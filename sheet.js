/* sheet.js — هندسة ورقة الإجابة (بالملّيمتر) ورسمها. الماسح omr.js يقرأ الهندسة نفسها. */
(function (root) {
  'use strict';

  var LET = ['أ', 'ب', 'ج', 'د'], FLET = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح'];

  /* مراكز مربعات الزوايا بالملّيمتر: TL TR BR(الحلقة) BL */
  var MARKERS = { TL: [13, 13], TR: [197, 13], BR: [197, 284], BL: [13, 284] };

  /* k = عدد النماذج (2..8): يُضاف صف «النموذج» فقط حين k > 1، فتبقى الأوراق القديمة بلا نموذج مطابقة للهندسة السابقة */
  function geom(n, nforms) {
    n = Math.max(1, Math.min(100, n | 0)); nforms = (nforms | 0) > 1 ? Math.min(8, nforms | 0) : 1;
    var cols = Math.max(2, Math.ceil(n / 25)), rows = Math.ceil(n / cols);
    var x0 = 14, x1 = 196, y0 = 64, y1 = 273;
    var colW = (x1 - x0) / cols, rp = Math.min(10.5, (y1 - y0) / rows);
    var pitch = Math.min(10, (colW - 14) / 4);
    var d = Math.min(6.4, Math.round(pitch * 0.62 * 100) / 100);
    var items = [];
    for (var i = 0; i < n; i++) {
      var c = Math.floor(i / rows), r = i % rows, xr = x1 - c * colW;
      items.push({ n: i + 1, numX: xr - 5, cy: y0 + rp * (r + 0.5),
                   cx: [0, 1, 2, 3].map(function (k) { return xr - 12 - k * pitch; }) });
    }
    var id = { r: 2.3, xs: [], ys: [31, 38, 45] };
    for (var k = 0; k < 10; k++) id.xs.push(24 + k * 6.2);
    var form = null;
    if (nforms > 1) { form = { k: nforms, y: 46.6, r: 2.3, xs: [] }; for (var j = 0; j < nforms; j++) form.xs.push(169 - j * 7.4); }
    return { page: [210, 297], markers: MARKERS, cols: cols, rows: rows, colW: colW, rowPitch: rp,
             optPitch: pitch, bubbleD: d, items: items, id: id, form: form, areaTop: y0, areaBottom: y1, n: n };
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function svgSheet(g, stu) {
    var s = '<svg viewBox="0 0 210 297" width="210mm" height="297mm" xmlns="http://www.w3.org/2000/svg" font-family="IBM Plex Sans Arabic, Segoe UI, Tahoma, DejaVu Sans, sans-serif">';
    s += '<rect x="8" y="8" width="10" height="10" fill="#000"/><rect x="192" y="8" width="10" height="10" fill="#000"/><rect x="8" y="279" width="10" height="10" fill="#000"/>';
    s += '<rect x="192" y="279" width="10" height="10" fill="#000"/><rect x="195" y="282" width="4" height="4" fill="#fff"/>';
    var digs = stu ? [Math.floor(stu.no / 100) % 10, Math.floor(stu.no / 10) % 10, stu.no % 10] : [-1, -1, -1];
    g.id.ys.forEach(function (y, ri) {
      g.id.xs.forEach(function (x, k) {
        var filled = digs[ri] === k;
        s += '<circle cx="' + x + '" cy="' + y + '" r="' + g.id.r + '" fill="' + (filled ? '#000' : 'none') + '" stroke="#1a1a1a" stroke-width=".35"/>';
        if (!filled) s += '<text x="' + x + '" y="' + y + '" font-size="2.6" fill="#555" text-anchor="middle" dy=".35em">' + k + '</text>';
      });
    });
    if (g.form) {
      g.form.xs.forEach(function (x, j) {
        var filled = stu && stu.form === j;
        s += '<circle cx="' + x + '" cy="' + g.form.y + '" r="' + g.form.r + '" fill="' + (filled ? '#000' : 'none') + '" stroke="#1a1a1a" stroke-width=".35"/>';
        if (!filled) s += '<text x="' + x + '" y="' + g.form.y + '" font-size="2.4" fill="#555" text-anchor="middle" dy=".35em">' + FLET[j] + '</text>';
      });
    }
    var rr = g.bubbleD / 2;
    for (var c = 0; c < g.cols; c++) {
      var xr = 196 - c * g.colW;
      for (var r = 5; r < g.rows; r += 5) {
        var y = g.areaTop + g.rowPitch * r;
        s += '<line x1="' + (xr - g.colW + 2) + '" x2="' + (xr - 1) + '" y1="' + y + '" y2="' + y + '" stroke="#BBB" stroke-width=".15"/>';
      }
    }
    g.items.forEach(function (it) {
      s += '<text x="' + it.numX + '" y="' + it.cy + '" font-size="3.3" font-weight="700" fill="#111" text-anchor="middle" dy=".35em">' + it.n + '</text>';
      it.cx.forEach(function (x, k) {
        s += '<circle cx="' + x.toFixed(2) + '" cy="' + it.cy.toFixed(2) + '" r="' + rr + '" fill="none" stroke="#1a1a1a" stroke-width=".35"/>';
        s += '<text x="' + x.toFixed(2) + '" y="' + it.cy.toFixed(2) + '" font-size="' + (g.bubbleD * 0.5).toFixed(2) + '" fill="#666" text-anchor="middle" dy=".35em">' + LET[k] + '</text>';
      });
    });
    return s + '</svg>';
  }

  function field(label, val, right, top, width) {
    return '<div class="fld" style="right:' + right + 'mm;top:' + top + 'mm;width:' + width + 'mm"><span class="l">' + label + ':</span><span class="v">' + esc(val) + '</span></div>';
  }

  /* o: {title, subject, cls, n}  stu: {no, name} أو null */
  function sheetHtml(o, g, stu) {
    var h = '<section class="sheet">' + svgSheet(g, stu);
    h += '<div class="t" style="left:22mm;right:22mm;top:9.4mm;text-align:center;font-size:15pt;font-weight:700">' + esc(o.title) + '</div>';
    h += '<div class="t" style="left:22mm;right:22mm;top:17.6mm;text-align:center;font-size:10pt">' + esc(o.subject) + (o.subject ? ' · ' : '') + o.n + ' فقرة</div>';
    h += field('اسم الطالب', stu ? stu.name : '', 20, 27, 88);
    h += field('الصف والشعبة', o.cls, 20, 36.5, 52);
    h += field('التاريخ', '', 76, 36.5, 32);
    h += '<div class="t" style="left:22mm;width:74mm;top:22.2mm;text-align:center;font-size:8.5pt;font-weight:600">رقم الطالب</div>';
    ['المئات', 'العشرات', 'الآحاد'].forEach(function (t, i) {
      h += '<div class="t" style="right:112mm;width:16mm;text-align:right;font-size:8pt;top:' + (g.id.ys[i] - 1.9) + 'mm">' + t + '</div>';
    });
    if (g.form) h += '<div class="t" style="right:20mm;width:15mm;text-align:right;font-size:8.5pt;font-weight:600;top:' + (g.form.y - 2) + 'mm">النموذج</div>';
    h += '<div class="t" style="left:22mm;right:22mm;top:51.6mm;text-align:center;font-size:8.5pt;color:#333">ظلّل الدائرة كاملة بقلم أسود أو رصاص غامق · لا تضع (✓) أو (✗) · عند التغيير امحُ تمامًا</div>';
    h += '<div class="t" style="left:22mm;right:22mm;top:282.6mm;text-align:center;font-size:7.5pt;color:#444">ورقة إجابة · ' + o.n + ' فقرة · لا تثنِ الورقة ولا تكتب قرب المربعات السوداء</div>';
    return h + '</section>';
  }

  var api = { geom: geom, svgSheet: svgSheet, sheetHtml: sheetHtml, MARKERS: MARKERS, esc: esc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Sheet = api;
})(typeof window !== 'undefined' ? window : this);
