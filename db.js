// db.js: saves every product the site fetches into a Postgres database.
// Needs the DATABASE_URL setting in Render. If it is not set, the site still
// works as before, it just does not save anything.
let pool = null;
let ready = null;

function enabled() { return !!process.env.DATABASE_URL; }

function getPool() {
  if (!enabled()) return null;
  if (pool) return pool;
  const { Pool } = require('pg');
  const url = process.env.DATABASE_URL;
  const local = /localhost|127\.0\.0\.1/.test(url);
  pool = new Pool({
    connectionString: url,
    ssl: local ? false : { rejectUnauthorized: false },
    max: 3
  });
  pool.on('error', (e) => console.error('database error:', e.message || e));
  return pool;
}

function init() {
  const p = getPool();
  if (!p) return Promise.resolve(false);
  if (!ready) {
    ready = p.query(`
      CREATE TABLE IF NOT EXISTS products (
        pid TEXT PRIMARY KEY,
        name TEXT,
        image TEXT,
        cost NUMERIC,
        suggested_price NUMERIC,
        category TEXT,
        listed_by_sellers INTEGER,
        score INTEGER,
        last_query TEXT,
        first_seen TIMESTAMPTZ DEFAULT now(),
        last_seen TIMESTAMPTZ DEFAULT now()
      )`).then(() => p.query(`
      CREATE TABLE IF NOT EXISTS searches (
        id SERIAL PRIMARY KEY,
        query TEXT NOT NULL,
        results INTEGER,
        searched_at TIMESTAMPTZ DEFAULT now()
      )`)).then(() => p.query(`
      CREATE TABLE IF NOT EXISTS snapshots (
        pid TEXT NOT NULL,
        day DATE NOT NULL DEFAULT CURRENT_DATE,
        listed INTEGER NOT NULL,
        PRIMARY KEY (pid, day)
      )`)).then(() => p.query(`ALTER TABLE snapshots ALTER COLUMN listed DROP NOT NULL`)
      ).then(() => p.query(`ALTER TABLE snapshots ADD COLUMN IF NOT EXISTS sold INTEGER`)
      ).then(() => p.query(`ALTER TABLE snapshots ADD COLUMN IF NOT EXISTS cost NUMERIC`)
      ).then(() => p.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS sold INTEGER`)
      ).then(() => p.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS rating NUMERIC`)
      ).then(() => true).catch((e) => {
        console.error('database setup failed:', e.message || e);
        ready = null;
        return false;
      });
  }
  return ready;
}

async function saveProducts(list, query) {
  if (!enabled() || !list || !list.length) return 0;
  if (!(await init())) return 0;
  const p = getPool();
  let n = 0;
  for (const x of list) {
    try {
      await p.query(
        `INSERT INTO products
           (pid, name, image, cost, suggested_price, category, listed_by_sellers, score, last_query)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (pid) DO UPDATE SET
           name = EXCLUDED.name, image = EXCLUDED.image, cost = EXCLUDED.cost,
           suggested_price = EXCLUDED.suggested_price, category = EXCLUDED.category,
           listed_by_sellers = EXCLUDED.listed_by_sellers, score = EXCLUDED.score,
           last_query = EXCLUDED.last_query, last_seen = now()`,
        [String(x.pid), x.name || '', x.image || '', x.cost, x.suggestedPrice,
         x.category || '', x.listedBySellers == null ? null : x.listedBySellers,
         x.score, String(query || '').slice(0, 80)]
      );
      if (x.listedBySellers != null && !isNaN(Number(x.listedBySellers))) {
        await p.query(
          `INSERT INTO snapshots (pid, day, listed) VALUES ($1, CURRENT_DATE, $2)
           ON CONFLICT (pid, day) DO UPDATE SET listed = EXCLUDED.listed`,
          [String(x.pid), Number(x.listedBySellers)]
        );
      }
      // Demand history: lifetime orders ("sold"), rating and cost, saved once a day.
      const soldN = Number(x.sold);
      const hasSold = x.sold != null && Number.isFinite(soldN);
      const ratingN = Number(x.rating);
      const hasRating = x.rating != null && Number.isFinite(ratingN);
      if (hasSold || hasRating) {
        await p.query(`UPDATE products SET sold = COALESCE($2, sold), rating = COALESCE($3, rating) WHERE pid = $1`,
          [String(x.pid), hasSold ? Math.round(soldN) : null, hasRating ? ratingN : null]);
      }
      if (hasSold && Number.isFinite(Number(x.cost))) {
        await p.query(
          `INSERT INTO snapshots (pid, day, listed, sold, cost) VALUES ($1, CURRENT_DATE, NULL, $2, $3)
           ON CONFLICT (pid, day) DO UPDATE SET sold = EXCLUDED.sold, cost = EXCLUDED.cost`,
          [String(x.pid), Math.round(soldN), Number(x.cost)]
        );
      }
      n++;
    } catch (e) {
      console.error('could not save product:', e.message || e);
    }
  }
  console.log('Saved ' + n + ' products to the database');
  return n;
}

