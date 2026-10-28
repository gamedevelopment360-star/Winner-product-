// research.js — product research for Winner Finder (CJ Dropshipping +
// AliExpress data, merged together).
// Routes (the password gate is in server.js; these use the CJ_API_KEY from the server):
//   GET /api/research?q=keyword      search CJ + AliExpress, score each product
//   GET /api/research/winners        scan several niches, best score first
//   GET /api/saved                   products saved in the database
//   GET /api/research/profit?pid=&sell=&ad=   real shipping + stock + profit for one product (CJ only)
//
// The score means "worth a small test", NOT "guaranteed profit".
// Every product carries a "source" field ('cj' or 'aliexpress') since
// fulfillment differs: CJ orders place automatically, AliExpress ones
// currently need to be ordered by hand on aliexpress.com.

// Standalone site: the CJ key comes from the CJ_API_KEY environment variable.
function requireCjKey(req, res, next) {
  if (!USE_CJ) { req.cjKey = process.env.CJ_API_KEY || 'none'; return next(); } // AliExpress mode
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
const USE_CJ = process.env.USE_CJ === 'true'; // CJ is OFF by default: every button uses AliExpress. Set USE_CJ=true in Render to turn CJ back on.
const ALI_KEYWORDS_PER_BUTTON = parseInt(process.env.ALI_KEYWORDS, 10) || 4; // AliExpress searches per button tap (each one uses RapidAPI quota)
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

// CJ sometimes answers "Too Many Requests" (limit is per IP; a free Render server shares its IP).
// Wait a little and try again, up to 4 times.
async function cjCall(key, path, opts) {
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await cjCallOnce(key, path, opts);
    } catch (e) {
      lastErr = e;
      if (!/too many requests/i.test(String((e && e.message) || e)) || attempt === 4) throw e;
      await sleep(2000 * attempt);
    }
  }
  throw lastErr;
}

