/**
 * roomManager.js - Wordbomb Multiplayer
 * Identification des joueurs par sessionToken (UUID) persistant côté client.
 * Le socketId change à chaque reconnexion, mais le sessionToken reste stable.
 */

class RoomManager {
  constructor() {
    this.rooms   = new Map(); // roomId -> Room
    this.sessions = new Map(); // sessionToken -> { socketId, roomId }
    this.sockets  = new Map(); // socketId -> sessionToken
  }

  generateId(prefix = '') {
    return prefix + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // Enregistre / met à jour le mapping sessionToken <-> socketId
  registerSocket(sessionToken, socketId) {
    const existing = this.sessions.get(sessionToken);
    if (existing) {
      // Nettoyer l'ancien socketId
      this.sockets.delete(existing.socketId);
      existing.socketId = socketId;
    } else {
      this.sessions.set(sessionToken, { socketId, roomId: null });
    }
    this.sockets.set(socketId, sessionToken);
    return this.sessions.get(sessionToken);
  }

  unregisterSocket(socketId) {
    const token = this.sockets.get(socketId);
    this.sockets.delete(socketId);
    // Clear the socketId from the session so the grace-period timer
    // can reliably detect whether the player has reconnected or not.
    if (token) {
      const session = this.sessions.get(token);
      if (session && session.socketId === socketId) {
        session.socketId = null;
      }
    }
    return token; // peut être undefined si socket inconnu
  }

  getTokenBySocket(socketId) {
    return this.sockets.get(socketId);
  }

  getSessionBySocket(socketId) {
    const token = this.sockets.get(socketId);
    return token ? this.sessions.get(token) : null;
  }

  createRoom(roomData, hostSocketId, hostToken) {
    const roomId = roomData.id || this.generateId('room_');
    const room = {
      id: roomId,
      name: roomData.name || 'Salle de jeu',
      host: roomData.host,
      hostAvatar: roomData.hostAvatar || '',
      hostToken,                     // <- identifiant stable de l'hôte
      pendingSpectators: [],         // joueurs en attente de rejoindre après la partie
      players: [{
        token: hostToken,
        socketId: hostSocketId,
        name: roomData.host,
        avatar: roomData.hostAvatar || '',
        isHost: true,
        isReady: true,
        lives: 2,
        wordsFound: 0,
        isAlive: true,
        disconnected: false
      }],
      gameState: 'lobby',
      settings: {
        scenario: roomData.scenario || null,
        wpp: roomData.wpp || null,
        maxPlayers: 6,
        startingLives: 2
      },
      game: {
        currentSyllable: null,
        currentPlayerIndex: 0,
        roundNumber: 0,
        startTime: null,
        timer: null
      },
      createdAt: Date.now()
    };

    this.rooms.set(roomId, room);
    const session = this.sessions.get(hostToken);
    if (session) session.roomId = roomId;
    return room;
  }

  joinRoom(roomId, playerData, socketId, token) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'Salle introuvable' };

    // Reconnexion : même token déjà dans la salle
    const existing = room.players.find(p => p.token === token);
    if (existing) {
      const oldSocketId = existing.socketId;
      existing.socketId = socketId;
      // Mettre à jour le host si nécessaire
      if (room.hostToken === token) {
        // On garde hostToken inchangé, c'est stable
      }
      const session = this.sessions.get(token);
      if (session) {
        session.socketId = socketId;
        session.roomId = roomId;
        session._lastDisconnectTime = null; // signal : joueur reconnecté, annuler le gracePre
      }
      return { success: true, room, reconnected: true };
    }

    // Salle pleine
    if (room.players.length >= room.settings.maxPlayers) return { error: 'Salle pleine' };

    // Partie en cours → bloquer les nouveaux joueurs, mais permettre la reconnexion
    // d'un joueur qui était dans la salle (expulsé par timeout ou session perdue)
    if (room.gameState === 'playing') {
      // Cas spécial : l'hôte revient après perte de session (wasHost mais token plus dans players)
      const isReturningHost = room.hostToken === token;
      // Ou un joueur qui était là mais a été expulsé avant de pouvoir revenir
      const wasInRoom = room._recentlyLeft && room._recentlyLeft.find(p => p.token === token);

      if (!isReturningHost && !wasInRoom) {
        return { error: 'Partie en cours — impossible de rejoindre' };
      }

      // Réadmettre le joueur/hôte dans la salle
      const returner = wasInRoom || null;
      const player = {
        token,
        socketId,
        name: returner ? returner.name : (playerData.name || 'Joueur'),
        avatar: returner ? returner.avatar : (playerData.avatar || ''),
        isHost: isReturningHost,
        isReady: true,
        lives: returner ? returner.lives : room.settings.startingLives,
        wordsFound: returner ? returner.wordsFound : 0,
        isAlive: returner ? returner.isAlive : true,
        disconnected: false
      };
      if (isReturningHost) room.hostToken = token;
      room.players.push(player);
      const session = this.sessions.get(token);
      if (session) { session.socketId = socketId; session.roomId = roomId; session._lastDisconnectTime = null; }
      return { success: true, room, reconnected: true };
    }

