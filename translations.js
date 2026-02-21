/**
 * translations.js
 * Système de traduction pour Wordbomb
 * Supporte: Français (FR), English (EN), Español (ES)
 */

const TRANSLATIONS = {
  fr: {
    // Header & Navigation
    menu: "Menu",
    guide: "Guide",
    language: "Langue",
    profile: "Profil",
    
    // Hero section
    heroTitle: "Maîtrisez les mots, avant que la bombe n'explose",
    heroSubtitle: "Défiez vos amis dans des parties rapides et intenses. Trouvez des mots contenant la syllabe donnée avant que le temps ne s'épuise !",
    createRoom: "🚀 Créer une salle",
    quickPlay: "⚡ Partie rapide",
    
    // Tabs
    tabRooms: "🏠 Salles",
    tabSearch: "🔍 Recherche",
    tabSyllables: "📊 Syllabes",
    tabDictionary: "📚 Dictionnaire",
    
    // Rooms section
    roomsTitle: "Salles de jeu",
    roomsSubtitle: "Rejoignez une partie ou créez la vôtre",
    emptyRoomsTitle: "Aucune salle disponible",
    emptyRoomsDesc: "Soyez le premier à créer une salle et lancez une partie !",
    deleteRoom: "Supprimer",
    playersOnline: "joueur(s) en ligne",
    
    // Search section
    searchTitle: "Recherche de mots",
    searchSubtitle: "Vérifiez si un mot existe dans le dictionnaire",
    searchPlaceholder: "Tapez un mot ou une syllabe...",
    searchButton: "🔍 Rechercher",
    searchResultsTitle: "Résultats pour",
    searchNoResults: "Aucun résultat trouvé",
    clear: "Effacer",
    
    // Syllables section
    syllablesTitle: "Syllabes ratées",
    syllablesSubtitle: "Analysez vos difficultés et progressez",
    category4letters: "4 lettres",
    categorySub8: "Sub8 (1-8 mots)",
    categorySub50: "Sub50 (9-50 mots)",
    categoryOthers: "Autres (51+ mots)",
    clearAll: "🗑️ Tout supprimer",
    emptySyllablesTitle: "Aucune syllabe ratée",
    emptySyllablesDesc: "Vos échecs apparaîtront ici",
    
    // Dictionary section
    dictionaryTitle: "Gestion du dictionnaire",
    dictionarySubtitle: "Ajoutez ou supprimez des mots du dictionnaire local",
    dictionaryModifyTitle: "Modifier le dictionnaire",
    dictionaryModifyDesc: "Ces actions modifient le fichier dictionary.txt sur le serveur local.",
    dictionaryInputPlaceholder: "Entrez un mot...",
    addWord: "➕ Ajouter",
    removeWord: "➖ Supprimer",
    downloadDict: "⬇️ Télécharger",
    
    // Create room modal
    createRoomTitle: "Créer une salle",
    roomNameLabel: "Nom de la salle",
    roomNamePlaceholder: "Ma super salle",
    hostNameLabel: "Votre pseudo",
    hostNamePlaceholder: "Toki",
    create: "Créer",
    cancel: "Annuler",
    
    // Profile modal
    profileTitle: "Mon profil",
    pseudoLabel: "Pseudo",
    pseudoPlaceholder: "Toki",
    avatarLabel: "Avatar",
    chooseFile: "Choisir un fichier",
    noFileChosen: "Aucun fichier choisi",
    save: "Enregistrer",
    
    // Language modal
    chooseLanguage: "🌐 Choisir la langue",
    french: "Français",
    english: "English",
    spanish: "Español",
    
    // Guide modal
    guideTitle: "📖 Guide Wordbomb",
    understood: "Compris !",
    
    // Room page
    roomTitle: "Salle",
    lobby: "Lobby",
    lives: "Vies",
    timer: "Temps",
    findWord: "Trouvez un mot avec",
    submitWordPlaceholder: "Votre mot...",
    submit: "Envoyer",
    
    // Chat
    chatPlaceholder: "Message...",
    
    // Sidebar buttons
    settingsBtn: "Paramètres",
    scenariosBtn: "Scénarios",
    themesBtn: "Thèmes",
    
    // Settings modal
    settingsTitle: "Paramètres de jeu",
    spaceSubmit: "Espace = tiret + validation",
    extraTime: "Secondes supplémentaires",
    apply: "Appliquer",
    close: "Fermer",
    
    // Scenarios modal
    scenariosTitle: "Scénarios",
    scenariosSubtitle: "Choisir un scénario prédéfini",
    noScenario: "Aucun scénario",
    scenario4letters: "4 lettres",
    scenarioSub8: "sub8",
    scenarioSub50: "sub50",
    scenarioTrainSkip: "Train skip",
    
    // Train Skip Category modal
    trainSkipCategoryTitle: "Train Skip - Catégorie",
    trainSkipCategoryDesc: "Choisissez la catégorie de syllabes ratées à entraîner",
    
    // WPP
    wppTitle: "WPP (subN)",
    wppIncompatible: "Incompatible avec les scénarios",
    
    // Practice mode
    practiceMode: "Mode Pratique",
    noLifeLoss: "Pas de perte de vie",
    
    // Themes modal
    themesTitle: "Thèmes",
    themesSubtitle: "Personnalisez l'apparence",
    
    // System messages
    systemMessages: "Messages système",
    
    // Game modes
    modeOriginal: "Original",
    modeClassic: "Classique",
    modeZenith: "Zenith"
  },
  
  en: {
    // Header & Navigation
    menu: "Menu",
    guide: "Guide",
    language: "Language",
    profile: "Profile",
    
    // Hero section
    heroTitle: "Master words before the bomb explodes",
    heroSubtitle: "Challenge your friends in fast-paced games. Find words containing the given syllable before time runs out!",
    createRoom: "🚀 Create room",
    quickPlay: "⚡ Quick play",
    
    // Tabs
    tabRooms: "🏠 Rooms",
    tabSearch: "🔍 Search",
    tabSyllables: "📊 Syllables",
    tabDictionary: "📚 Dictionary",
    
    // Rooms section
    roomsTitle: "Game rooms",
    roomsSubtitle: "Join a game or create your own",
    emptyRoomsTitle: "No rooms available",
    emptyRoomsDesc: "Be the first to create a room and start playing!",
    deleteRoom: "Delete",
    playersOnline: "player(s) online",
    
    // Search section
    searchTitle: "Word search",
    searchSubtitle: "Check if a word exists in the dictionary",
    searchPlaceholder: "Type a word or syllable...",
    searchButton: "🔍 Search",
    searchResultsTitle: "Results for",
    searchNoResults: "No results found",
    clear: "Clear",
    
    // Syllables section
    syllablesTitle: "Failed syllables",
    syllablesSubtitle: "Analyze your difficulties and improve",
    category4letters: "4 letters",
    categorySub8: "Sub8 (1-8 words)",
    categorySub50: "Sub50 (9-50 words)",
    categoryOthers: "Others (51+ words)",
    clearAll: "🗑️ Clear all",
    emptySyllablesTitle: "No failed syllables",
    emptySyllablesDesc: "Your failures will appear here",
    
    // Dictionary section
    dictionaryTitle: "Dictionary management",
    dictionarySubtitle: "Add or remove words from the local dictionary",
    dictionaryModifyTitle: "Modify dictionary",
    dictionaryModifyDesc: "These actions modify the dictionary.txt file on the local server.",
    dictionaryInputPlaceholder: "Enter a word...",
    addWord: "➕ Add",
    removeWord: "➖ Remove",
    downloadDict: "⬇️ Download",
    
    // Create room modal
    createRoomTitle: "Create room",
    roomNameLabel: "Room name",
    roomNamePlaceholder: "My awesome room",
    hostNameLabel: "Your nickname",
    hostNamePlaceholder: "Toki",
    create: "Create",
    cancel: "Cancel",
    
    // Profile modal
    profileTitle: "My profile",
    pseudoLabel: "Nickname",
    pseudoPlaceholder: "Toki",
    avatarLabel: "Avatar",
    chooseFile: "Choose file",
    noFileChosen: "No file chosen",
    save: "Save",
    
    // Language modal
    chooseLanguage: "🌐 Choose language",
    french: "Français",
    english: "English",
    spanish: "Español",
    
    // Guide modal
    guideTitle: "📖 Wordbomb Guide",
    understood: "Got it!",
    
    // Room page
    roomTitle: "Room",
    lobby: "Lobby",
    lives: "Lives",
    timer: "Time",
    findWord: "Find a word with",
    submitWordPlaceholder: "Your word...",
    submit: "Submit",
    
    // Chat
    chatPlaceholder: "Message...",
    
    // Sidebar buttons
    settingsBtn: "Settings",
    scenariosBtn: "Scenarios",
    themesBtn: "Themes",
    
    // Settings modal
    settingsTitle: "Game settings",
    spaceSubmit: "Space = dash + submit",
    extraTime: "Extra seconds",
    apply: "Apply",
    close: "Close",
    
    // Scenarios modal
    scenariosTitle: "Scenarios",
    scenariosSubtitle: "Choose a preset scenario",
    noScenario: "No scenario",
    scenario4letters: "4 letters",
    scenarioSub8: "sub8",
    scenarioSub50: "sub50",
    scenarioTrainSkip: "Train skip",
    
    // Train Skip Category modal
    trainSkipCategoryTitle: "Train Skip - Category",
    trainSkipCategoryDesc: "Choose the category of failed syllables to train",
    
    // WPP
    wppTitle: "WPP (subN)",
    wppIncompatible: "Incompatible with scenarios",
    
    // Practice mode
    practiceMode: "Practice Mode",
    noLifeLoss: "No life loss",
    
    // Themes modal
    themesTitle: "Themes",
    themesSubtitle: "Customize appearance",
    
    // System messages
    systemMessages: "System messages",
    
    // Game modes
    modeOriginal: "Original",
    modeClassic: "Classic",
    modeZenith: "Zenith"
  },
  
    es: {
    // Header & Navigation
    menu: "Menú",
    guide: "Guía",
    language: "Idioma",
    profile: "Perfil",
    
    // Hero section
    heroTitle: "Domina las palabras antes de que explote la bomba",
    heroSubtitle: "Desafía a tus amigos en partidas rápidas e intensas. ¡Encuentra palabras que contengan la sílaba dada antes de que se acabe el tiempo!",
    createRoom: "🚀 Crear sala",
    quickPlay: "⚡ Partida rápida",
    
    // Tabs
    tabRooms: "🏠 Salas",
    tabSearch: "🔍 Buscar",
    tabSyllables: "📊 Sílabas",
    tabDictionary: "📚 Diccionario",
    
    // Rooms section
    roomsTitle: "Salas de juego",
    roomsSubtitle: "Únete a una partida o crea la tuya",
    emptyRoomsTitle: "No hay salas disponibles",
    emptyRoomsDesc: "¡Sé el primero en crear una sala y empezar a jugar!",
    deleteRoom: "Eliminar",
    playersOnline: "jugador(es) en línea",
    
    // Search section
    searchTitle: "Búsqueda de palabras",
    searchSubtitle: "Verifica si una palabra existe en el diccionario",
    searchPlaceholder: "Escribe una palabra o sílaba...",
    searchButton: "🔍 Buscar",
    searchResultsTitle: "Resultados para",
    searchNoResults: "No se encontraron resultados",
    clear: "Borrar",
    
    // Syllables section
    syllablesTitle: "Sílabas fallidas",
    syllablesSubtitle: "Analiza tus dificultades y mejora",
    category4letters: "4 letras",
    categorySub8: "Sub8 (1-8 palabras)",
    categorySub50: "Sub50 (9-50 palabras)",
    categoryOthers: "Otras (51+ palabras)",
    clearAll: "🗑️ Borrar todo",
    emptySyllablesTitle: "No hay sílabas fallidas",
    emptySyllablesDesc: "Tus fallos aparecerán aquí",
    
    // Dictionary section
    dictionaryTitle: "Gestión del diccionario",
    dictionarySubtitle: "Agrega o elimina palabras del diccionario local",
    dictionaryModifyTitle: "Modificar diccionario",
    dictionaryModifyDesc: "Estas acciones modifican el archivo dictionary.txt en el servidor local.",
    dictionaryInputPlaceholder: "Ingresa una palabra...",
    addWord: "➕ Agregar",
    removeWord: "➖ Eliminar",
    downloadDict: "⬇️ Descargar",
    
    // Create room modal
    createRoomTitle: "Crear sala",
    roomNameLabel: "Nombre de la sala",
    roomNamePlaceholder: "Mi sala increíble",
    hostNameLabel: "Tu apodo",
    hostNamePlaceholder: "Toki",
    create: "Crear",
    cancel: "Cancelar",
    
    // Profile modal
    profileTitle: "Mi perfil",
    pseudoLabel: "Apodo",
    pseudoPlaceholder: "Toki",
    avatarLabel: "Avatar",
    chooseFile: "Elegir archivo",
    noFileChosen: "Ningún archivo elegido",
    save: "Guardar",
    
    // Language modal
    chooseLanguage: "🌐 Elegir idioma",
    french: "Français",
    english: "English",
    spanish: "Español",
    
    // Guide modal
    guideTitle: "📖 Guía de Wordbomb",
    understood: "¡Entendido!",
    
    // Room page
    roomTitle: "Sala",
    lobby: "Vestíbulo",
    lives: "Vidas",
    timer: "Tiempo",
    findWord: "Encuentra una palabra con",
    submitWordPlaceholder: "Tu palabra...",
    submit: "Enviar",
    
    // Chat
    chatPlaceholder: "Mensaje...",
    
    // Sidebar buttons
    settingsBtn: "Configuración",
    scenariosBtn: "Escenarios",
    themesBtn: "Temas",
    
    // Settings modal
    settingsTitle: "Configuración del juego",
    spaceSubmit: "Espacio = guión + enviar",
    extraTime: "Segundos adicionales",
    apply: "Aplicar",
    close: "Cerrar",
    
    // Scenarios modal
    scenariosTitle: "Escenarios",
    scenariosSubtitle: "Elige un escenario predefinido",
    noScenario: "Sin escenario",
    scenario4letters: "4 letras",
    scenarioSub8: "sub8",
    scenarioSub50: "sub50",
    scenarioTrainSkip: "Salto de entrenamiento",
    
    // Train Skip Category modal
    trainSkipCategoryTitle: "Salto de entrenamiento - Categoría",
    trainSkipCategoryDesc: "Elige la categoría de sílabas fallidas para entrenar",
    
    // WPP
    wppTitle: "WPP (subN)",
    wppIncompatible: "Incompatible con escenarios",
    
    // Practice mode
    practiceMode: "Modo Práctica",
    noLifeLoss: "Sin pérdida de vidas",
    
    // Themes modal
    themesTitle: "Temas",
    themesSubtitle: "Personaliza la apariencia",
    
    // System messages
    systemMessages: "Mensajes del sistema",
    
    // Game modes
    modeOriginal: "Original",
    modeClassic: "Clásico",
    modeZenith: "Cenit"
  }
};

