// Squad payments for Winner Finder: one payment = 30 days of access.
//
// Render > Environment:
//   SQUAD_SECRET_KEY   your Squad secret key (sandbox key while testing). Never put it in GitHub.
//   SQUAD_BASE         optional. Sandbox (default): https://sandbox-api-d.squadco.com   Live: https://api-d.squadco.com
//   SQUAD_AMOUNT       optional price per 30 days in normal units, default 30
//   SQUAD_CURRENCY     optional, default USD (use NGN if your Squad account charges in naira)
//   REQUIRE_PAYMENT    set to true to lock the app until a person has paid
//   ADMIN_EMAILS       your own Google email(s), comma separated. They never need to pay.
//   PUBLIC_URL         optional, https://winner-product.onrender.com
const crypto = require('crypto');
const express = require('express');
const db = require('./db');

module.exports = function (app) {
  const KEY = process.env.SQUAD_SECRET_KEY || '';
  const BASE = (process.env.SQUAD_BASE || 'https://sandbox-api-d.squadco.com').replace(/\/+$/, '');
  const AMOUNT = Number(process.env.SQUAD_AMOUNT || 30);
  const CURRENCY = (process.env.SQUAD_CURRENCY || 'USD').toUpperCase();
  const PAYWALL = process.env.REQUIRE_PAYMENT === 'true';
  const ADMINS = (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean);
  const DAYS = 30;
  const amountMinor = Math.round(AMOUNT * 100);
  const baseUrl = (req) => process.env.PUBLIC_URL || 'https://' + req.headers.host;
  const priceText = () => {
    try { return new Intl.NumberFormat('en', { style: 'currency', currency: CURRENCY, maximumFractionDigits: 0 }).format(AMOUNT) + ' per month'; }
    catch (e) { return AMOUNT + ' ' + CURRENCY + ' per month'; }
  };
  const isAdmin = (email) => ADMINS.includes(String(email || '').toLowerCase());

  async function status(email) {
    if (!PAYWALL) return { billing: false, subscribed: true, price: priceText() };
    if (isAdmin(email)) return { billing: true, subscribed: true, admin: true, price: priceText() };
    let until = null;
    try { until = await db.getSubscription(email); } catch (e) { console.error('subscription lookup failed:', e.message || e); }
    const ok = !!until && new Date(until).getTime() > Date.now();
    return { billing: true, subscribed: ok, paidUntil: until, price: priceText() };
  }
  app.locals.billingStatus = status;
  app.locals.billingPublic = () => ({ billing: PAYWALL });

  async function squad(method, path, body) {
    const r = await fetch(BASE + path, {
      method,
      headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    let j = {}; try { j = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error((j && j.message) || 'Squad error (' + r.status + ')');
    return j;
  }

  // Asks Squad whether the payment really went through, then gives 30 days of access.
  async function confirm(ref) {
    const pay = await db.getPayment(ref);
    if (!pay) return { ok: false, reason: 'unknown payment' };
    if (pay.status === 'paid') return { ok: true, email: pay.email };
    const j = await squad('GET', '/transaction/verify/' + encodeURIComponent(ref));
    const d = (j && j.data) || {};
    const st = String(d.transaction_status || d.status || '').toLowerCase();
    const paid = Number(d.transaction_amount);
    const expected = Number(pay.amount_minor);
    const amountOk = paid === expected || paid * 100 === expected; // Squad may report minor or normal units
    if (st !== 'success' || !amountOk) return { ok: false, reason: 'not successful (' + (st || 'no status') + ')' };
    const out = await db.activatePayment(ref, DAYS);
    return { ok: true, email: out.email };
  }

  // Creates a payment and returns Squad's checkout page address.
  async function startPayment(req) {
    const ref = 'WF' + Date.now() + crypto.randomBytes(4).toString('hex');
    await db.createPayment(ref, req.userEmail, amountMinor, CURRENCY);
    const j = await squad('POST', '/transaction/initiate', {
      amount: amountMinor,
      email: req.userEmail,
      currency: CURRENCY,
      initiate_type: 'inline',
      transaction_ref: ref,
      callback_url: baseUrl(req) + '/billing/return',
      metadata: { product: 'Winner Finder 30 days', email: req.userEmail }
    });
    const url = j && j.data && (j.data.checkout_url || j.data.auth_url);
    if (!url) throw new Error('Squad did not return a payment page.');
    return url;
  }

  // "Start now" button: sign in if needed, then go straight to Squad's payment page.
  app.get('/pay', async (req, res) => {
    const page = (msg) => res.status(503).send('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font:16px system-ui;background:#0f1115;color:#e8eaf0;padding:24px"><p>' + msg + '</p><p><a style="color:#6cb4ff" href="/landing.html">Back</a></p>');
    if (!req.userEmail) return res.redirect('/login.html?next=/pay'); // sign in first
    if (!KEY) return page('Payments are not set up yet.');
    try {
      const st = await status(req.userEmail);
      if (PAYWALL && st.subscribed) return res.redirect('/app');
      res.redirect(await startPayment(req));
    } catch (e) {
      console.error('pay failed:', e.message || e);
      page('Could not start the payment: ' + String(e.message || e).replace(/[<>&]/g, '').slice(0, 160));
    }
  });

  // Same thing as a button call (returns the address instead of redirecting).
  app.post('/api/billing/checkout', async (req, res) => {
    if (!KEY) return res.status(503).json({ error: 'Payments are not set up yet (SQUAD_SECRET_KEY is missing on Render).' });
    if (!req.userEmail) return res.status(401).json({ error: 'Please sign in with Google first.' });
    try { res.json({ url: await startPayment(req) }); }
    catch (e) {
      console.error('checkout failed:', e.message || e);
      res.status(502).json({ error: 'Could not start the payment: ' + String(e.message || e).slice(0, 160) });
    }
  });

  // Squad sends the person back here after paying.
  app.get('/billing/return', async (req, res) => {
    const ref = String(req.query.reference || req.query.transaction_ref || req.query.trxref || '');
    try {
      const out = ref ? await confirm(ref) : { ok: false, reason: 'no reference' };
      if (!out.ok) console.warn('payment not confirmed:', ref, out.reason);
      res.redirect(out.ok ? '/app?paid=1' : '/app?paid=0');
    } catch (e) {
      console.error('payment check failed:', e.message || e);
      res.redirect('/app?paid=0');
    }
  });

  // Squad also tells us by webhook. We never trust the message itself: we re-check with Squad.
  app.post('/api/billing/webhook', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
    try {
      const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
      const sent = String(req.headers['x-squad-encrypted-body'] || '').toLowerCase();
      const want = crypto.createHmac('sha512', KEY).update(raw).digest('hex').toLowerCase();
      if (!KEY || sent.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(want))) return res.status(401).send('bad signature');
      const body = JSON.parse(raw.toString() || '{}');
      const ref = (body.Body && body.Body.transaction_ref) || body.transaction_ref || '';
      if (ref) await confirm(String(ref)).catch((e) => console.error('webhook confirm failed:', e.message || e));
      res.send('ok');
    } catch (e) {
      console.error('webhook failed:', e.message || e);
      res.status(400).send('bad request');
    }
  });

  // The "Manage billing" button: payments are monthly and manual, so there is nothing to manage.
  app.post('/api/billing/portal', (req, res) => res.json({ url: '/app' }));

  // Lock the data until paid (only when REQUIRE_PAYMENT=true).
  if (PAYWALL) {
    app.use(async (req, res, next) => {
      const p = req.path;
      if (!p.startsWith('/api/') || p.startsWith('/api/auth/') || p.startsWith('/api/billing/') || p === '/api/version') return next();
      if (!req.userEmail) return res.status(401).json({ error: 'Please sign in with Google.' });
      const st = await status(req.userEmail);
      if (st.subscribed) return next();
      res.status(402).json({ error: 'Your access has ended. Subscribe to continue.' });
    });
  }
};
