// winning-ui.js: adds a "Winning analysis" button to every product card (Winning Products, Saved products, Suppliers).
// Tap it to see: supplier price and link, selling price, profit calculator, demand score, competition,
// trending status, ad examples and an AI store description.
// Needs the server route /api/research/winning (winning.js).
(function () {
  var API = '/api/research/winning';

  // ---------- styles ----------
  (function () {
    if (document.getElementById('wp-style')) return;
    var st = document.createElement('style');
    st.id = 'wp-style';
    st.textContent = [
      '.page .item .wpbtn{flex:0 0 100%;width:100%;min-height:44px;margin-top:2px}',
      '.wp-out{flex:0 0 100%;min-width:0}',
      '.wp-load{display:flex;align-items:center;gap:10px;padding:12px 2px;color:var(--mute);font-size:14px}',
      '.wp-spin{flex:none;width:18px;height:18px;border-radius:50%;border:2px solid var(--line-2);border-top-color:var(--accent);animation:wpspin .8s linear infinite}',
      '@keyframes wpspin{to{transform:rotate(360deg)}}',
      '.wp-err{padding:10px 12px;border-radius:12px;border:1px solid rgba(255,92,92,.45);background:rgba(255,92,92,.08);font-size:13px}',
      '.wp-box{background:#12161d;border:1px solid var(--line);border-radius:12px;padding:12px;margin-top:10px;min-width:0}',
      '.wp-box h4{margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--mute)}',
      '.wp-verdict{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
      '.wp-score{font-size:28px;font-weight:800;line-height:1}',
      '.wp-score small{font-size:12px;font-weight:600;color:var(--mute)}',
      '.wp-pill{display:inline-block;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;border:1px solid var(--line-2);color:var(--mute)}',
      '.wp-pill.good{background:rgba(46,204,113,.12);border-color:rgba(46,204,113,.45);color:#2ecc71}',
      '.wp-pill.mid{background:rgba(241,196,15,.12);border-color:rgba(241,196,15,.45);color:#f1c40f}',
      '.wp-pill.bad{background:rgba(255,92,92,.12);border-color:rgba(255,92,92,.45);color:#ff5c5c}',
      '.wp-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:10px}',
      '.wp-stat{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px;min-width:0}',
      '.wp-stat span{display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--mute);margin-bottom:3px}',
      '.wp-stat b{display:block;font-size:17px;line-height:1.2;overflow-wrap:anywhere}',
      '.wp-stat small{display:block;margin-top:4px;font-size:12px;color:var(--mute);line-height:1.35}',
      '.wp-bar{height:6px;border-radius:6px;background:#0b0e13;margin-top:6px;overflow:hidden}',
      '.wp-bar i{display:block;height:100%;background:var(--accent);border-radius:6px}',
      '.wp-calc{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}',
      '.wp-calc label{margin:0;font-size:12px}',
      '.wp-calc input{width:100%;min-width:0;margin-top:4px}',
      '.wp-res{margin-top:10px;padding:10px 12px;border-radius:10px;background:var(--panel);border:1px solid var(--line)}',
      '.wp-res .big{font-size:20px;font-weight:800}',
      '.wp-res .big.pos{color:#2ecc71}.wp-res .big.neg{color:#ff5c5c}',
      '.wp-res p{margin:4px 0 0;font-size:12px;color:var(--mute)}',
      '.wp-links{display:flex;gap:8px;flex-wrap:wrap}',
      '.wp-links a,.wp-links button{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:8px 12px;border-radius:10px;border:1px solid var(--line-2);background:var(--panel-2);color:var(--text);font-size:13px;font-weight:600;text-decoration:none;cursor:pointer}',
      '.wp-links a.main{background:var(--accent);border-color:var(--accent);color:#06210f}',
      '.wp-vids{display:grid;grid-template-columns:1fr;gap:8px;margin-top:10px}',
      '.wp-vid{display:flex;gap:10px;text-decoration:none;color:var(--text)!important;font-weight:400!important;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:6px;min-width:0}',
      '.wp-vid img{flex:0 0 88px;width:88px;height:50px;object-fit:cover;border-radius:6px;background:#0b0e13}',
      '.wp-vid div{min-width:0;font-size:12px;line-height:1.35}',
      '.wp-vid b{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-weight:600}',
      '.wp-vid small{color:var(--mute)}',
      '.wp-desc h5{margin:0 0 6px;font-size:15px}',
      '.wp-desc p{margin:0 0 8px;font-size:14px;line-height:1.5}',
      '.wp-desc ul{margin:0 0 10px;padding-left:18px;font-size:14px;line-height:1.5}',
      '.wp-note{margin:8px 0 0;font-size:12px;color:var(--mute);line-height:1.4}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(st);
  })();

  // ---------- helpers ----------
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function money(n) { n = Number(n) || 0; return (n < 0 ? '-' : '') + '$' + Math.abs(n).toFixed(2); }
  function short(n) {
    n = Number(n) || 0;
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return Math.round(n / 1e3) + 'K';
    return String(n);
  }
  function safeUrl(u) { return /^https?:\/\//i.test(String(u || '')) ? String(u) : ''; }
  function anchor(text, href, cls) {
    var a = el('a', cls || '', text);
    a.href = safeUrl(href) || '#';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }
  function copy(t) {
    if (typeof copyText === 'function') return copyText(t); // the page's own helper
    return navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject();
  }
  function copyButton(label, getText) {
    var b = el('button', '', label);
    b.type = 'button';
    b.onclick = function () {
      copy(getText()).then(function () { b.textContent = 'Copied ✓'; }, function () { b.textContent = 'Copy failed'; });
      setTimeout(function () { b.textContent = label; }, 2000);
    };
    return b;
  }
  function box(title) {
    var b = el('div', 'wp-box');
    if (title) b.appendChild(el('h4', '', title));
    return b;
  }
  function stat(label, value, sub, bar) {
    var s = el('div', 'wp-stat');
    s.appendChild(el('span', '', label));
    s.appendChild(el('b', '', value));
    if (bar != null) { var w = el('div', 'wp-bar'); var i = el('i'); i.style.width = Math.max(0, Math.min(100, bar)) + '%'; w.appendChild(i); s.appendChild(w); }
    if (sub) s.appendChild(el('small', '', sub));
    return s;
  }

  // ---------- profit calculator (live: the seller can change every number) ----------
  function calculator(d) {
    var c = box('Profit calculator');
    var dflt = d.defaults || {};
    var sell0 = d.sell || 0, cost0 = (d.supplier && d.supplier.cost) || 0;
    var fields = [
      ['Selling price ($)', 'sell', sell0],
      ['Supplier price ($)', 'cost', cost0],
      ['Shipping ($)', 'ship', dflt.shipping != null ? dflt.shipping : 4],
      ['Ads per sale ($)', 'ads', d.profit ? d.profit.ads : (sell0 * (dflt.adsPct || 20) / 100)],
      ['Fees (%)', 'fee', dflt.feePct != null ? dflt.feePct : 2.9]
    ];
    var grid = el('div', 'wp-calc');
    var inp = {};
    fields.forEach(function (f) {
      var l = el('label', '', f[0]);
      var i = document.createElement('input');
      i.type = 'number'; i.step = '0.01'; i.min = '0'; i.setAttribute('inputmode', 'decimal');
      i.value = Number(f[2]) ? String(Math.round(f[2] * 100) / 100) : '';
      l.appendChild(i); grid.appendChild(l);
      inp[f[1]] = i;
    });
    c.appendChild(grid);
    var res = el('div', 'wp-res');
    var big = el('div', 'big'), l1 = el('p'), l2 = el('p');
    res.appendChild(big); res.appendChild(l1); res.appendChild(l2);
    c.appendChild(res);
    var fixed = dflt.feeFixed != null ? dflt.feeFixed : 0.3;
    function upd() {
      var s = parseFloat(inp.sell.value) || 0, co = parseFloat(inp.cost.value) || 0, sh = parseFloat(inp.ship.value) || 0;
      var ad = parseFloat(inp.ads.value) || 0, fp = parseFloat(inp.fee.value) || 0;
      var fees = s > 0 ? s * fp / 100 + fixed : 0;
      var p = s - co - sh - ad - fees;
      var spend = co + sh + ad;
      big.textContent = money(p) + ' profit per sale';
      big.className = 'big ' + (p >= 0 ? 'pos' : 'neg');
      l1.textContent = 'Margin ' + (s > 0 ? (p / s * 100).toFixed(1) : '0.0') + '%  ·  Return on spend ' + (spend > 0 ? (p / spend * 100).toFixed(0) : '0') + '%';
      l2.textContent = 'Fees ' + money(fees) + '  ·  Break-even ad cost ' + money(Math.max(0, s - co - sh - fees)) + '  ·  10 sales = ' + money(p * 10);
    }
    Object.keys(inp).forEach(function (k) { inp[k].addEventListener('input', upd); });
    upd();
    c.appendChild(el('p', 'wp-note', 'Shipping and ads per sale are rough defaults. Change them to your own numbers.'));
    return c;
  }

  // ---------- result ----------
  function render(out, d) {
    out.textContent = '';

    var head = box();
    if (d.score != null) {
      var v = el('div', 'wp-verdict');
      var sc = el('div', 'wp-score', String(d.score));
      sc.appendChild(el('small', '', ' / 100'));
      v.appendChild(sc);
      v.appendChild(el('span', 'wp-pill ' + (d.verdict === 'Winning' ? 'good' : d.verdict === 'Worth testing' ? 'mid' : 'bad'), d.verdict));
      head.appendChild(v);
      head.appendChild(el('p', 'wp-note', 'Mix of demand, profit margin, trend and competition.'));
    } else {
      head.appendChild(el('p', 'wp-note', 'Not enough data for an overall score. See the details below.'));
    }
    var g = el('div', 'wp-grid');
    var cost = d.supplier && d.supplier.cost;
    g.appendChild(stat('Supplier price', cost ? money(cost) : 'Not found', d.supplier && d.supplier.direct ? 'From the supplier' : 'Open the link to check'));
    g.appendChild(stat('Selling price', d.sell ? money(d.sell) : '-', d.sellWhy || (d.sell ? 'Suggested by rule' : '')));
    g.appendChild(stat('Profit per sale', d.profit ? money(d.profit.profit) : '-', d.profit ? d.profit.margin + '% margin after shipping, fees and ads' : 'Needs a supplier price'));
    if (d.demand) {
      var ords = d.demand.sold != null ? short(d.demand.sold) + ' orders' + (d.demand.rating ? ' · ★ ' + d.demand.rating : '') : '';
      var vws = short(d.demand.totalViews) + ' video views · ' + d.demand.recent + ' of ' + d.demand.videos + ' videos are new';
      var dsub = d.demand.method === 'both' ? ords + '. ' + vws
        : d.demand.method === 'youtube' ? vws
        : d.demand.method === 'orders' ? ords + ' (lifetime, from the supplier)'
        : 'AI estimate';
      g.appendChild(stat('Demand', d.demand.score + ' / 100 · ' + d.demand.label, dsub, d.demand.score));
    } else g.appendChild(stat('Demand', '-', 'Not enough data'));
    var lv = d.competition.level;
    g.appendChild(stat('Competition', lv.charAt(0).toUpperCase() + lv.slice(1), d.competition.why));
    var ts = d.trend.status;
    g.appendChild(stat('Trend', ts === 'rising' ? 'Rising ↑' : ts === 'cooling' ? 'Cooling ↓' : ts === 'steady' ? 'Steady →' : 'Unknown', d.trend.why));
    head.appendChild(g);
    out.appendChild(head);

    out.appendChild(calculator(d));

    var sup = box('Supplier');
    var sl = el('div', 'wp-links');
    sl.appendChild(anchor(d.supplier.direct ? 'Buy from supplier' : 'Search on AliExpress', d.supplier.url, 'main'));
    sl.appendChild(copyButton('Copy supplier link', function () { return d.supplier.url; }));
    sup.appendChild(sl);
    out.appendChild(sup);

    var ad = box('Ad examples');
    var al = el('div', 'wp-links');
    ((d.ads && d.ads.links) || []).forEach(function (l) { al.appendChild(anchor(l.name, l.url)); });
    ad.appendChild(al);
    if (d.ads && d.ads.videos && d.ads.videos.length) {
      var vg = el('div', 'wp-vids');
      d.ads.videos.forEach(function (x) {
        var a = anchor('', x.url, 'wp-vid');
        if (safeUrl(x.thumb)) { var im = document.createElement('img'); im.src = x.thumb; im.alt = ''; im.loading = 'lazy'; a.appendChild(im); }
        var t = el('div');
        t.appendChild(el('b', '', x.title));
        t.appendChild(el('small', '', x.channel + ' · ' + short(x.views) + ' views'));
        a.appendChild(t);
        vg.appendChild(a);
      });
      ad.appendChild(vg);
    }
    ad.appendChild(el('p', 'wp-note', 'The buttons open live Facebook and TikTok searches for this product. The videos are the fastest-growing YouTube videos about it, good for ad ideas.'));
    out.appendChild(ad);

    var ds = box('AI product description');
    if (d.description) {
      var wrap = el('div', 'wp-desc');
      wrap.appendChild(el('h5', '', d.description.headline));
      wrap.appendChild(el('p', '', d.description.text));
      if (d.description.bullets.length) {
        var ul = el('ul');
        d.description.bullets.forEach(function (b) { ul.appendChild(el('li', '', b)); });
        wrap.appendChild(ul);
      }
      ds.appendChild(wrap);
      var cl = el('div', 'wp-links');
      cl.appendChild(copyButton('Copy description', function () {
        return d.description.headline + '\n\n' + d.description.text + (d.description.bullets.length ? '\n\n' + d.description.bullets.map(function (b) { return '- ' + b; }).join('\n') : '');
      }));
      ds.appendChild(cl);
      ds.appendChild(el('p', 'wp-note', 'Check it against the real product before you publish it.'));
    } else ds.appendChild(el('p', 'wp-note', 'The AI could not write a description this time. Try again in a minute.'));
    out.appendChild(ds);

    (d.notes || []).forEach(function (n) { out.appendChild(el('p', 'wp-note', n)); });
  }

  // ---------- one button per product card ----------
  var LABEL = 'Winning analysis';

  function cardInfo(card) {
    var nameEl = card.querySelector(':scope > div > div');
    var name = nameEl ? nameEl.textContent.trim() : '';
    var meta = card.textContent || '';
    var cm = /Cost \$([0-9]+(?:\.[0-9]+)?)/.exec(meta);
    var cp = card.querySelector('.cp');
    var img = card.querySelector(':scope > img');
    var sm = /([0-9][0-9,]*)\s+sold/.exec(meta);
    var rm = /★\s*([0-9](?:\.[0-9]+)?)/.exec(meta);
    return {
      name: name,
      sold: sm ? sm[1].replace(/,/g, '') : '',
      rating: rm ? rm[1] : '',
      cost: cm ? cm[1] : '',
      url: cp ? cp.getAttribute('data-url') : '',
      image: img ? img.getAttribute('src') : ''
    };
  }

  function addButton(card) {
    var info = cardInfo(card);
    if (!info.name) return;
    card.style.flexWrap = 'wrap';
    var btn = el('button', 'btn alt wpbtn', LABEL);
    btn.type = 'button';
    var out = el('div', 'wp-out');
    out.hidden = true;
    var loaded = false;

    btn.onclick = function () {
      if (loaded) { // toggle the result
        out.hidden = !out.hidden;
        btn.textContent = out.hidden ? LABEL : 'Hide analysis';
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Analysing…';
      out.hidden = false;
      out.textContent = '';
      var ld = el('div', 'wp-load');
      ld.setAttribute('role', 'status');
      ld.appendChild(el('span', 'wp-spin'));
      ld.appendChild(el('div', '', 'Checking demand, competition and price… this can take up to 40 seconds.'));
      out.appendChild(ld);
      var qs = 'q=' + encodeURIComponent(info.name);
      if (info.cost && info.url) qs += '&cost=' + encodeURIComponent(info.cost) + '&url=' + encodeURIComponent(info.url) + (info.image ? '&image=' + encodeURIComponent(info.image) : '');
      if (info.sold) qs += '&sold=' + encodeURIComponent(info.sold);
      if (info.rating) qs += '&rating=' + encodeURIComponent(info.rating);
      fetch(API + '?' + qs,{ credentials: 'same-origin' })
        .then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (d) {
          btn.disabled = false;
          if (d.error || !d.product) {
            out.textContent = '';
            out.appendChild(el('div', 'wp-err', d.error || 'Could not analyse this product.'));
            btn.textContent = LABEL;
            return;
          }
          render(out, d);
          loaded = true;
          btn.textContent = 'Hide analysis';
        })
        .catch(function (e) {
          btn.disabled = false;
          btn.textContent = LABEL;
          out.textContent = '';
          out.appendChild(el('div', 'wp-err', 'Could not load: ' + (e && e.message ? e.message : e)));
        });
    };
    card.appendChild(btn);
    card.appendChild(out);
  }

  // Product cards are drawn again every time a list loads, so look for new ones.
  function scan() {
    var cards = document.querySelectorAll('.card.item');
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      if (c.dataset.wpDone) continue;
      if (!c.querySelector('.cp')) continue;                    // only product cards (they have "Copy link")
      if (c.querySelector('a[href*="youtu"]')) continue;        // video cards have their own buttons
      c.dataset.wpDone = '1';
      addButton(c);
    }
  }
  var timer = null;
  function schedule() { if (timer) return; timer = setTimeout(function () { timer = null; scan(); }, 200); }
  if (window.MutationObserver) new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', scan);
  window.addEventListener('load', scan);
  scan();
})();