async function listProducts(opts) {
  opts = opts || {};
  if (!(await init())) throw new Error('Database is not set up.');
  const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 100, 1), 500);
  const params = [];
  const conds = [];
  if (opts.q) {
    params.push('%' + String(opts.q).slice(0, 80) + '%');
    conds.push('(name ILIKE $' + params.length + ' OR category ILIKE $' + params.length + ' OR last_query ILIKE $' + params.length + ')');
  }
  if (opts.maxCost) {
    params.push(opts.maxCost);
    conds.push('cost <= $' + params.length);
  }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  params.push(limit);
  const order = opts.sort === 'new' ? 'last_seen DESC' : 'score DESC, last_seen DESC';
  const r = await getPool().query(
    `SELECT pid, name, image, cost, suggested_price, category, listed_by_sellers, score, last_seen
       FROM products ${where} ORDER BY ${order} LIMIT $${params.length}`, params);
  return r.rows.map((x) => ({
    pid: x.pid, name: x.name, image: x.image,
    cost: Number(x.cost), suggestedPrice: Number(x.suggested_price),
    category: x.category,
    listedBySellers: x.listed_by_sellers == null ? '?' : x.listed_by_sellers,
    score: x.score, lastSeen: x.last_seen
  }));
}

// Products whose number of sellers grew the most over the last days (up to 8).
// Needs saved history: a product shows here only after it was seen on 2+ different days.
async function listRising(opts) {
  opts = opts || {};
  if (!(await init())) throw new Error('Database is not set up.');
  const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 30, 1), 100);
  const maxCost = opts.maxCost || 1e9;
  const r = await getPool().query(
    `WITH latest AS (
       SELECT DISTINCT ON (pid) pid, day, listed FROM snapshots ORDER BY pid, day DESC
     ), base AS (
       SELECT DISTINCT ON (s.pid) s.pid, s.day, s.listed
         FROM snapshots s JOIN latest l ON l.pid = s.pid
        WHERE s.day <= l.day - 1 AND s.day >= l.day - 8
        ORDER BY s.pid, s.day ASC
     )
     SELECT p.pid, p.name, p.image, p.cost, p.suggested_price, p.category, p.score,
            l.listed AS now_listed, b.listed AS then_listed, (l.day - b.day) AS days
       FROM latest l
       JOIN base b ON b.pid = l.pid
       JOIN products p ON p.pid = l.pid
      WHERE l.listed > b.listed AND p.cost <= $1
      ORDER BY (l.listed - b.listed) DESC, p.score DESC
      LIMIT $2`, [maxCost, limit]);
  return r.rows.map((x) => ({
    pid: x.pid, name: x.name, image: x.image,
    cost: Number(x.cost), suggestedPrice: Number(x.suggested_price),
    category: x.category, listedBySellers: x.now_listed, score: x.score,
    growth: x.now_listed - x.then_listed, growthDays: Number(x.days)
  }));
}

// Products whose lifetime orders ("sold") grew over the last days, with the price change.
// Needs saved history: a product shows here only after it was seen on 2+ different days.
async function listDemand(opts) {
  opts = opts || {};
  if (!(await init())) throw new Error('Database is not set up.');
  const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 30, 1), 100);
  const maxCost = opts.maxCost || 1e9;
  const r = await getPool().query(
    `WITH latest AS (
       SELECT DISTINCT ON (pid) pid, day, sold, cost FROM snapshots WHERE sold IS NOT NULL ORDER BY pid, day DESC
     ), base AS (
       SELECT DISTINCT ON (s.pid) s.pid, s.day, s.sold, s.cost
         FROM snapshots s JOIN latest l ON l.pid = s.pid
        WHERE s.sold IS NOT NULL AND s.day <= l.day - 1 AND s.day >= l.day - 8
        ORDER BY s.pid, s.day ASC
     )
     SELECT p.pid, p.name, p.image, p.cost, p.suggested_price, p.category, p.score, p.rating,
            l.sold AS now_sold, b.sold AS then_sold, l.cost AS now_cost, b.cost AS then_cost, (l.day - b.day) AS days
       FROM latest l
       JOIN base b ON b.pid = l.pid
       JOIN products p ON p.pid = l.pid
      WHERE l.sold > b.sold AND p.cost <= $1
      ORDER BY (l.sold - b.sold) DESC, p.score DESC
      LIMIT $2`, [maxCost, limit]);
  return r.rows.map((x) => ({
    pid: x.pid, name: x.name, image: x.image,
    cost: Number(x.cost), suggestedPrice: Number(x.suggested_price),
    category: x.category, score: x.score,
    rating: x.rating == null ? null : Number(x.rating),
    sold: x.now_sold, soldGrowth: x.now_sold - x.then_sold,
    soldGrowthPct: x.then_sold > 0 ? Math.round(((x.now_sold - x.then_sold) / x.then_sold) * 100) : null,
    growthDays: Number(x.days),
    costNow: x.now_cost == null ? null : Number(x.now_cost),
    costThen: x.then_cost == null ? null : Number(x.then_cost),
    source: String(x.pid).startsWith('ali_') ? 'aliexpress' : 'cj'
  }));
}

async function saveSearch(query, results) {
  if (!enabled() || !query) return;
  if (!(await init())) return;
  await getPool().query('INSERT INTO searches (query, results) VALUES ($1, $2)',
    [String(query).slice(0, 80), results == null ? null : results]);
}

async function listSearches(limit) {
  if (!(await init())) throw new Error('Database is not set up.');
  const n = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const r = await getPool().query(
    `SELECT LOWER(query) AS query, COUNT(*)::int AS times, MAX(searched_at) AS last_time
       FROM searches GROUP BY LOWER(query) ORDER BY MAX(searched_at) DESC LIMIT $1`, [n]);
  return r.rows;
}

async function count() {
  if (!(await init())) return 0;
  const r = await getPool().query('SELECT COUNT(*)::int AS n FROM products');
  return r.rows[0].n;
}

module.exports = { enabled, saveProducts, listProducts, listRising, listDemand, saveSearch, listSearches, count };
