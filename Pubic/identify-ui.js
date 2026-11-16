// identify-ui.js: adds an "Identify product" button to every YouTube video card.
// It shows the product name as an AliExpress link (a list when the video has several products).
// Needs the server route /api/research/identify (identify.js).
(function () {

  // ---- Design: professional responsive styles, injected from this file so the design works even if index.html is older ----
  (function () {
    if (document.getElementById('wf-design')) return;
    var st = document.createElement('style');
    st.id = 'wf-design';
    st.textContent = `
/* ===== Professional design layer: tokens, typography, components, responsive breakpoints ===== */
:root{--panel-2:#1d212b;--line-2:#343b49;--radius:14px;--shadow:0 8px 24px rgba(0,0,0,.28);--ring:0 0 0 3px rgba(46,204,113,.35);--ease:cubic-bezier(.2,.7,.2,1)}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:clamp(14.5px,.3vw + 13.6px,16px);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
h2{font-size:clamp(20px,1.1vw + 16px,28px);letter-spacing:-.015em;line-height:1.2}
:where(button,a,input,[role=button]):focus-visible{outline:none;box-shadow:var(--ring)}
input{min-height:44px;transition:border-color .15s,box-shadow .15s}
input:focus{outline:none;border-color:var(--accent);box-shadow:var(--ring)}
.btn{min-height:44px;transition:filter .15s,transform .1s,box-shadow .15s;box-shadow:0 2px 10px rgba(46,204,113,.22)}
.btn.alt{box-shadow:none}
.btn:active{transform:translateY(1px)}
.btn:disabled{box-shadow:none}
.backbtn,.chip{min-height:40px;transition:border-color .15s,background .15s}
.card{border-radius:var(--radius)}
nav{box-shadow:1px 0 0 rgba(255,255,255,.02)}
nav button{transition:background .15s,color .15s;position:relative}
nav button.on{box-shadow:inset 3px 0 0 var(--accent)}
.top{background:rgba(15,17,21,.88);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
main{width:100%}

/* video cards: thumbnail + title on top, Identify button and result on their own full-width row */
.page .item{align-items:flex-start;align-content:flex-start;box-shadow:0 1px 0 rgba(255,255,255,.03) inset}
#dTop,#dVid,#yOut{align-items:start}
/* Identify result: clean product rows, small copy button, no stretched boxes */
.item .idcard{padding:14px;background:#12161d;border-radius:14px}
.item .idhead{margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--mute)}
.item .idlist{display:flex;flex-direction:column;gap:8px}
.item .idrow{display:flex;flex-direction:row;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 10px;padding:10px 12px;background:#171b23;border:1px solid var(--line);border-radius:12px}
.item .idrowname{flex:1 1 130px;min-width:0;display:flex;align-items:center;gap:10px;font-size:15px;font-weight:600;line-height:1.35}
.item .idrowname a{text-decoration:none;overflow-wrap:anywhere}
.item .idrowname a:hover{text-decoration:underline}
.item .idnum{flex:none}
.item .idrow .idcp{flex:0 0 auto;width:auto;margin:0 0 0 auto;min-height:40px;padding:8px 14px;font-size:13px}
.item .idname{text-decoration:none}
.item .idname:hover{text-decoration:underline}
body .item .idrow{padding:10px 12px!important}
body .item .idrowname a,body .item .idname{text-decoration:none!important}
body .item .idrowname a:hover,body .item .idname:hover{text-decoration:underline!important}
@media(max-width:479px){
 .item .idrow{flex-wrap:nowrap}
 .item .idrow .idcp{min-width:44px;padding:8px 12px}
 .item .idrow .idcp span{display:none}
 .item .idrow .idcp.ok span,.item .idrow .idcp.bad span{display:inline}
}
.page .item>div{line-height:1.4}
.item>.meta{margin-top:0}
.item>.meta .idcard{margin-top:2px}
.page .item .idbtn{width:100%;min-height:46px;margin-top:2px}
.item>div>.meta{min-width:0}

/* lists of videos: one column on phones, grid on larger screens */
#yOut{display:grid;grid-template-columns:1fr;gap:12px}
#yOut .item{margin-bottom:0}
#yOut>p,#yOut>.ldbox,#yOut>.msg{grid-column:1/-1}
#yOut>p.msg{margin:0;padding:2px 0 4px;font-size:13px}

@media(hover:hover){
 .btn:hover{filter:brightness(1.07)}
 .btn.alt:hover{filter:none;border-color:var(--line-2)}
 nav button:hover{background:#232834;color:var(--text)}
 .page .item:hover{transform:translateY(-1px);box-shadow:var(--shadow)}
}
@media(pointer:coarse){
 nav button{min-height:46px}
 .chip,.backbtn{min-height:44px}
}

/* very small phones */
@media(max-width:360px){
 main{padding:12px}
 .page .item{--t:64px;padding:10px;gap:8px}
 .page .item img{width:64px;height:64px}
 .btn{font-size:13px;padding:10px 12px}
 #dash .stat b{font-size:24px}
 h2{font-size:19px}
}
/* phones */
@media(max-width:759px){
 .row{gap:8px}
 .row .btn{flex:1 1 auto}
 #pickbar{padding-left:12px;padding-right:12px}
}
/* large phones and small tablets (portrait) */
@media(min-width:600px) and (max-width:759px){
 main{padding:18px 22px}
 #dTop,#dVid,#yOut{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
}
/* tablets and small laptops: sidebar is always visible, cards in two columns */
@media(min-width:760px){
 main{padding:24px 28px}
 #dTop,#dVid,#yOut{grid-template-columns:1fr;gap:14px}
 .page .item img{width:104px;height:104px}
 body #idtoasts{left:auto;right:20px;bottom:20px;align-items:flex-end;padding:0}
}
/* small laptops and landscape tablets: two columns once the content area is wide enough */
@media(min-width:900px) and (max-width:1359px){
 #dTop,#dVid,#yOut{grid-template-columns:repeat(2,1fr)}
}
/* desktops: three columns, content centred */
@media(min-width:1360px){
 main{max-width:1320px;margin-inline:auto;padding:32px 40px}
 #dTop,#dVid,#yOut{grid-template-columns:repeat(3,1fr);gap:16px}
 .page .item img{width:96px;height:96px}
}
/* phones turned sideways: keep the menu scrollable */
@media(max-height:480px) and (orientation:landscape){
 nav{overflow-y:auto}
 .ldbox{padding:14px 10px}
}
@media(prefers-reduced-motion:reduce){
 .btn,.page .item,nav button,input{transition:none}
 .page .item:hover{transform:none}
}
@media print{nav,.top,#pickbar,.idbtn,#idbell,#idtoasts{display:none!important}main{max-width:none;padding:0}}

/* compact notices: smaller pop-up bar, short warning box, technical text folded under "Details" */
.item>.meta{border:0;background:none;box-shadow:none;border-radius:0;padding:0}
body #idtoasts{padding:0 10px}
body .idtoast{width:auto;max-width:min(380px,calc(100vw - 20px));padding:8px 12px;gap:10px;border-radius:12px}
body .idtoast .idti{width:26px;height:26px;min-width:26px;font-size:14px}
body .idtoast b{font-size:13px;line-height:1.3}
body .idtoast span.idtx{font-size:12px}
.idwarn{padding:10px 12px;font-size:13px}
.idwarn b{margin-bottom:2px}
.iddet{margin-top:6px}
.iddet summary{cursor:pointer;color:var(--mute);font-size:12px;list-style-position:inside}
.iddet small{display:block;margin-top:4px;max-height:7em;overflow:auto}

/* Cost (from AliExpress) and Sell (price chosen by Gemini) */
.idprice{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:10px}
.idpc{padding:6px 10px;border-radius:10px;background:var(--panel-2,#1d212b);border:1px solid var(--line-2,#343b49);color:var(--mute);font-size:13px;line-height:1.3}
.idpc b{color:var(--text);font-weight:700}
.idpc.sell{background:rgba(46,204,113,.1);border-color:rgba(46,204,113,.4);color:var(--accent)}
.idpc.sell b{color:var(--accent)}
.idpnote{margin:6px 0 0;font-size:12px;color:var(--mute)}
.idrowinfo{min-width:0;flex:1 1 auto}
.idrowprice{display:block;margin-top:2px;font-size:12px;font-weight:500;color:var(--mute)}
`;
    (document.head || document.documentElement).appendChild(st);
  })();
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
    b.setAttribute('aria-label', 'Copy product link');
    b.title = 'Copy product link';
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

    // The only back button: "Go back" opens the Saved videos page (same as tapping "Videos saved" on the Dashboard)
    var goBack = document.createElement('button');
    goBack.type = 'button';
    goBack.className = 'backbtn';
    goBack.textContent = 'Go back';
    goBack.onclick = function () {
      var card = document.getElementById('cardVids');
      if (card && card.click) card.click(); else goPage('pVids', 'Saved videos');
    };

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

    pg.appendChild(goBack);
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
    var msg = d && (d.error || d.reason) ? String(d.error || d.reason) : '';
    var limit = !ok && /429|quota|exceeded/i.test(msg);
    var title = ok ? 'Product found' : (limit ? 'Lookup limit reached' : (failed ? 'Could not identify' : 'No product found'));
    var text = ok ? d.product : (limit ? 'Try again when the limit resets' : video);
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
    var shown, detail = '';
    if (/429|quota|exceeded/i.test(m)) {
      t.textContent = 'AliExpress lookup limit reached';
      shown = 'The monthly RapidAPI limit is used up. It works again when the limit resets or after you upgrade the plan.';
      detail = m;
    } else {
      t.textContent = 'No product to show';
      shown = m || 'No physical product found in this video.';
      if (shown.length > 140) { detail = shown; shown = shown.slice(0, 140).replace(/\s+\S*$/, '') + '\u2026'; }
    }
    box.appendChild(t);
    box.appendChild(document.createTextNode(shown));
    if (detail) {
      var dt = document.createElement('details');
      dt.className = 'iddet';
      var sum = document.createElement('summary');
      sum.textContent = 'Details';
      var sm = document.createElement('small');
      sm.textContent = detail.length > 400 ? detail.slice(0, 400) + '\u2026' : detail;
      dt.appendChild(sum);
      dt.appendChild(sm);
      box.appendChild(dt);
    }
    out.appendChild(box);
  }

  function money(n) { return '$' + Number(n).toFixed(2); }

  // Cost = the AliExpress price. Sell = the price Gemini chose (sent by the server).
  function priceChips(cost, sell) {
    if (!(Number(cost) > 0)) return null;
    var wrap = document.createElement('div');
    wrap.className = 'idprice';
    var c = document.createElement('span');
    c.className = 'idpc';
    c.appendChild(document.createTextNode('Cost '));
    var cb = document.createElement('b');
    cb.textContent = money(cost);
    c.appendChild(cb);
    wrap.appendChild(c);
    if (Number(sell) > 0) {
      var sp = document.createElement('span');
      sp.className = 'idpc sell';
      sp.appendChild(document.createTextNode('Sell ~'));
      var sb = document.createElement('b');
      sb.textContent = money(sell);
      sp.appendChild(sb);
      wrap.appendChild(sp);
    }
    return wrap;
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
        var info = document.createElement('div');
        info.className = 'idrowinfo';
        info.appendChild(link(p.product + (p.brand ? ' (' + p.brand + ')' : ''), pu));
        if (Number(p.cost) > 0) {
          var rp = document.createElement('span');
          rp.className = 'idrowprice';
          rp.textContent = 'Cost ' + money(p.cost) + (Number(p.sell) > 0 ? ' \u00b7 Sell ~' + money(p.sell) : '');
          info.appendChild(rp);
        }
        t.appendChild(info);
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
    var chips = priceChips(d.cost, d.sell);
    if (chips) box.appendChild(chips);
    if (chips && d.priceNote) {
      var pn = document.createElement('p');
      pn.className = 'idpnote';
      pn.textContent = 'Price chosen by Gemini: ' + d.priceNote;
      box.appendChild(pn);
    }

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
    // The button and the result sit on their own full-width row under the thumbnail and the title.
    var holder = card;
    holder.style.flexWrap = 'wrap';
    var btn = document.createElement('button');
    btn.className = 'btn idbtn';
    btn.type = 'button';
    btn.textContent = 'Identify product';
    btn.style.flex = '0 0 100%';
    var out = document.createElement('div');
    out.className = 'meta';
    out.style.flex = '0 0 100%';
    out.style.minWidth = '0';
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
