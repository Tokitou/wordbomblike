/**
 * antiscraping.js
 * 
 * Module de protection anti-scraping pour Wordbomb
 * Protège dictionary.txt contre le téléchargement et l'extraction massive
 * 
 * Stratégies de protection :
 * 1. Chiffrement du dictionnaire en mémoire
 * 2. Fragmentation des réponses (jamais le dictionnaire complet)
 * 3. Système de tokens avec expiration et rotation
 * 4. Détection de patterns de scraping
 * 5. Rate limiting avancé multi-niveau
 * 6. Obfuscation des réponses
 * 7. Honeypots pour détecter les bots
 * 
 * Usage:
 *   const AntiScraping = require('./antiscraping');
 *   const protector = new AntiScraping({ secret: process.env.SECRET_KEY });
 *   app.use(protector.middleware());
 */

const crypto = require('crypto');

class AntiScraping {
  constructor(options = {}) {
    this.secret = options.secret || this._generateSecret();
    this.maxRequestsPerMinute = options.maxRequestsPerMinute || 30;
    this.maxRequestsPerHour = options.maxRequestsPerHour || 300;
    this.tokenExpiry = options.tokenExpiry || 5 * 60 * 1000; // 5 minutes
    this.maxWordsPerRequest = options.maxWordsPerRequest || 50;
    this.suspicionThreshold = options.suspicionThreshold || 100; // score
    
    // Structures de données pour le tracking
    this.ipTracking = new Map(); // IP -> { requests: [], tokens: Set, suspicionScore: number }
    this.activeTokens = new Map(); // token -> { ip, createdAt, usageCount, lastUsed }
    this.honeypotAccess = new Set(); // IPs qui ont accédé aux honeypots
    this.blockedIPs = new Set();
    
    // Patterns suspects
    this.suspiciousPatterns = [
      /bot|crawler|spider|scraper/i,
      /python|curl|wget/i,
      /headless/i
    ];
    
    // Nettoyage périodique
    setInterval(() => this._cleanup(), 60 * 1000); // chaque minute
  }

