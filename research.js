// research.js — product research for AI Store Builder (CJ Dropshipping data).
// Routes (login is already enforced in server.js; these also need the user's CJ key):
//   GET /api/research?q=keyword      search CJ, score each product
//   GET /api/research/winners        scan several niches, best score first
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

const BASE = 'https://developers.cjdropshipping.com/api2.0/v1';
const COUNTRY = (process.env.RESEARCH_COUNTRY || 'US').toUpperCase();
const FEE_PCT = 2.9;      // payment fee percent, plus the fixed part below
const FEE_FIXED = 0.30;
const EST_SHIPPING = 4;   // rough shipping guess used only for the list score

const NICHES = [
  'pet grooming', 'kitchen gadget', 'car organizer', 'massage', 'phone holder',
  'led light', 'travel organizer', 'yoga', 'baby safety', 'desk organizer'
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- tiny CJ client (token cached per key) ----------
const tokens = new Map();
async function token(key) {
  const c = tokens.get(key);
  if (c && c.exp > Date.now()) return c.token;
  const r = await fetch(BASE + '/authentication/getAccessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: key })
  });
  const j = await r.json().catch(() => ({}));
  const t = j && j.data && j.data.accessToken;
  if (!t) throw new Error((j && j.message) || 'CJ login failed (wait 5 minutes and retry)');
  tokens.set(key, { token: t, exp: Date.now() + 10 * 24 * 3600 * 1000 });
  return t;
}

async function cjCall(key, path, opts) {
  opts = opts || {};
  const t = await token(key);
  const r = await fetch(BASE + path, {
    method: opts.body ? 'POST' : 'GET',
    headers: { 'CJ-Access-Token': t, 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined
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
  const p = clamp(cost * 3.2 + EST_SHIPPING, 14.99, 69.99);
  return Math.floor(p) + 0.99;
}

// 0-100. Points: margin 35, price band 15, stock 15, competition 20, delivery 15.
function scoreProduct(p) {
  const sell = p.suggestedPrice;
  const feeAmt = sell * FEE_PCT / 100 + FEE_FIXED;
  const before = sell - p.cost - EST_SHIPPING - feeAmt;
  const marginBeforeAds = before / sell;                 // ads still to come off
  let s = 0;
  s += clamp((marginBeforeAds - 0.2) / 0.4, 0, 1) * 35;  // 20% -> 0 pts, 60% -> 35 pts
  s += (sell >= 20 && sell <= 60) ? 15 : (sell >= 15 ? 7 : 0);
  const stock = p.stock;
  s += stock == null ? 5 : clamp(stock / 1000, 0, 1) * 15;
  const sellers = p.listedBySellers;
  s += sellers == null ? 8 : sellers < 50 ? 20 : sellers < 200 ? 14 : sellers < 500 ? 8 : 3;
  const d = p.deliveryDays;
  s += d == null ? 6 : d <= 8 ? 15 : d <= 12 ? 10 : d <= 16 ? 4 : 0;
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
  return out;
}

const publicFields = (p) => ({
  pid: p.pid, name: p.name, image: p.image, cost: p.cost,
  suggestedPrice: p.suggestedPrice, category: p.category,
  listedBySellers: p.listedBySellers == null ? '?' : p.listedBySellers,
  score: p.score
});

// ---------- routes ----------
module.exports = function (app) {
  const winnersCache = new Map(); // cj key -> { at, results }

  app.get('/api/research', requireCjKey, async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 80);
    if (!q) return res.status(400).json({ error: 'Type a keyword first.' });
    try {
      const list = await searchKeyword(req.cjKey, q, 30);
      list.sort((a, b) => b.score - a.score);
      res.json({ results: list.map(publicFields) });
    } catch (e) {
      console.error('research search failed:', e.message || e);
      res.status(502).json({ error: e.message || 'CJ search failed' });
    }
  });

  app.get('/api/research/winners', requireCjKey, async (req, res) => {
    const hit = winnersCache.get(req.cjKey);
    if (hit && Date.now() - hit.at < 6 * 3600 * 1000) return res.json({ results: hit.results });
    try {
      const seen = new Set();
      let all = [];
      for (const n of NICHES) {
        try {
          const found = await searchKeyword(req.cjKey, n, 20);
          found.forEach((p) => { if (!seen.has(p.pid)) { seen.add(p.pid); all.push(p); } });
        } catch (e) {
          console.error('niche failed:', n, e.message || e);
        }
        await sleep(1100); // stay under CJ's request rate limit
      }
      all.sort((a, b) => b.score - a.score);
      const results = all.slice(0, 20).map(publicFields);
      if (results.length) winnersCache.set(req.cjKey, { at: Date.now(), results });
      res.json({ results });
    } catch (e) {
      console.error('winners scan failed:', e.message || e);
      res.status(502).json({ error: e.message || 'Scan failed' });
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