async function cjCallOnce(key, path, opts) {
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
// scoreDetail returns the total AND the reasons behind it, plus flags for missing or rough data.
function scoreDetail(p) {
  const sell = p.suggestedPrice;
  const feeAmt = sell * FEE_PCT / 100 + FEE_FIXED;
  const before = sell - p.cost - EST_SHIPPING - feeAmt;
  const marginBeforeAds = before / sell;                 // ads still to come off
  const parts = [];
  const flags = [];
  let s = 0;
  const add = (label, pts, max, note) => {
    s += pts;
    parts.push({ label, pts: Math.round(pts * 10) / 10, max, note });
  };

  add('Profit margin', clamp((marginBeforeAds - 0.2) / 0.4, 0, 1) * 35, 35,
    `About ${Math.round(marginBeforeAds * 100)}% before ads (20% scores 0, 60% or more scores full)`);

  const bandPts = (sell >= 20 && sell <= 60) ? 15 : sell < 20 ? (sell >= 15 ? 7 : 0) : sell <= 90 ? 6 : 0;
  add('Selling price range', bandPts, 15, `Suggested price $${sell} (best between $20 and $60)`);

  const stock = p.stock;
  add('Stock', stock == null ? 5 : clamp(stock / 1000, 0, 1) * 15, 15,
    stock == null ? 'Unknown, given a neutral score' : `${stock} units in stock`);
  if (stock == null) flags.push('Stock is unknown');

  const sellers = p.listedBySellers;
  add('Few competing sellers', sellers == null ? 8 : sellers < 50 ? 20 : sellers < 200 ? 14 : sellers < 500 ? 8 : 3, 20,
    sellers == null ? 'Unknown, given a neutral score' : `${sellers} sellers already list it`);
  if (sellers == null) flags.push('Number of competing sellers is unknown');

  const d = p.deliveryDays;
  add('Delivery time', d == null ? 6 : d <= 8 ? 15 : d <= 12 ? 10 : d <= 16 ? 4 : 0, 15,
    d == null ? 'Unknown, given a neutral score' : `About ${d} days`);
  if (d == null) flags.push('Delivery time is unknown');

  if (before < MIN_PROFIT) {
    const old = s; s *= 0.6;
    parts.push({ label: 'Low profit penalty', pts: Math.round((s - old) * 10) / 10, max: 0,
      note: `Less than $${MIN_PROFIT} left per sale before ads` });
  }
  if (sell > 90) {
    const old = s; s *= 0.75;
    parts.push({ label: 'High price penalty', pts: Math.round((s - old) * 10) / 10, max: 0,
      note: 'Costly items sell less and carry more risk' });
  }
  const season = seasonInfo(p.name, p.category);
  if (season.bonus) {
    s += season.bonus;
    parts.push({ label: 'Season', pts: season.bonus, max: 0, note: `${season.label} (a keyword guess, not real sales data)` });
  }

  flags.push(`Shipping is a rough guess ($${EST_SHIPPING}) until you tap Calculate profit`);
  flags.push('Suggested price is a formula, not a real market price');
  flags.push('30-day sales history is not available');
  if (p.source === 'aliexpress') flags.push('AliExpress data: orders must be placed by hand, with no live stock or shipping quote');

  return { total: Math.round(clamp(s, 0, 100)), parts, flags };
}
function scoreProduct(p) { return scoreDetail(p).total; }
function attachScore(p) {
  const d = scoreDetail(p);
  p.score = d.total;
  p.scoreParts = d.parts;
  p.dataFlags = d.flags;
}

// Demand analysis (0-100) from what AliExpress really gives us: lifetime orders ("sold")
// and star rating. It is NOT 30-day sales, and video engagement / review text are not
// available from supplier data, so they are flagged instead of guessed.
function demandDetail(p) {
  const sold = p.sold == null ? null : firstNum(p.sold);
  const rating = p.rating == null ? null : firstNum(p.rating);
  const flags = [
    'Sold = lifetime orders, not the last 30 days',
    'Video engagement is not available from supplier data (use the TikTok and YouTube links)'
  ];
  const parts = [];
  let pts = 0;
  let max = 0;
  if (sold != null) {
    const sp = sold >= 5000 ? 50 : sold >= 1000 ? 40 : sold >= 200 ? 30 : sold >= 50 ? 20 : sold >= 10 ? 10 : 3;
    pts += sp; max += 50;
    parts.push({ label: 'Orders sold', pts: sp, max: 50, note: sold.toLocaleString() + ' orders so far' });
  } else {
    flags.push('Orders sold are unknown for this product');
  }
  if (rating != null) {
    const rp = rating >= 4.7 ? 25 : rating >= 4.5 ? 20 : rating >= 4.2 ? 12 : rating >= 4.0 ? 6 : 0;
    pts += rp; max += 25;
    parts.push({ label: 'Rating', pts: rp, max: 25, note: rating.toFixed(1) + ' out of 5 stars' });
  } else {
    flags.push('Rating is unknown for this product');
  }
  if (!max) return { score: null, label: 'No demand data', parts, flags };
  const score = Math.round((pts / max) * 100);
  const label = score >= 75 ? 'Strong demand' : score >= 50 ? 'Some demand' : 'Weak demand';
  return { score, label, parts, flags };
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
    deliveryDays: firstNum(x.deliveryCycle),
    source: 'cj'
  };
  if (!p.pid) return null;
  p.suggestedPrice = suggestPrice(p.cost);
  attachScore(p);
  p.seasonLabel = seasonInfo(p.name, p.category).label;
  return p;
}

// ---------- AliExpress (via RapidAPI's Aliexpress DataHub) ----------
let aliDebugLogged = false; // only log the first raw result once, to confirm field names are right

