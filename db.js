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
      )`).then(() => true).catch((e) => {
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
  let where = '';
  if (opts.q) {
    params.push('%' + String(opts.q).slice(0, 80) + '%');
    where = 'WHERE name ILIKE $1 OR category ILIKE $1 OR last_query ILIKE $1';
  }
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

async function count() {
  if (!(await init())) return 0;
  const r = await getPool().query('SELECT COUNT(*)::int AS n FROM products');
  return r.rows[0].n;
}

module.exports = { enabled, saveProducts, listProducts, count };
