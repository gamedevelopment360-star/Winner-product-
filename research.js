// research.js — product research for Winner Finder (CJ Dropshipping data).
// Routes (the password gate is in server.js; these use the CJ_API_KEY from the server):
//   GET /api/research?q=keyword      search CJ, score each product
//   GET /api/research/winners        scan several niches, best score first
//   GET /api/saved                   products saved in the database
//   GET /api/research/profit?pid=&sell=&ad=   real shipping + stock + profit for one product
//
// The score means "worth a small test", NOT "guaranteed profit".
// AliExpress is not used yet. Add its signals later in scoreProduct().

// Standalone site: the CJ key comes from the CJ_API_KEY environment variable.
function requireCjKey(req, res, next) {
  if (!process.env.CJ_API_KEY) return res.status(503).json({ error: 'CJ_API_KEY is not set on the server.' });
  req.cjKey = process.env.CJ_API_KEY;
  next();
}

const db = require('./db');

const BASE = 'https://developers.cjdropshipping.com/api2.0/v1';
const COUNTRY = (process.env.RESEARCH_COUNTRY || 'US').toUpperCase();
const FEE_PCT = 2.9;      // payment fee percent, plus the fixed part below
const FEE_FIXED = 0.30;
const EST_SHIPPING = 4;   // rough shipping guess used only for the list score
const MAX_COST = parseFloat(process.env.MAX_COST) || 25; // skip products that cost CJ more than this ($)
const TREND_MAX_COST = parseFloat(process.env.TRENDING_MAX_COST) || 100; // CJ Trending button: skip products that cost more than this ($)
const MIN_PROFIT = parseFloat(process.env.MIN_PROFIT) || 7; // list score drops if profit before ads is below this ($)

const NICHES = [
  'pet grooming', 'kitchen gadget', 'car organizer', 'massage', 'phone holder',
  'led light', 'travel organizer', 'yoga', 'baby safety', 'desk organizer'
];

// Search keywords for the season-specific "winner" buttons, grouped under
// a short key the frontend sends (e.g. /api/research/winners/summer).
// Kept separate from SEASONAL_KEYWORDS below (that one is for SCORING an
// already-found product by name; this one is for SEARCHING CJ directly).
const SEASON_GROUPS = {
  summer: ['handheld fan', 'mini fan', 'neck fan', 'portable fan', 'clip on fan', 'cooling towel', 'cooling pillow', 'cooling blanket', 'air cooler', 'ice pack'],
  winter: ['hand warmer', 'electric heater', 'space heater', 'heated blanket', 'heated vest', 'heated gloves', 'thermal underwear', 'winter gloves', 'warm socks', 'beanie'],
  christmas: ['christmas', 'xmas decoration', 'ornament', 'advent calendar', 'santa'],
  halloween: ['halloween', 'costume', 'pumpkin decor', 'spooky decoration'],
  valentine: ['valentine gift', 'romantic gift', 'couple gift'],
  backtoschool: ['back to school', 'school supply', 'backpack', 'pencil case'],
};

// A product shown under a season button must have one of these in its name.
// Looser than the exact keyword, so the list is longer, but still on-topic.
const SEASON_MUST = {
  summer: /\bfans?\b|cooling|cooler|\bcool\b|ice pack|ice silk|air conditioner|misting/i,
  winter: /heat|warmer|warming|thermal|glove|beanie|\bsocks?\b|fleece|winter/i,
  christmas: /christmas|xmas|santa|ornament|advent|reindeer|\belf\b/i,
  halloween: /halloween|costume|pumpkin|spooky|witch|ghost|skeleton/i,
  valentine: /valentine|\blove\b|heart|romantic|couple|\brose\b/i,
  backtoschool: /school|backpack|pencil|notebook|lunch|student/i,
};
const NOT_THESE = /fan[- ]shaped/i; // "fan-shaped" is a shape, not a fan

