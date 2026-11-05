// identify-ui.js: adds an "Identify product" button to every YouTube video card.
// It shows the product name plus AliExpress and Amazon search links.
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

  function show(out, d) {
    out.className = 'meta';
    out.textContent = '';
    if (!d.product) {
      out.textContent = d.reason || 'No physical product found in this video.';
      return;
    }
    var b = document.createElement('b');
    b.textContent = 'Product: ';
    out.appendChild(b);
    out.appendChild(document.createTextNode(d.product + (d.brand ? ' (' + d.brand + ')' : '') + ' · ' + (d.confidence || '') + ' confidence '));
    var q = encodeURIComponent(((d.brand || '') + ' ' + d.product).trim());
    out.appendChild(document.createElement('br'));
    out.appendChild(link('Find on AliExpress', d.aliUrl || ('https://www.aliexpress.com/wholesale?SearchText=' + encodeURIComponent(d.product))));
    out.appendChild(document.createTextNode(' · '));
    out.appendChild(link('Find on Amazon', d.amazonUrl || ('https://www.amazon.com/s?k=' + q)));
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
    var cards = document.querySelectorAll('.card.item, .card');
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
    }
  }

  var timer = null;
  new MutationObserver(function () { clearTimeout(timer); timer = setTimeout(scan, 150); })
    .observe(document.body, { childList: true, subtree: true });
  scan();
})();
