// identify-ui.js: adds an "Identify product" button to every YouTube video card.
// It shows the product name as an AliExpress link (a list when the video has several products).
// Needs the server route /api/research/identify (identify.js).
(function () {
  var ID_RE = /(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{11})/;


  // ---- Styles (match the site colours; responsive for phone, tablet and desktop) ----
  // ---- Styles live in /identify-ui.css (same folder as index.html) ----
  (function () {
    if (document.getElementById('idui-style')) return;
    var l = document.createElement('link');
    l.id = 'idui-style';
    l.rel = 'stylesheet';
    l.href = '/identify-ui.css';
    document.head.appendChild(l);
  })();

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

  var COPY_ICON = [
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
    '<rect x="9" y="9" width="13" height="13" rx="2"/>',
    '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    '</svg>'
  ].join('');

  // "Copy product link" button: copies the product link (a full web address).
  function copyBtn(href) {
    if (href.charAt(0) === '/') href = location.origin + href; // a site-relative link only works after adding the site address
    var b = document.createElement('button');
    b.className = 'idcp';
    b.type = 'button';
    function reset() { b.className = 'idcp'; b.innerHTML = COPY_ICON + '<span>Copy product link</span>'; }
    reset();
    b.onclick = function () {
      copyText(href)
        .then(function () { b.className = 'idcp ok'; b.innerHTML = '<span>Copied \u2713</span>'; })
        .catch(function () { b.className = 'idcp bad'; b.innerHTML = '<span>Copy failed</span>'; });
      setTimeout(reset, 2000);
    };
    return b;
  }

  // ---- Loading box shown while the product is being identified ----
  function loading(out) {
    out.className = 'meta';
    out.textContent = '';
    var box = document.createElement('div');
    box.className = 'idload';
    box.setAttribute('role', 'status');
    var sp = document.createElement('span');
    sp.className = 'idspin';
    var tx = document.createElement('div');
    tx.innerHTML = 'Identifying the product\u2026<small>This can take up to 30 seconds. We will let you know when it is done.</small>';
    box.appendChild(sp);
    box.appendChild(tx);
    out.appendChild(box);
  }

  // ---- Notifications: an in-page message, a short vibration, and a phone notification when the tab is in the background ----
  function toast(title, text, warn, target) {
    var wrap = document.getElementById('idtoasts');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'idtoasts';
      wrap.setAttribute('aria-live', 'polite');
      document.body.appendChild(wrap);
    }
    var t = document.createElement('div');
    t.className = 'idtoast' + (warn ? ' warn' : '');
    t.setAttribute('role', 'status');
    var ic = document.createElement('span');
    ic.className = 'idti';
    ic.textContent = warn ? '!' : '\u2713';
    var c = document.createElement('div');
    c.className = 'idtc';
    var b = document.createElement('b');
    b.textContent = title;
    var x = document.createElement('span');
    x.className = 'idtx';
    x.textContent = text;
    c.appendChild(b);
    c.appendChild(x);
    t.appendChild(ic);
    t.appendChild(c);
    function close() { if (t.parentNode) t.parentNode.removeChild(t); }
    t.onclick = function () {
      if (target && target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      close();
    };
    wrap.appendChild(t);
    setTimeout(close, 6000);
  }

  function askPermission() {
    try {
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    } catch (e) {}
  }

  function systemNotify(title, body, tag) {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      var opts = { body: body, tag: tag };
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
        navigator.serviceWorker.getRegistration().then(function (reg) {
          if (reg && reg.showNotification) reg.showNotification(title, opts);
          else new Notification(title, opts);
        }).catch(function () {});
      } else {
        new Notification(title, opts);
      }
    } catch (e) {}
  }

  // ---- Notification bell (top right on every page, including the Dashboard) ----
  var LOG_KEY = 'wf_notifs';
  var BELL_ICON = [
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
    '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>',
    '<path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    '</svg>'
  ].join('');
  var bellBtn = null;

  function loadLog() {
    try { var a = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  function saveLog(a) { try { localStorage.setItem(LOG_KEY, JSON.stringify(a.slice(0, 30))); } catch (e) {} }

  function ago(ts) {
    var m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1) return 'Just now';
    if (m < 60) return m + ' min ago';
    var h = Math.floor(m / 60);
    if (h < 24) return h + ' hour' + (h > 1 ? 's' : '') + ' ago';
    var d = Math.floor(h / 24);
    return d + ' day' + (d > 1 ? 's' : '') + ' ago';
  }

  function refreshBadge() {
    if (!bellBtn) return;
    var n = loadLog().filter(function (x) { return !x.read; }).length;
    var old = bellBtn.querySelector('.idcount');
    if (old) old.remove();
    if (n > 0) {
      var c = document.createElement('span');
      c.className = 'idcount';
      c.textContent = n > 9 ? '9+' : String(n);
      bellBtn.appendChild(c);
    }
    bellBtn.setAttribute('aria-label', n > 0 ? 'Notifications, ' + n + ' new' : 'Notifications');
  }

  // ---- Notifications page (the bell opens it; it lives inside the app like the other pages) ----
  var PAGE_TITLES = { pVids: 'Saved videos', yt: 'YouTube Research', pSaved: 'Saved products' };

  function goPage(id, title) {
    if (typeof window.showPage === 'function') { window.showPage(id, title); return; }
    var pages = document.querySelectorAll('.page');
    for (var i = 0; i < pages.length; i++) pages[i].classList.toggle('on', pages[i].id === id);
    var t = document.getElementById('ttl');
    if (t) t.textContent = title;
    window.scrollTo(0, 0);
  }

  function pageOn() {
    var p = document.getElementById('pNotifs');
    return !!(p && p.classList.contains('on'));
  }

  function ensurePage() {
    var pg = document.getElementById('pNotifs');
    if (pg) return pg;
    var host = document.querySelector('main');
    if (!host) return null;
    pg = document.createElement('section');
    pg.className = 'page';
    pg.id = 'pNotifs';

    var back = document.createElement('button');
    back.type = 'button';
    back.className = 'backbtn';
    back.textContent = '\u2039 Dashboard';
    back.onclick = function () { goPage('dash', 'Dashboard'); };

    // "Go back" opens the Saved products page (same as tapping "Products saved" on the Dashboard)
    var goBack = document.createElement('button');
    goBack.type = 'button';
    goBack.className = 'backbtn';
    goBack.textContent = 'Go back';
    goBack.onclick = function () {
      var card = document.getElementById('cardSaved');
      if (card && card.click) card.click(); else goPage('pSaved', 'Saved products');
    };

    var navRow = document.createElement('div');
    navRow.style.display = 'flex';
    navRow.style.flexWrap = 'wrap';
    navRow.style.gap = '10px';
    navRow.appendChild(back);
    navRow.appendChild(goBack);

    var h = document.createElement('h2');
    h.textContent = 'Notifications';

    var bar = document.createElement('div');
    bar.className = 'idnbar';
    var sub = document.createElement('p');
    sub.className = 'dsub';
    sub.textContent = 'Results from Identify product.';
    var clear = document.createElement('button');
    clear.type = 'button';
    clear.id = 'idclear';
    clear.className = 'idclear';
    clear.textContent = 'Clear all';
    clear.onclick = function () { saveLog([]); renderPage(); refreshBadge(); };
    bar.appendChild(sub);
    bar.appendChild(clear);

    var list = document.createElement('div');
    list.id = 'idnlist';
    list.className = 'idnlist';

    pg.appendChild(navRow);
    pg.appendChild(h);
    pg.appendChild(bar);
    pg.appendChild(list);
    host.appendChild(pg);
    return pg;
  }

  // Jump to the video a notification is about (switching to the page that shows it).
  function openVideo(vid) {
    var a = vid ? document.querySelector('a[href*="' + vid + '"]') : null;
    if (!a) return;
    var sec = a.closest ? a.closest('.page') : null;
    if (sec && sec.id !== 'pNotifs') {
      var tt = document.getElementById('ttl');
      goPage(sec.id, PAGE_TITLES[sec.id] || (tt ? tt.textContent : ''));
    }
    var card = (a.closest && a.closest('.card')) || a.parentElement;
    setTimeout(function () {
      if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  }

  function renderPage() {
    var pg = ensurePage();
    if (!pg) return;
    var list = document.getElementById('idnlist');
    var clear = document.getElementById('idclear');
    var log = loadLog();
    list.textContent = '';
    clear.style.display = log.length ? '' : 'none';
    if (!log.length) {
      var e = document.createElement('div');
      e.className = 'idempty';
      e.textContent = 'No notifications yet. You will see your Identify product results here.';
      list.appendChild(e);
    }
    log.forEach(function (n) {
      var it = document.createElement('div');
      it.className = 'idni' + (n.ok ? '' : ' warn') + (n.read ? '' : ' unread');
      var ic = document.createElement('span');
      ic.className = 'idti';
      ic.textContent = n.ok ? '\u2713' : '!';
      var body = document.createElement('div');
      body.className = 'idnb';
      var b = document.createElement('b');
      b.textContent = n.title;
      var x = document.createElement('span');
      x.className = 'idtx';
      x.textContent = n.text;
      var tm = document.createElement('span');
      tm.className = 'idtm';
      tm.textContent = ago(n.ts);
      body.appendChild(b);
      body.appendChild(x);
      body.appendChild(tm);
      it.appendChild(ic);
      it.appendChild(body);
      if (!n.read) {
        var dot = document.createElement('span');
        dot.className = 'iddot';
        it.appendChild(dot);
      }
      it.onclick = function () { openVideo(n.vid); };
      list.appendChild(it);
    });
    // being on this page counts as having seen everything
    if (pageOn()) {
      log.forEach(function (n) { n.read = true; });
      saveLog(log);
      refreshBadge();
    }
  }

  function openPage() {
    if (!ensurePage()) return;
    goPage('pNotifs', 'Notifications');
    renderPage();
  }

  function addToLog(title, text, ok, vid) {
    var log = loadLog();
    log.unshift({ title: title, text: text, ok: !!ok, vid: vid || '', ts: Date.now(), read: false });
    saveLog(log);
    refreshBadge();
    if (bellBtn) {
      bellBtn.classList.remove('ring');
      void bellBtn.offsetWidth;
      bellBtn.classList.add('ring');
    }
    if (pageOn()) renderPage();
  }

  function makeBell() {
    if (document.getElementById('idbell') || !document.body) return;
    bellBtn = document.createElement('button');
    bellBtn.id = 'idbell';
    bellBtn.type = 'button';
    bellBtn.setAttribute('aria-label', 'Notifications');
    bellBtn.innerHTML = BELL_ICON;
    bellBtn.onclick = openPage;
    document.body.appendChild(bellBtn);
    refreshBadge();
  }
  if (document.body) makeBell(); else document.addEventListener('DOMContentLoaded', makeBell);

  function announce(card, id, d, failed) {
    var vt = card.querySelector('a[href*="youtu"]');
    var video = vt && vt.textContent ? vt.textContent.trim() : 'your video';
    var ok = !failed && d && d.product;
    var title = ok ? 'Product found' : (failed ? 'Could not identify' : 'No product found');
    var text = ok ? d.product : video;
    toast(title, text, !ok, card);
    addToLog(title, text, ok, id);
    try { if (navigator.vibrate) navigator.vibrate(ok ? [120] : [80, 60, 80]); } catch (e) {}
    if (document.hidden) systemNotify(title, text, 'identify-' + id);
  }

  // Lets the browser show phone notifications (needs the small file sw.js in the same folder as index.html).
  try { if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(function () {}); } catch (e) {}

  // Friendly message box for "no product" and error cases (also explains the RapidAPI limit in plain words).
  function notice(out, msg) {
    out.className = 'meta';
    out.textContent = '';
    var box = document.createElement('div');
    box.className = 'idwarn';
    var t = document.createElement('b');
    var m = String(msg || '');
    if (/429|quota|exceeded/i.test(m)) {
      t.textContent = 'AliExpress lookup limit reached';
      box.appendChild(t);
      box.appendChild(document.createTextNode(
        'The monthly search limit on your RapidAPI plan has been used up, ' +
        'so products cannot be matched on AliExpress right now. ' +
        'It starts working again when the limit resets, or after you upgrade the plan.'
      ));
      var sm = document.createElement('small');
      sm.textContent = m.length > 160 ? m.slice(0, 160) + '\u2026' : m;
      box.appendChild(sm);
    } else {
      t.textContent = 'No product to show';
      box.appendChild(t);
      box.appendChild(document.createTextNode(m || 'No physical product found in this video.'));
    }
    out.appendChild(box);
  }

  function show(out, d) {
    out.className = 'meta';
    out.textContent = '';
    if (!d.product) {
      notice(out, d.reason);
      return;
    }
    var box = document.createElement('div');
    box.className = 'idcard';
    out.appendChild(box);

    if (d.products && d.products.length > 1) {
      var h = document.createElement('div');
      h.className = 'idhead';
      h.textContent = d.products.length + ' products found';
      box.appendChild(h);
      var list = document.createElement('div');
      list.className = 'idlist';
      box.appendChild(list);
      d.products.forEach(function (p, i) {
        var row = document.createElement('div');
        row.className = 'idrow';
        var t = document.createElement('div');
        t.className = 'idrowname';
        var n = document.createElement('span');
        n.className = 'idnum';
        n.textContent = String(i + 1);
        t.appendChild(n);
        var pu = p.aliUrl || ('https://www.aliexpress.com/wholesale?SearchText=' + encodeURIComponent(p.product));
        t.appendChild(link(p.product + (p.brand ? ' (' + p.brand + ')' : ''), pu));
        row.appendChild(t);
        row.appendChild(copyBtn(pu));
        list.appendChild(row);
      });
      return;
    }

    var top = document.createElement('div');
    top.className = 'idtop';
    var lab = document.createElement('span');
    lab.className = 'idlabel';
    lab.textContent = 'Product found';
    top.appendChild(lab);
    if (d.confidence) {
      var c = String(d.confidence).toLowerCase();
      var badge = document.createElement('span');
      badge.className = 'idbadge ' + (c === 'high' || c === 'medium' || c === 'low' ? c : 'medium');
      badge.textContent = d.confidence + ' confidence';
      top.appendChild(badge);
    }
    box.appendChild(top);

    var u = d.aliUrl || ('https://www.aliexpress.com/wholesale?SearchText=' + encodeURIComponent(d.product));
    var a = link(d.product + (d.brand ? ' (' + d.brand + ')' : ''), u);
    a.className = 'idname';
    box.appendChild(a);

    if (d.reason) {
      var r = document.createElement('p');
      r.className = 'idreason';
      r.textContent = d.reason;
      box.appendChild(r);
    }
    var act = document.createElement('div');
    act.className = 'idactions';
    act.appendChild(copyBtn(u));
    box.appendChild(act);
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
      askPermission();
      btn.disabled = true;
      btn.classList.add('busy');
      btn.textContent = 'Identifying\u2026';
      loading(out);
      function finish() { btn.disabled = false; btn.classList.remove('busy'); btn.textContent = 'Identify product'; }
      fetch('/api/research/identify?id=' + encodeURIComponent(id), { credentials: 'same-origin' })
        .then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (d) {
          finish();
          if (d.error) { notice(out, d.error); announce(card, id, d, true); return; }
          show(out, d);
          announce(card, id, d, false);
        })
        .catch(function (e) {
          finish();
          notice(out, 'Could not check: ' + (e && e.message ? e.message : e));
          announce(card, id, null, true);
        });
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

  // Adds the Identify button to video cards as they appear (they are drawn again every time a list loads).
  function schedule() {
    if (timer) return;
    timer = setTimeout(function () { timer = null; scan(); }, 200);
  }
  if (window.MutationObserver) {
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  }
  document.addEventListener('DOMContentLoaded', scan);
  window.addEventListener('load', scan);
  setInterval(scan, 1500); // safety net
  scan();
})();
