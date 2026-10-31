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
app.get('/', (req, res) => res.sendFile(path.join(site, 'landing.html')));
app.get('/app', (req, res) => res.sendFile(path.join(site, 'index.html')));
app.use(express.static(site, { index: false }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Winner Finder running on port ' + port));
