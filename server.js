/**
 * server.js
 *
 * Express API for Wordbomb (complete file)
 * - Provides syllable stats, words-by-syllable, validation, top-syllables, search
 * - Adds admin endpoints to add/remove words in dictionary.txt
 * - Serves static files (index.html / room.html / client assets) from repo root
 * - Lightweight in-memory rate limiting for public endpoints
 * - Anti-scraping protection for dictionary.txt
 *
 * Usage:
 *  - set ADMIN_TOKEN=... to require admin token for protected endpoints (recommended in production)
 *  - set DICT_PATH to point to your dictionary.txt (default: ./dictionary.txt)
 *  - set ANTISCRAPING_SECRET=... for anti-scraping encryption (recommended in production)
 *  - set CORS_ORIGIN=https://yourdomain.com to restrict CORS in production (recommended)
 *  - npm install && node server.js
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const http = require('http');
const { Server } = require('socket.io');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const AntiScraping = require('./antiscraping');
const RoomManager = require('./roomManager');

// ----- Helpers sécurité -----

/**
 * Échappe les caractères HTML dangereux pour prévenir les injections XSS.
 */
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Valide qu'une chaîne n'est pas vide et respecte une longueur max.
 */
function validateStringInput(value, maxLength = 300) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength;
}

const PORT = process.env.PORT || 3000;
const DICT_PATH = process.env.DICT_PATH || path.join(__dirname, 'dictionary.txt');
const LENGTHS = [2, 3, 4]; // Uniquement les longueurs utiles en jeu (économie mémoire)
const SAMPLE_WORDS_CAP = parseInt(process.env.SAMPLE_CAP || '30', 10); // per syllable

// Security/config
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || ''; // if empty -> dev mode: dictionary route remains public
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 120); // requests per IP per window (adjustable)

// Anti-scraping protection
const protector = new AntiScraping({
  secret: process.env.ANTISCRAPING_SECRET || 'dev-mode-secret-change-in-production',
  maxRequestsPerMinute: 30,
  maxRequestsPerHour: 300,
  maxWordsPerRequest: 50,
  suspicionThreshold: 100
});
console.log('🛡️  Anti-scraping protection enabled');

const app = express();
app.set('trust proxy', true); // Railway passe l'IP réelle via X-Forwarded-For
// CORS : en production, définir CORS_ORIGIN avec le domaine autorisé (ex: https://monsite.com)
// En dev, '*' est utilisé comme fallback mais un avertissement est émis.
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
if (CORS_ORIGIN === '*' && process.env.NODE_ENV === 'production') {
  console.warn('⚠️  CORS_ORIGIN non défini en production — tous les origines sont autorisés. Définissez CORS_ORIGIN dans votre .env');
}
const corsOptions = {
  origin: CORS_ORIGIN === '*' ? '*' : (origin, callback) => {
    const allowed = CORS_ORIGIN.split(',').map(s => s.trim());
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Origine non autorisée par la politique CORS'));
    }
  },
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-admin-token', 'x-staff-token']
};
app.use(cors(corsOptions));
app.use(express.json());

// Block direct access to dictionary.txt BEFORE static middleware
app.get('/dictionary.txt', (req, res) => {
  return res.status(403).json({ error: 'forbidden', message: 'Access denied.' });
});

// Serve static files from repository root so http://localhost:3000/index.html works
app.use(express.static(path.join(__dirname)));

// Apply anti-scraping middlewares (but skip for admin routes)
app.use((req, res, next) => {
  // Skip anti-scraping for admin endpoints
  if (req.path.startsWith('/admin/')) {
    return next();
  }
  protector.middleware()(req, res, next);
});

app.use((req, res, next) => {
  // Skip dictionary blocking for admin endpoints
  if (req.path.startsWith('/admin/')) {
    return next();
  }
  protector.blockDictionaryAccess()(req, res, next);
});

// Honeypots (traps for bots)
app.get('/api/v1/dictionary/full', protector.createHoneypot());
app.get('/admin/dictionary', protector.createHoneypot());
app.get('/backup/words.txt', protector.createHoneypot());

let ready = false;
let readyMessage = 'Initializing';
const syllableCounts = {}; // { 2: Map, 3: Map, 4: Map }
const wordsBySyll = {};   // { '2:RE': ['REVE', 'REMISE', ...], ... }
let dictionarySet = null;  // Set<number> (FNV-1a hashes) - much lower memory than Set<string>

// FNV-1a 32-bit hash
function hashWord(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h;
}

function dictHas(word) {
  if (!dictionarySet) return false;
  return dictionarySet.has(hashWord(word));
}

function getSyllableCount(syl) {
  if (!syl) return null;
  const L = syl.length;
  const map = syllableCounts[L];
  if (!map) return null;
  return map.get(String(syl).toUpperCase()) || null;
}

// initialize maps
LENGTHS.forEach(L => {
  syllableCounts[L] = new Map();
});

// --------------------------- simple rate limiter ---------------------------
// small in-memory rate limiter keyed by IP and path.
// Not for production distributed use (use Redis/cluster-safe store).
const rateBuckets = new Map();

function pruneBuckets() {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets.entries()) {
    if (now - bucket.ts > RATE_LIMIT_WINDOW_MS * 5) rateBuckets.delete(key);
  }
}
setInterval(pruneBuckets, RATE_LIMIT_WINDOW_MS * 3);

function rateLimitMiddleware(req, res, next) {
  try {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const key = `${ip}:${req.path}`;
    const now = Date.now();
    let bucket = rateBuckets.get(key);
    if (!bucket) {
      bucket = { ts: now, count: 1 };
      rateBuckets.set(key, bucket);
      return next();
    }
    if (now - bucket.ts < RATE_LIMIT_WINDOW_MS) {
      bucket.count++;
      if (bucket.count > RATE_LIMIT_MAX) {
        res.setHeader('Retry-After', Math.ceil((bucket.ts + RATE_LIMIT_WINDOW_MS - now) / 1000));
        return res.status(429).json({ error: 'rate_limited', message: 'Too many requests, slow down' });
      }
      return next();
    } else {
      bucket.ts = now;
      bucket.count = 1;
      return next();
    }
  } catch (err) {
    // If limiter fails for some reason, allow request (fail-open)
    return next();
  }
}

// Apply rate limiting to endpoints that could be abused
const rateLimitedPaths = ['/syllable-stats', '/words-by-syllable', '/validate', '/top-syllables', '/search'];
app.use((req, res, next) => {
  if (rateLimitedPaths.includes(req.path)) return rateLimitMiddleware(req, res, next);
  return next();
});

// --------------------------- utilities -------------------------------------
function normalizeWord(raw) {
  if (!raw) return '';
  return String(raw).trim().toUpperCase();
}

function wordParts(word) {
  // split on hyphen and filter empty parts
  return word.split('-').filter(Boolean);
}

function isAllLetters(s) {
  return /^[\p{L}]+$/u.test(s);
}

// --------------------------- dictionary builder ----------------------------
async function buildStatsFromDictionary(dictPath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(dictPath)) {
      return reject(new Error(`Dictionary file not found at ${dictPath}`));
    }

    const dictStream = fs.createReadStream(dictPath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: dictStream, crlfDelay: Infinity });

    dictionarySet = new Set();

    let linesProcessed = 0;

    rl.on('line', (line) => {
      const word = normalizeWord(line);
      if (!word) return;

      linesProcessed++;
      dictionarySet.add(hashWord(word));

      const parts = wordParts(word);
      // Compter les mots DISTINCTS : une seule fois par mot meme si la syllabe
      // apparait plusieurs fois dans le meme mot
      const seenSylsInWord = {};
      LENGTHS.forEach(L => { seenSylsInWord[L] = new Set(); });

      for (const part of parts) {
        LENGTHS.forEach(L => {
          if (part.length < L) return;
          for (let i = 0; i <= part.length - L; i++) {
            const syl = part.substring(i, i + L);
            if (!isAllLetters(syl)) continue;
            seenSylsInWord[L].add(syl);
          }
        });
      }

      // Incrementer le compteur UNE SEULE FOIS par mot pour chaque syllabe trouvee
      LENGTHS.forEach(L => {
        for (const syl of seenSylsInWord[L]) {
          const map = syllableCounts[L];
          map.set(syl, (map.get(syl) || 0) + 1);

          const key = `${L}:${syl}`;
          if (!wordsBySyll[key]) wordsBySyll[key] = [];
          if (wordsBySyll[key].length < SAMPLE_WORDS_CAP) {
            wordsBySyll[key].push(word);
          }
        }
      });
    });

    rl.on('close', () => {
      resolve({ linesProcessed });
    });

    rl.on('error', (err) => {
      reject(err);
    });
  });
}

async function prepare() {
  ready = false;
  readyMessage = 'Starting build';
  try {
    console.log(`Preparing dictionary stats from ${DICT_PATH} ...`);
    // Reset data structures before building
    LENGTHS.forEach(L => {
      syllableCounts[L] = new Map();
    });
    Object.keys(wordsBySyll).forEach(k => delete wordsBySyll[k]);
    dictionarySet = new Set(); // Set<number> hashes

    const t0 = Date.now();
    const { linesProcessed } = await buildStatsFromDictionary(DICT_PATH);
    const t1 = Date.now();
    console.log(`Processed ${linesProcessed} lines in ${(t1 - t0) / 1000}s.`);

    LENGTHS.forEach(L => {
    });

    ready = true;
    readyMessage = 'Ready';
  } catch (err) {
    console.error('Error preparing dictionary:', err);
    ready = false;
    readyMessage = `Error: ${err.message}`;
  }
}

// --------------------------- admin/token helpers ---------------------------
function hasAdminToken(req) {
  if (!ADMIN_TOKEN) return true; // dev: no token configured -> allow
  const header = (req.get('x-admin-token') || '').trim();
  const q = (req.query && req.query.adminToken) ? String(req.query.adminToken).trim() : '';
  return (header && header === ADMIN_TOKEN) || (q && q === ADMIN_TOKEN);
}

// --------------------------- endpoints -------------------------------------
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/ready', (req, res) => {
  res.json({ ready, message: readyMessage });
});