// ---------- seasonality ----------
// Keyword -> the months (1-12) the product peaks in. A product matching
// none of these is "evergreen" (sells all year) and gets no bonus or
// penalty. This is a rough keyword guess, not real sales data — it only
// nudges the score, it does not decide it.
const SEASONAL_KEYWORDS = [
  { words: ['christmas', 'xmas', 'advent', 'ornament', 'santa'], months: [11, 12] },
  { words: ['halloween', 'costume', 'pumpkin', 'spooky'], months: [9, 10] },
  { words: ['valentine', 'heart gift', 'romantic gift'], months: [1, 2] },
  { words: ['easter', 'bunny egg'], months: [2, 3] },
  { words: ['thanksgiving'], months: [10, 11] },
  { words: ['new year', 'countdown'], months: [12, 1] },
  { words: ['summer', 'pool float', 'beach', 'swimsuit', 'swimwear', 'sunscreen', 'cooling', 'mini fan', 'neck fan', 'handheld fan', 'portable fan', 'hand fan', 'air cooler', 'ice pack', 'sun hat'], months: [4, 5, 6, 7] },
  { words: ['winter', 'heated', 'heater', 'warmer', 'thermal', 'electric blanket', 'beanie', 'glove', 'warm sock', 'snow', 'ice scraper'], months: [10, 11, 12, 1] },
  { words: ['back to school', 'school supply', 'backpack'], months: [7, 8] },
  { words: ['garden', 'patio', 'outdoor furniture'], months: [3, 4, 5] },
  { words: ['mother\'s day'], months: [4, 5] },
  { words: ['father\'s day'], months: [5, 6] },
  { words: ['graduation'], months: [4, 5, 6] },
];

// Shortest distance in months between two months on a 12-month wheel
// (so November -> January is 2 months, not 10).
function monthDistance(a, b) {
  const diff = Math.abs(a - b);
  return Math.min(diff, 12 - diff);
}

// Returns { bonus, label }. bonus is added to the base score (can be
// negative for deep off-season items, which tie up money in stock that
// won't sell for months). label is shown in the UI, or null if the
// product looks evergreen (sells year-round, so no adjustment applies).
function seasonInfo(name, category) {
  const text = `${name || ''} ${category || ''}`.toLowerCase();
  const match = SEASONAL_KEYWORDS.find((s) => s.words.some((w) => text.includes(w)));
  if (!match) return { bonus: 0, label: null };

  const now = new Date().getMonth() + 1; // 1-12
  const nearest = Math.min(...match.months.map((m) => monthDistance(now, m)));

  if (nearest === 0) return { bonus: 12, label: 'Peak season now' };
  if (nearest === 1) return { bonus: 8, label: 'Season coming soon' };
  if (nearest === 2) return { bonus: 2, label: 'Season approaching' };
  if (nearest === 3) return { bonus: -5, label: 'Off-season' };
  return { bonus: -12, label: 'Deep off-season' };
}
// ---------- end seasonality ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- tiny CJ client (token cached per key) ----------
const tokens = new Map();
const tokenLogins = new Map(); // logins in progress, so parallel requests share ONE login (CJ limits logins)
async function token(key) {
  const c = tokens.get(key);
  if (c && c.exp > Date.now()) return c.token;
  if (tokenLogins.has(key)) return tokenLogins.get(key);
  const login = (async () => {
    const r = await fetch(BASE + '/authentication/getAccessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: key }),
      signal: AbortSignal.timeout(20000)
    });
    const j = await r.json().catch(() => ({}));
    const t = j && j.data && j.data.accessToken;
    if (!t) throw new Error((j && j.message) || 'CJ login failed (wait 5 minutes and retry)');
    tokens.set(key, { token: t, exp: Date.now() + 10 * 24 * 3600 * 1000 });
    return t;
  })().finally(() => tokenLogins.delete(key));
  tokenLogins.set(key, login);
  return login;
}

