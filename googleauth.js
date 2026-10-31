// Google sign-in for Winner Finder. No extra packages needed.
// Render Environment: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET.
// Optional: SESSION_SECRET (any long random text), PUBLIC_URL, REQUIRE_LOGIN=true
const crypto = require('crypto');
let db = null;
try { db = require('./db'); } catch (e) { /* the site still works without it */ }

module.exports = function (app) {
  const ID = process.env.GOOGLE_CLIENT_ID;
  const SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const KEY = process.env.SESSION_SECRET || SECRET || 'change-me';
  const DAYS = 30;

  const baseUrl = (req) => process.env.PUBLIC_URL || 'https://' + req.headers.host;
  const sign = (v) => crypto.createHmac('sha256', KEY).update(v).digest('base64url');

  function cookies(req) {
    const out = {};
    (req.headers.cookie || '').split(';').forEach((c) => {
      const i = c.indexOf('=');
      if (i > 0) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
    });
    return out;
  }
  function setCookie(res, name, val, maxAge) {
    res.append('Set-Cookie', name + '=' + encodeURIComponent(val) + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + maxAge);
  }
  function getSession(req) {
    const v = cookies(req).wf_session;
    if (!v) return null;
    const [body, sig] = v.split('.');
    if (!body || !sig) return null;
    const want = sign(body);
    if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
    try {
      const d = JSON.parse(Buffer.from(body, 'base64url').toString());
      return d.exp > Date.now() ? d : null;
    } catch (e) { return null; }
  }

  // Tell the rest of the server who is asking (req.userEmail), so data stays per person.
  app.use((req, res, next) => {
    const s = getSession(req);
    if (s && s.email) req.userEmail = String(s.email).toLowerCase();
    next();
  });

  // Optional gate: set REQUIRE_LOGIN=true on Render once Google sign-in works.
  if (process.env.REQUIRE_LOGIN === 'true') {
    app.use((req, res, next) => {
      const p = req.path;
      if (p.startsWith('/auth/') || p.startsWith('/api/auth/') || p === '/' || p === '/login.html' || p === '/landing.html') return next();
      if (getSession(req)) return next();
      if (p.startsWith('/api/')) return res.status(401).json({ error: 'Please sign in.' });
      res.redirect('/login.html');
    });
  }

  app.get('/auth/google', (req, res) => {
    if (!ID || !SECRET) return res.status(404).send('Google sign-in is not set up.');
    const state = crypto.randomBytes(16).toString('hex');
    setCookie(res, 'wf_state', state, 600);
    const q = new URLSearchParams({
      client_id: ID,
      redirect_uri: baseUrl(req) + '/auth/google/callback',
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account'
    });
    res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + q);
  });

  app.get('/auth/google/callback', async (req, res) => {
    try {
      if (!ID || !SECRET) return res.status(404).send('Google sign-in is not set up.');
      if (req.query.error) return res.redirect('/login.html');
      if (!req.query.code || !req.query.state || req.query.state !== cookies(req).wf_state) {
        return res.status(400).send('Sign-in expired. Please go back and try again.');
      }
      const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: req.query.code,
          client_id: ID,
          client_secret: SECRET,
          redirect_uri: baseUrl(req) + '/auth/google/callback',
          grant_type: 'authorization_code'
        })
      });
      const t = await r.json();
      if (!r.ok || !t.id_token) throw new Error(t.error_description || t.error || 'Google rejected the sign-in');
      // The token came straight from Google over HTTPS, so its contents can be trusted.
      const info = JSON.parse(Buffer.from(t.id_token.split('.')[1], 'base64url').toString());
      if (info.aud !== ID || !info.email || info.email_verified === false) throw new Error('Invalid Google account');
      if (db && db.saveUser) await db.saveUser({ email: info.email, name: info.name }).catch(() => {});
      const body = Buffer.from(JSON.stringify({ email: info.email, name: info.name || '', exp: Date.now() + DAYS * 864e5 })).toString('base64url');
      setCookie(res, 'wf_session', body + '.' + sign(body), DAYS * 86400);
      setCookie(res, 'wf_state', '', 0);
      res.redirect('/app');
    } catch (e) {
      console.error('Google sign-in failed:', e.message);
      res.status(500).send('Google sign-in failed. Please go back and try again.');
    }
  });

  app.get('/api/auth/me', (req, res) => {
    const s = getSession(req);
    res.json(s ? { loggedIn: true, email: s.email, name: s.name } : { loggedIn: false });
  });
  const out = (req, res) => { setCookie(res, 'wf_session', '', 0); res.json({ ok: true }); };
  app.post('/api/auth/logout', out);
  app.get('/auth/logout', (req, res) => { setCookie(res, 'wf_session', '', 0); res.redirect('/landing.html'); });
};