function mapAliProduct(x, maxCost) {
  const limit = typeof maxCost === 'number' ? maxCost : MAX_COST;
  const def = (x.sku && x.sku.def) || {};
  const cost = firstNum(def.promotionPrice != null ? def.promotionPrice : def.price);
  if (!cost || cost <= 0 || cost > limit) return null;
  const itemId = x.itemId || x.productId || x.id;
  if (!itemId) return null;
  const p = {
    pid: 'ali_' + itemId,
    name: x.title || x.productTitle || 'Unnamed product',
    image: x.image || x.imageUrl || '',
    cost: round2(cost),
    category: '',
    // AliExpress gives a sold count, not a seller count — not the same
    // signal as CJ's "listedBySellers", so left null rather than guessed.
    listedBySellers: null,
    stock: null,
    deliveryDays: null,
    source: 'aliexpress',
    rating: x.averageStarRate != null ? Number(x.averageStarRate) : null,
    sold: x.sales != null ? Number(x.sales) : null,
  };
  p.suggestedPrice = suggestPrice(p.cost);
  attachScore(p);
  p.demand = demandDetail(p);
  p.seasonLabel = seasonInfo(p.name, p.category).label;
  return p;
}

async function searchAliExpress(q, size) {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) return []; // not configured — AliExpress results just won't appear, CJ still works
  try {
    const url = `https://aliexpress-datahub.p.rapidapi.com/item_search_2?q=${encodeURIComponent(q)}&page=1`;
    const r = await fetch(url, {
      headers: { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': 'aliexpress-datahub.p.rapidapi.com' },
    });
    const j = await r.json();
    const list = (j.result && j.result.resultList) || [];
    if (!aliDebugLogged && list.length) {
      console.log('[AliExpress DEBUG] First raw search item:', JSON.stringify(list[0]).slice(0, 1500));
      aliDebugLogged = true;
    }
    const out = [];
    list.forEach((block) => {
      const p = mapAliProduct(block.item || block, typeof size === 'number' ? undefined : undefined);
      if (p) out.push(p);
    });
    return onlyRelevant(out, q);
  } catch (e) {
    console.error('AliExpress search failed:', e.message || e);
    return [];
  }
}
// Used by the CJ buttons when CJ is blocked: search AliExpress for the first few keywords instead.
// (Only 3 keywords, so it does not use up your RapidAPI quota.)
async function aliFallback(keywords, keep) {
  const seen = new Set();
  const out = [];
  for (const k of keywords.slice(0, ALI_KEYWORDS_PER_BUTTON)) {
    const found = await searchAliExpress(k, 30);
    found.forEach((p) => {
      if (!seen.has(p.pid) && (!keep || keep(p))) { seen.add(p.pid); out.push(p); }
    });
    await sleep(1100);
  }
  return out;
}
// ---------- end AliExpress ----------

async function searchKeyword(key, q, size, keep) {
  if (!USE_CJ) return []; // CJ is off
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
  score: p.score, scoreParts: p.scoreParts || null, dataFlags: p.dataFlags || [], seasonLabel: p.seasonLabel || null,
  competition: competitionOf(p.listedBySellers),
  source: p.source || 'cj',
  sold: p.sold == null ? null : p.sold, rating: p.rating == null ? null : p.rating, demand: p.demand || null
});

