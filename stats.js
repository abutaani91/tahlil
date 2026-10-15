/* stats.js — محرك التحليل الكلاسيكي للاختبارات (اختيار من متعدد). لا يعتمد على الواجهة. */
(function (root) {
  'use strict';

  var LET = ['—', 'أ', 'ب', 'ج', 'د'];

  /* حرف إجابة → 1..4 أو 0 (بلا إجابة) */
  function normChar(ch) {
    var m = { 'أ': 1, 'ا': 1, 'إ': 1, 'آ': 1, 'ب': 2, 'ج': 3, 'د': 4,
              'a': 1, 'b': 2, 'c': 3, 'd': 4, 'A': 1, 'B': 2, 'C': 3, 'D': 4,
              '1': 1, '2': 2, '3': 3, '4': 4, '١': 1, '٢': 2, '٣': 3, '٤': 4 };
    return m[ch] || 0;
  }

  /* نص إجابات مثل «أبجدأ» أو «12341» → مصفوفة. المسافات والفواصل تُهمَل. */
  function parseAnswers(str) {
    var out = [];
    String(str || '').split('').forEach(function (ch) {
      if (/[\s,،;\t|]/.test(ch)) return;
      out.push(normChar(ch));
    });
    return out;
  }

  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  function mean(a) { return a.length ? sum(a) / a.length : 0; }

  /* الفقرات المحسوبة فقط هي التي لها مفتاح */
  function analyze(test) {
    var n = test.n;
    var key = test.key || [];
    var idx = [];
    for (var i = 0; i < n; i++) if (key[i] > 0) idx.push(i);
    var m = idx.length;
    var stu = (test.students || []).filter(function (s) { return !s.absent && s.ans && s.ans.length === n; });
    var N = stu.length;
    var res = { ok: false, N: N, m: m, n: n };
    if (m < 2) { res.reason = 'أدخل مفتاح الإجابة لفقرتين على الأقل'; return res; }
    if (N < 2) { res.reason = 'أدخل استجابات طالبين على الأقل'; return res; }

    var total = test.total > 0 ? test.total : m;
    var perItem = total / m;

    /* 1/0 لكل (طالب، فقرة) — الفراغ يُحتسب خاطئًا كما في الإكسل */
    var sc = stu.map(function (s) { return idx.map(function (i) { return s.ans[i] === key[i] ? 1 : 0; }); });
    var tot = sc.map(sum);
    var mu = mean(tot);
    var ss = 0; tot.forEach(function (t) { ss += (t - mu) * (t - mu); });
    var sd = Math.sqrt(ss / (N - 1));
    var varp = ss / N;

    var sorted = tot.slice().sort(function (a, b) { return a - b; });
    var median = N % 2 ? sorted[(N - 1) / 2] : (sorted[N / 2 - 1] + sorted[N / 2]) / 2;

    /* الالتواء والتفلطح كما في SKEW و KURT في إكسل (عينة) */
    var skew = null, kurt = null;
    if (sd > 0 && N >= 3) {
      var s3 = 0; tot.forEach(function (t) { s3 += Math.pow((t - mu) / sd, 3); });
      skew = (N / ((N - 1) * (N - 2))) * s3;
    }
    if (sd > 0 && N >= 4) {
      var s4 = 0; tot.forEach(function (t) { s4 += Math.pow((t - mu) / sd, 4); });
      kurt = (N * (N + 1) / ((N - 1) * (N - 2) * (N - 3))) * s4 - (3 * (N - 1) * (N - 1)) / ((N - 2) * (N - 3));
    }

    /* مجموعتا 27% مع احتساب المتعادلين (نفس قاعدة الإكسل) */
    var g = Math.max(1, Math.round(N * 0.27));
    var hiCut = sorted[N - g], loCut = sorted[g - 1];
    var hi = [], lo = [];
    tot.forEach(function (t, s) { if (t >= hiCut) hi.push(s); if (t <= loCut) lo.push(s); });

    var sumpq = 0;
    var items = [];
    idx.forEach(function (i, j) {
      var x = sc.map(function (r) { return r[j]; });
      var P = mean(x);
      sumpq += P * (1 - P);
      var Ph = hi.filter(function (s) { return x[s] === 1; }).length / hi.length;
      var Pl = lo.filter(function (s) { return x[s] === 1; }).length / lo.length;
      var D = Ph - Pl;

      /* ارتباط الفقرة بباقي الاختبار (point-biserial مصحَّح) */
      var y = x.map(function (v, s) { return tot[s] - v; });
      var my = mean(y), sxy = 0, sxx = 0, syy = 0;
      for (var s = 0; s < N; s++) {
        sxy += (x[s] - P) * (y[s] - my);
        sxx += (x[s] - P) * (x[s] - P);
        syy += (y[s] - my) * (y[s] - my);
      }
      var r = (sxx > 0 && syy > 0) ? sxy / Math.sqrt(sxx * syy) : 0;

      /* تحليل البدائل */
      var opts = [];
      for (var k = 0; k <= 4; k++) {
        var all = 0, hc = 0, lc = 0;
        stu.forEach(function (st, si) { if (st.ans[i] === k) all++; });
        hi.forEach(function (si) { if (stu[si].ans[i] === k) hc++; });
        lo.forEach(function (si) { if (stu[si].ans[i] === k) lc++; });
        if (k === 0 && all === 0) continue;
        var isKey = k === key[i];
        var pct = all / N, flag = '';
        if (k > 0 && !isKey) {
          if (pct < 0.05) flag = 'dead';
          else if (hc > lc && pct >= 0.10) flag = 'up';
        }
        opts.push({ k: k, l: k === 0 ? 'بلا إجابة' : LET[k], isKey: isKey, count: all, pct: pct,
                    hp: hc / hi.length, lp: lc / lo.length, flag: flag });
      }

      items.push({ i: i, n: i + 1, P: P, D: D, r: r, Ph: Ph, Pl: Pl, opts: opts, key: key[i], keyL: LET[key[i]], _y: y, _P: P });
    });

    var kr = varp > 0 ? (m / (m - 1)) * (1 - sumpq / varp) : null;
    var sem = (kr !== null) ? sd * Math.sqrt(Math.max(0, 1 - kr)) : null;

    /* الثبات لو حُذفت كل فقرة، ثم الحكم */
    items.forEach(function (it) {
      if (m > 2 && kr !== null) {
        var y = it._y, my = mean(y), vy = 0;
        y.forEach(function (v) { vy += (v - my) * (v - my); }); vy /= N;
        if (vy > 0) it.krDel = ((m - 1) / (m - 2)) * (1 - (sumpq - it._P * (1 - it._P)) / vy);
      }
      delete it._y; delete it._P;

      var reasons = [], st;
      if (it.D < 0 || it.r < 0) {
        st = 'key';
        reasons.push('تمييز سالب: الطلبة الأقوى يخطئون فيها أكثر من الأضعف. راجع مفتاح الإجابة وصياغة الفقرة قبل أي قرار آخر.');
      } else if (it.D < 0.2 && it.r < 0.2) {
        st = 'rej';
        reasons.push('التمييز ضعيف بالمقياسين معًا (D وr دون 0.20). تُعاد صياغتها أو تُحذف.');
      } else if (!(it.D >= 0.3 && it.r >= 0.25)) {
        st = 'rev';
        reasons.push('التمييز متوسط. قد تكفي مراجعة البدائل.');
      } else {
        st = 'ok';
        reasons.push('تمييز جيد بالمقياسين معًا.');
      }
      if (it.P > 0.8) { reasons.push('سهلة: P فوق 0.80. تبقى مقبولة إن كان الهدف قياس الحد الأدنى من الإتقان.'); if (st === 'ok') st = 'rev'; }
      if (it.P < 0.2) { reasons.push('صعبة جدًا: P دون 0.20. تأكد من أن الصياغة والوقت لا يظلمان الطلبة.'); if (st === 'ok') st = 'rev'; }
      it.opts.forEach(function (o) {
        if (o.flag === 'dead') { reasons.push('المموِّه (' + o.l + ') لم يجذب أحدًا تقريبًا. بديل غير فعّال يُستبدل.'); if (st === 'ok') st = 'rev'; }
        if (o.flag === 'up') { reasons.push('المموِّه (' + o.l + ') يجذب المجموعة العليا أكثر من الدنيا. راجع غموضه.'); if (st === 'ok') st = 'rev'; }
      });
      if (it.krDel !== undefined && kr !== null && it.krDel > kr + 0.01) {
        reasons.push('حذفها يرفع الثبات من ' + kr.toFixed(2) + ' إلى ' + it.krDel.toFixed(2) + '.');
      }
      it.st = st; it.reasons = reasons;
    });

    /* النتاجات */
    var outs = (test.outcomes || []).map(function (o) {
      var cols = [];
      (o.items || []).forEach(function (i) { var j = idx.indexOf(i); if (j >= 0) cols.push(j); });
      var per = sc.map(function (r) { return cols.length ? sum(cols.map(function (j) { return r[j]; })) / cols.length : null; });
      var vals = per.filter(function (v) { return v !== null; });
      return { name: o.name, count: cols.length, per: per, avg: vals.length ? mean(vals) : null,
               low: vals.filter(function (v) { return v < 0.6; }).length };
    });

    /* الطلبة والترتيب */
    var rows = stu.map(function (s, si) {
      var mark = Math.round(tot[si] * perItem * 100) / 100;
      return { s: s, tot: tot[si], mark: mark, pct: tot[si] / m, out: outs.map(function (o) { return o.per[si]; }) };
    });
    var order = rows.slice().sort(function (a, b) { return b.tot - a.tot; });
    rows.forEach(function (r) { r.rank = 1 + order.filter(function (o) { return o.tot > r.tot; }).length; });

    /* المدرّج التكراري: خمس فئات متساوية العرض تقريبًا */
    var w = Math.max(1, Math.ceil((m + 1) / 5));
    var bins = [];
    for (var b = 0; b * w <= m; b++) bins.push({ from: b * w, to: Math.min(m, b * w + w - 1), count: 0 });
    tot.forEach(function (t) { bins[Math.min(bins.length - 1, Math.floor(t / w))].count++; });

    res.ok = true;
    res.total = total; res.perItem = perItem;
    res.tot = tot; res.mean = mu; res.sd = sd; res.varp = varp; res.median = median;
    res.min = sorted[0]; res.max = sorted[N - 1]; res.skew = skew; res.kurt = kurt;
    res.kr = kr; res.sem = sem; res.hi = hi.length; res.lo = lo.length;
    res.meanMark = mu * perItem; res.sdMark = sd * perItem;
    res.pass = tot.filter(function (t) { return t * perItem >= total / 2; }).length / N;
    res.items = items; res.outs = outs; res.rows = rows; res.bins = bins;
    res.counts = { ok: 0, rev: 0, rej: 0, key: 0 };
    items.forEach(function (it) { res.counts[it.st]++; });
    res.smallN = N < 30;
    return res;
  }

  var api = { analyze: analyze, parseAnswers: parseAnswers, normChar: normChar, LET: LET };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Stats = api;
})(typeof window !== 'undefined' ? window : this);