async function cjCall(key, path, opts) {
  opts = opts || {};
  const t = await token(key);
  const r = await fetch(BASE + path, {
    method: opts.body ? 'POST' : 'GET',
    headers: { 'CJ-Access-Token': t, 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(25000)
  });
  const j = await r.json().catch(() => ({}));
  if (j && j.result === false) throw new Error(j.message || 'CJ request failed');
  return j;
}

// ---------- helpers ----------
const firstNum = (v) => {
  const m = String(v == null ? '' : v).match(/\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
};
const round2 = (n) => Math.round(n * 100) / 100;
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

function suggestPrice(cost) {
  const p = Math.max(14.99, cost * 3.2 + EST_SHIPPING); // no upper cap, so costly items are not scored as if cheap
  return Math.floor(p) + 0.99;
}

// 0-100. Points: margin 35, price band 15, stock 15, competition 20, delivery 15.
// Cheaper products (selling price $20-$60) score best. Products with too little profit are pushed down.
function scoreProduct(p) {
  const sell = p.suggestedPrice;
  const feeAmt = sell * FEE_PCT / 100 + FEE_FIXED;
  const before = sell - p.cost - EST_SHIPPING - feeAmt;
  const marginBeforeAds = before / sell;                 // ads still to come off
  let s = 0;
  s += clamp((marginBeforeAds - 0.2) / 0.4, 0, 1) * 35;  // 20% -> 0 pts, 60% -> 35 pts
  s += (sell >= 20 && sell <= 60) ? 15 : sell < 20 ? (sell >= 15 ? 7 : 0) : sell <= 90 ? 6 : 0;
  const stock = p.stock;
  s += stock == null ? 5 : clamp(stock / 1000, 0, 1) * 15;
  const sellers = p.listedBySellers;
  s += sellers == null ? 8 : sellers < 50 ? 20 : sellers < 200 ? 14 : sellers < 500 ? 8 : 3;
  const d = p.deliveryDays;
  s += d == null ? 6 : d <= 8 ? 15 : d <= 12 ? 10 : d <= 16 ? 4 : 0;
  if (before < MIN_PROFIT) s *= 0.6;                     // not enough money left per sale
  if (sell > 90) s *= 0.75;                              // costly items sell less and risk more
  s += seasonInfo(p.name, p.category).bonus;             // nudge for products with a known peak season
  return Math.round(clamp(s, 0, 100));
}

function mapProduct(x, maxCost) {
  const limit = typeof maxCost === 'number' ? maxCost : MAX_COST;
  const cost = firstNum(x.nowPrice != null ? x.nowPrice : x.sellPrice);
  if (!cost || cost <= 0 || cost > limit) return null;
  const p = {
    pid: x.id || x.pid,
    name: x.nameEn || x.productNameEn || x.name || 'Unnamed product',
    image: x.bigImage || x.productImage || '',
    cost: round2(cost),
    category: x.threeCategoryName || x.twoCategoryName || x.categoryName || '',
    listedBySellers: x.listedNum != null ? Number(x.listedNum) : null,
    stock: firstNum(x.warehouseInventoryNum != null ? x.warehouseInventoryNum : x.totalVerifiedInventory),
    deliveryDays: firstNum(x.deliveryCycle)
  };
  if (!p.pid) return null;
  p.suggestedPrice = suggestPrice(p.cost);
  p.score = scoreProduct(p);
  p.seasonLabel = seasonInfo(p.name, p.category).label;
  return p;
}

async function searchKeyword(key, q, size, keep) {
  const qs = new URLSearchParams({
    keyWord: q, page: '1', size: String(size || 20), countryCode: COUNTRY
  });
  const j = await cjCall(key, '/product/listV2?' + qs.toString());
  const content = (j.data && j.data.content) || [];
  const out = [];
  content.forEach((block) => {
    (block.productList || []).forEach((x) => {
      const p = mapProduct(x);
      if (p) out.push(p);
    });
  });
  return keep ? out.filter(keep) : onlyRelevant(out, q);
}

// CJ's keyword search is loose (a search for "hand fan" can return glue or a
// "fan-shaped" shelf). Keep only products whose NAME contains the searched words.
// Products that do not match are dropped, so the list can be short but never off-topic.
function onlyRelevant(list, q) {
  const words = String(q || '').toLowerCase().split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3)
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));
  if (!words.length) return list;
  const res = words.map((w) => new RegExp('\\b' + w + '(?:s|es)?\\b'));
  const count = (p) => { const n = String(p.name || '').toLowerCase(); return res.filter((r) => r.test(n)).length; };
  // 1-2 words: every word must be in the name. 3+ words: all but one.
  const need = words.length <= 2 ? words.length : words.length - 1;
  return list.filter((p) => count(p) >= need); // may be short or empty: better than unrelated products
}