// Protected dictionary route:
// - If ADMIN_TOKEN is set, require admin token in header x-admin-token or query param adminToken.
// - If ADMIN_TOKEN is not set, behave as before (convenience for local dev).
// - Now also blocked by anti-scraping middleware (returns 404 even with admin token)
app.get('/dictionary.txt', (req, res) => {
  // This endpoint is now blocked by protector.blockDictionaryAccess()
  // Even with admin token, direct dictionary download is not allowed
  // Use the API endpoints instead
  if (!hasAdminToken(req)) {
    return res.status(403).json({ error: 'forbidden', message: 'Admin token required' });
  }
  
  // Even with admin token, we don't serve the full dictionary
  return res.status(410).json({
    error: 'deprecated',
    message: 'Direct dictionary download is no longer supported. Use the API endpoints instead.'
  });
});

// syllable stats endpoint (rate limited)
app.get('/syllable-stats', (req, res) => {
  if (!ready) return res.status(503).json({ error: 'not ready', message: readyMessage });

  const lenParam = parseInt(req.query.length, 10);
  const L = Number.isFinite(lenParam) ? lenParam : 2;
  if (!LENGTHS.includes(L)) {
    return res.status(400).json({ error: 'invalid length', allowed: LENGTHS });
  }

  const map = syllableCounts[L];
  const obj = Object.create(null);
  for (const [syl, cnt] of map.entries()) {
    obj[syl] = cnt;
  }

  res.json(obj);
});

// words by syllable (rate limited)
app.get('/words-by-syllable', (req, res) => {
  if (!ready) return res.status(503).json({ error: 'not ready', message: readyMessage });

  const syl = normalizeWord(req.query.syl || '');
  const len = parseInt(req.query.length, 10);
  const L = Number.isFinite(len) ? len : (syl.length || 2);
  const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);

  if (!syl) return res.status(400).json({ error: 'syl required' });
  if (!LENGTHS.includes(L)) return res.status(400).json({ error: 'invalid length', allowed: LENGTHS });
  if (syl.length !== L) return res.status(400).json({ error: 'syl length mismatch' });

  const key = `${L}:${syl}`;
  const arr = wordsBySyll[key] || [];
  res.json({ syllable: syl, length: L, words: arr.slice(0, limit) });
});

// validate word existence (rate limited)
app.get('/validate', (req, res) => {
  if (!ready) return res.status(503).json({ error: 'not ready', message: readyMessage });

  const q = normalizeWord(req.query.word || '');
  if (!q) return res.status(400).json({ error: 'word required' });

  const exists = dictHas(q);
  res.json({ exists: !!exists });
});

// top syllables (rate limited)
app.get('/top-syllables', (req, res) => {
  if (!ready) return res.status(503).json({ error: 'not ready', message: readyMessage });

  const len = parseInt(req.query.length, 10) || 2;
  const limit = parseInt(req.query.limit, 10) || 100;
  if (!LENGTHS.includes(len)) return res.status(400).json({ error: 'invalid length', allowed: LENGTHS });

  const items = Array.from(syllableCounts[len].entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([syl, cnt]) => ({ syl, cnt }));

  res.json({ length: len, top: items });
});

/**
 * /search endpoint
 * - q (or query) param required
 * - limit optional (default 10)
 * Behavior:
 * - If q length is 2..4 and we have wordsBySyll for that syl, return wordsBySyll['L:Q'] (fast)
 * - Otherwise scan dictionarySet for words containing q (case-insensitive), return up to limit
 *
 * This endpoint is rate-limited (see middleware).
 */
app.get('/search', (req, res) => {
  if (!ready) return res.status(503).json({ error: 'not ready', message: readyMessage });

  const rawQ = req.query.q || req.query.query || req.query.word || '';
  const q = normalizeWord(rawQ);
  if (!q) return res.status(400).json({ error: 'q (query) parameter required' });

  const limit = Math.max(1, Math.min(200, parseInt(req.query.limit, 10) || 10));

  // 1) If q length is 2..4 and we have wordsBySyll for that syllable, use it (fast path)
  if (q.length >= 2 && q.length <= 4) {
    const key = `${q.length}:${q}`;
    const list = wordsBySyll[key];
    if (Array.isArray(list) && list.length > 0) {
      // return the slice (already uppercase normalized)
      return res.json({ query: q, source: 'by-syllable', total: list.length, results: list.slice(0, limit) });
    }
    // If wordsBySyll not available for this exact syl, fallthrough to scanning dictionary
  }

  // 2) Fallback: scan wordsBySyll samples (dictionarySet est un Set de hashes, non itérable).
  if (!dictionarySet || dictionarySet.size === 0) {
    return res.json({ query: q, source: 'none', total: 0, results: [] });
  }

  const results = [];
  const seen = new Set();
  for (const key of Object.keys(wordsBySyll)) {
    for (const w of wordsBySyll[key]) {
      if (!seen.has(w) && w.includes(q)) {
        seen.add(w);
        results.push(w);
        if (results.length >= limit) break;
      }
    }
    if (results.length >= limit) break;
  }

  res.json({ query: q, source: 'scan', total: results.length, results });
});

// ------------------------------------------------------------------
// Admin: add / remove words in dictionary (protected by ADMIN_TOKEN)
// ------------------------------------------------------------------
app.post('/admin/add-word', (req, res) => {
  if (!hasAdminToken(req)) return res.status(403).json({ error: 'forbidden' });

  const raw = (req.body && req.body.word) ? String(req.body.word) : '';
  const word = normalizeWord(raw);
  if (!word || !isAllLetters(word)) return res.status(400).json({ error: 'invalid_word', message: 'word required (letters only)' });

  // Ensure dictionary exists
  if (!fs.existsSync(DICT_PATH)) {
    // create file with the new word
    try {
      fs.writeFileSync(DICT_PATH, word + '\n', 'utf8');
    } catch (err) {
      console.error('add-word create file error:', err);
      return res.status(500).json({ error: 'io_error', message: 'could not create dictionary file' });
    }
    // Rebuild stats
    prepare().then(() => {
      return res.json({ added: true, word });
    }).catch((e) => {
      console.warn('prepare after add failed', e);
      return res.json({ added: true, word, warning: 'rebuild_failed' });
    });
    return;
  }

  // Already present?
  if (dictionarySet && dictHas(word)) {
    return res.json({ added: false, message: 'already_exists', word });
  }

  // Append line (ensure newline)
  const line = word + '\n';
  fs.appendFile(DICT_PATH, line, 'utf8', (err) => {
    if (err) {
      console.error('add-word append error:', err);
      return res.status(500).json({ error: 'io_error', message: 'could not write dictionary' });
    }
    // Rebuild stats (best-effort)
    prepare().then(() => {
      return res.json({ added: true, word });
    }).catch((e) => {
      console.warn('prepare after add failed', e);
      // still return success, but warn client
      return res.json({ added: true, word, warning: 'rebuild_failed' });
    });
  });
});

app.post('/admin/remove-word', (req, res) => {
  if (!hasAdminToken(req)) return res.status(403).json({ error: 'forbidden' });

  const raw = (req.body && req.body.word) ? String(req.body.word) : '';
  const word = normalizeWord(raw);
  if (!word || !isAllLetters(word)) return res.status(400).json({ error: 'invalid_word', message: 'word required (letters only)' });

  if (!fs.existsSync(DICT_PATH)) return res.status(404).json({ error: 'dict_not_found' });

  // Read, filter, write
  fs.readFile(DICT_PATH, 'utf8', (err, data) => {
    if (err) {
      console.error('remove-word read error:', err);
      return res.status(500).json({ error: 'io_error', message: 'could not read dictionary' });
    }
    // Normalize lines while preserving simple newline formatting
    const lines = data.split(/\r?\n/).map(l => normalizeWord(l)).filter(Boolean);
    const existed = lines.includes(word);
    const filtered = lines.filter(l => l !== word);
    const out = filtered.join('\n') + (filtered.length ? '\n' : '');
    fs.writeFile(DICT_PATH, out, 'utf8', (werr) => {
      if (werr) {
        console.error('remove-word write error:', werr);
        return res.status(500).json({ error: 'io_error', message: 'could not write dictionary' });
      }
      // Rebuild stats (best-effort)
      prepare().then(() => {
        return res.json({ removed: existed, word });
      }).catch((e) => {
        console.warn('prepare after remove failed', e);
        return res.json({ removed: existed, word, warning: 'rebuild_failed' });
      });
    });
  });
});

// --------------------------- admin antiscraping endpoints ------------------
app.get('/admin/antiscraping/stats', (req, res) => {
  if (!hasAdminToken(req)) return res.status(403).json({ error: 'forbidden' });
  const stats = protector.getStats();
  res.json(stats);
});

app.get('/admin/antiscraping/blocked-ips', (req, res) => {
  if (!hasAdminToken(req)) return res.status(403).json({ error: 'forbidden' });
  const blockedIPs = protector.getBlockedIPs();
  res.json({ blocked: blockedIPs });
});

app.post('/admin/antiscraping/unblock', (req, res) => {
  if (!hasAdminToken(req)) return res.status(403).json({ error: 'forbidden' });
  const ip = req.body.ip;
  if (!ip) return res.status(400).json({ error: 'ip required' });
  protector.unblockIP(ip);
  res.json({ success: true, message: `IP ${ip} unblocked` });
});

// Public endpoint for legitimate clients to get access tokens
app.post('/api/request-token', (req, res) => {
  const token = req.antiscraping.generateToken();
  res.json({ token, expiresIn: 300000 }); // 5 minutes
});

// ========================= STAFF ACCOUNT SYSTEM =========================
const STAFF_PATH = path.join(__dirname, 'staff.json');
const crypto = require('crypto');

// Nombre de rounds bcrypt — 12 est un bon compromis sécurité/performance (environ 300ms)
const BCRYPT_ROUNDS = 12;

/**
 * Hache un mot de passe avec bcrypt (résistant aux attaques par dictionnaire).
 * Retourne une promesse — TOUJOURS utiliser await.
 */
async function hashPassword(password) {
  return bcrypt.hash(String(password), BCRYPT_ROUNDS);
}

