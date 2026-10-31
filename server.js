// Winner Finder: a separate small website. Not connected to the Shopify app.
// Set these in Render (Environment): CJ_API_KEY and SITE_PASSWORD.
const express = require('express');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.disable('x-powered-by');

const password = process.env.SITE_PASSWORD;
if (!password) {
  console.warn('SITE_PASSWORD is not set. The site is OPEN to anyone who has the link.');
} else {
  // Simple password gate (browser pops up a login box). Username can be anything.
  app.use((req, res, next) => {
    const h = req.headers.authorization || '';
    const given = Buffer.from(h.startsWith('Basic ') ? h.slice(6) : '', 'base64').toString();
    const pass = given.includes(':') ? given.slice(given.indexOf(':') + 1) : '';
    const a = Buffer.from(pass), b = Buffer.from(password);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return next();
    res.set('WWW-Authenticate', 'Basic realm="Winner Finder"');
    res.status(401).send('Password needed.');
  });
}

require('./googleauth')(app);
require('./research')(app);
// Find the website folder whatever its spelling on GitHub (public, Public or Pubic).
const fs = require('fs');
const dirs = ['public', 'Public', 'Pubic'].map((d) => path.join(__dirname, d));
const site = dirs.find((d) => fs.existsSync(path.join(d, 'landing.html'))) || dirs.find((d) => fs.existsSync(d)) || dirs[0];
console.log('Serving website files from ' + site);
// The first page people see is the landing page. The dashboard lives at /app.
const page = (f) => (req, res) =>
  res.sendFile(path.join(site, f), { headers: { 'Cache-Control': 'no-cache' } }, (e) => {
    if (e) { console.error('Could not send ' + f + ': ' + e.message); if (!res.headersSent) res.status(500).send('Page not found: ' + f); }
  });
app.get('/', page('landing.html'));
app.get('/app', page('index.html'));
// Temporary check: shows which website files the server can see. Safe to delete later.
app.get('/debug', (req, res) => {
  try {
    const files = fs.readdirSync(site).map((f) => ({ name: f, bytes: fs.statSync(path.join(site, f)).size }));
    res.json({ site, files, foldersFound: dirs.filter((d) => fs.existsSync(d)) });
  } catch (e) { res.status(500).json({ error: e.message, site }); }
});
app.use(express.static(site, { index: false }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Winner Finder running on port ' + port));