// How crowded a product is, from how many sellers already list it.
const competitionOf = (n) => (n == null || isNaN(Number(n)) ? null : Number(n) < 50 ? 'Low' : Number(n) < 200 ? 'Medium' : 'High');

const publicFields = (p) => ({
  pid: p.pid, name: p.name, image: p.image, cost: p.cost,
  suggestedPrice: p.suggestedPrice, category: p.category,
  listedBySellers: p.listedBySellers == null ? '?' : p.listedBySellers,
  score: p.score, seasonLabel: p.seasonLabel || null,
  competition: competitionOf(p.listedBySellers)
});

// ---------- routes ----------
module.exports = function (app) {
  app.get('/api/version', (req, res) => res.json({ version: 'relevance-v8' }));
  const winnersCache = new Map(); // cj key -> { at, results }

  app.get('/api/research', requireCjKey, async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 80);
    if (!q) return res.status(400).json({ error: 'Type a keyword first.' });
    try {
      const list = await searchKeyword(req.cjKey, q, 50);
      list.sort((a, b) => b.score - a.score);
      db.saveProducts(list, q).catch((e) => console.error('save failed:', e.message || e));
      db.saveSearch(q, list.length).catch((e) => console.error('search save failed:', e.message || e));
      res.json({ results: list.map(publicFields) });
    } catch (e) {
      console.error('research search failed:', e.message || e);
      res.status(502).json({ error: e.message || 'CJ search failed' });
    }
  });

  const scansRunning = new Map(); // cj key -> scan in progress, so taps in a row do not start many scans

  async function scanWinners(key) {
    const seen = new Set();
    const all = [];
    for (const n of NICHES) {
      try {
        const found = await searchKeyword(key, n, 20);
        found.forEach((p) => { if (!seen.has(p.pid)) { seen.add(p.pid); all.push(p); } });
      } catch (e) {
        console.error('niche failed:', n, e.message || e);
      }
      await sleep(1100); // stay under CJ's request rate limit
    }
    all.sort((a, b) => b.score - a.score);
    db.saveProducts(all, 'winners scan').catch((e) => console.error('save failed:', e.message || e));
    const results = all.slice(0, 20).map(publicFields);
    if (results.length) winnersCache.set(key, { at: Date.now(), results });
    return results;
  }

  app.get('/api/research/winners', requireCjKey, async (req, res) => {
    const hit = winnersCache.get(req.cjKey);
    if (hit && Date.now() - hit.at < 6 * 3600 * 1000) return res.json({ results: hit.results });
    try {
      let run = scansRunning.get(req.cjKey);
      if (!run) {
        run = scanWinners(req.cjKey).finally(() => scansRunning.delete(req.cjKey));
        scansRunning.set(req.cjKey, run);
      }
      res.json({ results: await run });
    } catch (e) {
      console.error('winners scan failed:', e.message || e);
      res.status(502).json({ error: e.message || 'Scan failed' });
    }
  });

  // Same idea as /api/research/winners, but scans only one season's own
  // keywords (e.g. /api/research/winners/summer) instead of the general
  // niche list. Cached separately per season so the buttons don't step
  // on each other's results.
  const seasonCache = new Map();   // "cjKey:season" -> { at, results }
  const seasonRunning = new Map(); // "cjKey:season" -> scan in progress

  async function scanSeason(key, seasonKey) {
    const words = SEASON_GROUPS[seasonKey];
    const must = SEASON_MUST[seasonKey];
    const keep = (p) => (!must || must.test(p.name)) && !NOT_THESE.test(p.name);
    const perKeyword = Math.ceil(24 / words.length);
    const seen = new Set();
    const all = [];
    for (const n of words) {
      try {
        const found = await searchKeyword(key, n, 50, keep);
        found.sort((a, b) => b.score - a.score);
        let taken = 0; // best few from EACH keyword, so fans are not pushed out by one popular keyword
        for (const p of found) {
          if (taken >= perKeyword) break;
          if (!seen.has(p.pid)) { seen.add(p.pid); all.push(p); taken++; }
        }
      } catch (e) {
        console.error('season niche failed:', n, e.message || e);
      }
      await sleep(1100); // stay under CJ's request rate limit
    }
    all.sort((a, b) => b.score - a.score);
    db.saveProducts(all, seasonKey + ' winners scan').catch((e) => console.error('save failed:', e.message || e));
    const results = all.slice(0, 30).map(publicFields);
    if (results.length) seasonCache.set(key + ':' + seasonKey, { at: Date.now(), results });
    return results;
  }

  app.get('/api/research/winners/:season', requireCjKey, async (req, res) => {
    const seasonKey = String(req.params.season || '').toLowerCase();
    if (!SEASON_GROUPS[seasonKey]) {
      return res.status(400).json({ error: 'Unknown season. Try: ' + Object.keys(SEASON_GROUPS).join(', ') });
    }
    const cacheKey = req.cjKey + ':' + seasonKey;
    const hit = seasonCache.get(cacheKey);
    if (hit && Date.now() - hit.at < 6 * 3600 * 1000) return res.json({ results: hit.results });
    try {
      let run = seasonRunning.get(cacheKey);
      if (!run) {
        run = scanSeason(req.cjKey, seasonKey).finally(() => seasonRunning.delete(cacheKey));
        seasonRunning.set(cacheKey, run);
      }
      res.json({ results: await run });
    } catch (e) {
      console.error('season scan failed:', e.message || e);
      res.status(502).json({ error: e.message || 'Scan failed' });
    }
  });

  // CJ's own "Trending Product" list (searchType 2). Cached 6 hours (each CJ call costs points).
  let trendingCache = null;
  app.get('/api/research/trending', requireCjKey, async (req, res) => {
    if (trendingCache && Date.now() - trendingCache.at < 6 * 3600 * 1000) return res.json({ results: trendingCache.results });
    try {
      const qs = new URLSearchParams({ pageNum: '1', pageSize: '50', searchType: '2', countryCode: COUNTRY });
      const j = await cjCall(req.cjKey, '/product/list?' + qs.toString());
      const d = j.data || {};
      let rows = Array.isArray(d.list) ? d.list : [];
      if (!rows.length && Array.isArray(d.content)) {
        d.content.forEach((b) => (b.productList || []).forEach((x) => rows.push(x)));
      }
      const list = rows.map((x) => mapProduct(x, TREND_MAX_COST)).filter(Boolean);
      list.sort((a, b) => b.score - a.score);
      console.log('CJ trending: ' + rows.length + ' from CJ, ' + list.length + ' kept (cost limit $' + TREND_MAX_COST + ')');
      db.saveProducts(list, 'cj trending').catch((e) => console.error('save failed:', e.message || e));
      const results = list.slice(0, 30).map(publicFields);
      if (results.length) trendingCache = { at: Date.now(), results };
      res.json({ results, message: results.length ? (rows.length > list.length ? (rows.length - list.length) + ' of ' + rows.length + ' CJ trending products were hidden (cost over $' + TREND_MAX_COST + ' or no price).' : 'CJ sent ' + rows.length + ' trending products.') : 'CJ returned no trending products under your cost limit.' });
    } catch (e) {
      console.error('trending failed:', e.message || e);
      res.status(502).json({ error: e.message || 'CJ trending failed' });
    }
  });

  // Trending FANS: CJ's trending list limited to fans. If CJ has none, show the fans
  // that the most sellers list. Cached 6 hours (each CJ call costs points).
  let fanCache = null;
  app.get('/api/research/trending-fans', requireCjKey, async (req, res) => {
    if (fanCache && Date.now() - fanCache.at < 6 * 3600 * 1000) return res.json(fanCache.data);
    const fanOnly = (p) => SEASON_MUST.summer.test(p.name) && /\bfans?\b/i.test(p.name) && !NOT_THESE.test(p.name);
    try {
      let list = [];
      let source = 'CJ trending fans';
      try {
        const qs = new URLSearchParams({ pageNum: '1', pageSize: '50', searchType: '2', productNameEn: 'fan', countryCode: COUNTRY });
        const j = await cjCall(req.cjKey, '/product/list?' + qs.toString());
        const d = j.data || {};
        let rows = Array.isArray(d.list) ? d.list : [];
        if (!rows.length && Array.isArray(d.content)) d.content.forEach((b) => (b.productList || []).forEach((x) => rows.push(x)));
        list = rows.map(mapProduct).filter(Boolean).filter(fanOnly);
      } catch (e) { console.error('trending f