/**
 * Compare un mot de passe en clair avec un hash bcrypt.
 * Compatible rétrocompatibilité : si le hash est un ancien SHA-256 (longueur 64),
 * on le compare à l'ancienne méthode pour permettre la migration au premier login.
 */
async function verifyPassword(plainPassword, storedHash) {
  if (!plainPassword || !storedHash) return false;
  // Détection d'un ancien hash SHA-256 (hex 64 chars) pour la migration transparente
  if (/^[0-9a-f]{64}$/.test(storedHash)) {
    const legacyHash = crypto.createHash('sha256').update(plainPassword + 'wb_salt_2025').digest('hex');
    return legacyHash === storedHash;
  }
  // Hash bcrypt standard
  return bcrypt.compare(String(plainPassword), storedHash);
}

function loadStaff() {
  try {
    if (!fs.existsSync(STAFF_PATH)) return {};
    return JSON.parse(fs.readFileSync(STAFF_PATH, 'utf8'));
  } catch(e) { return {}; }
}

function saveStaff(data) {
  fs.writeFileSync(STAFF_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// Initialiser le compte admin depuis l'env si pas encore créé (async car bcrypt)
(async function initAdminAccount() {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return;
  const staff = loadStaff();
  if (!staff['admin']) {
    staff['admin'] = {
      username: 'admin',
      passwordHash: await hashPassword(adminPassword),
      role: 'admin',
      createdAt: Date.now()
    };
    saveStaff(staff);
    console.log('✅ Compte admin initialisé depuis ADMIN_PASSWORD (bcrypt)');
  } else if (/^[0-9a-f]{64}$/.test(staff['admin'].passwordHash)) {
    // Migration automatique : l'admin a encore un hash SHA-256 — on le remplace par bcrypt
    console.log('🔄 Migration du hash admin vers bcrypt...');
    staff['admin'].passwordHash = await hashPassword(adminPassword);
    saveStaff(staff);
    console.log('✅ Hash admin migré vers bcrypt');
  }
})();

// Login staff
app.post('/staff/login', async (req, res) => {
  const { username, password } = req.body;
  if (!validateStringInput(username, 50) || !validateStringInput(password, 200)) {
    return res.status(400).json({ error: 'Champs manquants ou invalides' });
  }
  const staff = loadStaff();
  const account = staff[username.toLowerCase().trim()];
  // Réponse identique si compte inexistant ou mot de passe incorrect (protection contre l'énumération)
  if (!account) {
    await bcrypt.hash('dummy_timing_protection', BCRYPT_ROUNDS); // constante de temps
    return res.status(401).json({ error: 'Identifiants incorrects' });
  }
  const ok = await verifyPassword(password, account.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Identifiants incorrects' });

  // Migration transparente : si l'ancien hash SHA-256 était encore là, on le remplace
  if (/^[0-9a-f]{64}$/.test(account.passwordHash)) {
    account.passwordHash = await hashPassword(password);
    console.log(`🔄 Hash migré vers bcrypt pour l'utilisateur: ${account.username}`);
  }

  // Générer un token de session staff (valable 8h)
  const sessionToken = crypto.randomBytes(32).toString('hex');
  account.sessionToken = sessionToken;
  account.sessionExpires = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 jours
  saveStaff(staff);
  res.json({ success: true, sessionToken, role: account.role, username: account.username });
});

// Middleware de vérification session staff
function requireStaff(req, res, next) {
  const token = req.get('x-staff-token') || req.query.staffToken;
  if (!token) return res.status(401).json({ error: 'Non authentifié' });
  const staff = loadStaff();
  const account = Object.values(staff).find(a => a.sessionToken === token && a.sessionExpires > Date.now());
  if (!account) return res.status(401).json({ error: 'Session expirée' });
  req.staffAccount = account;
  next();
}

function requireAdmin(req, res, next) {
  requireStaff(req, res, () => {
    if (req.staffAccount.role !== 'admin') return res.status(403).json({ error: 'Droits admin requis' });
    next();
  });
}

// Créer un compte staff (admin seulement)
app.post('/staff/create', requireAdmin, async (req, res) => {
  const { username, password, role } = req.body;
  if (!validateStringInput(username, 50) || !validateStringInput(password, 200)) {
    return res.status(400).json({ error: 'Champs manquants ou invalides' });
  }
  if (password.length < 8) return res.status(400).json({ error: 'Mot de passe trop court (8 caractères min)' });
  const cleanName = username.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
  if (cleanName.length < 3) return res.status(400).json({ error: 'Nom trop court ou invalide (lettres/chiffres/_)' });
  const staff = loadStaff();
  if (staff[cleanName]) return res.status(409).json({ error: 'Ce nom d\'utilisateur existe déjà' });
  staff[cleanName] = {
    username: cleanName,
    passwordHash: await hashPassword(password),
    role: role === 'admin' ? 'admin' : 'staff',
    createdAt: Date.now(),
    createdBy: escapeHtml(req.staffAccount.username)
  };
  saveStaff(staff);
  res.json({ success: true, username: cleanName, role: staff[cleanName].role });
});

// Lister les comptes staff (admin seulement)
app.get('/staff/list', requireAdmin, (req, res) => {
  const staff = loadStaff();
  const list = Object.values(staff).map(a => ({
    username: a.username,
    role: a.role,
    createdAt: a.createdAt,
    createdBy: a.createdBy || 'système'
  }));
  res.json(list);
});

// Supprimer un compte staff (admin seulement, ne peut pas supprimer admin)
app.delete('/staff/delete/:username', requireAdmin, (req, res) => {
  const target = req.params.username.toLowerCase();
  if (target === 'admin') return res.status(403).json({ error: 'Impossible de supprimer le compte admin' });
  const staff = loadStaff();
  if (!staff[target]) return res.status(404).json({ error: 'Compte introuvable' });
  delete staff[target];
  saveStaff(staff);
  res.json({ success: true });
});

// Changer son propre mot de passe
app.post('/staff/change-password', requireStaff, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!validateStringInput(oldPassword, 200) || !validateStringInput(newPassword, 200)) {
    return res.status(400).json({ error: 'Champs manquants ou invalides' });
  }
  if (newPassword.length < 8) return res.status(400).json({ error: 'Nouveau mot de passe trop court (8 caractères min)' });
  const staff = loadStaff();
  const account = staff[req.staffAccount.username];
  if (!account) return res.status(401).json({ error: 'Compte introuvable' });
  const ok = await verifyPassword(oldPassword, account.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Ancien mot de passe incorrect' });
  account.passwordHash = await hashPassword(newPassword);
  saveStaff(staff);
  res.json({ success: true });
});

// Vérifier sa session (pour rester connecté au refresh)
app.get('/staff/me', requireStaff, (req, res) => {
  res.json({ username: req.staffAccount.username, role: req.staffAccount.role });
});

// Logout
app.post('/staff/logout', requireStaff, (req, res) => {
  const staff = loadStaff();
  const account = staff[req.staffAccount.username];
  if (account) { delete account.sessionToken; delete account.sessionExpires; saveStaff(staff); }
  res.json({ success: true });
});
// ========================= END STAFF SYSTEM =========================

// Enrichit room.players avec staffRole basé sur les sessions staff actives
function enrichRoomWithStaffRoles(room) {
  if (!room || !room.players) return room;
  const staff = loadStaff();
  const activeStaff = Object.values(staff).filter(a => a.sessionToken && a.sessionExpires > Date.now());
  room.players.forEach(p => {
    const match = activeStaff.find(a => a.username.toLowerCase() === (p.name || '').toLowerCase());
    p.staffRole = match ? match.role : null;
  });
  return room;
}

// ========================= USER TRACKING & BAN SYSTEM =========================
const BAN_PATH = path.join(__dirname, 'bans.json');

function loadBans() {
  try { return fs.existsSync(BAN_PATH) ? JSON.parse(fs.readFileSync(BAN_PATH, 'utf8')) : {}; } catch(e) { return {}; }
}
function saveBans(data) { fs.writeFileSync(BAN_PATH, JSON.stringify(data, null, 2), 'utf8'); }
// ========================= PERSISTENT USER LOG =========================
// Log persistant sur disque : survit aux redémarrages serveur et aux vidages de cache
// Indexé par IP pour garder l'historique même si le token change
const USERS_LOG_PATH = path.join(__dirname, 'users_log.json');

function loadUsersLog() {
  try {
    if (!fs.existsSync(USERS_LOG_PATH)) return {};
    return JSON.parse(fs.readFileSync(USERS_LOG_PATH, 'utf8'));
  } catch(e) { return {}; }
}

function saveUsersLog(data) {
  try { fs.writeFileSync(USERS_LOG_PATH, JSON.stringify(data, null, 2), 'utf8'); } catch(e) {
    console.error('[UsersLog] Erreur écriture:', e);
  }
}

// Mise à jour du log persistant pour un utilisateur (ip obligatoire)
function updateUserLog(ip, { token, name, avatar } = {}) {
  if (!ip || ip === 'unknown') return;
  const log = loadUsersLog();
  const entry = log[ip] || {
    ip,
    tokens: [],
    names: [],
    firstSeen: Date.now(),
    lastSeen: Date.now(),
    gamesPlayed: 0,
    avatar: null
  };
  entry.lastSeen = Date.now();
  if (token && !entry.tokens.includes(token)) {
    entry.tokens.push(token);
    if (entry.tokens.length > 20) entry.tokens.splice(0, entry.tokens.length - 20);
  }
  if (name && name !== 'Inconnu' && !entry.names.includes(name)) {
    entry.names.push(name);
    if (entry.names.length > 10) entry.names.splice(0, entry.names.length - 10);
  }
  if (avatar) entry.avatar = avatar;
  log[ip] = entry;
  saveUsersLog(log);
}

function incrementUserGames(ip) {
  if (!ip || ip === 'unknown') return;
  const log = loadUsersLog();
  if (log[ip]) {
    log[ip].gamesPlayed = (log[ip].gamesPlayed || 0) + 1;
    log[ip].lastSeen = Date.now();
    saveUsersLog(log);
  }
}
// ========================= END PERSISTENT USER LOG =========================


// Map en mémoire : sessionToken -> { ip, name, avatar, connectedAt, lastSeen, socketId }
const connectedUsers = new Map();

function getClientIP(socket) {
  return socket.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || socket.handshake.address
    || 'unknown';
}

function isIPBanned(ip) {
  const bans = loadBans();
  return !!bans[ip];
}

// API : liste des utilisateurs connectés (admin only)
app.get('/admin/users', requireAdmin, (req, res) => {
  const bans = loadBans();
  const persistentLog = loadUsersLog();
  const seen = new Set();
  const users = [];

  // D'abord les utilisateurs actuellement en mémoire (en ligne récemment)
  for (const [token, u] of connectedUsers) {
    const ip = u.ip || 'unknown';
    const logEntry = persistentLog[ip] || {};
    seen.add(ip);
    users.push({
      tokenHint: token.substring(0, 8) + '…',
      ip,
      name: u.name || logEntry.names?.[logEntry.names.length - 1] || 'Inconnu',
      allNames: logEntry.names || (u.name ? [u.name] : []),
      avatar: u.avatar || logEntry.avatar || null,
      connectedAt: u.connectedAt,
      lastSeen: Math.max(u.lastSeen || 0, logEntry.lastSeen || 0),
      firstSeen: logEntry.firstSeen || u.connectedAt,
      gamesPlayed: logEntry.gamesPlayed || 0,
      banned: !!bans[ip],
      online: true
    });
  }

  // Ensuite les entrées du log persistant qui ne sont plus en mémoire
  for (const [ip, entry] of Object.entries(persistentLog)) {
    if (seen.has(ip)) continue;
    users.push({
      tokenHint: entry.tokens?.length ? (entry.tokens[entry.tokens.length - 1].substring(0, 8) + '…') : '—',
      ip,
      name: entry.names?.[entry.names.length - 1] || 'Inconnu',
      allNames: entry.names || [],
      avatar: entry.avatar || null,
      connectedAt: entry.firstSeen,
      lastSeen: entry.lastSeen,
      firstSeen: entry.firstSeen,
      gamesPlayed: entry.gamesPlayed || 0,
      banned: !!bans[ip],
      online: false
    });
  }

  users.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
  res.json(users);
});

// API : bannir une IP (admin only)
app.post('/admin/ban', requireAdmin, (req, res) => {
  const { ip, reason } = req.body;
  if (!ip) return res.status(400).json({ error: 'IP requise' });
  const bans = loadBans();
  bans[ip] = { ip, reason: reason || 'Aucune raison précisée', bannedAt: Date.now(), bannedBy: req.staffAccount.username };
  saveBans(bans);
  let kicked = 0;
  for (const [token, u] of connectedUsers) {
    if (u.ip === ip && u.socketId) {
      const sock = io.sockets.sockets.get(u.socketId);
      if (sock) { sock.emit('banned', { reason: bans[ip].reason }); sock.disconnect(true); kicked++; }
    }
  }
  res.json({ success: true, kicked });
});

// API : débannir une IP (admin only)
app.delete('/admin/ban/:ip', requireAdmin, (req, res) => {
  const ip = decodeURIComponent(req.params.ip);
  const bans = loadBans();
  if (!bans[ip]) return res.status(404).json({ error: 'IP non bannie' });
  delete bans[ip];
  saveBans(bans);
  res.json({ success: true });
});

// API : liste des bans (admin only)
app.get('/admin/bans', requireAdmin, (req, res) => {
  const bans = loadBans();
  res.json(Object.values(bans).sort((a, b) => b.bannedAt - a.bannedAt));
});
// ========================= END USER TRACKING =========================


// ========================= WORD REQUEST SYSTEM =========================
// File d'attente en mémoire des demandes de mots (add/remove) soumises par les utilisateurs
// Chaque demande est soumise à validation admin avant d'être appliquée
// Format: { id, type: 'add'|'remove', word, submittedAt, submittedBy, status: 'pending'|'approved'|'rejected', resolvedAt, resolvedBy }
const wordRequests = []; // in-memory, max 500 entrées
const WORD_REQUEST_MAX = 500;

function generateRequestId() {
  return 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

// Diffuse les demandes en attente à tous les admins connectés via Socket.IO
// (appelé après chaque création / résolution de demande)
function broadcastPendingRequests() {
  const pending = wordRequests.filter(r => r.status === 'pending');
  if (io) io.emit('wordRequestsUpdate', { pending });
}

// ---- Soumettre une demande (public, rate-limitée) ----
app.post('/api/word-request', (req, res) => {
  if (!ready) return res.status(503).json({ error: 'not_ready' });

  const rawType = req.body && req.body.type;
  const rawWord = req.body && req.body.word;
  const submittedBy = req.body && req.body.submittedBy ? String(req.body.submittedBy).trim().substring(0, 30) : 'Anonyme';

  const type = (rawType === 'add' || rawType === 'remove') ? rawType : null;
  const word = normalizeWord(rawWord || '');

  if (!type) return res.status(400).json({ error: 'type doit être "add" ou "remove"' });
  if (!word || !isAllLetters(word)) return res.status(400).json({ error: 'Mot invalide (lettres uniquement)' });
  if (word.length < 2) return res.status(400).json({ error: 'Mot trop court (2 lettres min)' });
  if (word.length > 50) return res.status(400).json({ error: 'Mot trop long (50 lettres max)' });

  // Vérifier qu'il n'y a pas déjà une demande en attente pour ce mot + type
  const duplicate = wordRequests.find(r => r.word === word && r.type === type && r.status === 'pending');
  if (duplicate) return res.status(409).json({ error: `Une demande de ${type === 'add' ? 'ajout' : 'suppression'} pour "${word}" est déjà en attente` });

  // Limiter la taille de la file
  if (wordRequests.length >= WORD_REQUEST_MAX) {
    // Supprimer les plus anciennes demandes résolues
    const firstResolved = wordRequests.findIndex(r => r.status !== 'pending');
    if (firstResolved >= 0) wordRequests.splice(firstResolved, 1);
    else return res.status(429).json({ error: 'File de demandes pleine, réessayez plus tard' });
  }

  const exists = dictHas(word);
  if (type === 'add' && exists) {
    return res.status(409).json({ error: `"${word}" existe déjà dans le dictionnaire` });
  }
  if (type === 'remove' && !exists) {
    return res.status(409).json({ error: `"${word}" n'existe pas dans le dictionnaire` });
  }

  const req_obj = {
    id: generateRequestId(),
    type,
    word,
    submittedAt: Date.now(),
    submittedBy: escapeHtml(submittedBy),
    status: 'pending',
    resolvedAt: null,
    resolvedBy: null,
    note: null
  };
  wordRequests.unshift(req_obj); // plus récent en premier

  // Diffuser aux admins en temps réel
  broadcastPendingRequests();

  res.json({ success: true, id: req_obj.id, word, type });
});

// ---- Lister les demandes (admin only) ----
app.get('/admin/word-requests', requireAdmin, (req, res) => {
  const status = req.query.status; // 'pending' | 'approved' | 'rejected' | undefined = all
  const list = status ? wordRequests.filter(r => r.status === status) : wordRequests;
  res.json(list.slice(0, 200)); // max 200
});

// ---- Approuver une demande (admin only) ----
app.post('/admin/word-requests/:id/approve', requireAdmin, async (req, res) => {
  const reqObj = wordRequests.find(r => r.id === req.params.id);
  if (!reqObj) return res.status(404).json({ error: 'Demande introuvable' });
  if (reqObj.status !== 'pending') return res.status(409).json({ error: 'Demande déjà traitée' });

  try {
    if (reqObj.type === 'add') {
      // Append to dictionary
      if (!dictHas(reqObj.word)) {
        const line = reqObj.word + '\n';
        await fs.promises.appendFile(DICT_PATH, line, 'utf8');
        await prepare();
      }
    } else {
      // Remove from dictionary
      const data = await fs.promises.readFile(DICT_PATH, 'utf8');
      const lines = data.split(/\r?\n/).map(l => normalizeWord(l)).filter(Boolean);
      const filtered = lines.filter(l => l !== reqObj.word);
      await fs.promises.writeFile(DICT_PATH, filtered.join('\n') + (filtered.length ? '\n' : ''), 'utf8');
      await prepare();
    }

    reqObj.status = 'approved';
    reqObj.resolvedAt = Date.now();
    reqObj.resolvedBy = escapeHtml(req.staffAccount.username);

    broadcastPendingRequests();
    // Notifier l'ensemble des clients du résultat
    if (io) io.emit('wordRequestResolved', { id: reqObj.id, word: reqObj.word, type: reqObj.type, status: 'approved' });

    res.json({ success: true, ...reqObj });
  } catch (err) {
    console.error('approve word-request error:', err);
    res.status(500).json({ error: 'Erreur lors de l\'application', detail: err.message });
  }
});

// ---- Rejeter une demande (admin only) ----
app.post('/admin/word-requests/:id/reject', requireAdmin, (req, res) => {
  const reqObj = wordRequests.find(r => r.id === req.params.id);
  if (!reqObj) return res.status(404).json({ error: 'Demande introuvable' });
  if (reqObj.status !== 'pending') return res.status(409).json({ error: 'Demande déjà traitée' });

  reqObj.status = 'rejected';
  reqObj.resolvedAt = Date.now();
  reqObj.resolvedBy = escapeHtml(req.staffAccount.username);
  reqObj.note = req.body && req.body.note ? String(req.body.note).trim().substring(0, 200) : null;

  broadcastPendingRequests();
  if (io) io.emit('wordRequestResolved', { id: reqObj.id, word: reqObj.word, type: reqObj.type, status: 'rejected' });

  res.json({ success: true, ...reqObj });
});
// ========================= END WORD REQUEST SYSTEM =========================

// --------------------------- HTTP + Socket.IO setup ----------------------------------
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: corsOptions,
  perMessageDeflate: {
    threshold: 1024
  }
});

const roomManager = new RoomManager();

// Rate limiter pour soumissions de mots (anti-triche)
const wordSubmissions = new Map();

function sendSystemMessage(roomId, message) {
  io.to(roomId).emit('chatMessage', {
    id: Date.now() + Math.random(),
    message,
    timestamp: Date.now(),
    type: 'system'
  });
}

// Sélection aléatoire d'une syllabe côté serveur (évite l'aller-retour vers l'hôte)
// scenario peut valoir : null | '4 lettres' | 'sub8' | 'sub50' | etc.
function pickServerSyllable(usedSyllables, scenario) {
  const ALL_LENGTHS = [2, 3, 4];

  // Déterminer les longueurs autorisées selon le scénario
  let allowedLengths;
  const sc = scenario ? String(scenario).trim().toLowerCase() : '';
  if (sc === '4 lettres') {
    allowedLengths = [4];
  } else if (sc === 'sub8' || sc === 'sub50') {
    // Les scénarios sub8/sub50 filtrent par nombre de mots, pas par longueur de syllabe.
    // On exclut les syllabes de 4 lettres qui relèvent du scénario "4 lettres" dédié.
    allowedLengths = [2, 3];
  } else {
    // Mode normal (sans scénario) : uniquement 2 et 3 lettres, comme gamecore.js (DEFAULTS.syllableLengths = [2, 3])
    allowedLengths = [2, 3];
  }

  // Filtrer les longueurs qui ont des données
  const availableLengths = allowedLengths.filter(L => syllableCounts[L] && syllableCounts[L].size > 0);

  if (availableLengths.length === 0) {
    // Fallback sur toutes longueurs disponibles
    for (const fl of ALL_LENGTHS) {
      if (syllableCounts[fl] && syllableCounts[fl].size > 0) {
        const keys = Array.from(syllableCounts[fl].keys());
        return keys[Math.floor(Math.random() * keys.length)];
      }
    }
    return 'RE'; // dernier recours absolu
  }

  // Scénario sub8 : syllabes avec <= 8 mots (rares)
  // Scénario sub50 : syllabes avec <= 50 mots
  let countFilter = null;
  if (scenario) {
    const sc = String(scenario).trim().toLowerCase();
    if (sc === 'sub8') countFilter = (c) => c <= 8;
    else if (sc === 'sub50') countFilter = (c) => c <= 50;
  }

  // Choisir une longueur au hasard parmi celles disponibles
  const L = availableLengths[Math.floor(Math.random() * availableLengths.length)];
  const map = syllableCounts[L];

  let entries = Array.from(map.entries()).filter(([s]) => !usedSyllables || !usedSyllables.has(s));
  if (countFilter) entries = entries.filter(([, c]) => countFilter(c));

  // Si toutes les syllabes du scénario ont été utilisées : réinitialiser usedSyllables
  // et recommencer avec toutes les syllabes du scénario (jamais tomber sur hors-scénario).
  if (entries.length === 0 && countFilter) {
    if (usedSyllables) usedSyllables.clear();
    entries = Array.from(map.entries()).filter(([, c]) => countFilter(c));
  }
  // Dernier recours absolu (pas de données pour ce scénario) : toutes les syllabes
  if (entries.length === 0) entries = Array.from(map.entries());

  // En mode normal (pas de scénario sub8/sub50), on pondère par count pour favoriser
  // fortement les syllabes fréquentes (RE, ON, etc.) par rapport aux syllabes rares.
  // Pour sub8/sub50, tirage uniforme car on veut équi-distribuer les syllabes rares.
  if (!countFilter) {
    // Pondération quadratique : les syllabes très fréquentes sont massivement favorisées
    let totalWeight = 0;
    const weighted = entries.map(([syl, cnt]) => {
      const w = Math.sqrt(cnt); // racine carrée pour pondérer sans trop écraser les moyennes
      totalWeight += w;
      return { syl, w };
    });
    let r = Math.random() * totalWeight;
    for (const e of weighted) {
      if (r < e.w) return e.syl;
      r -= e.w;
    }
    return weighted[weighted.length - 1].syl;
  }

  // Scénarios filtrés (sub8, sub50) : tirage uniforme
  return entries[Math.floor(Math.random() * entries.length)][0];
}

// Timer serveur synchronisé
function startRoomTimer(roomId, durationMs) {
  const room = roomManager.getRoom(roomId);
  if (!room) return null;

  // Stopper timer existant
  if (room.game.timer) { clearInterval(room.game.timer); room.game.timer = null; }

  // Si une durée pausée est mémorisée, l'utiliser à la place de durationMs
  const effectiveDuration = (room.game.pausedRemaining != null && room.game.pausedRemaining > 0)
    ? room.game.pausedRemaining
    : durationMs;
  room.game.pausedRemaining = null; // consommer la valeur mémorisée
  room.game.timerTotal = durationMs; // toujours garder la durée totale du round

  const startTime = Date.now();
  const endTime = startTime + effectiveDuration;

  const interval = setInterval(() => {
    const now = Date.now();
    const remaining = Math.max(0, endTime - now);

    // Ne pas émettre si la partie est en pause
    if (room.game.paused) return;

    io.to(roomId).emit('timerUpdate', { remaining, total: durationMs });

    if (remaining === 0) {
      clearInterval(interval);
      const r = roomManager.getRoom(roomId);
      if (!r || r.gameState !== 'playing') return;

      r.game.timer = null;
      const currentPlayer = r.players[r.game.currentPlayerIndex % r.players.length];
      if (!currentPlayer) return;

      io.to(roomId).emit('timeout', {
        socketId: currentPlayer.socketId,
        playerName: currentPlayer.name
      });

      // Appliquer la perte de vie
      handleLoseLife(roomId, currentPlayer.socketId);
    }
  }, 50);

  room.game.timer = interval;
  room.game.timerEndTime = endTime;
  return interval;
}

/**
 * Met la partie en pause (stoppe le décompte du timer)
 * Mémorise le temps restant pour pouvoir reprendre correctement.
 */
function pauseRoomGame(roomId, reason) {
  const room = roomManager.getRoom(roomId);
  if (!room || room.gameState !== 'playing' || room.game.paused) return;

  const remaining = room.game.timerEndTime ? Math.max(0, room.game.timerEndTime - Date.now()) : 0;
  room.game.paused = true;
  room.game.pausedRemaining = remaining;
  room.game.pausedAt = Date.now();

  // On garde le setInterval actif mais il ne tick plus (guard `if paused` ci-dessus)
  // On émet un état de pause à tous les joueurs
  io.to(roomId).emit('gamePaused', {
    reason: reason || 'Joueur déconnecté',
    remaining,
    total: room.game.timerTotal || 8000
  });
}

/**
 * Reprend la partie depuis là où elle s'était arrêtée.
 */
function resumeRoomGame(roomId) {
  const room = roomManager.getRoom(roomId);
  if (!room || room.gameState !== 'playing' || !room.game.paused) return;

  room.game.paused = false;

  // Relancer le timer avec le temps restant mémorisé
  const remaining = room.game.pausedRemaining || 3000; // 3s min pour laisser le temps de reprendre
  room.game.pausedRemaining = null;

  // Stopper l'ancien interval (il était en vie mais inactif)
  if (room.game.timer) { clearInterval(room.game.timer); room.game.timer = null; }

  io.to(roomId).emit('gameResumed', {
    remaining,
    total: room.game.timerTotal || 8000,
    syllable: room.game.currentSyllable,
    playerIndex: room.game.currentPlayerIndex,
    player: room.players[room.game.currentPlayerIndex] || room.players[0],
    roundNumber: room.game.roundNumber
  });

  // Relancer le timer depuis la durée restante
  const endTime = Date.now() + remaining;
  const timerTotal = room.game.timerTotal || 8000;
  const interval = setInterval(() => {
    const now = Date.now();
    const rem = Math.max(0, endTime - now);

    if (room.game.paused) return;

    io.to(roomId).emit('timerUpdate', { remaining: rem, total: timerTotal });

    if (rem === 0) {
      clearInterval(interval);
      const r = roomManager.getRoom(roomId);
      if (!r || r.gameState !== 'playing' || r.game.paused) return;

      r.game.timer = null;
      const currentPlayer = r.players[r.game.currentPlayerIndex % r.players.length];
      if (!currentPlayer) return;

      io.to(roomId).emit('timeout', {
        socketId: currentPlayer.socketId,
        playerName: currentPlayer.name
      });
      handleLoseLife(roomId, currentPlayer.socketId);
    }
  }, 50);

  room.game.timer = interval;
  room.game.timerEndTime = endTime;
}

function handleLoseLife(roomId, playerSocketId) {
  const room = roomManager.getRoom(roomId);
  if (!room || room.gameState !== 'playing') return;
  // Ne pas traiter une perte de vie si la partie est en pause (reconnexion en cours)
  if (room.game.paused) return;

  const player = room.players.find(p => p.socketId === playerSocketId);
  if (!player || !player.isAlive) return;

  player.lives = Math.max(0, player.lives - 1);

  io.to(roomId).emit('playerLostLife', {
    socketId: playerSocketId,
    playerName: player.name,
    livesLeft: player.lives,
    syllable: room.game.currentSyllable || null
  });

  if (player.lives <= 0) {
    player.isAlive = false;
    io.to(roomId).emit('playerEliminated', {
      socketId: playerSocketId,
      playerName: player.name
    });
    sendSystemMessage(roomId, `☠️ ${player.name} est éliminé!`);

    const alivePlayers = room.players.filter(p => p.isAlive && p.lives > 0);
    if (alivePlayers.length <= 1) {
      const result = roomManager.endGame(roomId);
      io.to(roomId).emit('gameOver', {
        winner: result.winner ? {
          name: result.winner.name,
          socketId: result.winner.socketId,
          wordsFound: result.winner.wordsFound
        } : null,
        duration: Date.now() - room.game.startTime,
        room: result.room
      });
      if (result.winner) sendSystemMessage(roomId, `🏆 ${result.winner.name} a gagné!`);
      // Notifier les anciens spectateurs qu'ils sont maintenant joueurs
      if (result.newPlayers && result.newPlayers.length > 0) {
        for (const np of result.newPlayers) {
          const npSocket = io.sockets.sockets.get(np.socketId);
          if (npSocket) npSocket.emit('promotedToPlayer', { room: result.room });
        }
        sendSystemMessage(roomId, `👥 ${result.newPlayers.map(p => p.name).join(', ')} ${result.newPlayers.length > 1 ? 'rejoignent' : 'rejoint'} la partie!`);
        io.emit('roomsList', roomManager.getPublicRooms());
      }
      return;
    }

    // Passer au joueur suivant vivant et lancer le round suivant
    advanceToNextAlivePlayer(roomId);
    startNextRound(roomId);
  } else {
    sendSystemMessage(roomId, `💥 ${player.name} a perdu une vie! (${player.lives} ❤️ restantes)`);
    advanceToNextAlivePlayer(roomId);
    startNextRound(roomId);
  }
}

function startNextRound(roomId) {
  const room = roomManager.getRoom(roomId);
  if (!room || room.gameState !== 'playing') return;
  if (!room.game.usedSyllables) room.game.usedSyllables = new Set();
  const scenario = room.settings && room.settings.scenario ? room.settings.scenario : null;
  const newSyl = pickServerSyllable(room.game.usedSyllables, scenario);
  room.game.usedSyllables.add(newSyl);
  room.game.currentSyllable = newSyl;
  room.game.roundNumber = (room.game.roundNumber || 0) + 1;

  // Empêcher l'hôte d'écraser cette syllabe via newSyllable pendant 3 secondes.
  // Le WordbombCore de l'hôte tourne localement et peut émettre newSyllable
  // quasi-simultanément, causant une désynchronisation du scénario.
  room.game.serverControlledUntil = Date.now() + 3000;

  const defaultTimerMs = (8 + Math.max(0, Number(room.settings.extraTurnSeconds) || 0)) * 1000;
  io.to(roomId).emit('syllableUpdate', {
    syllable: newSyl,
    playerIndex: room.game.currentPlayerIndex,
    player: room.players[room.game.currentPlayerIndex] || room.players[0],
    roundNumber: room.game.roundNumber,
    count: getSyllableCount(newSyl)
  });
  startRoomTimer(roomId, defaultTimerMs);
}

function advanceToNextAlivePlayer(roomId) {
  const room = roomManager.getRoom(roomId);
  if (!room || room.gameState !== 'playing') return;

  const alivePlayers = room.players.filter(p => p.isAlive && p.lives > 0 && !p.disconnected);
  if (alivePlayers.length === 0) return;

  let next = (room.game.currentPlayerIndex + 1) % room.players.length;
  let attempts = 0;
  while (!room.players[next].isAlive || room.players[next].lives <= 0 || room.players[next].disconnected) {
    next = (next + 1) % room.players.length;
    if (++attempts > room.players.length) break;
  }
  room.game.currentPlayerIndex = next;

  io.to(roomId).emit('turnChanged', {
    playerIndex: next,
    player: room.players[next]
  });
}

// ===========================
// SOCKET.IO EVENTS
// ===========================
io.on('connection', (socket) => {
  // Vérifier si l'IP est bannie dès la connexion
  const clientIP = getClientIP(socket);
  if (isIPBanned(clientIP)) {
    const bans = loadBans();
    socket.emit('banned', { reason: bans[clientIP]?.reason || 'Banni' });
    socket.disconnect(true);
    return;
  }

  // Enregistrer la connexion dans connectedUsers (enrichi au register/joinRoom)
  // On utilise socket.id comme clé temporaire jusqu'à obtenir le token
  let socketUserToken = null;

  // Le token est maintenant envoyé directement dans chaque message
  // plus besoin d'un événement 'register' séparé.
  // On garde un cache local pour les événements qui ne passent pas le token (legacy)
  let clientToken = null;

  // Enregistre/met à jour le token pour ce socket (appelé à chaque événement)
  function useToken(token) {
    if (!token || typeof token !== 'string') return null;
    if (clientToken !== token) {
      clientToken = token;
      roomManager.registerSocket(token, socket.id);
    }
    // Mettre à jour connectedUsers
    socketUserToken = token;
    if (!connectedUsers.has(token)) {
      connectedUsers.set(token, { ip: clientIP, name: null, avatar: null, connectedAt: Date.now(), lastSeen: Date.now(), socketId: socket.id });
      updateUserLog(clientIP, { token }); // log persistant à la première connexion
    } else {
      const u = connectedUsers.get(token);
      u.socketId = socket.id;
      u.lastSeen = Date.now();
      u.ip = clientIP; // mettre à jour l'IP au cas où
      updateUserLog(clientIP, { token }); // rafraîchir lastSeen dans le log persistant
    }
    return token;
  }

  function getToken() { return clientToken; }

  // Compatibilité : si le client envoie encore 'register' séparément
  socket.on('register', (token) => { useToken(token); });

  // ---- LOBBY ----

  socket.on('getRooms', () => {
    socket.emit('roomsList', roomManager.getPublicRooms());
  });

  socket.on('createRoom', (data) => {
    // Sanitisation des données de la salle
    if (data.name) data.name = String(data.name).trim().substring(0, 50);
    if (data.host) data.host = String(data.host).trim().substring(0, 30);
    // Le token peut être dans data.token (nouveau) ou via register (ancien)
    const roomData = data.token ? data : data;
    const token = useToken(data.token) || getToken();
    if (!token) { socket.emit('error', 'Non enregistré'); return; }

    // Vérifier si ce token a déjà une salle
    const existingSession = roomManager.sessions.get(token);
    if (existingSession && existingSession.roomId) {
      const existingRoom = roomManager.getRoom(existingSession.roomId);
      if (existingRoom) {
        // Renvoyer la salle existante
        socket.join(existingRoom.id);
        socket.emit('roomCreated', existingRoom);
        io.emit('roomsList', roomManager.getPublicRooms());
        return;
      }
    }

    const room = roomManager.createRoom(roomData, socket.id, token);
    socket.join(room.id);
    socket.emit('roomCreated', room);
    io.emit('roomsList', roomManager.getPublicRooms());
    sendSystemMessage(room.id, `Salle créée par ${room.host}`);
  });

  socket.on('joinRoom', ({ roomId, playerData, token: payloadToken, wasHost, staffToken }) => {
    const token = useToken(payloadToken) || getToken();
    if (!token) { socket.emit('joinError', 'Non enregistré'); return; }

    // Mettre à jour le profil dans connectedUsers
    // Sanitisation des données joueur pour prévenir les injections
    if (playerData) {
      if (playerData.name) playerData.name = String(playerData.name).trim().substring(0, 30);
      if (playerData.avatar && typeof playerData.avatar === 'string') {
        // N'accepter que les data URI d'images ou URLs https
        if (!playerData.avatar.startsWith('data:image/') && !playerData.avatar.startsWith('https://')) {
          playerData.avatar = '';
        }
      }
    }

    if (playerData && token && connectedUsers.has(token)) {
      const u = connectedUsers.get(token);
      if (playerData.name) u.name = playerData.name;
      if (playerData.avatar) u.avatar = playerData.avatar;
      u.lastSeen = Date.now();
      // Persister sur disque avec le vrai nom/avatar
      updateUserLog(clientIP, { token, name: playerData.name, avatar: playerData.avatar });
    } else if (playerData && token) {
      connectedUsers.set(token, { ip: clientIP, name: playerData.name || null, avatar: playerData.avatar || null, connectedAt: Date.now(), lastSeen: Date.now(), socketId: socket.id });
      updateUserLog(clientIP, { token, name: playerData.name, avatar: playerData.avatar });
    }

    // Résoudre le rôle staff si un staffToken est fourni
    let joinerStaffRole = null;
    if (staffToken) {
      const staffData = loadStaff();
      const staffAccount = Object.values(staffData).find(a => a.sessionToken === staffToken && a.sessionExpires > Date.now());
      if (staffAccount) joinerStaffRole = staffAccount.role;
    }

    // Si la room n'existe plus (ex: serveur redémarré) et que le joueur était hôte,
    // recréer automatiquement la room avec le même ID.
    const existingRoomCheck = roomManager.getRoom(roomId);
    console.log(`[joinRoom] token=${token && token.substr(0,8)} roomId=${roomId} wasHost=${wasHost} roomExists=${!!existingRoomCheck} players=${existingRoomCheck ? existingRoomCheck.players.map(p=>p.name) : 'N/A'}`);
    if (!existingRoomCheck && wasHost) {
      console.log(`[joinRoom] → RECREATION de salle (room manquante)`);
      const newRoom = roomManager.createRoom({
        id: roomId,
        host: playerData && playerData.name,
        hostAvatar: playerData && playerData.avatar || ''
      }, socket.id, token);
      socket.join(newRoom.id);
      socket.emit('roomJoined', { room: newRoom, reconnected: false, recreated: true });
      return;
    }

    const result = roomManager.joinRoom(roomId, playerData, socket.id, token);
    console.log(`[joinRoom] → roomManager.joinRoom result: error=${result.error} reconnected=${result.reconnected} players=${result.room ? result.room.players.map(p=>p.name) : 'N/A'}`);
    if (result.error) { socket.emit('joinError', result.error); return; }

    socket.join(roomId);
    const room = result.room;

    // Attacher le rôle staff au joueur dans la room
    if (joinerStaffRole) {
      const player = room.players.find(p => p.token === token);
      if (player) player.staffRole = joinerStaffRole;
    }

    if (result.reconnected) {
      const updatedRoom = roomManager.getRoom(roomId);
      const wasDisconnected = updatedRoom && updatedRoom.players.find(p => p.token === token && p.disconnected);
      // Marquer le joueur comme reconnecté (retire le gris) seulement si nécessaire
      roomManager.markReconnected(token);
      const freshRoom = roomManager.getRoom(roomId);

      // Construire la réponse de base
      const roomJoinedPayload = { room: freshRoom, reconnected: true };

      // Si une partie est en cours, joindre l'état complet du jeu pour restaurer l'UI
      if (freshRoom && freshRoom.gameState === 'playing') {
        const g = freshRoom.game;
        roomJoinedPayload.gameState = {
          syllable: g.currentSyllable,
          playerIndex: g.currentPlayerIndex,
          player: freshRoom.players[g.currentPlayerIndex] || freshRoom.players[0],
          roundNumber: g.roundNumber,
          count: getSyllableCount(g.currentSyllable),
          paused: !!g.paused,
          remaining: g.pausedRemaining != null
            ? g.pausedRemaining
            : (g.timerEndTime ? Math.max(0, g.timerEndTime - Date.now()) : 0),
          total: g.timerTotal || 8000
        };
      }

      socket.emit('roomJoined', roomJoinedPayload);

      // N'afficher le message de reconnexion que si le joueur était vraiment marqué déconnecté
      if (wasDisconnected && freshRoom && freshRoom.players.length > 1) {
        io.to(roomId).emit('playerReconnected', { token, playerName: playerData.name, room: freshRoom });
        sendSystemMessage(roomId, `✅ ${playerData.name} a reconnecté`);

        // Si la partie était en pause à cause de ce joueur, la reprendre
        if (freshRoom.game.paused) {
          // Petit délai pour laisser le client s'initialiser
          setTimeout(() => {
            const r = roomManager.getRoom(roomId);
            if (r && r.game.paused) {
              resumeRoomGame(roomId);
              sendSystemMessage(roomId, `▶️ ${playerData.name} est de retour — partie reprise !`);
            }
          }, 800);
        }
      }
    } else if (result.spectator) {
      socket.emit('joinedAsSpectator', room);
      sendSystemMessage(roomId, `${playerData.name} observe la partie`);
      // Notifier tous les joueurs qu'un spectateur attend
      io.to(roomId).emit('spectatorsWaiting', {
        count: room.pendingSpectators ? room.pendingSpectators.length : 0,
        names: room.pendingSpectators ? room.pendingSpectators.map(s => s.name) : []
      });
    } else {
      socket.emit('roomJoined', { room });
      io.to(roomId).emit('playerJoined', {
        player: room.players[room.players.length - 1],
        room
      });
      sendSystemMessage(roomId, `${playerData.name} a rejoint la salle`);
      io.emit('roomsList', roomManager.getPublicRooms());
    }
  });

  socket.on('leaveRoom', () => {
    const token = getToken();
    if (!token) return;
    const session = roomManager.sessions.get(token);
    if (!session || !session.roomId) return;
    const roomId = session.roomId;
    socket.rooms.forEach(r => { if (r !== socket.id) socket.leave(r); });
    const result = roomManager.leaveRoom(token);
    if (!result) return;
    if (result.roomDeleted) {
      io.emit('roomsList', roomManager.getPublicRooms());
    } else {
      io.to(result.room.id).emit('playerLeft', { socketId: socket.id, room: result.room, newHost: result.newHost });
      if (result.newHost) sendSystemMessage(result.room.id, `${result.newHost} est maintenant l'hôte`);
      io.emit('roomsList', roomManager.getPublicRooms());
    }
  });

  socket.on('deleteRoom', (roomId) => {
    const token = getToken();
    if (!token || !roomManager.isHost(roomId, token)) { socket.emit('error', 'Non autorisé'); return; }
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    io.to(roomId).emit('roomDeleted');
    [...room.players].forEach(p => roomManager.leaveRoom(p.token));
    io.emit('roomsList', roomManager.getPublicRooms());
  });

  // ---- GAME ----

  socket.on('toggleReady', (roomId) => {
    const token = getToken();
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    const player = room.players.find(p => p.token === token);
    if (!player || player.isHost) return;
    player.isReady = !player.isReady;
    io.to(roomId).emit('playerReadyChanged', { socketId: socket.id, isReady: player.isReady, room });
  });

  socket.on('startGame', (data) => {
    // data peut être un string (ancien format) ou un objet { roomId, scenario }
    const roomId = (typeof data === 'object' && data !== null) ? data.roomId : data;
    const scenario = (typeof data === 'object' && data !== null) ? (data.scenario || null) : null;
    const token = getToken();
    if (!token || !roomManager.isHost(roomId, token)) { socket.emit('error', 'Non autorisé'); return; }
    // Stocker le scénario avant de démarrer la partie
    const room = roomManager.getRoom(roomId);
    if (room && scenario !== null) room.settings.scenario = scenario;
    const gameRoom = roomManager.startGame(roomId);
    if (!gameRoom) return;
    // Appliquer les startingLives du serveur à tous les joueurs
    const startingLives = gameRoom.settings.startingLives || 2;
    gameRoom.players.forEach(p => {
      p.lives = startingLives; p.isAlive = true;
      // Incrémenter le compteur de parties dans le log persistant
      const userEntry = connectedUsers.get(p.token);
      if (userEntry) incrementUserGames(userEntry.ip);
    });
    // Mettre à jour les socketIds depuis les sessions courantes (important après reconnexions)
    gameRoom.players.forEach(p => {
      const sess = roomManager.sessions.get(p.token);
      if (sess && sess.socketId) p.socketId = sess.socketId;
    });
    io.to(roomId).emit('gameStarted', { room: gameRoom, firstPlayer: gameRoom.players[0], settings: gameRoom.settings });
    sendSystemMessage(roomId, '🎮 La partie commence! Bonne chance!');
    io.emit('roomsList', roomManager.getPublicRooms());
  });

  socket.on('newSyllable', ({ roomId, playerIndex, timerMs }) => {
    // NOTE : on ignore complètement la syllabe envoyée par l'hôte.
    // Le serveur est la seule source de vérité pour le choix de syllabe
    // (via pickServerSyllable) afin de garantir le respect du scénario (sub8, sub50…).
    // Ce handler ne sert plus qu'à signaler au serveur que l'hôte est prêt pour
    // le round suivant — le serveur choisit lui-même et diffuse syllableUpdate.
    const token = getToken();
    const room = roomManager.getRoom(roomId);
    if (!room || room.gameState !== 'playing') return;
    if (!roomManager.isHost(roomId, token)) return;

    // Si le serveur a déjà émis syllableUpdate pour ce round (après timeout ou submitWord),
    // ignorer ce newSyllable redondant.
    if (room.game.serverControlledUntil && Date.now() < room.game.serverControlledUntil) {
      room.game.serverControlledUntil = 0;
      return;
    }

    // Cas normal (mot accepté, hôte seul) : le serveur choisit la syllabe suivante.
    if (typeof playerIndex === 'number') room.game.currentPlayerIndex = playerIndex;
    startNextRound(roomId);
  });

  socket.on('submitWord', ({ roomId, word, syllable }) => {
    const token = getToken();
    const room = roomManager.getRoom(roomId);
    if (!room || room.gameState !== 'playing') return;

    const player = room.players.find(p => p.token === token);
    if (!player || !player.isAlive) return;

    // Rate limiting
    const now = Date.now();
    if (!wordSubmissions.has(token)) wordSubmissions.set(token, []);
    const subs = wordSubmissions.get(token).filter(t => now - t < 800);
    if (subs.length > 0) { socket.emit('wordRejected', { socketId: socket.id, reason: 'Trop rapide!' }); return; }
    subs.push(now);
    wordSubmissions.set(token, subs);

    // Vérifier le tour
    const currentPlayer = room.players[room.game.currentPlayerIndex % room.players.length];
    const isHost = roomManager.isHost(roomId, token);
    if (currentPlayer && currentPlayer.token !== token) {
      // L'hôte peut soumettre pour un bot local (qui n'a pas de token serveur)
      // Un bot est détecté par l'absence de token dans la liste des joueurs réels
      const isBotTurn = isHost && !room.players.some(p => p.token === currentPlayer.token && p.token !== null);
      if (!isBotTurn) {
        socket.emit('wordRejected', { socketId: socket.id, reason: 'Pas votre tour' });
        return;
      }
    }

    // Mettre à jour le socketId du joueur si nécessaire (reconnexion)
    if (player.socketId !== socket.id) {
      player.socketId = socket.id;
    }

    const wordUpper = String(word || '').toUpperCase().trim();
    // Toujours utiliser la syllabe du serveur comme source de vérité
    // (ne jamais faire confiance à la syllabe envoyée par le client qui peut être désynchronisée)
    const sylUpper = String(room.game.currentSyllable || '').toUpperCase().trim();

    if (!wordUpper) { socket.emit('wordRejected', { socketId: socket.id, reason: 'Mot vide' }); return; }
    if (sylUpper && !wordUpper.includes(sylUpper)) {
      socket.emit('wordRejected', { socketId: socket.id, reason: `Le mot ne contient pas "${sylUpper}"` });
      return;
    }

    const exists = dictionarySet && dictHas(wordUpper);
    if (exists) {
      // Stopper le timer en cours
      if (room.game.timer) { clearInterval(room.game.timer); room.game.timer = null; }
      player.wordsFound++;
      io.to(roomId).emit('wordAccepted', {
        player: player.name, socketId: socket.id, word: wordUpper, wordsFound: player.wordsFound
      });

      // Le serveur choisit toujours la syllabe suivante (quel que soit le nombre de joueurs).
      // Cela garantit que le scénario (sub8, sub50, etc.) est toujours respecté,
      // car le WordbombCore local de l'hôte n'applique pas forcément le bon filtre.
      advanceToNextAlivePlayer(roomId);
      startNextRound(roomId);
    } else {
      io.to(roomId).emit('wordRejected', {
        player: player.name, socketId: socket.id, word: wordUpper, reason: 'Mot non dans le dictionnaire'
      });
    }
  });

  socket.on('loseLife', ({ roomId, playerId }) => {
    const token = getToken();
    if (!token || !roomManager.isHost(roomId, token)) return;
    handleLoseLife(roomId, playerId || socket.id);
  });

  socket.on('endGame', (roomId) => {
    const token = getToken();
    if (!token || !roomManager.isHost(roomId, token)) return;
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    // Stopper le timer en cours avant de terminer la partie
    if (room.game && room.game.timer) { clearInterval(room.game.timer); room.game.timer = null; }

    const startTime = room.game ? room.game.startTime : Date.now();
    const result = roomManager.endGame(roomId);

    // Diffuser à TOUS les joueurs de la salle (y compris non-hôtes)
    io.to(roomId).emit('gameOver', {
      winner: result.winner ? { name: result.winner.name, socketId: result.winner.socketId, wordsFound: result.winner.wordsFound } : null,
      duration: Date.now() - (startTime || Date.now()),
      room: result.room,
      forcedStop: true
    });

    if (result.newPlayers && result.newPlayers.length > 0) {
      for (const np of result.newPlayers) {
        const npSocket = io.sockets.sockets.get(np.socketId);
        if (npSocket) npSocket.emit('promotedToPlayer', { room: result.room });
      }
      sendSystemMessage(roomId, `👥 ${result.newPlayers.map(p => p.name).join(', ')} ${result.newPlayers.length > 1 ? 'rejoignent' : 'rejoint'} la partie!`);
    }
    io.emit('roomsList', roomManager.getPublicRooms());
  });

  // Mise à jour du nombre de bots/joueurs locaux (non enregistrés côté serveur)
  // Permet à la liste des salles de refléter le vrai nombre de joueurs en lobby
  socket.on('updateBotCount', ({ roomId, totalCount }) => {
    const token = getToken();
    if (!token || !roomManager.isHost(roomId, token)) return;
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    // Stocker le count "affiché" sans créer de vrais joueurs serveur
    room._displayPlayerCount = Math.max(1, Math.min(totalCount || 1, room.settings.maxPlayers || 6));
    io.emit('roomsList', roomManager.getPublicRoomsWithBotCount());
  });

  socket.on('updateSettings', ({ roomId, settings }) => {
    const token = getToken();
    if (!token || !roomManager.isHost(roomId, token)) return;
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    if (settings.startingLives) room.settings.startingLives = Math.max(1, Math.min(5, settings.startingLives));
    if (settings.extraTurnSeconds !== undefined) room.settings.extraTurnSeconds = Math.max(0, Math.min(10, Number(settings.extraTurnSeconds) || 0));
    if (settings.scenario !== undefined) room.settings.scenario = settings.scenario;
    if (settings.wpp !== undefined) room.settings.wpp = settings.wpp;
    // Diffuser à TOUS les joueurs de la salle (y compris l'hôte pour confirmation)
    io.to(roomId).emit('settingsUpdated', { settings: room.settings });
  });

  // ---- TYPING BROADCAST ----

  socket.on('typingUpdate', ({ roomId, text, playerName, accepted }) => {
    const token = getToken();
    const room = roomManager.getRoom(roomId);
    if (!room || room.gameState !== 'playing') return;
    // Diffuser à tous les autres joueurs de la salle (pas à l'émetteur)
    socket.to(roomId).emit('playerTyping', {
      socketId: socket.id,
      playerName: playerName || '',
      text: String(text || '').substring(0, 50),
      accepted: !!accepted
    });
  });

  // ---- CHAT ----

  socket.on('chatMessage', ({ roomId, message, playerName, avatar, replyTo, staffToken, isBot }) => {
    const token = getToken();
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    const msg = String(message || '').trim().substring(0, 300);
    if (!msg) return;
    // Sanitisation du nom de l'expéditeur et de l'avatar pour éviter les injections
    const safePlayerName = playerName ? String(playerName).trim().substring(0, 30) : '';
    const safeAvatar = (avatar && typeof avatar === 'string' && (avatar.startsWith('data:image/') || avatar.startsWith('https://'))) ? avatar : '';

    // Messages TokiBot : seul l'hôte peut en envoyer, diffusés à tous avec type 'bot'
    if (isBot === true) {
      if (!roomManager.isHost(roomId, token)) return; // sécurité : seul l'hôte peut envoyer des msgs bot
      io.to(roomId).emit('chatMessage', {
        id: Date.now() + Math.random(),
        sender: 'TokiBot',
        senderSocketId: socket.id,
        message: msg,
        timestamp: Date.now(),
        type: 'bot',
        avatar: '',
        replyTo: null,
        staffRole: null
      });
      return;
    }

    // Vérifier si le joueur est staff
    let staffRole = null;
    if (staffToken) {
      const staff = loadStaff();
      const account = Object.values(staff).find(a => a.sessionToken === staffToken && a.sessionExpires > Date.now());
      if (account) staffRole = account.role;
    }

    io.to(roomId).emit('chatMessage', {
      id: Date.now() + Math.random(),
      sender: safePlayerName,
      senderSocketId: socket.id,
      message: msg,
      timestamp: Date.now(),
      type: 'player',
      avatar: safeAvatar,
      replyTo: replyTo || null,
      staffRole: staffRole
    });
  });


  socket.on('suicideRequest', ({ roomId }) => {
    const token = getToken();
    const room = roomManager.getRoom(roomId);
    if (!room || room.gameState !== 'playing') return;
    const player = room.players.find(p => p.token === token);
    if (!player || !player.isAlive) return;
    // Vérifier que c'est bien le tour du joueur
    const currentPlayer = room.players[room.game.currentPlayerIndex % room.players.length];
    if (!currentPlayer || currentPlayer.token !== token) return;
    // Stopper le timer en cours et forcer la perte de vie
    if (room.game.timer) { clearInterval(room.game.timer); room.game.timer = null; }
    io.to(roomId).emit('timeout', { socketId: socket.id, playerName: player.name });
    handleLoseLife(roomId, socket.id);
  });

  // ---- DISCONNECT ----
  socket.on('disconnect', () => {
    const token = getToken();
    wordSubmissions.delete(token);

    if (!token) return;

    // Mettre à jour lastSeen mais garder dans connectedUsers 5min (historique récent)
    if (connectedUsers.has(token)) {
      connectedUsers.get(token).lastSeen = Date.now();
      setTimeout(() => {
        const u = connectedUsers.get(token);
        // Ne supprimer que si le socket n'a pas été réassigné (reconnexion)
        if (u && u.socketId === socket.id) connectedUsers.delete(token);
      }, 5 * 60 * 1000);
    }

    roomManager.unregisterSocket(socket.id);

    const session = roomManager.sessions.get(token);
    if (!session || !session.roomId) return;
    const roomId = session.roomId;
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    const player = room.players.find(p => p.token === token);
    const playerName = player ? player.name : 'Un joueur';

    // Horodater la déconnexion pour détecter une reconnexion ultérieure
    const disconnectTime = Date.now();
    if (session) session._lastDisconnectTime = disconnectTime;

    // Délai de 8s avant de marquer comme déconnecté (absorbe les refresh lents + Railway cold start)
    // Si le joueur revient dans ce délai, on ne fait rien du tout
    const gracePre = setTimeout(() => {
      const sess = roomManager.sessions.get(token);
      // Reconnexion détectée si le timestamp a changé (joinRoom l'a réinitialisé) ou socketId actif
      if (sess && sess._lastDisconnectTime !== disconnectTime) return;
      if (sess && sess.socketId && sess.roomId) return;

      // Marquer comme déconnecté (apparaît gris) seulement après 4s
      roomManager.markDisconnected(token);
      const currentRoom = roomManager.getRoom(roomId);
      if (!currentRoom) return;

      // --- PAUSE si c'est le joueur courant qui s'est déconnecté pendant une partie ---
      const isCurrentPlayer = currentRoom.gameState === 'playing' &&
        currentRoom.players[currentRoom.game.currentPlayerIndex % currentRoom.players.length]?.token === token;

      if (isCurrentPlayer) {
        pauseRoomGame(roomId, `${playerName} s'est déconnecté`);
        io.to(roomId).emit('playerDisconnected', { token, playerName, room: currentRoom, gamePaused: true });
        sendSystemMessage(roomId, `⏸️ ${playerName} s'est déconnecté — partie en pause 20s`);
      } else {
        io.to(roomId).emit('playerDisconnected', { token, playerName, room: currentRoom, gamePaused: false });
        sendSystemMessage(roomId, `⚠️ ${playerName} s'est déconnecté — 20s pour revenir`);
      }

      // Délai de grâce : 45s supplémentaires pour se reconnecter (Railway peut être lent)
      setTimeout(() => {
        const sess2 = roomManager.sessions.get(token);
        if (sess2 && sess2._lastDisconnectTime !== disconnectTime) return; // reconnecté
        if (sess2 && sess2.socketId && sess2.roomId) return;

        // Le joueur n'est pas revenu → reprendre la partie si elle était en pause pour lui
        const roomNow = roomManager.getRoom(roomId);
        if (roomNow && roomNow.game.paused) {
          // Avancer au joueur suivant puis reprendre
          advanceToNextAlivePlayer(roomId);
          resumeRoomGame(roomId);
          sendSystemMessage(roomId, `▶️ ${playerName} n'est pas revenu — partie reprise`);
        }

        // Expulser définitivement
        const result = roomManager.leaveRoom(token);
        if (!result) return;
        if (result.roomDeleted) {
          io.emit('roomsList', roomManager.getPublicRooms());
        } else if (result.room) {
          io.to(result.room.id).emit('playerLeft', { socketId: socket.id, room: result.room, newHost: result.newHost });
          sendSystemMessage(result.room.id, `👟 ${playerName} a été expulsé (déconnexion)`);
          if (result.newHost) sendSystemMessage(result.room.id, `${result.newHost} est maintenant l'hôte 👑`);
          io.emit('roomsList', roomManager.getPublicRooms());
        }
      }, 45000);
    }, 8000);
  });
});

// Nettoyage toutes les 10 minutes des salles terminées/abandonnées
setInterval(() => {
  const now = Date.now();
  const TIMEOUT = 60 * 60 * 1000; // 1h
  for (const [roomId, room] of roomManager.rooms) {
    if (room.players.length === 0 || (room.gameState === 'finished' && now - room.createdAt > TIMEOUT)) {
      if (room.game && room.game.timer) clearInterval(room.game.timer);
      roomManager.rooms.delete(roomId);
      console.log(`[Cleanup] Salle supprimée: ${roomId}`);
    }
  }
}, 10 * 60 * 1000);

// --------------------------- start server ----------------------------------
httpServer.listen(PORT, () => {
  console.log(`wordbomb-api listening on http://localhost:${PORT}`);
  console.log(`DICT_PATH=${DICT_PATH}`);
  console.log('🔌 Socket.IO prêt pour le multijoueur!');
  if (ADMIN_TOKEN) console.log('ADMIN_TOKEN is set -> /dictionary.txt protected');
  else console.log('ADMIN_TOKEN NOT set -> admin routes allowed without token (dev mode)');

  // prepare data async
  prepare().then(() => {
    console.log('Preparation done:', readyMessage);
  }).catch(err => {
    console.error('Preparation error:', err);
  });
});

// --------------------------- global error guards ---------------------------
// Empêche le crash du serveur sur les exceptions non catchées
process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException — serveur maintenu:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] unhandledRejection — serveur maintenu:', reason);
});
