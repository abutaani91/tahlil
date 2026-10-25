/* omr.js — قراءة ورقة الإجابة من صورة. كله داخل المتصفح بلا إنترنت.
   الخطوات: تصغير الصورة ← كشف مربعات الزوايا ← تحديد الاتجاه بالحلقة ← تصحيح المنظور ← قياس غمق كل فقاعة ← حكم لكل فقرة. */
(function (root) {
  'use strict';

  var S = 6;                    /* بكسل لكل ملّيمتر في الصورة المصحَّحة */
  var PW = 210, PH = 297;
  var MAXD = 2000;              /* أطول ضلع بعد التصغير */

  function mkCanvas(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    var c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }

  /* ---------- صورة → رمادي ---------- */
  function grayFrom(source) {
    var sw = source.naturalWidth || source.videoWidth || source.width, sh = source.naturalHeight || source.videoHeight || source.height;
    var k = Math.min(1, MAXD / Math.max(sw, sh));
    var w = Math.round(sw * k), h = Math.round(sh * k);
    var c = mkCanvas(w, h), ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, w, h);
    var d = ctx.getImageData(0, 0, w, h).data, g = new Float32Array(w * h);
    for (var i = 0, j = 0; j < g.length; i += 4, j++) g[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    return { g: g, w: w, h: h, scale: k };
  }

  /* ---------- عتبة محلية بالمتوسط (صورة تكاملية) ---------- */
  function adaptiveDark(g, w, h, win, ratio) {
    var W1 = w + 1, I = new Float64Array(W1 * (h + 1));
    for (var y = 0; y < h; y++) {
      var row = 0;
      for (var x = 0; x < w; x++) { row += g[y * w + x]; I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + row; }
    }
    var r = win >> 1, out = new Uint8Array(w * h);
    for (var y2 = 0; y2 < h; y2++) {
      var y0 = Math.max(0, y2 - r), y1 = Math.min(h, y2 + r + 1);
      for (var x2 = 0; x2 < w; x2++) {
        var x0 = Math.max(0, x2 - r), x1 = Math.min(w, x2 + r + 1);
        var s = I[y1 * W1 + x1] - I[y0 * W1 + x1] - I[y1 * W1 + x0] + I[y0 * W1 + x0];
        var m = s / ((x1 - x0) * (y1 - y0));
        if (g[y2 * w + x2] < m * ratio && g[y2 * w + x2] < 170) out[y2 * w + x2] = 1;
      }
    }
    return out;
  }

  /* ---------- المكوّنات المتصلة مع العزوم ---------- */
  function components(bin, w, h, minArea, maxArea) {
    var seen = new Uint8Array(w * h), stack = new Int32Array(w * h), out = [];
    for (var p0 = 0; p0 < w * h; p0++) {
      if (!bin[p0] || seen[p0]) continue;
      var sp = 0; stack[sp++] = p0; seen[p0] = 1;
      var area = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, minx = w, maxx = 0, miny = h, maxy = 0;
      while (sp) {
        var p = stack[--sp], x = p % w, y = (p / w) | 0;
        area++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
        if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
        if (x > 0 && bin[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[sp++] = p - 1; }
        if (x < w - 1 && bin[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[sp++] = p + 1; }
        if (y > 0 && bin[p - w] && !seen[p - w]) { seen[p - w] = 1; stack[sp++] = p - w; }
        if (y < h - 1 && bin[p + w] && !seen[p + w]) { seen[p + w] = 1; stack[sp++] = p + w; }
      }
      if (area < minArea || area > maxArea) continue;
      var cx = sx / area, cy = sy / area;
      var m20 = sxx / area - cx * cx, m02 = syy / area - cy * cy, m11 = sxy / area - cx * cy;
      var tr = m20 + m02, det = m20 * m02 - m11 * m11, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
      var l1 = tr / 2 + disc, l2 = Math.max(1e-9, tr / 2 - disc);
      out.push({ area: area, cx: cx, cy: cy, bw: maxx - minx + 1, bh: maxy - miny + 1,
                 edge: minx <= 2 || miny <= 2 || maxx >= w - 3 || maxy >= h - 3,
                 fill: area / ((maxx - minx + 1) * (maxy - miny + 1)), aniso: Math.sqrt(l1 / l2) });
    }
    return out;
  }

  /* ---------- اختيار مربعات الزوايا الأربعة ---------- */
  function cross(o, a, b) { return (a.cx - o.cx) * (b.cy - o.cy) - (a.cy - o.cy) * (b.cx - o.cx); }
  function orderCW(pts) {
    var mx = 0, my = 0; pts.forEach(function (p) { mx += p.cx; my += p.cy; }); mx /= pts.length; my /= pts.length;
    return pts.slice().sort(function (a, b) { return Math.atan2(a.cy - my, a.cx - mx) - Math.atan2(b.cy - my, b.cx - mx); });
  }
  function pickMarkers(cands, W, H) {
    cands.sort(function (a, b) { return b.area - a.area; });
    var pool = cands.slice(0, 10), best = null;
    for (var a = 0; a < pool.length; a++) for (var b = a + 1; b < pool.length; b++)
      for (var c = b + 1; c < pool.length; c++) for (var d = c + 1; d < pool.length; d++) {
        var q = [pool[a], pool[b], pool[c], pool[d]];
        var amin = Math.min.apply(null, q.map(function (p) { return p.area; })), amax = Math.max.apply(null, q.map(function (p) { return p.area; }));
        if (amax / amin > 2.4) continue;
        var o = orderCW(q), ok = true, sgn = 0;
        for (var i = 0; i < 4; i++) {
          var cr = cross(o[i], o[(i + 1) % 4], o[(i + 2) % 4]);
          if (cr === 0) { ok = false; break; }
          if (sgn === 0) sgn = cr > 0 ? 1 : -1; else if ((cr > 0 ? 1 : -1) !== sgn) { ok = false; break; }
        }
        if (!ok) continue;
        var area = 0;
        for (var j = 0; j < 4; j++) area += o[j].cx * o[(j + 1) % 4].cy - o[(j + 1) % 4].cx * o[j].cy;
        area = Math.abs(area) / 2;
        if (area < 0.06 * W * H) continue;
        var L = function (p, r) { return Math.hypot(p.cx - r.cx, p.cy - r.cy); };
        var s1 = (L(o[0], o[1]) + L(o[2], o[3])) / 2, s2 = (L(o[1], o[2]) + L(o[3], o[0])) / 2;
        var ratio = Math.max(s1, s2) / Math.min(s1, s2);
        if (ratio < 1.15 || ratio > 2.0) continue;
        var score = area * (amin / amax);
        if (!best || score > best.score) best = { pts: o, score: score };
      }
    return best ? best.pts : null;
  }

  /* ---------- تحويل المنظور ---------- */
  function homography(src, dst) {       /* dst → src */
    var A = [], b = [];
    for (var i = 0; i < 4; i++) {
      var x = dst[i][0], y = dst[i][1], u = src[i][0], v = src[i][1];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    for (var c = 0; c < 8; c++) {
      var piv = c; for (var r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      var t = A[c]; A[c] = A[piv]; A[piv] = t; var tb = b[c]; b[c] = b[piv]; b[piv] = tb;
      for (var r2 = c + 1; r2 < 8; r2++) {
        var f = A[r2][c] / A[c][c];
        for (var k = c; k < 8; k++) A[r2][k] -= f * A[c][k];
        b[r2] -= f * b[c];
      }
    }
    var h = new Array(8);
    for (var i2 = 7; i2 >= 0; i2--) {
      var s = b[i2]; for (var j = i2 + 1; j < 8; j++) s -= A[i2][j] * h[j];
      h[i2] = s / A[i2][i2];
    }
    return h;
  }

  function warp(gray, H) {
    var Wc = PW * S, Hc = PH * S, out = new Float32Array(Wc * Hc), g = gray.g, w = gray.w, h = gray.h;
    for (var y = 0; y < Hc; y++) for (var x = 0; x < Wc; x++) {
      var den = H[6] * x + H[7] * y + 1;
      var u = (H[0] * x + H[1] * y + H[2]) / den, v = (H[3] * x + H[4] * y + H[5]) / den;
      if (u < 0 || v < 0 || u >= w - 1 || v >= h - 1) { out[y * Wc + x] = 255; continue; }
      var x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0, p = y0 * w + x0;
      out[y * Wc + x] = (g[p] * (1 - fx) + g[p + 1] * fx) * (1 - fy) + (g[p + w] * (1 - fx) + g[p + w + 1] * fx) * fy;
    }
    return { g: out, w: Wc, h: Hc };
  }

  /* ---------- غمق الفقاعة: (الخلفية − داخل الفقاعة) / الخلفية ---------- */
  function darkness(wp, cxmm, cymm, rmm) {
    var cx = cxmm * S, cy = cymm * S, ri = 0.62 * rmm * S, ro1 = 1.45 * rmm * S, ro2 = 1.85 * rmm * S;
    var x0 = Math.floor(cx - ro2), x1 = Math.ceil(cx + ro2), y0 = Math.floor(cy - ro2), y1 = Math.ceil(cy + ro2);
    var inSum = 0, inN = 0, ring = [];
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
      if (x < 0 || y < 0 || x >= wp.w || y >= wp.h) continue;
      var d = Math.hypot(x - cx, y - cy), v = wp.g[y * wp.w + x];
      if (d <= ri) { inSum += v; inN++; } else if (d >= ro1 && d <= ro2) ring.push(v);
    }
    if (!inN || ring.length < 8) return 0;
    ring.sort(function (a, b) { return a - b; });
    var bg = ring[Math.floor(ring.length * 0.7)], inner = inSum / inN;
    return Math.max(0, Math.min(1, (bg - inner) / Math.max(bg, 1)));
  }

  /* ---------- ضبط موضع كل صف محليًا: يعوّض انحناء الورقة وأي انحراف بسيط ---------- */
  function ringAvg(wp, cx, cy, rad) {
    var s = 0, n = 0;
    for (var a = 0; a < 24; a++) {
      var x = Math.round(cx + rad * Math.cos(a * 0.2618)), y = Math.round(cy + rad * Math.sin(a * 0.2618));
      if (x >= 0 && y >= 0 && x < wp.w && y < wp.h) { s += wp.g[y * wp.w + x]; n++; }
    }
    return n ? s / n : 255;
  }
  /* حلقة الحدّ المطبوع أغمق من محيطها إذا كان الموضع صحيحًا */
  function outline(wp, cxmm, cymm, rmm, g1, g2) {
    var cx = cxmm * S, cy = cymm * S, r = rmm * S;
    var ring = (ringAvg(wp, cx, cy, r - 0.2 * S) + ringAvg(wp, cx, cy, r) + ringAvg(wp, cx, cy, r + 0.2 * S)) / 3;
    var bg = (ringAvg(wp, cx, cy, r + g1 * S) + ringAvg(wp, cx, cy, r + g2 * S)) / 2;
    return (bg - ring) / Math.max(bg, 1);
  }
  function rowScore(wp, xs, cy, rmm, g1, g2, dx, dy) {
    var s = 0; xs.forEach(function (x) { s += outline(wp, x + dx, cy + dy, rmm, g1, g2); }); return s / xs.length;
  }
  function refineRow(wp, xs, cy, rmm, g1, g2, bx, by) {
    var best = { dx: 0, dy: 0, s: -9 };
    function tryRange(c0x, c0y, span, step) {
      for (var dy = c0y - span; dy <= c0y + span + 1e-6; dy += step) for (var dx = c0x - span; dx <= c0x + span + 1e-6; dx += step) {
        var sc = rowScore(wp, xs, cy, rmm, g1, g2, bx + dx, by + dy) - 0.004 * (dx * dx + dy * dy);
        if (sc > best.s) best = { dx: dx, dy: dy, s: sc };
      }
    }
    tryRange(0, 0, 3.2, 0.8); tryRange(best.dx, best.dy, 0.8, 0.2);
    return best;
  }
  function median3(a, i, lo, hi) {
    var v = []; for (var k = Math.max(lo, i - 1); k <= Math.min(hi, i + 1); k++) v.push(a[k]);
    v.sort(function (p, q) { return p - q; }); return v[v.length >> 1];
  }

  function otsu(vals) {
    var B = 50, hist = new Array(B).fill(0);
    vals.forEach(function (v) { hist[Math.min(B - 1, Math.floor(v * B))]++; });
    var tot = vals.length, sumAll = 0; for (var i = 0; i < B; i++) sumAll += i * hist[i];
    var wB = 0, sB = 0, best = -1, bt = 0, mLo = 0, mHi = 0;
    for (var t = 0; t < B; t++) {
      wB += hist[t]; if (!wB) continue; var wF = tot - wB; if (!wF) break;
      sB += t * hist[t];
      var m1 = sB / wB, m2 = (sumAll - sB) / wF, bv = wB * wF * (m1 - m2) * (m1 - m2);
      if (bv > best) { best = bv; bt = t; mLo = m1; mHi = m2; }
    }
    return { t: (bt + 1) / B, sep: (mHi - mLo) / B };
  }

  /* ---------- الدالة الرئيسية ---------- */
  function scan(source, g, opts) {
    opts = opts || {};
    var DX = opts.dx || 0, DY = opts.dy || 0;
    var gray = grayFrom(source), w = gray.w, h = gray.h;
    var win = Math.max(41, (Math.max(w, h) / 12) | 0) | 1;
    var bin = adaptiveDark(gray.g, w, h, win, 0.8);
    var comps = components(bin, w, h, 0.0002 * w * h, 0.03 * w * h);
    var cands = comps.filter(function (c) {
      var asp = c.bw / c.bh;
      return !c.edge && asp > 0.5 && asp < 2.0 && c.fill > 0.42 && c.aniso < 1.8;
    });
    var q = pickMarkers(cands, w, h);
    if (!q) return { ok: false, reason: 'markers', message: 'لم أجد مربعات الزوايا الأربعة. صوّر الورقة كاملة بحيث تظهر الزوايا كلها وبإضاءة متساوية.' };

    /* الحلقة: مركزها أبيض */
    q.forEach(function (p) {
      var cnt = 0, tot = 0, cx = Math.round(p.cx), cy = Math.round(p.cy);
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) { tot++; if (bin[(cy + dy) * w + cx + dx]) cnt++; }
      p.hole = cnt / tot < 0.3;
    });
    var holes = q.filter(function (p) { return p.hole; }).length;
    if (holes === 0) return { ok: false, reason: 'markers', message: 'لم أجد مربعات الزوايا الأربعة. صوّر الورقة كاملة بحيث تظهر الزوايا كلها وبإضاءة متساوية.' };
    if (holes > 1) return { ok: false, reason: 'orient', message: 'تعذّر تحديد اتجاه الورقة. تأكد أن الزاوية السفلية اليمنى (المربع المجوّف) ظاهرة بوضوح.' };
    var r = q.findIndex(function (p) { return p.hole; });
    var BR = q[r], BL = q[(r + 1) % 4], TL = q[(r + 2) % 4], TR = q[(r + 3) % 4];
    var M = g.markers;
    var src = [TL, TR, BR, BL].map(function (p) { return [p.cx, p.cy]; });
    var dst = [M.TL, M.TR, M.BR, M.BL].map(function (m) { return [m[0] * S, m[1] * S]; });
    var H = homography(src, dst);
    var wp = warp(gray, H);

    var rmm = g.bubbleD / 2;
    /* موضع كل صف: بحث محلي ثم تنعيم بوسيط الصفوف المجاورة في العمود نفسه */
    var rawOff = g.items.map(function (it) { return refineRow(wp, it.cx, it.cy, rmm, 1.2, 1.5, DX, DY); });
    var off = g.items.map(function (it, ii) {
      var col = Math.floor(ii / g.rows), lo = col * g.rows, hi = Math.min(g.items.length - 1, lo + g.rows - 1);
      return { dx: median3(rawOff.map(function (o) { return o.dx; }), ii, lo, hi), dy: median3(rawOff.map(function (o) { return o.dy; }), ii, lo, hi) };
    });
    var scores = g.items.map(function (it, ii) { return rowScore(wp, it.cx, it.cy, rmm, 1.2, 1.5, DX + off[ii].dx, DY + off[ii].dy); });
    var sorted2 = scores.slice().sort(function (a, b) { return a - b; });
    var align = sorted2[sorted2.length >> 1], alignMin = sorted2[Math.floor(sorted2.length * 0.15)];
    var maxOff = 0; off.forEach(function (o) { maxOff = Math.max(maxOff, Math.hypot(o.dx, o.dy)); });
    var items = g.items.map(function (it, ii) {
      return { n: it.n, d: it.cx.map(function (x) { return darkness(wp, x + DX + off[ii].dx, it.cy + DY + off[ii].dy, rmm); }) };
    });
    var all = []; items.forEach(function (it) { it.d.forEach(function (v) { all.push(v); }); });
    var ot = otsu(all);
    var low = all.slice().sort(function (a, b) { return a - b; }).slice(0, Math.floor(all.length * 0.6));
    var mu0 = 0, sd0 = 0;
    low.forEach(function (v) { mu0 += v; }); mu0 /= low.length;
    low.forEach(function (v) { sd0 += (v - mu0) * (v - mu0); }); sd0 = Math.sqrt(sd0 / low.length);
    var thr = Math.max(0.16, Math.min(0.40, mu0 + 4 * sd0 + 0.04));

    var flagged = [], blank = 0, answers = [];
    items.forEach(function (it) {
      var marked = [], amb = [];
      it.d.forEach(function (v, k) { if (v >= thr) marked.push(k); else if (v >= 0.6 * thr) amb.push(k); });
      var ans = 0, st = 'ok', note = '';
      if (marked.length === 1) {
        ans = marked[0] + 1;
        var md = it.d[marked[0]];
        if (md < thr + 0.04) { st = 'review'; note = 'تظليل باهت'; }
        else if (amb.some(function (k) { return it.d[k] > 0.5 * md; })) { st = 'review'; note = 'أثر تظليل آخر'; }
      } else if (marked.length >= 2) {
        marked.sort(function (a, b) { return it.d[b] - it.d[a]; });
        if (it.d[marked[0]] >= 2.5 * it.d[marked[1]] && it.d[marked[0]] >= 0.4) { ans = marked[0] + 1; note = 'أثر محو'; }
        else if (it.d[marked[0]] >= 1.5 * it.d[marked[1]]) { ans = marked[0] + 1; st = 'review'; note = 'تظليلان، اخترت الأغمق'; }
        else { ans = 0; st = 'review'; note = 'تظليلان متقاربان'; }
      } else {
        if (amb.length) { st = 'review'; note = 'تظليل خفيف جدًا'; if (amb.length === 1) ans = amb[0] + 1; }
        else { st = 'blank'; blank++; }
      }
      it.ans = ans; it.status = st; it.note = note;
      if (st === 'review') flagged.push(it.n);
      answers.push(ans);
    });

    /* رقم الطالب: ثلاثة صفوف */
    var idRows = g.id.ys.map(function (y) {
      var o2 = refineRow(wp, g.id.xs, y, g.id.r, 0.8, 1.1, DX, DY);
      var ds = g.id.xs.map(function (x) { return darkness(wp, x + DX + o2.dx, y + DY + o2.dy, g.id.r); });
      var mk = []; ds.forEach(function (v, k) { if (v >= thr) mk.push(k); });
      return { d: ds, digit: mk.length === 1 ? mk[0] : null, count: mk.length };
    });
    var idNo = idRows.every(function (r2) { return r2.digit !== null; }) ? idRows[0].digit * 100 + idRows[1].digit * 10 + idRows[2].digit : null;

    /* النموذج: صف واحد (يُرسم فقط حين تكون الورقة لاختبار متعدد النماذج). idx: 0..k-1، -1 بلا تظليل، -2 تظليلان أو أكثر */
    var formIdx;
    if (g.form) {
      var o3 = refineRow(wp, g.form.xs, g.form.y, g.form.r, 0.8, 1.1, DX, DY);
      var fd = g.form.xs.map(function (x) { return darkness(wp, x + DX + o3.dx, g.form.y + DY + o3.dy, g.form.r); });
      var fm = []; fd.forEach(function (v, k) { if (v >= thr) fm.push(k); });
      formIdx = fm.length === 1 ? fm[0] : (fm.length ? -2 : -1);
    }

    /* وضوح الصورة: متوسط تدرّج الحواف في منطقة الفقاعات */
    var sharp = 0, cnt = 0;
    for (var y = (g.areaTop * S) | 0; y < (g.areaBottom * S) | 0; y += 3) for (var x = 40; x < wp.w - 40; x += 3) {
      var i0 = y * wp.w + x; sharp += Math.abs(wp.g[i0 + 1] - wp.g[i0 - 1]) + Math.abs(wp.g[i0 + wp.w] - wp.g[i0 - wp.w]); cnt++;
    }
    sharp = sharp / Math.max(1, cnt);

    return { ok: true, items: items, answers: answers, flagged: flagged, blank: blank, id: idNo, idRows: idRows, form: formIdx,
             thr: thr, sep: ot.sep, sharp: sharp, align: align, alignMin: alignMin, maxOff: maxOff, warped: wp, geom: g };
  }

  /* مقطع صغير لصف فقرة من الصورة المصحَّحة لعرضه عند المراجعة */
  function cropItem(res, i) {
    var g = res.geom, it = g.items[i], wp = res.warped;
    var x0 = Math.max(0, Math.floor((it.cx[3] - g.optPitch * 0.7) * S)), x1 = Math.min(wp.w, Math.ceil((it.numX + 5) * S));
    var hh = Math.min(g.rowPitch, 9), y0 = Math.max(0, Math.floor((it.cy - hh / 2) * S)), y1 = Math.min(wp.h, Math.ceil((it.cy + hh / 2) * S));
    var w = x1 - x0, h = y1 - y0, c = mkCanvas(w, h), ctx = c.getContext('2d'), im = ctx.createImageData(w, h);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var v = wp.g[(y0 + y) * wp.w + x0 + x], o = (y * w + x) * 4; im.data[o] = im.data[o + 1] = im.data[o + 2] = v; im.data[o + 3] = 255;
    }
    ctx.putImageData(im, 0, 0);
    return c;
  }

  /* معاينة الورقة المصحَّحة مع علامات ما قُرئ: أخضر مقروء، برتقالي للمراجعة */
  function overlay(res, width) {
    var wp = res.warped, g = res.geom, k = width / wp.w, w = width, h = Math.round(wp.h * k);
    var c = mkCanvas(w, h), ctx = c.getContext('2d'), full = mkCanvas(wp.w, wp.h), fctx = full.getContext('2d'), im = fctx.createImageData(wp.w, wp.h);
    for (var i = 0, j = 0; j < wp.g.length; i += 4, j++) { var v = wp.g[j]; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
    fctx.putImageData(im, 0, 0);
    ctx.drawImage(full, 0, 0, w, h);
    ctx.lineWidth = Math.max(1.5, 0.5 * S * k * 3);
    res.items.forEach(function (it, ii) {
      var gi = g.items[ii];
      if (it.ans) {
        ctx.strokeStyle = it.status === 'review' ? '#E07B00' : '#0E8F4F';
        ctx.beginPath(); ctx.arc(gi.cx[it.ans - 1] * S * k, gi.cy * S * k, (g.bubbleD / 2 + 0.7) * S * k, 0, 6.2832); ctx.stroke();
      } else if (it.status === 'review') {
        ctx.strokeStyle = '#E07B00'; ctx.strokeRect((gi.cx[3] - 3) * S * k, (gi.cy - 3) * S * k, (gi.cx[0] - gi.cx[3] + 6) * S * k, 6 * S * k);
      }
    });
    return c;
  }

  var api = { scan: scan, cropItem: cropItem, overlay: overlay, SCALE: S,
              _i: { grayFrom: grayFrom, adaptiveDark: adaptiveDark, components: components, pickMarkers: pickMarkers } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OMR = api;
})(typeof window !== 'undefined' ? window : this);
