/*
  gamecore.js - Core engine (corrected & robust)
  - Expose: init(opts), startGame(opts), stopGame(), submitWord(word), takeLife(),
           setScenario, setApiBase, setTrainAllowed, getState
  - Attempts to load syllable stats from API; if unavailable, uses dictionary.txt fallback.
  - Avoids emitting the same syllable twice during a running game (emittedSyllables).
  - When a trainAllowedSet is provided, emits only from that set and stops the game when exhausted.
*/

(function (global) {
  'use strict';

  const DEFAULTS = {
    apiBaseUrl: '',
    dictionaryPath: '/dictionary.txt',
    timerMs: 6000,
    initialLives: 2,
    syllableLengths: [2, 3],
    allow4LettersScenarioName: '4 lettres'
  };

  const state = {
    apiBaseUrl: DEFAULTS.apiBaseUrl,
    dictionaryPath: DEFAULTS.dictionaryPath,
    timerMs: DEFAULTS.timerMs,
    lives: DEFAULTS.initialLives,
    running: false,
    currentSyllable: null,
    currentSyllableLength: 2,
    roundTimerId: null,
    roundTickIntervalId: null,
    roundEndTs: null,
    syllableCounts: { 2: new Map(), 3: new Map(), 4: new Map() },
    wordsBySyllable: {},    // { 'SYL': ['WORD', ...] } where key is uppercase
    dictionarySet: null,
    totalSyllableCountsReady: false,
    scenario: 'random',
    onSyllable: null,
    onTimerTick: null,
    onLivesUpdate: null,
    onRoundWin: null,
    onRoundLose: null,
    onGameOver: null,
    onInfo: null,

    // New fields:
    emittedSyllables: new Set(),   // syllables already emitted during the running game
    trainAllowedSet: null          // Set (uppercase) or null ; when provided, only emit from that set
  };

  // ---------- Helpers ----------
  function logInfo(msg) {
    if (typeof state.onInfo === 'function') state.onInfo(msg);
    else console.info('[WordbombCore]', msg);
  }

  function normalizeWord(raw) { return raw ? String(raw).trim().toUpperCase() : ''; }
  function isLetter(c) { return /\p{L}/u.test(c); }
  function wordParts(word) { return word.split('-').filter(Boolean); }
  function toKey(s) { return String(s || '').toUpperCase(); }

  function computeSyllableStatsFromDict(dictText, lengths = [2, 3, 4], maxWordsPerSyll = 200) {
    logInfo('Computing syllable stats from dictionary...');
    const maps = {};
    lengths.forEach(L => maps[L] = new Map());
    const wordsBySyll = {};
    const lines = dictText.split(/\r?\n/);
    let processed = 0;
    for (const rawLine of lines) {
      const w = normalizeWord(rawLine);
      if (!w) continue;
      processed++;
      const parts = wordParts(w);
      // Compter les mots DISTINCTS : une seule fois par mot meme si la syllabe
      // apparait plusieurs fois dans le meme mot
      const seenSylsInWord = {};
      lengths.forEach(L => { seenSylsInWord[L] = new Set(); });
      for (const part of parts) {
        for (const L of lengths) {
          if (part.length < L) continue;
          for (let i = 0; i <= part.length - L; i++) {
            const syl = part.substring(i, i + L);
            if (![...syl].every(isLetter)) continue;
            seenSylsInWord[L].add(syl);
          }
        }
      }
      // Incrementer le compteur UNE SEULE FOIS par mot pour chaque syllabe
      lengths.forEach(L => {
        for (const syl of seenSylsInWord[L]) {
          const m = maps[L];
          m.set(syl, (m.get(syl) || 0) + 1);
          if (!wordsBySyll[syl]) wordsBySyll[syl] = [];
          if (wordsBySyll[syl].length < maxWordsPerSyll) wordsBySyll[syl].push(w);
        }
      });
    }
    logInfo(`Computed syllable stats (${processed} words).`);
    return { maps, wordsBySyll };
  }

  async function fetchText(url, timeoutMs = 6000) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const opt = controller ? { signal: controller.signal } : {};
    if (controller) setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, opt);
    if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`);
    return await res.text();
  }

  async function fetchJson(url, timeoutMs = 6000) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const opt = controller ? { signal: controller.signal } : {};
    if (controller) setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, opt);
    if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`);
    return await res.json();
  }

  // If apiBaseUrl provided, try API first; if not or failing, try dictionaryPath fallback
  async function prepareSyllableDataIfNeeded() {
    if (state.totalSyllableCountsReady) {
      return;
    }

    const lengths = [2, 3, 4];
    let loaded = false;

    if (state.apiBaseUrl) {
      try {
        logInfo(`Attempting to load syllable-stats from API base ${state.apiBaseUrl}`);
        for (const L of lengths) {
          try {
            const url = `${state.apiBaseUrl.replace(/\/$/, '')}/syllable-stats?length=${L}`;
            const json = await fetchJson(url);
            const m = new Map();
            Object.keys(json || {}).forEach(k => m.set(String(k).toUpperCase(), json[k]));
            state.syllableCounts[L] = m;
          } catch (e) {
            logInfo(`Could not load syllable-stats length=${L} from API: ${e.message}`);
            // continue trying other lengths
          }
        }
        // Try to fetch some words-by-syllable endpoint to populate wordsBySyllable lazily
        try {
          const sampleUrl = `${state.apiBaseUrl.replace(/\/$/, '')}/top-syllables?length=2&limit=50`;
          const sample = await fetchJson(sampleUrl);
          if (sample && Array.isArray(sample.top)) {
            for (const it of sample.top) {
              const syl = String(it.syl || '').toUpperCase();
              if (syl && !state.wordsBySyllable[syl]) state.wordsBySyllable[syl] = [];
            }
          }
        } catch (e) {
          // not fatal
        }

        // Check whether we loaded any counts
        const anyCount = lengths.some(L => state.syllableCounts[L] && state.syllableCounts[L].size > 0);
        if (anyCount) {
          state.totalSyllableCountsReady = true;
          logInfo('Loaded syllable stats from API.');
          loaded = true;
        } else {
          logInfo('API reachable but no syllable counts returned.');
        }
      } catch (err) {
        logInfo('API fetch failed: ' + (err && err.message ? err.message : err));
      }
    }

    if (!loaded) {
      // Fallback: attempt to fetch dictionary.txt from apiBaseUrl/dictionary.txt or local dictionaryPath
      try {
        let dictUrl = null;
        if (state.apiBaseUrl) dictUrl = state.apiBaseUrl.replace(/\/$/, '') + state.dictionaryPath;
        else dictUrl = state.dictionaryPath;
        logInfo(`Attempting to load dictionary from ${dictUrl} for local computation...`);
        const txt = await fetchText(dictUrl);
        const lines = txt.split(/\r?\n/).map(l => normalizeWord(l)).filter(Boolean);
        state.dictionarySet = new Set(lines);
        const { maps, wordsBySyll } = computeSyllableStatsFromDict(txt, lengths);
        lengths.forEach(L => state.syllableCounts[L] = maps[L]);
        state.wordsBySyllable = wordsBySyll;
        state.totalSyllableCountsReady = true;
        logInfo('Syllable stats computed locally from dictionary.');
        loaded = true;
      } catch (err) {
        logInfo('Could not load dictionary for local computation: ' + (err && err.message ? err.message : err));
      }
    }

    if (!loaded) {
      // Final fallback: no stats available — keep maps empty but do not throw.
      state.totalSyllableCountsReady = false;
      logInfo('No syllable stats available (API/dictionary both failed). Fallback behavior will be used.');
    }
  }

  // choose weighted; avoid emitting syllables already in state.emittedSyllables.
  // If a trainAllowedSet is present, only consider syllables in that set.
  // Return null if no candidate exists (caller should handle end-of-game).
  function chooseWeightedSyllable(length, options = {}) {
    const map = state.syllableCounts[length];
    const emitted = state.emittedSyllables || new Set();
    const allowed = state.trainAllowedSet || null; // Set or null

    // Helper to check allowed/emitted
    function isAllowedAndNotEmitted(syl) {
      const S = String(syl || '').toUpperCase();
      if (allowed && !allowed.has(S)) return false;
      if (emitted && emitted.has(S)) return false;
      return true;
    }

    // PRIORITY 1: If trainAllowedSet exists, use ONLY those syllables
    if (allowed) {
      const allowedRemaining = Array.from(allowed).map(s => String(s||'').toUpperCase()).filter(s => s && (!emitted || !emitted.has(s)));
      if (allowedRemaining.length === 0) {
        // truly exhausted
        return null;
      }

      // Prefer allowedRemaining entries that exist in the stats map (if available)
      const present = (map && map.size > 0) ? allowedRemaining.filter(s => map.has(s)) : [];
      if (present.length > 0) {
        // choose weighted among present using counts if available
        let total = 0;
        const entries = present.map(s => {
          const w = Number((map.get(s) || 1));
          total += w;
          return { s, w };
        });
        let r = Math.random() * total;
        for (const e of entries) {
          if (r < e.w) return e.s;
          r -= e.w;
        }
        return entries[entries.length - 1].s;
      }

      // Otherwise pick uniformly from allowedRemaining
      return allowedRemaining[Math.floor(Math.random() * allowedRemaining.length)];
    }

    // PRIORITY 2: If we have map-based stats (and NO trainAllowedSet), use weighted sampling
    if (map && map.size > 0) {
      const exactCount = options.exactCount || null;   // WPP: only syllables with exactly this count
      const minCount   = options.minCount   || 0;      // minimum word count filter
      const entries = [];
      let totalWeight = 0;
      for (const [syl, cnt] of map.entries()) {
        const S = String(syl || '').toUpperCase();
        if (!isFinite(cnt) || cnt <= 0) continue;
        if (!isAllowedAndNotEmitted(S)) continue;
        // WPP exactCount : keep only syllables whose count matches exactly
        if (exactCount !== null && cnt !== exactCount) continue;
        // minCount filter (when no exactCount)
        if (exactCount === null && cnt < minCount) continue;
        entries.push({ syl: S, weight: cnt });
        totalWeight += cnt;
      }
      if (entries.length === 0) {
        // Relax filter: keep emitted restriction but drop exactCount/minCount
        for (const [syl, cnt] of map.entries()) {
          const S = String(syl || '').toUpperCase();
          if (!isFinite(cnt) || cnt <= 0) continue;
          if (emitted && emitted.has(S)) continue;
          entries.push({ syl: S, weight: cnt });
          totalWeight += cnt;
        }
      }
      if (entries.length > 0) {
        let r = Math.random() * totalWeight;
        for (const e of entries) {
          if (r < e.weight) return e.syl;
          r -= e.weight;
        }
        return entries[entries.length - 1].syl;
      }
    }

    // 3) Fallback: pick from wordsBySyllable keys for this length (not emitted, respect allowed)
    const keys = Object.keys(state.wordsBySyllable || {}).map(k => String(k || '').toUpperCase())
      .filter(k => {
        if (k.length !== length) return false;
        if (state.emittedSyllables && state.emittedSyllables.has(k)) return false;
        if (allowed && !allowed.has(k)) return false; // Respect trainAllowedSet
        return true;
      });

    if (keys.length > 0) {
      return keys[Math.floor(Math.random() * keys.length)];
    }

    // 4) Final builtin fallback (avoid emitted, respect allowed)
    const builtinAll = (length === 2) ? ['RE','LA','TI','ON','US','BA','LO','PO','CL','TR'] :
                       (length === 3) ? ['TRO','CLA','SAL','ZIN','CLO','PAR'] :
                       ['QUIZ','TION'];
    const builtin = builtinAll.filter(s => {
      if (state.emittedSyllables.has(s)) return false;
      if (allowed && !allowed.has(s)) return false; // Respect trainAllowedSet
      return true;
    });
    if (builtin.length > 0) return builtin[Math.floor(Math.random() * builtin.length)];

    // Nothing left
    return null;
  }

  function interpretScenario(scenario) {
    const scen = String(scenario || '').trim().toLowerCase();
    if (!scen || scen === 'random') return { lengths: DEFAULTS.syllableLengths, minCount: 0 };
    if (scen === DEFAULTS.allow4LettersScenarioName.toLowerCase() || scen === '4 lettres' || scen === '4lettres') {
      return { lengths: [4], minCount: 0 };
    }
    const subMatch = scen.match(/^sub(\d+)$/i);
    if (subMatch) {
      const n = parseInt(subMatch[1], 10);
      // WPP subN : ne garder que les syllabes ayant EXACTEMENT n mots disponibles
      if (!isNaN(n) && n > 0) return { lengths: DEFAULTS.syllableLengths, minCount: n, exactCount: n };
    }
    if (scen === 'train skip' || scen === 'train-skip' || scen === 'train') {
      return { lengths: DEFAULTS.syllableLengths, minCount: 0, trainSkip: true };
    }
    return { lengths: DEFAULTS.syllableLengths, minCount: 0 };
  }

  async function startRound() {
    if (!state.running) return;
    // Ensure we attempted to prepare data
    try {
      await prepareSyllableDataIfNeeded();
    } catch (err) {
      logInfo('Warning: prepareSyllableDataIfNeeded error: ' + (err && err.message ? err.message : err));
      // continue — will use fallback
    }

    const info = interpretScenario(state.scenario);
    const chosenLength = (info.lengths && info.lengths.length > 0) ? info.lengths[Math.floor(Math.random() * info.lengths.length)] : DEFAULTS.syllableLengths[0];
    state.currentSyllableLength = chosenLength;

    let syl;
    try {
      syl = chooseWeightedSyllable(chosenLength, { minCount: info.minCount || 0, exactCount: info.exactCount || null });
    } catch (err) {
      logInfo('chooseWeightedSyllable failed, using fallback: ' + (err && err.message ? err.message : err));
      const keys = Object.keys(state.wordsBySyllable || {});
      if (keys.length > 0) syl = keys[Math.floor(Math.random() * keys.length)];
      else syl = chooseWeightedSyllable(chosenLength, {});
    }

    // If chooseWeightedSyllable returned null -> exhaustion (mostly when trainAllowedSet present and all used)
    if (syl === null) {
      logInfo('No candidate syllable available (exhausted allowed set / no remaining syllables). Stopping game.');
      state.running = false;
      clearRoundTimers();
      if (typeof state.onGameOver === 'function') state.onGameOver();
      return;
    }

    state.currentSyllable = syl;
    // mark emitted so we don't emit it again
    try { state.emittedSyllables.add(String(syl || '').toUpperCase()); } catch (e) {}

    const count = (state.syllableCounts[chosenLength] && state.syllableCounts[chosenLength].get(syl)) || (state.wordsBySyllable[syl] ? state.wordsBySyllable[syl].length : 0);

    startTimer(state.timerMs);

    if (typeof state.onSyllable === 'function') {
      try {
        state.onSyllable({ syl, count, length: chosenLength });
      } catch (err) {
        logInfo('onSyllable callback error: ' + (err && err.message ? err.message : err));
      }
    }
    logInfo(`New syllable ${syl} (len=${chosenLength}, count=${count})`);
  }

  function startTimer(ms) {
    clearRoundTimers();
    const startTs = Date.now();
    state.roundEndTs = startTs + ms;
    state.roundTickIntervalId = setInterval(() => {
      const rem = Math.max(0, state.roundEndTs - Date.now());
      if (typeof state.onTimerTick === 'function') state.onTimerTick(rem);
    }, 100);
    state.roundTimerId = setTimeout(() => {
      const info = interpretScenario(state.scenario);
      if (!info.trainSkip) {
        state.lives -= 1;
        if (typeof state.onLivesUpdate === 'function') state.onLivesUpdate(state.lives);
      } else {
        logInfo('Train-skip: no life lost on timeout.');
      }
      if (typeof state.onRoundLose === 'function') state.onRoundLose(state.currentSyllable);
      if (state.lives <= 0) {
        state.running = false;
        clearRoundTimers();
        if (typeof state.onGameOver === 'function') state.onGameOver();
      } else {
        // start next round (best-effort)
        if (state.running) startRound().catch(e => logInfo(`Error starting next round: ${e.message}`));
      }
    }, ms);
  }

  function clearRoundTimers() {
    if (state.roundTimerId) { clearTimeout(state.roundTimerId); state.roundTimerId = null; }
    if (state.roundTickIntervalId) { clearInterval(state.roundTickIntervalId); state.roundTickIntervalId = null; }
    state.roundEndTs = null;
    if (typeof state.onTimerTick === 'function') state.onTimerTick(0);
  }

  async function validateSubmission(word) {
    if (!word || !state.currentSyllable) return false;
    const normalized = normalizeWord(word);
    const syl = toKey(state.currentSyllable);
    const parts = wordParts(normalized);
    let contains = false;
    for (const p of parts) {
      if (p.includes(syl)) { contains = true; break; }
    }
    if (!contains) return false;
    if (state.dictionarySet) return state.dictionarySet.has(normalized);
    if (state.apiBaseUrl) {
      try { return await validateWordViaApi(normalized); }
      catch (err) { logInfo(`Word validation via API failed: ${err.message}`); return false; }
    }
    // Without dictionary set or API, be permissive (allow) to avoid blocking gameplay
    return true;
  }

  async function validateWordViaApi(word) {
    if (!state.apiBaseUrl) throw new Error('No apiBaseUrl configured');
    const url = `${state.apiBaseUrl.replace(/\/$/, '')}/validate?word=${encodeURIComponent(word)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API validate failed: ${res.status}`);
    const json = await res.json();
    return json.exists === true;
  }

  async function submitWord(word) {
    if (!state.running || !state.currentSyllable) return false;
    const normalized = normalizeWord(word);
    if (!normalized) return false;
    let ok = false;
    try { ok = await validateSubmission(normalized); } catch (err) { logInfo(`Error validating submission: ${err.message}`); ok = false; }
    if (ok) {
      clearRoundTimers();
      if (typeof state.onRoundWin === 'function') state.onRoundWin(normalized, state.currentSyllable);
      if (state.running) startRound().catch(e => logInfo(e.message));
      return true;
    } else {
      // incorrect -> no life penalty here
      return false;
    }
  }

  function takeLife() {
    if (!state.running) {
      logInfo('takeLife called but game is not running.');
      return;
    }
    state.lives -= 1;
    if (typeof state.onLivesUpdate === 'function') state.onLivesUpdate(state.lives);
    if (typeof state.onRoundLose === 'function') state.onRoundLose(state.currentSyllable);
    clearRoundTimers();
    if (state.lives <= 0) {
      state.running = false;
      if (typeof state.onGameOver === 'function') state.onGameOver();
    } else {
      if (state.running) startRound().catch(e => logInfo(e.message));
    }
  }

  // Public API
  async function init(opts = {}) {
    state.apiBaseUrl = (typeof opts.apiBaseUrl === 'string') ? opts.apiBaseUrl : DEFAULTS.apiBaseUrl;
    state.dictionaryPath = opts.dictionaryPath || DEFAULTS.dictionaryPath;
    state.timerMs = (typeof opts.timerMs === 'number') ? opts.timerMs : DEFAULTS.timerMs;
    state.lives = (typeof opts.initialLives === 'number') ? opts.initialLives : DEFAULTS.initialLives;
    state.onSyllable = opts.onSyllable || null;
    state.onTimerTick = opts.onTimerTick || null;
    state.onLivesUpdate = opts.onLivesUpdate || null;
    state.onRoundWin = opts.onRoundWin || null;
    state.onRoundLose = opts.onRoundLose || null;
    state.onGameOver = opts.onGameOver || null;
    state.onInfo = opts.onInfo || null;
    state.scenario = opts.scenario || 'random';
    state.totalSyllableCountsReady = false;
    state.dictionarySet = null;
    state.wordsBySyllable = {};
    state.syllableCounts = { 2: new Map(), 3: new Map(), 4: new Map() };
    state.emittedSyllables = new Set();
    state.trainAllowedSet = null;
    logInfo('WordbombCore initialized (robust).');
    return Promise.resolve();
  }

  async function startGame(opts = {}) {
    if (state.running) { logInfo('Game already running.'); return; }
    state.lives = (typeof opts.lives === 'number') ? opts.lives : state.lives || DEFAULTS.initialLives;
    state.timerMs = (typeof opts.timerMs === 'number') ? opts.timerMs : state.timerMs || DEFAULTS.timerMs;
    state.running = true;
    // reset emitted syllables at new game start
    state.emittedSyllables = new Set();
    if (typeof state.onLivesUpdate === 'function') state.onLivesUpdate(state.lives);
    try {
      await prepareSyllableDataIfNeeded();
      await startRound();
    } catch (err) {
      logInfo(`Could not start game cleanly: ${err.message}`);
      state.running = false;
    }
  }

  function stopGame() {
    state.running = false;
    clearRoundTimers();
    state.currentSyllable = null;
    logInfo('Game stopped.');
  }

  function setScenario(name) {
    state.scenario = name;
    logInfo(`Scenario set to: ${name}`);
  }

  function setApiBase(url) {
    state.apiBaseUrl = String(url || '').trim();
    logInfo(`API base set to: ${state.apiBaseUrl}`);
    // clear previously computed counts so prepare will reattempt
    state.totalSyllableCountsReady = false;
  }

  // New: provide an allowed set (array|set|null). When provided, core will only emit syllables from that set.
  function setTrainAllowed(allowed) {
    if (!allowed) {
      state.trainAllowedSet = null;
      logInfo('Train allowed set cleared.');
      return;
    }
    try {
      const arr = Array.isArray(allowed) ? allowed : Array.from(allowed);
      const s = new Set(arr.map(x => String(x || '').toUpperCase()).filter(Boolean));
      state.trainAllowedSet = s;
      logInfo(`Train allowed set set (${s.size} syllables).`);
      // If the allowed set is empty, stop the game proactively
      if (state.trainAllowedSet.size === 0 && state.running) {
        logInfo('Train allowed set empty -> stopping game.');
        state.running = false;
        clearRoundTimers();
        if (typeof state.onGameOver === 'function') state.onGameOver();
      }
    } catch (e) {
      console.warn('setTrainAllowed error', e);
      state.trainAllowedSet = null;
    }
  }

  function getState() {
    return {
      running: state.running,
      lives: state.lives,
      currentSyllable: state.currentSyllable,
      timerMs: state.timerMs,
      scenario: state.scenario,
      apiBaseUrl: state.apiBaseUrl
    };
  }


  // Bot word selection: finds a valid word containing the current syllable
  async function getBotWord(syllable, botName) {
    if (!syllable) {
      logInfo(`[getBotWord] Syllabe vide pour ${botName}`);
      return null;
    }
    const syl = toKey(syllable);
    logInfo(`[getBotWord] Bot ${botName} cherche un mot pour: ${syl}`);

    // Expanded fallback list (kept as final fallback)
    const fallbackWords = [
      // Frequent/covering words
      'TABLE','BALLE','BALLON','PIERRE','CARTE','ROUTE','COURIR','MANGER','STYLO','VOYAGE','ARBRE','FLEUR','TEMPS','MONDE','VILLE',
      'GRAND','PETIT','NOIR','BLANC','ROUGE','TIRE','BATEAU','BANANE','BARBE','CARTE','CAFE','CINEMA','COURIR','COULEUR','DORMIR',
      'MANGER','MAISON','MAIN','MERCI','PIERRE','POMME','ROUTE','RIVIERE','SOLEIL','SOIR','TOMBER','TIGE','VILLE','VOITURE','VOYAGE',
      'ECRIRE','JARDIN','JOUER','LIRE','TRAIN','PRINCE','CHANTER','FORET','PLAGE','FLEUR'
    ];

    // 1) Try local wordsBySyllable first (fast)
    if (state.wordsBySyllable && Array.isArray(state.wordsBySyllable[syl]) && state.wordsBySyllable[syl].length > 0) {
      const words = state.wordsBySyllable[syl];
      const word = words[Math.floor(Math.random() * words.length)];
      logInfo(`[getBotWord] Mot trouvé via wordsBySyllable: ${word}`);
      return { word, botName };
    }

    // 2) Try dictionarySet (if available)
    if (state.dictionarySet && state.dictionarySet.size > 0) {
      const matching = Array.from(state.dictionarySet).filter(w => w.includes(syl));
      if (matching.length > 0) {
        const word = matching[Math.floor(Math.random() * matching.length)];
        logInfo(`[getBotWord] Mot trouvé via dictionarySet: ${word}`);
        return { word, botName };
      }
    }

    // 3) Try API endpoint /words-by-syllable (preferred over the old /words-containing)
    if (state.apiBaseUrl) {
      try {
        const len = (typeof state.currentSyllableLength === 'number' && state.currentSyllableLength > 0) ? state.currentSyllableLength : syl.length;
        const url = `${state.apiBaseUrl.replace(/\/$/, '')}/words-by-syllable?syl=${encodeURIComponent(syl)}&length=${Math.max(2, len)}&limit=40`;
        logInfo(`[getBotWord] Tentative API words-by-syllable: ${url}`);
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const opt = controller ? { signal: controller.signal } : {};
        if (controller) setTimeout(() => controller.abort(), 2500);
        const res = await fetch(url, opt);
        if (res.ok) {
          const json = await res.json().catch(() => null);
          const arr = Array.isArray(json.words) ? json.words : (Array.isArray(json.results) ? json.results : (Array.isArray(json.data) ? json.data : []));
          if (arr && arr.length > 0) {
            const word = arr[Math.floor(Math.random() * arr.length)];
            logInfo(`[getBotWord] Mot trouvé via API words-by-syllable: ${word}`);
            return { word: normalizeWord(word), botName };
          }
        }
      } catch (e) {
        logInfo(`[getBotWord] API words-by-syllable échoué (ignoré): ${e && e.message ? e.message : e}`);
      }

      // 3b) Fallback: try /search?q=syl to get any matching words
      try {
        const url2 = `${state.apiBaseUrl.replace(/\/$/, '')}/search?q=${encodeURIComponent(syl)}&limit=40`;
        logInfo(`[getBotWord] Tentative API search: ${url2}`);
        const controller2 = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const opt2 = controller2 ? { signal: controller2.signal } : {};
        if (controller2) setTimeout(() => controller2.abort(), 2500);
        const res2 = await fetch(url2, opt2);
        if (res2.ok) {
          const json2 = await res2.json().catch(() => null);
          const arr2 = Array.isArray(json2.results) ? json2.results : (Array.isArray(json2.words) ? json2.words : (Array.isArray(json2.data) ? json2.data : []));
          if (arr2 && arr2.length > 0) {
            const word = arr2[Math.floor(Math.random() * arr2.length)];
            logInfo(`[getBotWord] Mot trouvé via API search: ${word}`);
            return { word: normalizeWord(word), botName };
          }
        }
      } catch (e) {
        logInfo(`[getBotWord] API search échoué (ignoré): ${e && e.message ? e.message : e}`);
      }
    }

    // 4) Use fallback list (best effort: prefer entries that contain syllable)
    const matching = fallbackWords.filter(w => w.includes(syl));
    if (matching.length > 0) {
      const word = matching[Math.floor(Math.random() * matching.length)];
      logInfo(`[getBotWord] Mot trouvé via fallback: ${word}`);
      return { word, botName };
    }

    // 5) Last resort: return any fallback word
    const word = fallbackWords[Math.floor(Math.random() * fallbackWords.length)];
    logInfo(`[getBotWord] Dernier recours (mot aléatoire): ${word}`);
    return { word, botName };
  }

  global.WordbombCore = {
    init,
    startGame,
    stopGame,
    submitWord,
    setScenario,
    setApiBase,
    setTrainAllowed,
    getState,
    takeLife,
    getBotWord,
    _internal: { state, prepareSyllableDataIfNeeded, computeSyllableStatsFromDict, startRound, clearRoundTimers }
  };
})(window);
