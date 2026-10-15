/* bank.js — بنك الأسئلة (من دوسياتي): السحب بحسب النتاجات ومستويات بلوم. لا يعتمد على الواجهة. */
(function (root) {
  'use strict';
  var LVL = { 'ت': 'تذكّر وفهم', 'ط': 'تطبيق', 'ح': 'تحليل' }, LVLS = ['ت', 'ط', 'ح'], SEGCAP = 3;

  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function shuffle(a, r) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function plain(s) { return String(s == null ? '' : s).replace(/<[^>]+>/g, ''); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  /* يسمح بوسمَي <b> و<ltr> فقط */
  function rich(s) {
    return esc(s).replace(/&lt;ltr&gt;/g, '<span dir="ltr" style="unicode-bidi:isolate">').replace(/&lt;\/ltr&gt;/g, '</span>').replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>');
  }

  /* الزمن المقدَّر للفقرة بالثواني: قراءة (150 كلمة/دقيقة لطالب) + تفكير بحسب المستوى + حساب إن كثرت الأرقام.
     تقدير أوّلي لا قياس؛ يُعدَّل يدويًّا لكل فقرة ويُعايَر لاحقًا من أزمنة طلبة فعلية. */
  var THINK = { 'ت': 20, 'ط': 50, 'ح': 55 };
  function words(s) { return plain(s).trim().split(/\s+/).filter(Boolean).length; }
  function secs(it) {
    var w = words(it.q), txt = it.q;
    it.op.forEach(function (o) { w += words(o); txt += ' ' + o; });
    var nums = (txt.match(/\d|<ltr>/g) || []).length, calc = nums >= 8 ? 30 : nums >= 4 ? 15 : 0;
    var v = w / 2.5 + THINK[it.lvl] + calc;
    return Math.max(30, Math.min(180, Math.round(v / 5) * 5));
  }

  /* تحويل ملفّ bank.json إلى كائنات وفهرس */
  function index(raw) {
    var byId = {}, units = raw.units.map(function (u) {
      var items = u.items.map(function (r) { var it = { id: r[0], s: r[1], o: r[2], lvl: r[3], q: r[4], op: r[5], a: r[6], fb: r[7], u: u.id }; byId[it.id] = it; return it; });
      return { id: u.id, subject: u.subject, grade: u.grade, unitNo: u.unitNo, title: u.title, outcomes: u.outcomes, lessons: u.lessons, segs: u.segs, byOutcome: u.byOutcome, bloom: u.bloom, items: items };
    });
    var byUnit = {}; units.forEach(function (u) { byUnit[u.id] = u; });
    return { units: units, byId: byId, byUnit: byUnit, src: raw.src };
  }

  /* توزيع تلقائي لعدد n من الفقرات على نتاجات الوحدات المختارة: حصص متساوية للوحدات ثم أوزان نتاجات الاختبار الذاتي */
  function allocate(B, unitIds, n) {
    var cells = [], out = {};
    unitIds.forEach(function (id) {
      var u = B.byUnit[id], tot = 0, share = n / unitIds.length;
      Object.keys(u.outcomes).forEach(function (o) { tot += (u.byOutcome[o] || 1); });
      Object.keys(u.outcomes).forEach(function (o) {
        var avail = u.items.filter(function (i) { return String(i.o) === String(o); }).length, w = (u.byOutcome[o] || 1) / tot * share;
        cells.push({ k: id + '|' + o, w: w, avail: avail, c: Math.min(avail, Math.floor(w)), frac: w - Math.floor(w) });
      });
    });
    var sum = cells.reduce(function (s, c) { return s + c.c; }, 0);
    /* الحدّ الأدنى فقرة لكلّ نتاج متى اتّسع العدد */
    if (n >= cells.length) cells.forEach(function (c) { if (c.c < 1 && sum < n) { c.c = 1; sum++; } });
    var order = cells.slice().sort(function (a, b) { return b.frac - a.frac; }), guard = 0;
    while (sum < n && guard++ < 1000) { var moved = false; for (var i = 0; i < order.length && sum < n; i++) if (order[i].c < order[i].avail) { order[i].c++; sum++; moved = true; } if (!moved) break; }
    while (sum > n) { var big = cells.slice().sort(function (a, b) { return b.c - a.c; })[0]; if (big.c <= 0) break; big.c--; sum--; }
    cells.forEach(function (c) { out[c.k] = c.c; });
    return out;
  }

  function bloomTarget(B, alloc, n) {
    var w = { 'ت': 0, 'ط': 0, 'ح': 0 }, tot = 0;
    Object.keys(alloc).forEach(function (k) {
      if (!alloc[k]) return; var u = B.byUnit[k.split('|')[0]], bt = u.bloom, s = (bt['ت'] || 0) + (bt['ط'] || 0) + (bt['ح'] || 0) || 1;
      LVLS.forEach(function (l) { w[l] += alloc[k] * (bt[l] || 0) / s; }); tot += alloc[k];
    });
    var t = {}, sum = 0; LVLS.forEach(function (l) { t[l] = Math.floor(w[l]); sum += t[l]; });
    LVLS.slice().sort(function (a, b) { return (w[b] - t[b]) - (w[a] - t[a]); }).forEach(function (l) { if (sum < tot) { t[l]++; sum++; } });
    return t;
  }

  /* السحب: opts = {seed, exclude:{id:1}, shuffleOrder} */
  function draw(B, alloc, opts) {
    opts = opts || {}; var r = rng(opts.seed || 1), ex = opts.exclude || {}, picked = [], cap = {};
    var n = 0; Object.keys(alloc).forEach(function (k) { n += alloc[k]; });
    var target = bloomTarget(B, alloc, n), have = { 'ت': 0, 'ط': 0, 'ح': 0 };
    var keys = shuffle(Object.keys(alloc).filter(function (k) { return alloc[k] > 0; }), r);
    var byKey = {};
    keys.forEach(function (k) {
      var p = k.split('|'), u = B.byUnit[p[0]], cand = shuffle(u.items.filter(function (i) { return String(i.o) === p[1] && !ex[i.id]; }), r), got = [];
      for (var c = 0; c < alloc[k]; c++) {
        var best = null, bs = -1e9;
        cand.forEach(function (it, ix) {
          var capUsed = cap[u.id + ':' + it.s] || 0, sc = (target[it.lvl] - have[it.lvl]) * 10 - ix * 0.001 - (capUsed >= SEGCAP ? 1000 : 0);
          if (sc > bs) { bs = sc; best = it; }
        });
        if (!best) break;
        cand.splice(cand.indexOf(best), 1); got.push(best); have[best.lvl]++; cap[u.id + ':' + best.s] = (cap[u.id + ':' + best.s] || 0) + 1;
      }
      byKey[k] = got;
    });
    /* ترتيب العرض: بحسب الوحدة ثمّ رقم النتاج ، أو خلط كامل */
    var uOrder = {}; Object.keys(alloc).forEach(function (k) { var id = k.split('|')[0]; if (!(id in uOrder)) uOrder[id] = Object.keys(uOrder).length; });
    Object.keys(byKey).sort(function (a, b) { var pa = a.split('|'), pb = b.split('|'); return uOrder[pa[0]] - uOrder[pb[0]] || (+pa[1]) - (+pb[1]); }).forEach(function (k) { byKey[k].forEach(function (it) { picked.push(it); }); });
    if (opts.shuffleOrder) picked = shuffle(picked, r);
    return { items: picked, target: target, short: n - picked.length };
  }

  /* أفضل سحبة من أربعين بذرة: أقلّ انحرافًا في توزّع حروف المفتاح ثمّ في نسب بلوم */
  function drawBest(B, alloc, opts) {
    opts = opts || {}; var best = null, bs = 1e9, s0 = opts.seed || 1;
    for (var t = 0; t < 40; t++) {
      var o = {}; for (var k in opts) o[k] = opts[k]; o.seed = s0 + t * 7919;
      var d = draw(B, alloc, o), n = d.items.length, kd = keyDist(d.items), ld = lvlDist(d.items), sc = 0;
      kd.forEach(function (c) { sc += (c - n / 4) * (c - n / 4); });
      LVLS.forEach(function (l) { sc += 2 * Math.pow(ld[l] - d.target[l], 2); });
      if (d.short) sc += 1000 * d.short;
      if (sc < bs) { bs = sc; best = d; best.seed = o.seed; }
    }
    return best;
  }

  /* استبدال فقرة بأخرى من النتاج نفسه لم تُسحب بعد */
  function replaceOne(B, picked, idx, seed, ex) {
    ex = ex || {}; var old = picked[idx], used = {}, cap = {}, r = rng(seed || 7);
    picked.forEach(function (i) { used[i.id] = 1; cap[i.u + ':' + i.s] = (cap[i.u + ':' + i.s] || 0) + 1; });
    var cand = shuffle(B.byUnit[old.u].items.filter(function (i) { return i.o === old.o && !used[i.id] && !ex[i.id]; }), r);
    if (!cand.length) return null;
    cand.sort(function (a, b) {
      var sa = (a.lvl === old.lvl ? 0 : 10) + ((cap[a.u + ':' + a.s] || 0) >= SEGCAP ? 100 : 0), sb = (b.lvl === old.lvl ? 0 : 10) + ((cap[b.u + ':' + b.s] || 0) >= SEGCAP ? 100 : 0); return sa - sb;
    });
    return cand[0];
  }

  function keyDist(items) { var d = [0, 0, 0, 0]; items.forEach(function (i) { d[i.a]++; }); return d; }
  function lvlDist(items) { var d = { 'ت': 0, 'ط': 0, 'ح': 0 }; items.forEach(function (i) { d[i.lvl]++; }); return d; }

  var api = { LVL: LVL, LVLS: LVLS, index: index, allocate: allocate, draw: draw, drawBest: drawBest, replaceOne: replaceOne, keyDist: keyDist, lvlDist: lvlDist, plain: plain, rich: rich, secs: secs, rng: rng, SEGCAP: SEGCAP };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Bank = api;
})(typeof window !== 'undefined' ? window : this);
