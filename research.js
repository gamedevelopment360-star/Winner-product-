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
  summer: ['mini fan', 'neck fan', 'cooling towel', 'portable air cooler', 'cooling pillow', 'ice pack', 'sunscreen', 'swimwear'],
  winter: ['hand warmer', 'electric heater', 'heated blanket', 'heated jacket', 'thermal underwear', 'winter gloves', 'warm socks', 'scarf'],
  christmas: ['christmas', 'xmas decoration', 'ornament', 'advent calendar', 'santa'],
  halloween: ['halloween', 'costume', 'pumpkin decor', 'spooky decoration'],
  valentine: ['valentine gift', 'romantic gift', 'couple gift'],
  backtoschool: ['back to school', 'school supply', 'backpack', 'pencil case'],
};

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
  { words: ['summer', 'pool float', 'beach', 'swimwear', 'sunscreen', 'cooling', 'mini fan', 'neck fan', 'portable fan', 'handheld fan', 'air cooler', 'ice pack'], months: [4, 5, 6, 7] },
  { words: ['winter', 'heated', 'heater', 'warmer', 'snow', 'scarf', 'thermal', 'electric blanket', 'ice scraper'], months: [10, 11, 12, 1] },
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

function mapProduct(x) {
  const cost = firstNum(x.nowPrice != null ? x.nowPrice : x.sellPrice);
  if (!cost || cost <= 0) return null;
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

async function searchKeyword(key, q, size) {
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
  return onlyRelevant(out, q);
}

// CJ's keyword search is loose (a search for "hand fan" can return glue or a
// "fan-shaped" shelf). Keep only products whose NAME contains the searched words.
// If that leaves too few, fall back to products that match at least half of the words.
function onlyRelevant(list, q) {
  const words = String(q || '').toLowerCase().split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3)
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));
  if (!words.length) return list;
  const res = words.map((w) => new RegExp('\\b' + w + '(?:s|es)?\\b'));
  const count = (p) => { const n = String(p.name || '').toLowerCase(); return res.filter((r) => r.test(n)).length; };
  const full = list.filter((p) => count(p) === words.length);
  if (full.length >= 3) return full;
  const half = list.filter((p) => count(p) >= Math.max(1, Math.ceil(words.length / 2)));
  return half; // may be short or empty: better than showing unrelated products
}

const publicFields = (p) => ({
  pid: p.pid, name: p.name, image: p.image, cost: p.cost,
  suggestedPrice: p.suggestedPrice, category: p.category,
  listedBySellers: p.listedBySellers == null ? '?' : p.listedBySellers,
  score: p.score, seasonLabel: p.seasonLabel || null
});

// ---------- routes ----------
module.exports = function (app) {
  app.get('/api/version', (req, res) => res.json({ version: 'relevance-v2' }));
  const winnersCache = new Map(); // cj key -> { at, results }

  app.get('/api/research', requireCjKey, async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 80);
    if (!q) return res.status(400).json({ error: 'Type a keyword first.' });
    try {
      const list = await searchKeyword(req.cjKey, q, 30);
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
    const seen = new Set();
    const all = [];
    for (const n of words) {
      try {
        const found = await searchKeyword(key, n, 20);
        found.forEach((p) => { if (!seen.has(p.pid)) { seen.add(p.pid); all.push(p); } });
      } catch (e) {
        console.error('season niche failed:', n, e.message || e);
      }
      await sleep(1100); // stay under CJ's request rate limit
    }
    all.sort((a, b) => b.score - a.score);
    db.saveProducts(all, seasonKey + ' winners scan').catch((e) => console.error('save failed:', e.message || e));
    const results = all.slice(0, 20).map(publicFields);
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

  // Products saved in the database. ?q=word  &sort=new  &limit=100
  app.get('/api/saved', async (req, res) => {
    if (!db.enabled()) return res.status(503).json({ error: 'DATABASE_URL is not set on the server.' });
    try {
      const results = await db.listProducts({ q: String(req.query.q || '').trim(), sort: req.query.sort, limit: req.query.limit });
      res.json({ total: await db.count(), results });
    } catch (e) {
      console.error('saved list failed:', e.message || e);
      res.status(502).json({ error: e.message || 'Could not read saved products' });
    }
  });

  // Words that were searched, newest first. ?limit=20
  app.get('/api/searches', async (req, res) => {
    if (!db.enabled()) return res.json({ results: [] });
    try {
      res.json({ results: await db.listSearches(req.query.limit) });
    } catch (e) {
      console.error('searches list failed:', e.message || e);
      res.json({ results: [] });
    }
  });

  app.get('/api/research/profit', requireCjKey, async (req, res) => {
    const pid = String(req.query.pid || '');
    const sell = parseFloat(req.query.sell);
    const ad = parseFloat(req.query.ad);
    if (!pid || !(sell > 0)) return res.json({ ok: false, error: 'Enter a selling price.' });
    const adCost = ad >= 0 ? ad : 0;
    try {
      const d = await cjCall(req.cjKey, '/product/query?pid=' + encodeURIComponent(pid));
      const prod = d.data || {};
      const variants = (prod.variants || []).filter((v) => v && v.vid);
      variants.sort((a, b) => (firstNum(a.variantSellPrice) || 1e9) - (firstNum(b.variantSellPrice) || 1e9));
      const v = variants[0];
      if (!v) return res.json({ ok: false, error: 'CJ returned no variants for this product.' });
      const cost = firstNum(v.variantSellPrice) != null ? firstNum(v.variantSellPrice) : firstNum(prod.sellPrice);

      let shipping = null, shippingMethod = null, deliveryDays = null;
      try {
        const f = await cjCall(req.cjKey, '/logistic/freightCalculate', {
          body: { startCountryCode: 'CN', endCountryCode: COUNTRY, products: [{ quantity: 1, vid: v.vid }] }
        });
        const opts = (f.data || []).filter((o) => firstNum(o.logisticPrice) != null);
        opts.sort((a, b) => firstNum(a.logisticPrice) - firstNum(b.logisticPrice));
        if (opts[0]) {
          shipping = firstNum(opts[0].logisticPrice);
          shippingMethod = opts[0].logisticName || null;
          deliveryDays = opts[0].logisticAging || null;
        }
      } catch (e) { console.error('freight lookup failed:', e.message || e); }

      let inStock = null;
      try {
        const s = await cjCall(req.cjKey, '/product/stock/queryByVid?vid=' + encodeURIComponent(v.vid));
        const rows = Array.isArray(s.data) ? s.data : [];
        if (rows.length) {
          const total = rows.reduce((n, r) => n + (Number(r.totalInventoryNum != null ? r.totalInventoryNum : r.storageNum) || 0), 0);
          inStock = total > 0;
        }
      } catch (e) { console.error('stock lookup failed:', e.message || e); }

      const paymentFee = round2(sell * FEE_PCT / 100 + FEE_FIXED);
      const known = cost != null && shipping != null;
      const profit = known ? round2(sell - cost - shipping - paymentFee - adCost) : null;
      res.json({
        ok: true, sell, cost, shipping, shippingMethod, deliveryDays,
        paymentFee, adCost, profit,
        margin: profit == null ? null : Math.round(profit / sell * 100),
        inStock
      });
    } catch (e) {
      console.error('profit lookup failed:', e.message || e);
      res.json({ ok: false, error: e.message || 'Lookup failed' });
    }
  });
};