    // Nouveau joueur
    const player = {
      token,
      socketId,
      name: playerData.name,
      avatar: playerData.avatar || '',
      isHost: false,
      isReady: false,
      lives: room.settings.startingLives,
      wordsFound: 0,
      isAlive: true,
      disconnected: false
    };
    room.players.push(player);
    const session = this.sessions.get(token);
    if (session) session.roomId = roomId;
    return { success: true, room };
  }

  leaveRoom(token) {
    const session = this.sessions.get(token);
    if (!session || !session.roomId) return null;

    const room = this.rooms.get(session.roomId);
    if (!room) { session.roomId = null; return null; }

    const wasHost = room.hostToken === token;
    const leavingPlayer = room.players.find(p => p.token === token);

    // Garder une trace du joueur qui quitte (permet la reconnexion si partie en cours)
    if (leavingPlayer && room.gameState === 'playing') {
      if (!room._recentlyLeft) room._recentlyLeft = [];
      room._recentlyLeft.push({ ...leavingPlayer, leftAt: Date.now() });
      // Purger après 60s
      setTimeout(() => {
        if (room._recentlyLeft) {
          room._recentlyLeft = room._recentlyLeft.filter(p => p.token !== token || Date.now() - p.leftAt < 60000);
        }
      }, 60000);
    }

    room.players = room.players.filter(p => p.token !== token);
    session.roomId = null;

    if (room.players.length === 0) {
      if (room.game && room.game.timer) { clearInterval(room.game.timer); room.game.timer = null; }
      this.rooms.delete(room.id);
      return { roomDeleted: true, roomId: room.id };
    }

    let newHost = null;
    if (wasHost) {
      const next = room.players[0];
      next.isHost = true;
      room.hostToken = next.token;
      room.host = next.name;
      room.hostAvatar = next.avatar || ''; // ← mettre à jour l'avatar de la salle
      newHost = next.name;
    }

    return { room, newHost };
  }

  // Retourne le socketId actuel d'un token
  getSocketId(token) {
    const s = this.sessions.get(token);
    return s ? s.socketId : null;
  }

  getPublicRooms() {
    const rooms = [];
    for (const [, room] of this.rooms) {
      const serverCount = room.players.filter(p => p.isAlive !== false || room.gameState === 'lobby').length;
      // Utiliser le count "affiché" (incluant les bots locaux) s'il est plus grand
      const playerCount = (room._displayPlayerCount && room._displayPlayerCount > serverCount)
        ? room._displayPlayerCount
        : serverCount;
      rooms.push({
        id: room.id,
        name: room.name,
        host: room.host,
        hostAvatar: room.hostAvatar,
        playerCount,
        maxPlayers: room.settings.maxPlayers,
        gameState: room.gameState,
        createdAt: room.createdAt
      });
    }
    return rooms;
  }

  // Alias pour compatibilité
  getPublicRoomsWithBotCount() { return this.getPublicRooms(); }

  getRoom(roomId) { return this.rooms.get(roomId); }

  markDisconnected(token) {
    const session = this.sessions.get(token);
    if (!session || !session.roomId) return null;
    const room = this.rooms.get(session.roomId);
    if (!room) return null;
    const player = room.players.find(p => p.token === token);
    if (player) player.disconnected = true;
    return room;
  }

  markReconnected(token) {
    const session = this.sessions.get(token);
    if (!session || !session.roomId) return null;
    const room = this.rooms.get(session.roomId);
    if (!room) return null;
    const player = room.players.find(p => p.token === token);
    if (player) player.disconnected = false;
    return room;
  }

  isHost(roomId, token) {
    const room = this.rooms.get(roomId);
    return room && room.hostToken === token;
  }

  startGame(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    room.gameState = 'playing';
    room.game.startTime = Date.now();
    room.game.roundNumber = 0;
    room.game.currentPlayerIndex = 0;
    room.players.forEach(p => { p.lives = room.settings.startingLives; p.wordsFound = 0; p.isAlive = true; });
    return room;
  }

  endGame(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    room.gameState = 'finished';
    if (room.game && room.game.timer) { clearInterval(room.game.timer); room.game.timer = null; }
    const alive = room.players.filter(p => p.isAlive && p.lives > 0);
    const winner = alive.length > 0 ? alive[0] : (room.players[0] || null);

    // Intégrer les spectateurs en attente comme joueurs pour la prochaine partie
    const newPlayers = [];
    if (room.pendingSpectators && room.pendingSpectators.length > 0) {
      for (const spec of room.pendingSpectators) {
        if (room.players.find(p => p.token === spec.token)) continue; // déjà joueur
        const newPlayer = {
          token: spec.token,
          socketId: spec.socketId,
          name: spec.name,
          avatar: spec.avatar || '',
          isHost: false,
          isReady: false,
          lives: room.settings.startingLives,
          wordsFound: 0,
          isAlive: true
        };
        room.players.push(newPlayer);
        newPlayers.push(newPlayer);
        const session = this.sessions.get(spec.token);
        if (session) session.roomId = roomId;
      }
      room.pendingSpectators = [];
    }

    // Remettre la salle en lobby pour la prochaine partie
    room.gameState = 'lobby';
    room.players.forEach(p => { p.lives = room.settings.startingLives; p.wordsFound = 0; p.isAlive = true; p.isReady = false; });

    return { room, winner, newPlayers };
  }
}

module.exports = RoomManager;
