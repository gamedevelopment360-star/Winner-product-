// identify-ui.js: adds an "Identify product" button to every YouTube video card.
// It shows the product name as an AliExpress link (a list when the video has several products).
// Needs the server route /api/research/identify (identify.js).
(function () {
  var ID_RE = /(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{11})/;

  function link(text, href) {
    var a = document.createElement('a');
    a.textContent = text;
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    return a;
  }

  function copyText(t) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t);
    return new Promise(function (ok, no) {
      var ta = document.createElement('textarea');
      ta.value = t;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy') ? ok() : no(); } catch (e) { no(e); }
      document.body.removeChild(ta);
    });
  }

  // "Copy link" button: copies the direct product link (aliexpress.com/item/...) when we have it,
  // otherwise the AliExpress search link for the product.
  function copyBtn(href) {
    if (href.charAt(0) === '/') href = location.origin + href; // a site-relative link only works after adding the site address
    var b = document.createElement('button');
    b.className = 'chip idcp';
    b.type = 'button';
    b.textContent = 'Copy product link';
    b.style.marginLeft = '8px';
    b.onclick = function () {
      copyText(href).then(function () { b.textContent = 'Copied'; }).catch(function () { b.textContent = 'Copy failed'; });
      setTimeout(function () { b.textContent = 'Copy product link'; }, 2000);
    };
    return b;
  }

  function show(out, d) {
    out.className = 'meta';
    out.textContent = '';
    if (!d.product) {
      out.textContent = d.reason || 'No physical product found in this video.';
      return;
    }
    if (d.products && d.products.length > 1) {
      var h = document.createElement('div');
      h.className = 'idhead';
      h.textContent = d.products.length + ' products found';
      out.appendChild(h);
      d.products.forEach(function (p, i) {
        var row = document.createElement('div');
        row.className = 'idrow';
        var t = document.createElement('div');
        t.className = 'idrowname';
        t.appendChild(document.createTextNode((i + 1) + '. '));
        var pu = p.aliUrl || ('https://www.aliexpress.com/wholesale?SearchText=' + encodeURIComponent(p.product));
        t.appendChild(link(p.product + (p.brand ? ' (' + p.brand + ')' : ''), pu));
        t.appendChild(copyBtn(pu));
        row.appendChild(t);
        out.appendChild(row);
      });
      return;
    }
    var b = document.createElement('b');
    b.textContent = 'Product: ';
    out.appendChild(b);
    var u = d.aliUrl || ('https://www.aliexpress.com/wholesale?SearchText=' + encodeURIComponent(d.product));
    out.appendChild(link(d.product + (d.brand ? ' (' + d.brand + ')' : ''), u));
    out.appendChild(document.createTextNode(' · ' + (d.confidence || '') + ' confidence'));
    out.appendChild(copyBtn(u));
    if (d.reason) {
      out.appendChild(document.createElement('br'));
      out.appendChild(document.createTextNode(d.reason));
    }
  }

  function addButton(card, id) {
    var holder = card.querySelector('a[href*="youtu"]');
    holder = holder && holder.parentElement ? holder.parentElement : card;
    var btn = document.createElement('button');
    btn.className = 'btn idbtn';
    btn.type = 'button';
    btn.textContent = 'Identify product';
    var out = document.createElement('div');
    out.className = 'meta';
    btn.onclick = function () {
      btn.disabled = true;
      out.textContent = 'Looking…';
      fetch('/api/research/identify?id=' + encodeURIComponent(id), { credentials: 'same-origin' })
        .then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (d) {
          btn.disabled = false;
          if (d.error) { out.textContent = d.error; return; }
          show(out, d);
        })
        .catch(function (e) { btn.disabled = false; out.textContent = 'Could not check: ' + (e && e.message ? e.message : e); });
    };
    holder.appendChild(btn);
    holder.appendChild(out);
  }

  function scan() {
    var fresh = [];
    var cards = document.querySelectorAll('.card.item, .card, .vpcard');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (card.dataset.idDone) continue;
      var a = card.querySelector('a[href*="youtu"]');
      if (!a) continue;
      var m = ID_RE.exec(a.getAttribute('href') || '');
      if (!m) continue;
      card.dataset.idDone = '1';
      // skip cards that already have an Identify button
      var has = false, bs = card.querySelectorAll('button');
      for (var j = 0; j < bs.length; j++) if (/identify/i.test(bs[j].textContent)) has = true;
      if (!has) addButton(card, m[1]);
      if (!card.classList.contains('vpcard')) fresh.push({ card: card, id: m[1] });
    }
    if (fresh.length) fixProductLines(fresh.slice(0, 60));
  }

  // Replace the guessed "Product:" line (from title words) with a name the AI understood.
  // If the AI is not sure, the line is removed.
  function productLine(card) {
    var ms = card.querySelectorAll('.meta');
    for (var k = 0; k < ms.length; k++) if (/^\s*Product:/i.test(ms[k].textContent)) return ms[k];
    return null;
  }
  function fixProductLines(items) {
    for (var i = 0; i < items.length; i += 20) {
      (function (chunk) {
        chunk.forEach(function (x) { var l = productLine(x.card); if (l) l.style.display = 'none'; });
        fetch('/api/research/video-products?ids=' + chunk.map(function (x) { return x.id; }).join(','), { credentials: 'same-origin' })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            var map = (d && d.products) || {};
            chunk.forEach(function (x) {
              var l = productLine(x.card);
              if (!l) return;
              var name = map[x.id];
              if (!name) { l.remove(); return; }
              l.textContent = '';
              var b = document.createElement('b');
              b.textContent = 'Product: ';
              l.appendChild(b);
              l.appendChild(link(name, 'https://www.aliexpress.com/wholesale?SearchText=' + encodeURIComponent(name)));
              l.style.display = '';
            });
          })
          .catch(function () {
            chunk.forEach(function (x) { var l = productLine(x.card); if (l) l.style.display = ''; });
          });
      })(items.slice(i, i + 20));
    }
  }

  var timer = null;
  new MutationObserver(function () { clearTimeout(timer); timer = setTimeout(scan, 150); })
    .observe(document.body, { childList: true, subtree: true });
  scan();
})();
