// copy-all-links.js — adds a "Copy products link" button to any page of your site.
// It reads your saved products from /api/saved and copies one supplier link per line,
// ready to paste into AutoDS. Nothing else on the page is changed.
//
// Use: put this file in your public folder, then add this line before </body>
// on the page where you want the button (for example the Dashboard page):
//   <script src="/copy-all-links.js"></script>
(function () {
  function productUrl(p) {
    var id = String(p.pid || '');
    return id.indexOf('ali_') === 0
      ? 'https://www.aliexpress.com/item/' + id.slice(4) + '.html'
      : 'https://cjdropshipping.com/product/p-' + id + '.html';
  }

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Copy products link';
  btn.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:9999;padding:13px 16px;' +
    'border:0;border-radius:10px;background:#2ecc71;color:#000;font:700 15px system-ui,sans-serif;' +
    'box-shadow:0 2px 10px rgba(0,0,0,.35);cursor:pointer';

  function say(text) {
    btn.textContent = text;
    setTimeout(function () { btn.textContent = 'Copy products link'; btn.disabled = false; }, 2500);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {      // fallback for older browsers
      var t = document.createElement('textarea');
      t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      try { document.execCommand('copy') ? resolve() : reject(); } catch (e) { reject(e); }
      document.body.removeChild(t);
    });
  }

  btn.addEventListener('click', function () {
    btn.disabled = true;
    btn.textContent = 'Getting links...';
    fetch('/api/saved?limit=500')
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok) { say(x.j.error || 'Could not load products'); return; }
        var links = (x.j.results || []).map(productUrl);
        if (!links.length) { say('No saved products yet'); return; }
        return copyText(links.join('\n')).then(function () { say('Copied ' + links.length + ' links'); });
      })
      .catch(function () { say('Copy failed. Try again'); });
  });

  document.body.appendChild(btn);
})();