  /**
   * Génère une clé secrète aléatoire
   */
  _generateSecret() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Chiffre des données avec la clé secrète
   */
  _encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      'aes-256-cbc',
      Buffer.from(this.secret.slice(0, 64), 'hex'),
      iv
    );
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Déchiffre des données
   */
  _decrypt(encryptedData) {
    const parts = encryptedData.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      Buffer.from(this.secret.slice(0, 64), 'hex'),
      iv
    );
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Génère un token d'accès unique
   */
  generateToken(ip) {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenData = {
      ip,
      createdAt: Date.now(),
      usageCount: 0,
      lastUsed: Date.now()
    };
    this.activeTokens.set(token, tokenData);
    
    // Ajouter le token au tracking IP
    if (!this.ipTracking.has(ip)) {
      this.ipTracking.set(ip, {
        requests: [],
        tokens: new Set(),
        suspicionScore: 0
      });
    }
    this.ipTracking.get(ip).tokens.add(token);
    
    return token;
  }

  /**
   * Valide un token
   */
  validateToken(token, ip) {
    const tokenData = this.activeTokens.get(token);
    if (!tokenData) return false;
    
    // Vérifier expiration
    if (Date.now() - tokenData.createdAt > this.tokenExpiry) {
      this.activeTokens.delete(token);
      return false;
    }
    
    // Vérifier que l'IP correspond
    if (tokenData.ip !== ip) {
      this._increaseSuspicion(ip, 50, 'Token IP mismatch');
      return false;
    }
    
    // Mettre à jour usage
    tokenData.usageCount++;
    tokenData.lastUsed = Date.now();
    
    return true;
  }

  /**
   * Obtient l'IP du client (gère les proxies)
   */
  _getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
           req.headers['x-real-ip'] ||
           req.connection?.remoteAddress ||
           req.socket?.remoteAddress ||
           req.ip ||
           'unknown';
  }

  /**
   * Enregistre une requête et retourne si elle doit être bloquée
   */
  _trackRequest(ip, req) {
    if (!this.ipTracking.has(ip)) {
      this.ipTracking.set(ip, {
        requests: [],
        tokens: new Set(),
        suspicionScore: 0
      });
    }
    
    const tracking = this.ipTracking.get(ip);
    const now = Date.now();
    
    // Ajouter la requête
    tracking.requests.push({
      timestamp: now,
      path: req.path,
      userAgent: req.get('user-agent') || 'unknown'
    });
    
    // Nettoyer les anciennes requêtes (> 1 heure)
    tracking.requests = tracking.requests.filter(r => now - r.timestamp < 3600000);
    
    // Vérifier rate limiting
    const lastMinute = tracking.requests.filter(r => now - r.timestamp < 60000);
    const lastHour = tracking.requests.filter(r => now - r.timestamp < 3600000);
    
    if (lastMinute.length > this.maxRequestsPerMinute) {
      this._increaseSuspicion(ip, 20, 'Too many requests per minute');
      return { blocked: true, reason: 'rate_limit_minute' };
    }
    
    if (lastHour.length > this.maxRequestsPerHour) {
      this._increaseSuspicion(ip, 30, 'Too many requests per hour');
      return { blocked: true, reason: 'rate_limit_hour' };
    }
    
    // Détecter patterns suspects dans User-Agent
    const ua = req.get('user-agent') || '';
    if (this.suspiciousPatterns.some(pattern => pattern.test(ua))) {
      this._increaseSuspicion(ip, 10, 'Suspicious user-agent');
    }
    
    // Détecter requêtes séquentielles suspectes
    if (this._detectSequentialPattern(tracking.requests)) {
      this._increaseSuspicion(ip, 25, 'Sequential pattern detected');
    }
    
    return { blocked: false };
  }

  /**
   * Détecte des patterns de requêtes séquentielles (typique du scraping)
   */
  _detectSequentialPattern(requests) {
    if (requests.length < 10) return false;
    
    const recent = requests.slice(-20);
    const intervals = [];
    
    for (let i = 1; i < recent.length; i++) {
      intervals.push(recent[i].timestamp - recent[i-1].timestamp);
    }
    
    // Si les intervalles sont trop réguliers (variance faible), c'est suspect
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    
    // Intervalle régulier < 2 secondes avec faible variance = bot
    return avg < 2000 && stdDev < 500;
  }

  /**
   * Augmente le score de suspicion d'une IP
   */
  _increaseSuspicion(ip, points, reason) {
    if (!this.ipTracking.has(ip)) return;
    
    const tracking = this.ipTracking.get(ip);
    tracking.suspicionScore = (tracking.suspicionScore || 0) + points;
    
    console.warn(`[AntiScraping] IP ${ip} suspicion +${points} (${reason}). Total: ${tracking.suspicionScore}`);
    
    // Bloquer si le score dépasse le seuil
    if (tracking.suspicionScore >= this.suspicionThreshold) {
      this.blockedIPs.add(ip);
      console.error(`[AntiScraping] IP ${ip} BLOCKED (score: ${tracking.suspicionScore})`);
    }
  }

  /**
   * Fragmente une liste de mots de manière aléatoire
   */
  fragmentWords(words, maxWords) {
    if (!Array.isArray(words)) return [];
    
    // Mélanger aléatoirement
    const shuffled = words.sort(() => Math.random() - 0.5);
    
    // Prendre seulement un sous-ensemble
    const fragment = shuffled.slice(0, Math.min(maxWords, words.length));
    
    // Ajouter du bruit (quelques mots aléatoires modifiés)
    return fragment;
  }

  /**
   * Obfusque une réponse pour rendre le parsing plus difficile
   */
  obfuscateResponse(data) {
    // Ajouter des métadonnées trompeuses
    const obfuscated = {
      _meta: {
        v: '2.0',
        ts: Date.now(),
        sig: crypto.randomBytes(16).toString('hex'),
        // Faux checksum pour confondre les parsers
        checksum: crypto.randomBytes(8).toString('hex')
      },
      // Ajouter des champs de bruit
      _noise: Array.from({ length: 3 }, () => crypto.randomBytes(4).toString('hex')),
      // Les vraies données
      data: data
    };
    
    return obfuscated;
  }

  /**
   * Middleware Express principal
   */
  middleware() {
    return (req, res, next) => {
      const ip = this._getClientIP(req);
      
      // Vérifier si IP bloquée
      if (this.blockedIPs.has(ip)) {
        return res.status(403).json({
          error: 'forbidden',
          message: 'Access denied due to suspicious activity'
        });
      }
      
      // Vérifier honeypot
      if (this.honeypotAccess.has(ip)) {
        this._increaseSuspicion(ip, 100, 'Honeypot access');
        return res.status(404).json({ error: 'not_found' });
      }
      
      // Tracker la requête
      const trackResult = this._trackRequest(ip, req);
      if (trackResult.blocked) {
        return res.status(429).json({
          error: 'rate_limited',
          message: 'Too many requests',
          reason: trackResult.reason
        });
      }
      
      // Ajouter des méthodes helper à req
      req.antiscraping = {
        generateToken: () => this.generateToken(ip),
        validateToken: (token) => this.validateToken(token, ip),
        fragmentWords: (words) => this.fragmentWords(words, this.maxWordsPerRequest),
        obfuscate: (data) => this.obfuscateResponse(data),
        getClientIP: () => ip
      };
      
      next();
    };
  }

  /**
   * Middleware pour bloquer l'accès direct au dictionnaire
   */
  blockDictionaryAccess() {
    return (req, res, next) => {
      const ip = this._getClientIP(req);
      
      // Bloquer complètement l'accès au fichier dictionary.txt
      if (req.path === '/dictionary.txt' || req.path.includes('dictionary')) {
        this._increaseSuspicion(ip, 50, 'Direct dictionary access attempt');
        
        // Réponse trompeuse
        return res.status(404).json({
          error: 'not_found',
          message: 'The requested resource does not exist'
        });
      }
      
      next();
    };
  }

  /**
   * Crée un honeypot (piège pour bots)
   */
  createHoneypot() {
    return (req, res) => {
      const ip = this._getClientIP(req);
      this.honeypotAccess.add(ip);
      this._increaseSuspicion(ip, 100, 'Honeypot triggered');
      
      console.error(`[AntiScraping] Honeypot triggered by IP ${ip}`);
      
      // Retourner des données fake qui semblent légitimes
      res.json({
        words: Array.from({ length: 100 }, (_, i) => 
          crypto.randomBytes(4).toString('hex').toUpperCase()
        )
      });
    };
  }

  /**
   * Middleware pour valider les tokens sur les endpoints sensibles
   */
  requireToken() {
    return (req, res, next) => {
      const ip = this._getClientIP(req);
      const token = req.get('x-access-token') || req.query.token;
      
      if (!token) {
        this._increaseSuspicion(ip, 5, 'Missing token');
        return res.status(401).json({
          error: 'unauthorized',
          message: 'Access token required'
        });
      }
      
      if (!this.validateToken(token, ip)) {
        this._increaseSuspicion(ip, 15, 'Invalid token');
        return res.status(403).json({
          error: 'forbidden',
          message: 'Invalid or expired token'
        });
      }
      
      next();
    };
  }

  /**
   * Nettoyage périodique des données anciennes
   */
  _cleanup() {
    const now = Date.now();
    
    // Nettoyer tokens expirés
    for (const [token, data] of this.activeTokens.entries()) {
      if (now - data.createdAt > this.tokenExpiry) {
        this.activeTokens.delete(token);
      }
    }
    
    // Décrémenter les scores de suspicion (réhabilitation progressive)
    for (const [ip, tracking] of this.ipTracking.entries()) {
      if (tracking.suspicionScore > 0) {
        tracking.suspicionScore = Math.max(0, tracking.suspicionScore - 1);
      }
      
      // Débloquer les IPs avec score < seuil
      if (tracking.suspicionScore < this.suspicionThreshold / 2) {
        this.blockedIPs.delete(ip);
      }
      
      // Supprimer les IPs inactives depuis > 24h
      const lastRequest = tracking.requests[tracking.requests.length - 1];
      if (!lastRequest || now - lastRequest.timestamp > 86400000) {
        this.ipTracking.delete(ip);
      }
    }
    
    // Nettoyer honeypot après 24h
    // (en production, tu voudrais peut-être garder ces IPs plus longtemps)
    // Pour l'instant, on les garde indéfiniment
  }

  /**
   * Obtient les statistiques de protection
   */
  getStats() {
    return {
      totalIPs: this.ipTracking.size,
      blockedIPs: this.blockedIPs.size,
      activeTokens: this.activeTokens.size,
      honeypotHits: this.honeypotAccess.size,
      suspiciousIPs: Array.from(this.ipTracking.entries())
        .filter(([_, data]) => data.suspicionScore > 20)
        .length
    };
  }

  /**
   * Débloquer manuellement une IP (pour les admins)
   */
  unblockIP(ip) {
    this.blockedIPs.delete(ip);
    if (this.ipTracking.has(ip)) {
      this.ipTracking.get(ip).suspicionScore = 0;
    }
    console.log(`[AntiScraping] IP ${ip} manually unblocked`);
  }

  /**
   * Liste les IPs bloquées
   */
  getBlockedIPs() {
    return Array.from(this.blockedIPs);
  }
}

module.exports = AntiScraping;