// ---------- routes ----------
module.exports = function (app) {
  app.get('/api/version', (req, res) => res.json({ version: 'relevance-v8' }));
  const winnersCache = new Map(); // cj key -> { at, results }

  app.get('/api/research', requireCjKey, async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 80);
    if (!q) return res.status(400).json({ error: 'Type a keyword first.' });
    // Each source is independent: if CJ is blocked (or AliExpress is down),
    // the other source's results still come back instead of the whole
    // search failing.
    const [cjResult, aliResult] = await Promise.allSettled([
      searchKeyword(req.cjKey, q, 50),
      searchAliExpress(q, 30),
    ]);
    const cjList = cjResult.status === 'fulfilled' ? cjResult.value : [];
    const aliList = aliResult.status === 'fulfilled' ? aliResult.value : [];
    if (cjResult.status === 'rejected') console.error('CJ search failed:', cjResult.reason?.message || cjResult.reason);
    if (aliResult.status === 'rejected') console.error('AliExpress search failed:', aliResult.reason?.message || aliResult.reason);

    const list = cjList.concat(aliList);
    list.sort((a, b) => b.score - a.score);

    if (!list.length) {
      // Both sources failed (or found nothing) — this is the only time to
      // show an error instead of an (empty) results list.
      const err = cjResult.status === 'rejected' ? cjResult.reason : aliResult.status === 'rejected' ? aliResult.reason : null;
      return res.status(502).json({ error: err?.message || 'No results from CJ or AliExpress.' });
    }

    db.saveProducts(list, q).catch((e) => console.error('save failed:', e.message || e));
    db.saveSearch(q, list.length).catch((e) => console.error('search save failed:', e.message || e));
    res.json({ results: list.map(publicFields), cjFailed: cjResult.status === 'rejected', aliFailed: aliResult.status === 'rejected' });
  });

  const scansRunning = new Map(); // cj key -> scan in progress, so taps in a row do not start many scans

  async function scanWinners(key) {
    const seen = new Set();
    const all = [];
    for (const n of (USE_CJ ? NICHES : [])) {
      try {
        const found = await searchKeyword(key, n, 20);
        found.forEach((p) => { if (!seen.has(p.pid)) { seen.add(p.pid); all.push(p); } });
      } catch (e) {
        console.error('niche failed:', n, e.message || e);
      }
      await sleep(1100); // stay under CJ's request rate limit
    }
    if (!all.length) (await aliFallback(NICHES)).forEach((p) => all.push(p)); // CJ blocked: use AliExpress
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
    for (const n of (USE_CJ ? words : [])) {
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
    if (!all.length) (await aliFallback(words, keep)).forEach((p) => all.push(p)); // CJ blocked: use AliExpress
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
    if (!USE_CJ) {
      try {
        const alt = (await aliFallback(NICHES)).sort((a, b) => b.score - a.score).slice(0, 30).map(publicFields);
        if (alt.length) trendingCache = { at: Date.now(), results: alt };
        return res.json({ results: alt, message: alt.length ? 'Top products from AliExpress.' : 'AliExpress returned no products. Check RAPIDAPI_KEY in Render.' });
      } catch (e) {
        console.error('AliExpress picks failed:', e.message || e);
        return res.status(502).json({ error: e.message || 'AliExpress failed' });
      }
    }
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
      let results = list.slice(0, 30).map(publicFields);
      let added = 0;
      if (results.length < 10) {
        // CJ's trending list is short, so add the best products from the niche scan
        try {
          const hit = winnersCache.get(req.cjKey);
          let extra;
          if (hit && Date.now() - hit.at < 6 * 3600 * 1000) extra = hit.results;
          else {
            let run = scansRunning.get(req.cjKey);
            if (!run) {
              run = scanWinners(req.cjKey).finally(() => scansRunning.delete(req.cjKey));
              scansRunning.set(req.cjKey, run);
            }
            extra = await run;
          }
          const have = new Set(results.map((p) => p.pid));
          extra.forEach((p) => { if (!have.has(p.pid) && results.length < 30) { have.add(p.pid); results.push(p); added++; } });
        } catch (e) { console.error('trending extra failed:', e.message || e); }
      }
      if (results.length) trendingCache = { at: Date.now(), results };
      if (added) return res.json({ results, message: 'CJ sent only ' + list.length + ' trending, so ' + added + ' top products from the niche scan were added.' });
      res.json({ results, message: results.length ? (rows.length > list.length ? (rows.length - list.length) + ' of ' + rows.length + ' CJ trending products were hidden (cost over $' + TREND_MAX_COST + ' or no price).' : 'CJ sent ' + rows.length + ' trending products.') : 'CJ returned no trending products under your cost limit.' });
    } catch (e) {
      console.error('trending failed:', e.message || e);
      try {
        const alt = (await aliFallback(NICHES)).sort((a, b) => b.score - a.score).slice(0, 30).map(publicFields);
        if (alt.length) return res.json({ results: alt, message: 'CJ is blocked right now, so these are from AliExpress.' });
      } catch (e2) { console.error('trending AliExpress fallback failed:', e2.message || e2); }
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
      } catch (e) { console.error('trending fans (CJ list) failed:', e.message || e); }
      if (!list.length) {
        source = 'fans listed by the most sellers';
        await sleep(1100);
        list = await searchKeyword(req.cjKey, 'fan', 50, fanOnly);
        list.sort((a, b) => (b.listedBySellers || 0) - (a.listedBySellers || 0));
      } else {
        list.sort((a, b) => b.score - a.score);
      }
      db.saveProducts(list, 'trending fans').catch((e) => console.error('save failed:', e.message || e));
      const results = list.slice(0, 30).map(publicFields);
      const data = { results, message: results.length ? '' : 'No fans found under your cost limit.', source };
      if (results.length) fanCache = { at: Date.now(), data };
      res.json(data);
    } catch (e) {
      console.error('trending fans failed:', e.message || e);
      res.status(502).json({ error: e.message || 'Trending fans failed' });
    }
  });

  // Products whose number of sellers grew the most in the last days (from saved daily history).
  app.get('/api/research/rising', async (req, res) => {
    if (!db.enabled()) return res.json({ results: [], message: 'The database is not connected, so rising products cannot be tracked.' });
    try {
      const results = (await db.listRising({ limit: 30, maxCost: MAX_COST })).map((p) => ({ ...publicFields(p), growth: p.growth, growthDays: p.growthDays }));
      res.json({ results, message: results.length ? '' : 'No rising products yet. The site saves each product once a day when it shows up in a search or scan. Run scans on 2 or more different days, then check again.' });
    } catch (e) {
      console.error('rising failed:', e.message || e);
      res.status(502).json({ error: e.message || 'Could not read rising products' });
    }
  });

  // Products whose lifetime orders grew over the last days (from saved daily history), with price change.
  app.get('/api/research/demand', async (req, res) => {
    if (!db.enabled()) return res.json({ results: [], message: 'The database is not connected, so demand growth cannot be tracked.' });
    try {
      const results = (await db.listDemand({ limit: 30, maxCost: MAX_COST })).map((p) => ({
        ...p, demand: demandDetail(p), competition: null, listedBySellers: '?', scoreParts: null, dataFlags: []
      }));
      res.json({ results, message: results.length ? '' : 'No demand growth yet. The site saves each AliExpress product once a day when it shows up in a search or scan. Run scans on 2 or more different days, then check again.' });
    } catch (e) {
      console.error('demand failed:', e.message || e);
      res.status(502).json({ error: e.message || 'Could not read demand growth' });
    }
  });

  // Products saved in the database. ?q=word  &sort=new  &limit=100
  app.get('/api/saved', async (req, res) => {
    if (!db.enabled()) return res.status(503).json({ error: 'DATABASE_URL is not set on the server.' });
    try {
      const results = await db.listProducts({ q: String(req.query.q || '').trim(), sort: req.query.sort, limit: req.query.limit, maxCost: MAX_COST });
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
    if (pid.startsWith('ali_')) {
      // AliExpress product: cost comes from the card, shipping is a rough guess
      const cost = parseFloat(req.query.cost);
      if (!(cost > 0)) return res.json({ ok: false, error: 'Product cost is missing.' });
      const fee = sell * FEE_PCT / 100 + FEE_FIXED;
      const profit = sell - cost - EST_SHIPPING - fee - adCost;
      return res.json({ ok: true, sell: round2(sell), cost: round2(cost), shipping: EST_SHIPPING, paymentFee: round2(fee), adCost: round2(adCost), profit: round2(profit), margin: Math.round(profit / sell * 1000) / 10, inStock: null });
    }
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
