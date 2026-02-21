/**
 * guide-content.js
 * Contenu du guide Wordbomb en 3 langues
 */

const GUIDE_CONTENT = {
  fr: {
    title: "📖 Guide Wordbomb",
    sections: [
      {
        icon: "🎮",
        title: "Comment jouer",
        content: `Wordbomb est un jeu de mots multijoueur en temps réel. Une syllabe s'affiche sur la bombe — trouvez un mot qui la contient et soumettez-le avant l'explosion !

<strong>Tour par tour :</strong> En multijoueur, chaque joueur joue à son tour. Si vous ne trouvez pas de mot à temps, vous perdez une vie et le tour passe au suivant.

<strong>Vies :</strong> Vous commencez avec 2 vies (modifiable par l'hôte). Perdez une vie si le temps s'écoule. Le dernier survivant gagne la partie.

<strong>Validation :</strong> Le mot doit exister dans le dictionnaire ET contenir la syllabe demandée. Appuyez sur <strong>Entrée</strong> ou cliquez sur <strong>Envoyer</strong>.`
      },
      {
        icon: "🏠",
        title: "Salles multijoueur",
        content: `<strong>Créer une salle :</strong> Cliquez sur "Créer une salle", choisissez un nom et vos options de jeu. Vous devenez automatiquement l'hôte.

<strong>Rejoindre une salle :</strong> Les salles disponibles apparaissent dans la liste. Les salles avec un bord <span style="color:#f87171">rouge</span> sont en cours de partie — vous ne pouvez pas les rejoindre.

<strong>Hôte :</strong> L'hôte (👑) peut démarrer la partie, modifier les paramètres et expulser des joueurs.

<strong>Prêt :</strong> Marquez-vous comme prêt avant que l'hôte démarre. La partie peut commencer dès que tous les joueurs sont prêts.`
      },
      {
        icon: "⚔️",
        title: "Déroulement d'une partie",
        content: `<strong>Démarrage :</strong> L'hôte lance la partie. Une syllabe apparaît sur la bombe et le joueur actif a un temps limité pour répondre.

<strong>Mot trouvé ✅ :</strong> Le tour passe au joueur suivant avec une nouvelle syllabe.

<strong>Temps écoulé ❌ :</strong> Vous perdez une vie. Si vous n'avez plus de vies, vous êtes éliminé.

<strong>Fin de partie :</strong> Le dernier joueur encore en vie remporte la partie. Son score (nombre de mots trouvés) s'affiche dans le récapitulatif.

<strong>Déconnexion :</strong> Si un joueur se déconnecte, il apparaît en grisé. Il a 20 secondes pour revenir — sinon il est expulsé automatiquement.`
      },
      {
        icon: "📜",
        title: "Scénarios",
        content: `Les scénarios changent le type de syllabes proposées :

<strong>Aléatoire :</strong> Syllabes de toutes longueurs et difficultés mélangées.

<strong>4 lettres :</strong> Uniquement des syllabes de 4 caractères (plus rare, donc plus difficile).

<strong>Sub8 :</strong> Syllabes avec seulement 1 à 8 mots valides — très difficile, peu de solutions !

<strong>Sub50 :</strong> Syllabes avec 9 à 50 mots valides — difficulté intermédiaire.

<strong>Train Skip :</strong> Mode entraînement. Rejoue les syllabes sur lesquelles tu as déjà perdu, sans perdre de vies. Idéal pour progresser sur tes points faibles.`
      },
      {
        icon: "📊",
        title: "Syllabes ratées",
        content: `L'onglet <strong>Syllabes</strong> liste toutes les syllabes sur lesquelles tu as perdu une vie, classées par difficulté :

• <strong>4 lettres</strong> — syllabes de 4 caractères
• <strong>Sub8</strong> — 1 à 8 mots disponibles (très difficile)
• <strong>Sub50</strong> — 9 à 50 mots disponibles (moyen)
• <strong>Autres</strong> — 51+ mots disponibles (plus accessible)

Clique sur une syllabe pour la supprimer de la liste. Combine cette vue avec le mode <strong>Train Skip</strong> pour t'entraîner ciblé.`
      },
      {
        icon: "🔍",
        title: "Recherche de mots",
        content: `L'onglet <strong>Recherche</strong> te permet d'explorer le dictionnaire.

<strong>Comment :</strong> Tape une syllabe (ex : <code>TRO</code>, <code>QUI</code>, <code>MENT</code>) et clique sur Rechercher. Tous les mots valides contenant cette syllabe s'affichent.

<strong>Commande chat :</strong> Dans une salle, tape <code>/c SYLLABE</code> dans le chat pour faire une recherche rapide sans quitter la partie.

<strong>Astuce :</strong> Entraîne-toi en cherchant les syllabes les plus rares avant de jouer !`
      },
      {
        icon: "⚙️",
        title: "Paramètres de jeu",
        content: `L'hôte peut ajuster ces paramètres avant de lancer une partie :

<strong>Vies de départ :</strong> Nombre de vies accordées à chaque joueur (1 à 5).

<strong>Scénario :</strong> Choisissez le type de syllabes proposées (voir section Scénarios).

<strong>Secondes supplémentaires :</strong> Ajoutez du temps au timer pour les débutants (0 à 10s).

<strong>Espace = tiret + validation :</strong> Si activé, appuyer sur Espace dans le champ de saisie insère un tiret et soumet le mot — pratique pour les mots composés.`
      },
      {
        icon: "🎨",
        title: "Thèmes",
        content: `Wordbomb propose 13 thèmes visuels. Changez-en depuis l'icône thèmes dans la barre latérale :

• <strong>Midnight</strong> — Bleu nuit (par défaut)
• <strong>Glacier</strong> — Tons bleus glacés
• <strong>Ember</strong> — Orange et rouge chaleureux
• <strong>Forest</strong> — Vert nature
• <strong>Cobalt</strong> — Bleu cobalt intense
• <strong>Aurora</strong> — Violet aurore boréale
• <strong>Slate</strong> — Gris ardoise moderne
• <strong>Sunrise</strong> — Rose et orange
• <strong>Neon</strong> — Couleurs néon vives
• <strong>Ocean</strong> — Bleu océan apaisant
• <strong>Crimson</strong> — Rouge profond
• <strong>Matrix</strong> — Vert cyberpunk
• <strong>Lavender</strong> — Violet lavande doux`
      },
      {
        icon: "💡",
        title: "Astuces & Raccourcis",
        content: `<strong>Bien jouer :</strong>
• Les mots composés avec tirets sont valides (ex: <code>PORTE-CLÉS</code>)
• Les pluriels et conjugaisons comptent (CHATS, MANGEONS…)
• Pense aux préfixes courants : RE-, DÉ-, IN-, CON-, PRÉ-…
• Entraîne-toi avec Train Skip sur tes syllabes faibles

<strong>Raccourcis clavier :</strong>
• <strong>Entrée</strong> — Soumettre le mot / le message chat
• <strong>Espace</strong> — Tiret + soumission (si activé dans les paramètres)

<strong>Commandes chat :</strong>
• <code>/c SYLLABE</code> — Recherche rapide de mots contenant la syllabe

Bonne partie ! 💣`
      }
    ]
  },
  
  en: {
    title: "📖 Wordbomb Guide",
    sections: [
      {
        icon: "🎮",
        title: "How to play",
        content: `Wordbomb is a fast-paced game where you must find words containing a given syllable before time runs out.

<strong>Objective:</strong> Find a valid word containing the displayed syllable and submit it before the bomb explodes!

<strong>Lives:</strong> You start with 2 lives. Lose a life if time runs out or if your word is invalid. The game ends when you run out of lives.`
      },
      {
        icon: "🏠",
        title: "Game rooms",
        content: `Rooms are spaces where you can play alone or with other players.

<strong>Create a room:</strong> Click "Create room" from the home page, give it a name and start playing.

<strong>Join a room:</strong> Click on an existing room in the list to join it.

<strong>Delete a room:</strong> Click the "Delete" button next to a room you created.`
      },
      {
        icon: "🎯",
        title: "Game modes",
        content: `Wordbomb offers several modes to vary the experience:

<strong>Original:</strong> The classic mode with 2 or 3 letters.

<strong>Classic:</strong> Variant of the original mode with adjusted rules.

<strong>Zenith:</strong> More difficult mode for experienced players.`
      },
      {
        icon: "📜",
        title: "Scenarios",
        content: `Scenarios modify the game rules to create unique challenges:

<strong>4 letters:</strong> All syllables will have 4 characters.

<strong>Sub8:</strong> Syllables with 1 to 8 available words (hard!).

<strong>Sub50:</strong> Syllables with 9 to 50 available words (medium).

<strong>Train Skip:</strong> Special training mode! You can choose a category of failed syllables to practice specifically:
  • <strong>4 letters</strong>: Failed 4-character syllables
  • <strong>Sub8 (1-8 words)</strong>: Failed difficult syllables
  • <strong>Sub50 (9-50 words)</strong>: Failed medium syllables
  • <strong>Others (51+ words)</strong>: Other failed syllables

Train Skip doesn't cost lives - it's designed for practice!`
      },
      {
        icon: "📊",
        title: "Failed syllables",
        content: `The "Syllables" tab displays all syllables where you lost lives, organized by category:

<strong>4 letters:</strong> 4-character syllables

<strong>Sub8:</strong> 1-8 available words (very difficult)

<strong>Sub50:</strong> 9-50 available words (medium difficulty)

<strong>Others:</strong> 51+ available words (easier)

Use this data with "Train Skip" mode to improve your weak points!

<strong>Delete syllables:</strong> Click on a syllable to remove it from the list.`
      },
      {
        icon: "🔍",
        title: "Search",
        content: `The "Search" tab allows you to find all words containing a specific syllable.

<strong>Usage:</strong> Enter a syllable (e.g., TRO, QUI) and click "Search". The list of words will appear below.

<strong>Tip:</strong> Use this feature to discover new words and prepare for upcoming games!`
      },
      {
        icon: "📚",
        title: "Dictionary",
        content: `The "Dictionary" tab allows you to manage the word dictionary used by the game.

<strong>Add a word:</strong> Enter a word and click "Add".

<strong>Remove a word:</strong> Enter an existing word and click "Remove".

<strong>Download:</strong> Download the complete dictionary in .txt format.

<em>Note: These modifications affect the dictionary.txt file on your local server.</em>`
      },
      {
        icon: "⚙️",
        title: "Settings",
        content: `Customize your gaming experience with available settings:

<strong>Space = dash + submit:</strong> When enabled, pressing Space in the input field adds a dash AND automatically submits the word.

<strong>Extra seconds:</strong> Add 0-10 seconds to the time allowed for each syllable.

<strong>System messages:</strong> Click the "S" button in the sidebar to hide/show system messages in chat.

All your settings are automatically saved!`
      },
      {
        icon: "🎨",
        title: "Available themes",
        content: `Wordbomb offers 13 beautiful visual themes:

• <strong>Glacier</strong> - Icy blue tones
• <strong>Ember</strong> - Orange and red warmth
• <strong>Forest</strong> - Nature green
• <strong>Midnight</strong> - Deep night blue (default)
• <strong>Cobalt</strong> - Intense cobalt blue
• <strong>Aurora</strong> - Northern lights purple
• <strong>Slate</strong> - Modern slate gray
• <strong>Sunrise</strong> - Pink and orange sunrise
• <strong>Neon</strong> - Bright neon colors
• <strong>Ocean</strong> - Soothing ocean blue
• <strong>Crimson</strong> - Deep red
• <strong>Matrix</strong> - Cyberpunk Matrix green
• <strong>Lavender</strong> - Soft lavender purple

Click the themes icon in the sidebar to change!`
      },
      {
        icon: "💡",
        title: "Tips & Advice",
        content: `<strong>To play better:</strong>

• Think of compound words with hyphens (e.g., MOTHER-IN-LAW)
• Plurals are valid (CATS, CARS...)
• Practice your failed syllables with Train Skip
• Use search to explore the dictionary
• Enable extra seconds if you're a beginner

<strong>Chat commands:</strong>

• Type <code>/c SYLLABLE</code> in chat to search for words containing that syllable

<strong>Keyboard shortcuts:</strong>

• <strong>Enter</strong>: Submit word or message
• <strong>Space</strong>: Dash + submit (if enabled)

Have fun! 🎮💣`
      }
    ]
  },
  
  es: {
    title: "📖 Guía de Wordbomb",
    sections: [
      {
        icon: "🎮",
        title: "Cómo jugar",
        content: `Wordbomb es un juego de rapidez donde debes encontrar palabras que contengan una sílaba dada antes de que se acabe el tiempo.

<strong>Objetivo:</strong> ¡Encuentra una palabra válida que contenga la sílaba mostrada y envíala antes de que explote la bomba!

<strong>Vidas:</strong> Comienzas con 2 vidas. Pierdes una vida si se acaba el tiempo o si tu palabra no es válida. El juego termina cuando te quedas sin vidas.`
      },
      {
        icon: "🏠",
        title: "Salas de juego",
        content: `Las salas son espacios donde puedes jugar solo o con otros jugadores.

<strong>Crear una sala:</strong> Haz clic en "Crear sala" desde la página de inicio, dale un nombre y comienza a jugar.

<strong>Unirse a una sala:</strong> Haz clic en una sala existente en la lista para unirte.

<strong>Eliminar una sala:</strong> Haz clic en el botón "Eliminar" junto a una sala que hayas creado.`
      },
      {
        icon: "🎯",
        title: "Modos de juego",
        content: `Wordbomb ofrece varios modos para variar la experiencia:

<strong>Original:</strong> El modo clásico con 2 o 3 letras.

<strong>Clásico:</strong> Variante del modo original con reglas ajustadas.

<strong>Cenit:</strong> Modo más difícil para jugadores experimentados.`
      },
      {
        icon: "📜",
        title: "Escenarios",
        content: `Los escenarios modifican las reglas del juego para crear desafíos únicos:

<strong>4 letras:</strong> Todas las sílabas tendrán 4 caracteres.

<strong>Sub8:</strong> Sílabas con 1 a 8 palabras disponibles (¡difícil!).

<strong>Sub50:</strong> Sílabas con 9 a 50 palabras disponibles (medio).

<strong>Salto de entrenamiento:</strong> ¡Modo de entrenamiento especial! Puedes elegir una categoría de sílabas fallidas para practicar específicamente:
  • <strong>4 letras</strong>: Sílabas fallidas de 4 caracteres
  • <strong>Sub8 (1-8 palabras)</strong>: Sílabas difíciles fallidas
  • <strong>Sub50 (9-50 palabras)</strong>: Sílabas medias fallidas
  • <strong>Otras (51+ palabras)</strong>: Otras sílabas fallidas

¡El Salto de entrenamiento no cuesta vidas - está diseñado para practicar!`
      },
      {
        icon: "📊",
        title: "Sílabas fallidas",
        content: `La pestaña "Sílabas" muestra todas las sílabas en las que perdiste vidas, organizadas por categoría:

<strong>4 letras:</strong> Sílabas de 4 caracteres

<strong>Sub8:</strong> 1-8 palabras disponibles (muy difícil)

<strong>Sub50:</strong> 9-50 palabras disponibles (dificultad media)

<strong>Otras:</strong> 51+ palabras disponibles (más fácil)

¡Usa estos datos con el modo "Salto de entrenamiento" para mejorar tus puntos débiles!

<strong>Eliminar sílabas:</strong> Haz clic en una sílaba para eliminarla de la lista.`
      },
      {
        icon: "🔍",
        title: "Búsqueda",
        content: `La pestaña "Buscar" te permite encontrar todas las palabras que contienen una sílaba específica.

<strong>Uso:</strong> Ingresa una sílaba (ej: TRO, QUI) y haz clic en "Buscar". La lista de palabras aparecerá abajo.

<strong>Consejo:</strong> ¡Usa esta función para descubrir nuevas palabras y prepararte para las próximas partidas!`
      },
      {
        icon: "📚",
        title: "Diccionario",
        content: `La pestaña "Diccionario" te permite gestionar el diccionario de palabras utilizado por el juego.

<strong>Agregar una palabra:</strong> Ingresa una palabra y haz clic en "Agregar".

<strong>Eliminar una palabra:</strong> Ingresa una palabra existente y haz clic en "Eliminar".

<strong>Descargar:</strong> Descarga el diccionario completo en formato .txt.

<em>Nota: Estas modificaciones afectan el archivo dictionary.txt en tu servidor local.</em>`
      },
      {
        icon: "⚙️",
        title: "Configuración",
        content: `Personaliza tu experiencia de juego con las configuraciones disponibles:

<strong>Espacio = guión + enviar:</strong> Cuando está activado, presionar Espacio en el campo de entrada agrega un guión Y envía la palabra automáticamente.

<strong>Segundos adicionales:</strong> Agrega 0-10 segundos al tiempo permitido para cada sílaba.

<strong>Mensajes del sistema:</strong> Haz clic en el botón "S" en la barra lateral para ocultar/mostrar los mensajes del sistema en el chat.

¡Todas tus configuraciones se guardan automáticamente!`
      },
      {
        icon: "🎨",
        title: "Temas disponibles",
        content: `Wordbomb ofrece 13 hermosos temas visuales:

• <strong>Glacier</strong> - Tonos azules helados
• <strong>Ember</strong> - Calidez naranja y roja
• <strong>Forest</strong> - Verde naturaleza
• <strong>Midnight</strong> - Azul noche profundo (predeterminado)
• <strong>Cobalt</strong> - Azul cobalto intenso
• <strong>Aurora</strong> - Púrpura aurora boreal
• <strong>Slate</strong> - Gris pizarra moderno
• <strong>Sunrise</strong> - Rosa y naranja amanecer
• <strong>Neon</strong> - Colores neón brillantes
• <strong>Ocean</strong> - Azul océano relajante
• <strong>Crimson</strong> - Rojo profundo
• <strong>Matrix</strong> - Verde Matrix ciberpunk
• <strong>Lavender</strong> - Púrpura lavanda suave

¡Haz clic en el ícono de temas en la barra lateral para cambiar!`
      },
      {
        icon: "💡",
        title: "Consejos y trucos",
        content: `<strong>Para jugar mejor:</strong>

• Piensa en palabras compuestas con guiones
• Los plurales son válidos (GATOS, COCHES...)
• Practica tus sílabas fallidas con Salto de entrenamiento
• Usa la búsqueda para explorar el diccionario
• Activa segundos adicionales si eres principiante

<strong>Comandos del chat:</strong>

• Escribe <code>/c SÍLABA</code> en el chat para buscar palabras que contengan esa sílaba

<strong>Atajos de teclado:</strong>

• <strong>Enter</strong>: Enviar palabra o mensaje
• <strong>Espacio</strong>: Guión + enviar (si está activado)

¡Que te diviertas! 🎮💣`
      }
    ]
  }
};

// Fonction pour générer le HTML du guide
function generateGuideHTML(lang = 'fr') {
  const guide = GUIDE_CONTENT[lang] || GUIDE_CONTENT.fr;
  
  let html = `<div class="guide-content">`;
  
  guide.sections.forEach(section => {
    html += `
      <div class="guide-section">
        <div class="guide-section-header">
          <span class="guide-section-icon">${section.icon}</span>
          <h3 class="guide-section-title">${section.title}</h3>
        </div>
        <div class="guide-section-content">${section.content}</div>
      </div>
    `;
  });
  
  html += `</div>`;
  
  return html;
}

// Fonction pour mettre à jour le guide quand la langue change
function updateGuideContent() {
  const guideContainer = document.querySelector('.guide-scroll');
  if (!guideContainer || !window.i18n) return;
  
  const currentLang = window.i18n.currentLang || 'fr';
  guideContainer.innerHTML = generateGuideHTML(currentLang);
}

// Export pour utilisation globale
window.generateGuideHTML = generateGuideHTML;
window.updateGuideContent = updateGuideContent;