// Utilitaires de traduction
class I18n {
  constructor() {
    this.currentLang = this.loadLanguage();
    this.listeners = [];
  }
  
  loadLanguage() {
    try {
      return localStorage.getItem('wb_language') || 'fr';
    } catch (e) {
      return 'fr';
    }
  }
  
  setLanguage(lang) {
    if (!TRANSLATIONS[lang]) {
      console.warn(`Language ${lang} not supported`);
      return;
    }
    this.currentLang = lang;
    try {
      localStorage.setItem('wb_language', lang);
    } catch (e) {
      console.warn('Cannot save language preference', e);
    }
    this.updatePage();
    this.notifyListeners();
  }
  
  onChange(callback) {
    if (typeof callback === 'function') {
      this.listeners.push(callback);
    }
  }
  
  notifyListeners() {
    this.listeners.forEach(callback => {
      try {
        callback(this.currentLang);
      } catch (e) {
        console.warn('Error in i18n listener:', e);
      }
    });
  }
  
  t(key) {
    return TRANSLATIONS[this.currentLang]?.[key] || TRANSLATIONS.fr[key] || key;
  }
  
  updatePage() {
    // Mettre à jour tous les éléments avec data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const translation = this.t(key);
      
      if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'search')) {
        el.placeholder = translation;
      } else {
        el.textContent = translation;
      }
    });
    
    // Mettre à jour les attributs data-i18n-attr
    document.querySelectorAll('[data-i18n-attr]').forEach(el => {
      const attrMap = el.getAttribute('data-i18n-attr');
      try {
        const pairs = JSON.parse(attrMap);
        Object.entries(pairs).forEach(([attr, key]) => {
          el.setAttribute(attr, this.t(key));
        });
      } catch (e) {
        console.warn('Invalid data-i18n-attr format', e);
      }
    });
  }
}

// Instance globale
window.i18n = new I18n();

// Auto-initialisation
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.i18n.updatePage());
} else {
  window.i18n.updatePage();
}
