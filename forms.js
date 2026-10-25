/* forms.js — نماذج الاختبار الورقي (2 / 4 / 6 / 8): خلط ترتيب الفقرات والخيارات وتحويل الإجابات إلى الترتيب الأصلي.
   منطق نقي بلا DOM ليُختبر في Node. النموذج 0 (أ) هو الترتيب الأصلي دائمًا.
   F = { k, seed, so, ord:[[…]], omap:[[[…]]] }
     ord[f][p]     = رقم الفقرة الأصلية (من 0) التي تظهر في الموضع p من النموذج f
     omap[f][p][d] = رقم الخيار الأصلي (0..3) الذي يظهر في الموضع d من الفقرة التي في الموضع p            */
(function (root) {
  'use strict';

  var LET = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح'];
  var ALLOWED = [1, 2, 4, 6, 8];

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0; var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, r) {
    for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), x = arr[i]; arr[i] = arr[j]; arr[j] = x; }
    return arr;
  }
  function seq(n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; }

  /* خيارات لا يصحّ خلط ترتيبها: «كل ما سبق»، «أ و ب معًا»، أو خيارات رقمية مرتّبة */
  var REF = /(ما\s*سبق|جميع\s*(ما|الإجابات|الاجابات|الخيارات|البدائل|العبارات)|كل\s*(ما|الإجابات|الاجابات|الخيارات)|لا\s*(شيء|أحد|يوجد)\s*مما|كلا(هما)?\b|الإجابتان|الاجابتان|جميعها|كلها|(^|[\s(])[أبجد]\)?\s*(و|،|\+)\s*\(?[أبجد]([\s)]|$))/;
  function fixedOptions(opts) {
    if (!opts || opts.length < 2) return true;
    var texts = opts.map(function (o) { return String(o == null ? '' : o).trim(); });
    if (texts.some(function (t) { return REF.test(t); })) return true;
    if (texts.every(function (t) { return /^[\s\-−+(]*[\d٠-٩]/.test(t); })) return true;
    return false;
  }

  function dispLetter(F, f, p, key, ord) {
    var kv = key[ord[p]]; if (!(kv > 0)) return 0;
    return F.omap[f][p].indexOf(kv - 1) + 1;
  }
  function scoreForm(F, f, key, n) {
    var ord = F.ord[f], cnt = [0, 0, 0, 0], m = 0, run = 0, maxRun = 0, last = 0, p;
    for (p = 0; p < n; p++) {
      var l = dispLetter(F, f, p, key, ord);
      if (l > 0) { cnt[l - 1]++; m++; }
      if (l > 0 && l === last) run++; else run = 1; last = l; if (run > maxRun) maxRun = run;
    }
    var chi = 0; if (m) { var e = m / 4; cnt.forEach(function (c) { chi += (c - e) * (c - e) / e; }); }
    var co = 0;
    for (var g = 0; g < f; g++) for (p = 0; p < n; p++) if (F.ord[g][p] === ord[p]) co++;
    return chi + Math.max(0, maxRun - 3) * 2 + co * 2;
  }

  /* يُعدّل ترتيب خيارات الفقرات الحرّة بتبديل موضع الخيار الصحيح فقط ليتساوى عدد مرات ظهور أ/ب/ج/د في مفتاح النموذج */
  function balance(F, f, key, n, fixed, r) {
    var ord = F.ord[f], om = F.omap[f], cnt = [0, 0, 0, 0], p, d, kv;
    for (p = 0; p < n; p++) { kv = key[ord[p]]; if (kv > 0) cnt[om[p].indexOf(kv - 1)]++; }
    var idx = shuffle(seq(n), r);
    idx.forEach(function (q) {
      var orig = ord[q]; kv = key[orig]; if (!(kv > 0) || (fixed && fixed[orig])) return;
      var cur = om[q].indexOf(kv - 1); cnt[cur]--;
      var best = cur; for (d = 0; d < 4; d++) if (cnt[d] < cnt[best]) best = d;
      if (best !== cur) { var t = om[q][cur]; om[q][cur] = om[q][best]; om[q][best] = t; }
      cnt[best]++;
    });
  }

  /* n فقرة، key مفتاح الأصل (1..4، 0 = بلا)، fixed[i] = true إن لا يُخلط ترتيب خيارات الفقرة */
  function build(n, key, fixed, k, shuffleOpts, seed) {
    k = ALLOWED.indexOf(k) >= 0 ? k : 1; seed = (seed >>> 0) || 1;
    var F = { k: k, seed: seed, so: !!shuffleOpts, ord: [seq(n)], omap: [] };
    F.omap.push(seq(n).map(function () { return [0, 1, 2, 3]; }));
    for (var f = 1; f < k; f++) {
      var best = null, bs = Infinity;
      for (var tr = 0; tr < 80; tr++) {
        var r = rng(seed * 7919 + f * 104729 + tr * 31 + 17);
        var ord = shuffle(seq(n), r);
        var om = ord.map(function (orig) {
          var a = [0, 1, 2, 3];
          if (F.so && !(fixed && fixed[orig])) shuffle(a, r);
          return a;
        });
        F.ord[f] = ord; F.omap[f] = om;
        if (F.so) balance(F, f, key, n, fixed, r);
        var s = scoreForm(F, f, key, n);
        if (s < bs) { bs = s; best = { ord: ord.slice(), om: om.map(function (x) { return x.slice(); }) }; }
      }
      F.ord[f] = best.ord; F.omap[f] = best.om;
    }
    return F;
  }

  function valid(F, n) {
    if (!F || ALLOWED.indexOf(F.k) < 0 || F.ord.length !== F.k || F.omap.length !== F.k) return false;
    for (var f = 0; f < F.k; f++) {
      if (F.ord[f].length !== n || F.omap[f].length !== n) return false;
      var seen = {}; for (var p = 0; p < n; p++) { var o = F.ord[f][p]; if (!(o >= 0 && o < n) || seen[o]) return false; seen[o] = 1; if (F.omap[f][p].slice().sort().join() !== '0,1,2,3') return false; }
    }
    return true;
  }

  /* raw = الإجابات كما ظُلّلت حسب مواضع النموذج f ← إجابات بترتيب الأصل */
  function toOrig(F, f, raw) {
    var n = F.ord[f].length, ans = []; for (var i = 0; i < n; i++) ans.push(0);
    for (var p = 0; p < n; p++) { var v = raw[p]; ans[F.ord[f][p]] = v > 0 ? F.omap[f][p][v - 1] + 1 : 0; }
    return ans;
  }
  function toDisp(F, f, ans) {
    var n = F.ord[f].length, raw = [];
    for (var p = 0; p < n; p++) { var v = ans[F.ord[f][p]]; raw.push(v > 0 ? F.omap[f][p].indexOf(v - 1) + 1 : 0); }
    return raw;
  }
  function dispKey(F, f, key) {
    var n = F.ord[f].length, k2 = [];
    for (var p = 0; p < n; p++) k2.push(dispLetter(F, f, p, key, F.ord[f]));
    return k2;
  }
  /* نسبة الصحيح لو كان raw من النموذج f (من الفقرات التي لها مفتاح) */
  function pctUnder(F, f, key, raw) {
    var ans = toOrig(F, f, raw), c = 0, m = 0;
    for (var i = 0; i < key.length; i++) if (key[i] > 0) { m++; if (ans[i] === key[i]) c++; }
    return m ? c / m : 0;
  }
  /* تنبيه إن كانت الإجابات أقرب لمفتاح نموذج آخر بفارق ≥ 25 نقطة */
  function mismatch(F, f, key, raw) {
    var mine = pctUnder(F, f, key, raw), bestF = -1, best = 0;
    for (var g = 0; g < F.k; g++) if (g !== f) { var p = pctUnder(F, g, key, raw); if (p > best) { best = p; bestF = g; } }
    return (bestF >= 0 && best >= mine + 0.25 && best >= 0.45) ? { mine: mine, other: bestF, otherPct: best } : null;
  }

  /* ---- تحليل التباين بعامل واحد (مقارنة متوسطات النماذج) ---- */
  function lgam(x) {
    var c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5], y = x, t = x + 5.5, s = 1.000000000190015;
    t -= (x + 0.5) * Math.log(t); for (var j = 0; j < 6; j++) s += c[j] / ++y;
    return -t + Math.log(2.5066282746310005 * s / x);
  }
  function betacf(a, b, x) {
    var qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap, h, m, m2, aa, del;
    if (Math.abs(d) < 1e-30) d = 1e-30; d = 1 / d; h = d;
    for (m = 1; m <= 200; m++) {
      m2 = 2 * m; aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30; c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30; d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30; c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30; d = 1 / d; del = d * c; h *= del;
      if (Math.abs(del - 1) < 3e-12) break;
    }
    return h;
  }
  function betai(a, b, x) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    var bt = Math.exp(lgam(a + b) - lgam(a) - lgam(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  }
  function fSurvival(F, d1, d2) { return betai(d2 / 2, d1 / 2, d2 / (d2 + d1 * F)); }
  /* groups: مصفوفة مصفوفات قيم. تعيد null إن لم تكفِ البيانات. */
  function oneWay(groups) {
    groups = groups.filter(function (g) { return g.length > 0; });
    var k = groups.length, N = 0, sum = 0; groups.forEach(function (g) { N += g.length; g.forEach(function (v) { sum += v; }); });
    if (k < 2 || N - k < 1) return null;
    var gm = sum / N, ssb = 0, ssw = 0;
    groups.forEach(function (g) {
      var m = 0; g.forEach(function (v) { m += v; }); m /= g.length; ssb += g.length * (m - gm) * (m - gm);
      g.forEach(function (v) { ssw += (v - m) * (v - m); });
    });
    var d1 = k - 1, d2 = N - k, msw = ssw / d2;
    if (msw <= 0) return { F: ssb > 0 ? Infinity : 0, d1: d1, d2: d2, p: ssb > 0 ? 0 : 1, eta2: ssb + ssw ? ssb / (ssb + ssw) : 0 };
    var Fv = (ssb / d1) / msw;
    return { F: Fv, d1: d1, d2: d2, p: fSurvival(Fv, d1, d2), eta2: ssb / (ssb + ssw) };
  }

  function letter(f) { return LET[f] || String(f + 1); }

  var api = { LET: LET, ALLOWED: ALLOWED, build: build, valid: valid, toOrig: toOrig, toDisp: toDisp, dispKey: dispKey, pctUnder: pctUnder,
              mismatch: mismatch, oneWay: oneWay, fixedOptions: fixedOptions, letter: letter, rng: rng };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Forms = api;
})(typeof window !== 'undefined' ? window : this);
