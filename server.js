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

require('./research')(app);
app.use(express.static(path.join(__dirname, 'Public')));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Winner Finder running on port ' + port));
