/* app.js — واجهة «تحليل». بيانات المعلم كلها في localStorage على جهازه، ولا شيء يُرسَل إلى أي خادم. */
(function () {
  'use strict';
  var APP_VERSION = 4;
  var KEY = 'tahlil.db.v1';
  var LET = ['—', 'أ', 'ب', 'ج', 'د'];
  var esc = Sheet.esc;
  var $ = function (s, r) { return (r || document).querySelector(s); };

  /* ---------- التخزين ---------- */
  function emptyDb() { return { v: 1, set: { teacher: '', school: '' }, tests: [] }; }
  function load() {
    try { var d = JSON.parse(localStorage.getItem(KEY)); if (d && Array.isArray(d.tests)) { d.set = d.set || { teacher: '', school: '' }; return d; } } catch (e) {}
    return emptyDb();
  }
  var db = load();
  var memOnly = false;
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); memOnly = false; }
    catch (e) { memOnly = true; toast('تعذّر الحفظ على الجهاز. صدّر نسخة احتياطية الآن.'); }
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  var toastT;
  function toast(msg) {
    var t = $('#toast'); t.innerHTML = '<span>' + esc(msg) + '</span>'; t.style.display = 'flex';
    clearTimeout(toastT); toastT = setTimeout(function () { t.style.display = 'none'; }, 3200);
  }
  function fmt(v, d) { return (v === null || v === undefined || isNaN(v)) ? '—' : Number(v).toFixed(d === undefined ? 2 : d); }
  function pct(v) { return (v === null || v === undefined || isNaN(v)) ? '—' : Math.round(v * 100) + '%'; }
  function download(name, blob) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function safeName(s) { return String(s || 'اختبار').replace(/[\\\/:*?"<>|]/g, '_').slice(0, 60); }

  /* ---------- نموذج الاختبار ---------- */
  function newTest() {
    var n = 30;
    return { id: uid(), title: 'اختبار جديد', subject: '', cls: '', n: n, total: n, key: zeros(n), outcomes: [], students: [], created: Date.now() };
  }
  function zeros(n) { var a = []; for (var i = 0; i < n; i++) a.push(0); return a; }
  function getTest(id) { for (var i = 0; i < db.tests.length; i++) if (db.tests[i].id === id) return db.tests[i]; return null; }
  function resize(t, n) {
    n = Math.max(1, Math.min(100, n | 0));
    var key = zeros(n); for (var i = 0; i < Math.min(n, t.key.length); i++) key[i] = t.key[i];
    t.students.forEach(function (s) {
      if (!s.ans) return;
      var a = zeros(n); for (var j = 0; j < Math.min(n, s.ans.length); j++) a[j] = s.ans[j]; s.ans = a;
    });
    t.outcomes.forEach(function (o) { o.items = o.items.filter(function (i) { return i < n; }); });
    if (t.total === t.n) t.total = n;
    t.key = key; t.n = n;
  }
  function entered(t) { return t.students.filter(function (s) { return s.ans && s.ans.length === t.n; }).length; }
  function keyed(t) { return t.key.filter(function (k) { return k > 0; }).length; }
  function nextNo(t) { var u = {}; t.students.forEach(function (s) { u[s.no] = 1; }); for (var i = 1; i < 1000; i++) if (!u[i]) return i; return 999; }
  function findStu(t, no) { for (var i = 0; i < t.students.length; i++) if (t.students[i].no === no) return t.students[i]; return null; }
  function sortStu(t) { t.students.sort(function (a, b) { return a.no - b.no; }); }

  /* «1-5, 9» ⇄ [0,1,2,3,4,8] */
  function parseRange(str, n) {
    var out = {}, bad = false;
    String(str || '').replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); }).split(/[,،;\s]+/).forEach(function (p) {
      if (!p) return;
      var m = p.match(/^(\d+)(?:[-–—](\d+))?$/);
      if (!m) { bad = true; return; }
      var a = +m[1], b = m[2] ? +m[2] : a; if (a > b) { var x = a; a = b; b = x; }
      if (a < 1 || b > n) { bad = true; }
      for (var i = Math.max(1, a); i <= Math.min(n, b); i++) out[i - 1] = 1;
    });
    return { items: Object.keys(out).map(Number).sort(function (a, b) { return a - b; }), bad: bad };
  }
  function rangeStr(items) {
    var parts = [], i = 0;
    while (i < items.length) {
      var j = i; while (j + 1 < items.length && items[j + 1] === items[j] + 1) j++;
      parts.push(j > i ? (items[i] + 1) + '-' + (items[j] + 1) : '' + (items[i] + 1)); i = j + 1;
    }
    return parts.join(', ');
  }

  /* ---------- التوجيه ---------- */
  var ui = { atab: 'sum', scans: [], openItem: null, sortRank: false, entryMode: 'scan' };
  function route() { var h = location.hash.replace(/^#\/?/, '').split('/'); return { p: h[0] || '', id: h[1] || '', tab: h[2] || '' }; }
  function go(h) { if (location.hash === h) render(); else location.hash = h; }
  window.addEventListener('hashchange', function () { render(); window.scrollTo(0, 0); });

  var cur = null; /* الاختبار المفتوح */
  function render() {
    clearInterval(ui.poll);
    var r = route(), app = $('#app');
    if (r.p === 'bank') {
      cur = null;
      app.innerHTML = topbar('بنك الأسئلة', '#/', true) + '<div class="wrap" id="main"></div>';
      viewBank($('#main'));
    } else if (r.p === 't') {
      cur = getTest(r.id);
      if (!cur) { go('#/'); return; }
      var tab = r.tab || (keyed(cur) >= 2 && entered(cur) >= 2 ? 'analysis' : keyed(cur) < 2 ? 'setup' : 'entry');
      app.innerHTML = topbar(cur.title, '#/', true) + nav(tab) + '<div class="wrap" id="main"></div>';
      var m = $('#main');
      if (tab === 'setup') viewSetup(m); else if (tab === 'entry') viewEntry(m); else if (tab === 'analysis') viewAnalysis(m); else if (tab === 'sheet') viewSheet(m); else if (tab === 'online') viewOnline(m); else viewSetup(m);
    } else {
      cur = null;
      app.innerHTML = topbar('تحليل الاختبارات', null) + '<div class="wrap" id="main"></div>';
      viewHome($('#main'));
    }
  }
  function topbar(title, back) {
    return '<header class="top"><div class="in">' + (back ? '<button data-act="back" aria-label="رجوع إلى قائمة الاختبارات">‹ الاختبارات</button>' : '') +
      '<h1>' + esc(title) + '</h1></div></header>';
  }
  function nav(tab) {
    var items = [['setup', 'الإعداد', '⚙'], ['entry', 'الإدخال', '✎'], ['analysis', 'التحليل', '▤'], ['sheet', 'ورقة الإجابة', '▦'], ['online', 'إلكتروني', '◉']];
    return '<nav class="nav" aria-label="أقسام الاختبار">' + items.map(function (x) {
      return '<button data-act="tab" data-tab="' + x[0] + '"' + (tab === x[0] ? ' aria-current="page"' : '') + '><span class="ic" aria-hidden="true">' + x[2] + '</span>' + x[1] + '</button>';
    }).join('') + '</nav>';
  }

  /* ---------- الرئيسية ---------- */
  function viewHome(m) {
    var h = '<div class="btns"><button class="btn" data-act="new">+ اختبار جديد</button>' +
      '<button class="btn alt" data-act="bank">بنك الأسئلة (من دوسياتي)</button>' +
      '<button class="btn alt" data-act="backup">نسخة احتياطية</button>' +
      '<label class="btn alt" style="display:inline-flex;align-items:center;margin:0">استعادة نسخة<input type="file" accept=".json,application/json" data-act="restore" hidden></label></div>';
    if (!db.tests.length) h += '<div class="card empty"><h2>لا اختبارات بعد</h2><p>أنشئ اختبارًا، أدخل مفتاح الإجابة، ثم صوّر أوراق الطلبة أو الصق إجاباتهم، فيظهر التحليل كاملًا.</p></div>';
    else {
      h += '<div class="tl">' + db.tests.slice().sort(function (a, b) { return b.created - a.created; }).map(function (t) {
        return '<div class="tcard" role="button" tabindex="0" data-act="open" data-id="' + t.id + '"><div class="m"><b>' + esc(t.title) + '</b><span>' +
          esc([t.subject, t.cls].filter(Boolean).join(' · ')) + (t.subject || t.cls ? ' · ' : '') + t.n + ' فقرة · ' + entered(t) + ' من ' + t.students.length + ' طالبًا أُدخلت إجاباتهم</span></div>' +
          '<button class="btn alt sm" data-act="dup" data-id="' + t.id + '">نسخ</button><button class="btn danger sm" data-act="del" data-id="' + t.id + '">حذف</button></div>';
      }).join('') + '</div>';
    }
    h += '<div class="card"><h2>بيانات الترويسة</h2><p class="hint">تظهر في التقرير المطبوع فقط.</p><div class="grid g2" style="margin-top:8px"><div><label for="st">المعلم</label><input id="st" type="text" data-set="teacher" value="' + esc(db.set.teacher) + '"></div>' +
      '<div><label for="ss">المدرسة</label><input id="ss" type="text" data-set="school" value="' + esc(db.set.school) + '"></div></div></div>' +
      '<div class="card"><h2>عن التطبيق</h2><p class="hint">الإصدار التجريبي ' + APP_VERSION + '. كل البيانات محفوظة على هذا الجهاز فقط وتعمل دون إنترنت. المتصفح قد يمسح البيانات إن نظّفت بيانات الموقع، فاحتفظ بنسخة احتياطية بعد كل إدخال مهم. التحليل والتقرير يستعملان نتائج لا تُقبل إلا بعد مراجعتك لها.</p></div>';
    m.innerHTML = h;
  }

  /* ---------- الإعداد ---------- */
  function rosterText(t) { return t.students.map(function (s) { return s.no + ', ' + s.name; }).join('\n'); }
  function viewSetup(m) {
    var t = cur;
    var h = '<div class="card"><h2>بيانات الاختبار</h2><div class="grid g2">' +
      '<div style="grid-column:1/-1"><label for="f-title">عنوان الاختبار</label><input id="f-title" type="text" data-f="title" value="' + esc(t.title) + '"></div>' +
      '<div><label for="f-subject">المادة</label><input id="f-subject" type="text" data-f="subject" value="' + esc(t.subject) + '"></div>' +
      '<div><label for="f-cls">الصف والشعبة</label><input id="f-cls" type="text" data-f="cls" value="' + esc(t.cls) + '"></div>' +
      '<div><label for="f-n">عدد الفقرات (1–100)</label><input id="f-n" type="number" inputmode="numeric" min="1" max="100" value="' + t.n + '" data-f="n"' + (t.bank ? ' disabled' : '') + '></div>' +
      '<div><label for="f-total">العلامة الكلية</label><input id="f-total" type="number" inputmode="decimal" min="1" value="' + t.total + '" data-f="total"></div>' +
      '<div><label for="f-min">زمن الاختبار بالدقائق (اختياري)</label><input id="f-min" type="number" inputmode="numeric" min="1" value="' + (t.minutes || '') + '" data-f="minutes"></div></div>' +
      '<div class="chips" aria-label="عدد فقرات شائع">' + [10, 20, 30, 40, 50, 100].map(function (n) { return '<button class="chip" data-act="setn" data-n="' + n + '" aria-pressed="' + (t.n === n) + '"' + (t.bank ? ' disabled' : '') + '>' + n + '</button>'; }).join('') + '</div>' +
      '<p class="hint">علامة كل فقرة = العلامة الكلية ÷ عدد الفقرات التي لها مفتاح.</p>' + (t.bank ? '<div class="notice ok">اختبار من بنك الأسئلة: عدد الفقرات ثابت (' + t.n + ') وفقراته ومفتاحه ونتاجاته مأخوذة من البنك. يمكنك تعديل المفتاح إن وجدت فيه خطأً.</div>' : '') + '</div>';
    h += '<div class="card"><h2>مفتاح الإجابة</h2><label for="f-key">اكتب المفتاح متتابعًا (أ ب ج د) أو (A B C D) أو (1 2 3 4)</label>' +
      '<textarea id="f-key" data-f="keystr" placeholder="مثال: أبجدأبجد...">' + esc(t.key.map(function (k) { return k ? LET[k] : '-'; }).join('')) + '</textarea>' +
      '<div id="keyinfo"></div><div class="keygrid" id="keygrid"></div><p class="hint">اضغط على أي خلية لتغيير إجابتها بالتتابع: أ ← ب ← ج ← د ← فارغ. الفقرة بلا مفتاح لا تدخل في التحليل.</p></div>';
    h += '<div class="card"><h2>النتاجات (اختياري)</h2><p class="hint">اربط كل نتاج بأرقام فقراته، مثل ‎1-5, 9‎، فيظهر لكل طالب نسبة إتقانه لكل نتاج (الإتقان من 60%).</p><div id="outs"></div><div class="btns"><button class="btn alt sm" data-act="addout">+ نتاج</button></div></div>';
    h += '<div class="card"><h2>قائمة الطلبة</h2><label for="f-roster">سطر لكل طالب: «الرقم، الاسم» أو الاسم وحده (يُرقَّم تلقائيًا). الرقم من 1 إلى 999 ويُظلَّل على الورقة.</label>' +
      '<textarea id="f-roster" style="min-height:160px" placeholder="1, أحمد محمد&#10;2, سارة علي">' + esc(rosterText(t)) + '</textarea>' +
      '<div class="btns"><button class="btn" data-act="roster">تحديث القائمة</button>' +
      (db.tests.length > 1 ? '<select id="copyfrom" style="max-width:260px" aria-label="نسخ قائمة طلبة من اختبار سابق"><option value="">نسخ القائمة من اختبار سابق…</option>' +
        db.tests.filter(function (x) { return x.id !== t.id && x.students.length; }).map(function (x) { return '<option value="' + x.id + '">' + esc(x.title) + ' (' + x.students.length + ')</option>'; }).join('') + '</select>' : '') + '</div>' +
      '<div id="rosterinfo" class="hint">' + t.students.length + ' طالبًا في القائمة.</div></div>';
    m.innerHTML = h;
    drawKey(); drawOuts();
  }
  function drawKey() {
    var t = cur, g = $('#keygrid'); if (!g) return;
    if (g.children.length === t.n) {
      t.key.forEach(function (k, i) { var b = g.children[i]; b.className = 'cell' + (k ? ' on' : ''); b.querySelector('b').textContent = k ? LET[k] : '·'; b.setAttribute('aria-label', 'الفقرة ' + (i + 1) + ': ' + (k ? LET[k] : 'بلا مفتاح')); });
      var c0 = keyed(t); $('#keyinfo').innerHTML = '<p class="hint">' + c0 + ' من ' + t.n + ' فقرة لها مفتاح.</p>' + (c0 < t.n ? '<div class="notice">' + (t.n - c0) + ' فقرة بلا مفتاح ولن تُحلَّل.</div>' : '');
      return;
    }
    g.innerHTML = t.key.map(function (k, i) { return '<button class="cell' + (k ? ' on' : '') + '" data-act="keycell" data-i="' + i + '" aria-label="الفقرة ' + (i + 1) + ': ' + (k ? LET[k] : 'بلا مفتاح') + '"><small>' + (i + 1) + '</small><b>' + (k ? LET[k] : '·') + '</b></button>'; }).join('');
    var c = keyed(t);
    $('#keyinfo').innerHTML = '<p class="hint">' + c + ' من ' + t.n + ' فقرة لها مفتاح.</p>' + (c < t.n ? '<div class="notice">' + (t.n - c) + ' فقرة بلا مفتاح ولن تُحلَّل.</div>' : '');
  }
  function drawOuts() {
    var t = cur, o = $('#outs'); if (!o) return;
    o.innerHTML = t.outcomes.length ? t.outcomes.map(function (x, i) {
      return '<div class="grid g2" style="grid-template-columns:2fr 1fr auto;align-items:end;margin-top:8px"><div><label for="on' + i + '">اسم النتاج</label><input id="on' + i + '" type="text" data-out="name" data-i="' + i + '" value="' + esc(x.name) + '"></div>' +
        '<div><label for="oi' + i + '">الفقرات</label><input id="oi' + i + '" type="text" data-out="items" data-i="' + i + '" value="' + esc(rangeStr(x.items)) + '"></div>' +
        '<button class="btn danger sm" data-act="delout" data-i="' + i + '" aria-label="حذف النتاج">حذف</button></div>';
    }).join('') : '<p class="hint">لا نتاجات مضافة.</p>';
  }
  function parseRoster(t, text) {
    var lines = String(text).split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean), used = {}, rows = [], pending = [], warn = [];
    lines.forEach(function (ln) {
      var m = ln.match(/^([0-9٠-٩]{1,3})\s*[,،;\t.\-–:]+\s*(.+)$/) || ln.match(/^([0-9٠-٩]{1,3})\s+(\S.*)$/);
      if (m) {
        var no = +String(m[1]).replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); });
        if (no >= 1 && no <= 999 && !used[no]) { used[no] = 1; rows.push({ no: no, name: m[2].trim() }); return; }
        warn.push('الرقم ' + no + ' مكرر أو خارج 1–999: أُعطي رقمًا جديدًا');
        pending.push(m[2].trim()); return;
      }
      pending.push(ln);
    });
    var k = 1;
    pending.forEach(function (name) { while (used[k]) k++; if (k > 999) return; used[k] = 1; rows.push({ no: k, name: name }); });
    rows.sort(function (a, b) { return a.no - b.no; });
    return { rows: rows, warn: warn };
  }
  function applyRoster(t, text) {
    var p = parseRoster(t, text), old = {};
    t.students.forEach(function (s) { old[s.no] = s; });
    var lost = t.students.filter(function (s) { return s.ans && !p.rows.some(function (r) { return r.no === s.no; }); }).length;
    if (lost && !confirm('سيُحذف ' + lost + ' طالبًا لديهم إجابات مدخلة لأنهم غير موجودين في القائمة الجديدة. متابعة؟')) return null;
    t.students = p.rows.map(function (r) { var o = old[r.no]; return o ? { no: r.no, name: r.name, ans: o.ans, absent: o.absent, src: o.src } : { no: r.no, name: r.name, ans: null, absent: false }; });
    save(); return p;
  }

  /* التقاط أحداث الإعداد */
  function onChange(e) {
    var el = e.target;
    if (el.dataset.set !== undefined) { db.set[el.dataset.set] = el.value; save(); return; }
    if (el.dataset.act === 'restore') { restoreFile(el.files[0]); el.value = ''; return; }
    if (el.dataset.bk) { bankChange(el); return; }
    if (el.dataset.o) { onlineChange(el); return; }
    if (!cur) return;
    var t = cur, f = el.dataset.f;
    if (f === 'title' || f === 'subject' || f === 'cls') { t[f] = el.value; save(); if (f === 'title') $('.top h1').textContent = el.value || 'اختبار'; }
    else if (f === 'n') {
      var n = Math.max(1, Math.min(100, parseInt(el.value, 10) || t.n)); el.value = n;
      if (n < t.n && t.students.some(function (s) { return s.ans; }) && !confirm('تقليل عدد الفقرات سيقص إجابات الطلبة المدخلة بعد الفقرة ' + n + '. متابعة؟')) { el.value = t.n; return; }
      resize(t, n); save(); $('#f-total').value = t.total; $('#f-key').value = t.key.map(function (k) { return k ? LET[k] : '-'; }).join(''); drawKey(); drawOuts();
      document.querySelectorAll('[data-act=setn]').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.dataset.n === n)); });
    } else if (f === 'total') { var v = parseFloat(el.value); if (v > 0) { t.total = v; save(); } else el.value = t.total; }
    else if (f === 'keystr') {
      var a = Stats.parseAnswers(el.value.replace(/[-–·_]/g, '0')), bad = 0;
      for (var i = 0; i < t.n; i++) t.key[i] = a[i] || 0;
      if (a.length > t.n) toast('زاد المفتاح عن عدد الفقرات (' + a.length + ') وأُهمل الباقي');
      el.value = t.key.map(function (k) { return k ? LET[k] : '-'; }).join(''); save(); drawKey();
    } else if (el.dataset.out) {
      var o = t.outcomes[+el.dataset.i];
      if (el.dataset.out === 'name') o.name = el.value;
      else { var r = parseRange(el.value, t.n); if (r.bad) toast('تحقق من الأرقام: يجب أن تكون بين 1 و ' + t.n); o.items = r.items; el.value = rangeStr(r.items); }
      save();
    } else if (el.id === 'copyfrom' && el.value) {
      var src = getTest(el.value); if (src) { $('#f-roster').value = rosterText(src); toast('نُسخت القائمة. اضغط «تحديث القائمة» للاعتماد'); }
      el.value = '';
    } else if (el.dataset.act === 'restore') { restoreFile(el.files[0]); el.value = ''; }
    else if (el.dataset.act === 'scanfile') { scanFiles(el.files); el.value = ''; }
    else if (el.dataset.act === 'impfile') { importFile(el.files[0]); el.value = ''; }
    else if (el.dataset.act === 'absent') { var s = findStu(t, +el.dataset.no); if (s) { s.absent = el.checked; save(); updateEntryHead(); el.closest('tr').classList.toggle('abs', el.checked); } }
  }

  /* ---------- الإدخال ---------- */
  function updateEntryHead() {
    var e = $('#ehead'); if (!e || !cur) return;
    var tot = cur.students.filter(function (s) { return !s.absent; }).length, n = entered(cur);
    e.innerHTML = '<b>' + n + '</b> من ' + tot + ' طالبًا حاضرًا أُدخلت إجاباتهم' + (!keyed(cur) ? ' · <span style="color:var(--rev)">لم يُدخل مفتاح الإجابة بعد</span>' : '') +
      '<div class="prog"><i style="width:' + (tot ? Math.round(100 * n / tot) : 0) + '%"></i></div>';
  }
  function stuOptions(t, selNo, withNew) {
    return '<option value="">اختر الطالب…</option>' + t.students.map(function (s) {
      return '<option value="' + s.no + '"' + (s.no === selNo ? ' selected' : '') + '>' + s.no + ' — ' + esc(s.name) + (s.ans ? ' (مُدخل)' : '') + '</option>';
    }).join('') + (withNew ? '<option value="add:' + withNew + '"' + (selNo === -1 ? ' selected' : '') + '>رقم ' + withNew + ' غير موجود في القائمة — يُضاف طالبًا جديدًا</option>' : '');
  }
  function viewEntry(m) {
    var t = cur;
    if (!t.students.length) { m.innerHTML = '<div class="card empty"><h2>أضف الطلبة أولًا</h2><p>من قسم «الإعداد» الصق قائمة الأسماء، ثم عُد هنا.</p><button class="btn" data-act="tab" data-tab="setup">الذهاب إلى الإعداد</button></div>'; return; }
    var md = ui.entryMode;
    var h = '<div class="card"><div id="ehead"></div><div class="subtabs" role="tablist">' + [['scan', 'مسح ورقة الإجابة'], ['paste', 'لصق أو استيراد'], ['grid', 'جدول الطلبة']].map(function (x) {
      return '<button class="chip" role="tab" data-act="emode" data-m="' + x[0] + '" aria-pressed="' + (md === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div></div>';
    if (md === 'scan') {
      h += '<div class="card"><h2>مسح أوراق الإجابة</h2><p class="hint">اطبع ورقة الإجابة من قسم «ورقة الإجابة»، وصوّر الورقة كاملة بحيث تظهر المربعات السوداء الأربعة، على سطح مستوٍ وبإضاءة متساوية بلا ظل. التطبيق يقرأ الرقم والإجابات ويعرض لك ما يحتاج مراجعة.</p>' +
        '<div class="btns"><label class="btn" style="display:inline-flex;align-items:center;margin:0">التقاط بالكاميرا<input type="file" accept="image/*" capture="environment" data-act="scanfile" hidden></label>' +
        '<label class="btn alt" style="display:inline-flex;align-items:center;margin:0">رفع صور (عدة صور)<input type="file" accept="image/*" multiple data-act="scanfile" hidden></label></div></div><div id="scans"></div>';
    } else if (md === 'paste') {
      h += '<div class="card"><h2>إدخال سريع لطالب</h2><div class="grid g2" style="grid-template-columns:1fr 2fr"><div><label for="qs">الطالب</label><select id="qs">' + stuOptions(t) + '</select></div>' +
        '<div><label for="qa">إجاباته متتابعة (' + t.n + ' فقرة)</label><input id="qa" type="text" dir="auto" placeholder="أبجدأ..."></div></div><div class="btns"><button class="btn" data-act="quick">حفظ</button></div><div id="qmsg"></div></div>' +
        '<div class="card"><h2>لصق جدول</h2><p class="hint">من إكسل: عمود للرقم أو الاسم ثم إجابات الفقرات في أعمدة (أو في خلية واحدة متتابعة). تُعرف الصفوف بالرقم أولًا ثم بالاسم، والغريب يُضاف طالبًا جديدًا.</p>' +
        '<textarea id="pastebox" dir="auto" placeholder="1&#9;أ ب ج د أ ...&#10;سارة علي&#9;أبجدأ..."></textarea><div class="btns"><button class="btn" data-act="pastego">استيراد المُلصَق</button>' +
        '<label class="btn alt" style="display:inline-flex;align-items:center;margin:0">استيراد ملف Excel أو CSV<input type="file" accept=".xlsx,.xls,.csv,.txt" data-act="impfile" hidden></label></div><div id="pmsg"></div></div>';
    } else {
      var key = t.key;
      h += '<div class="card"><h2>جدول الإجابات</h2><p class="hint">اضغط الخلية لتغيير إجابة الطالب بالتتابع. الأخضر صحيح والأحمر خطأ (يحتاج مفتاحًا).</p><div class="mx" id="mx"><table><thead><tr><th class="nm">الطالب</th><th>غائب</th>' +
        key.map(function (k, i) { return '<th>' + (i + 1) + '</th>'; }).join('') + '</tr></thead><tbody>' + t.students.map(function (s) {
          return '<tr class="' + (s.absent ? 'abs' : '') + '"><td class="nm" title="' + esc(s.name) + '">' + s.no + ' ' + esc(s.name) + '</td><td><input type="checkbox" data-act="absent" data-no="' + s.no + '"' + (s.absent ? ' checked' : '') + ' aria-label="غائب: ' + esc(s.name) + '" style="width:20px;height:20px"></td>' +
            key.map(function (k, i) { return cellHtml(s, i, k); }).join('') + '</tr>'; }).join('') + '</tbody></table></div></div>';
    }
    m.innerHTML = h; updateEntryHead(); if (md === 'scan') drawScans();
  }
  function cellHtml(s, i, k) {
    var v = s.ans ? s.ans[i] : -1, cls = v < 0 ? '' : (k ? (v === k ? 'right' : 'wrong') : '');
    return '<td><button class="mc ' + cls + '" data-act="mcell" data-no="' + s.no + '" data-i="' + i + '" aria-label="' + esc(s.name) + '، الفقرة ' + (i + 1) + '">' + (v < 0 ? '·' : (v ? LET[v] : '—')) + '</button></td>';
  }
  var saveT;
  function saveSoon() { clearTimeout(saveT); saveT = setTimeout(save, 400); }
  function cycleCell(btn) {
    var s = findStu(cur, +btn.dataset.no), i = +btn.dataset.i; if (!s) return;
    if (!s.ans) s.ans = zeros(cur.n);
    s.ans[i] = (s.ans[i] + 1) % 5; s.src = s.src || 'manual';
    var v = s.ans[i], k = cur.key[i];
    btn.textContent = v ? LET[v] : '—'; btn.className = 'mc ' + (k ? (v === k ? 'right' : 'wrong') : '');
    saveSoon(); updateEntryHead();
  }

  /* ---------- لصق واستيراد ---------- */
  function cellAns(c) {
    c = String(c == null ? '' : c).trim();
    if (c === '' || c === '-' || c === '–') return 0;
    if (c.length !== 1) return null;
    var v = Stats.normChar(c); return (v || c === '0') ? v : null;
  }
  function rowToAns(cells, n) {
    cells = cells.map(function (c) { return String(c == null ? '' : c).trim(); });
    while (cells.length && cells[cells.length - 1] === '' && cells.length > n) cells.pop();
    if (cells.length >= n) {
      var tail = cells.slice(cells.length - n), a = tail.map(cellAns);
      if (a.every(function (v) { return v !== null; }) && a.some(function (v) { return v > 0; })) return { ident: cells.slice(0, cells.length - n).filter(Boolean).join(' '), ans: a };
    }
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i].replace(/[\s,،;|]/g, '');
      if (c.length === n && /^[أابجدإآABCDabcd1-4١-٤\-0]+$/.test(c)) {
        var a2 = c.split('').map(function (ch) { return ch === '-' ? 0 : Stats.normChar(ch); });
        return { ident: cells.filter(function (x, j) { return j !== i; }).filter(Boolean).join(' '), ans: a2 };
      }
    }
    return null;
  }
  function importRows(rows) {
    var t = cur, ok = 0, added = 0, skipped = [], over = 0;
    rows.forEach(function (cells) {
      if (!cells.some(function (c) { return String(c).trim(); })) return;
      var r = rowToAns(cells, t.n);
      if (!r) { skipped.push(cells.slice(0, 2).join(' ').slice(0, 24) || '(صف فارغ)'); return; }
      var id = r.ident.replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); }).trim(), s = null;
      if (/^\d{1,3}$/.test(id)) { s = findStu(t, +id); if (!s) { s = { no: +id, name: 'طالب ' + id, ans: null, absent: false }; t.students.push(s); added++; } }
      else if (id) {
        t.students.forEach(function (x) { if (!s && x.name.replace(/\s+/g, ' ').trim() === id.replace(/\s+/g, ' ')) s = x; });
        if (!s) { s = { no: nextNo(t), name: id, ans: null, absent: false }; t.students.push(s); added++; }
      } else {
        s = t.students.filter(function (x) { return !x.ans; })[0];
        if (!s) { skipped.push('(بلا اسم)'); return; }
      }
      if (s.ans) over++;
      s.ans = r.ans; s.absent = false; s.src = 'import'; ok++;
    });
    sortStu(t); save();
    var msg = 'استُورد ' + ok + ' صفًا' + (added ? '، أُضيف ' + added + ' طالبًا جديدًا' : '') + (over ? '، واستُبدلت إجابات ' + over + ' طالبًا' : '') + '.';
    if (skipped.length) msg += ' تعذّر فهم ' + skipped.length + ' صفًا (عدد الإجابات لا يساوي ' + t.n + ' أو حروف غير مفهومة): ' + skipped.slice(0, 5).join('، ') + (skipped.length > 5 ? '…' : '');
    return { ok: ok, msg: msg, bad: skipped.length };
  }
  function pasteGo() {
    var txt = $('#pastebox').value, rows = txt.split(/\r?\n/).filter(function (l) { return l.trim(); }).map(function (l) {
      if (l.indexOf('\t') >= 0) return l.split('\t');
      var c = l.split(/[,،;]/); if (c.length > 2) return c;
      var m = l.trim().match(/^(.*\S)\s+(\S+)$/); return m ? [m[1], m[2]] : [l];
    });
    var r = importRows(rows);
    $('#pmsg').innerHTML = '<div class="notice ' + (r.ok && !r.bad ? 'ok' : '') + '">' + esc(r.msg) + '</div>'; updateEntryHead();
  }
  function importFile(f) {
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var wb = XLSX.read(rd.result, { type: 'array' }), ws = wb.Sheets[wb.SheetNames[0]];
        var rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
        var r = importRows(rows); $('#pmsg').innerHTML = '<div class="notice ' + (r.ok && !r.bad ? 'ok' : '') + '">' + esc(r.msg) + '</div>'; updateEntryHead();
      } catch (e) { $('#pmsg').innerHTML = '<div class="notice bad">تعذّرت قراءة الملف.</div>'; }
    };
    rd.readAsArrayBuffer(f);
  }
  function quickSave() {
    var no = parseInt($('#qs').value, 10), s = findStu(cur, no), a = Stats.parseAnswers($('#qa').value), box = $('#qmsg');
    if (!s) { box.innerHTML = '<div class="notice bad">اختر الطالب أولًا.</div>'; return; }
    if (a.length !== cur.n) { box.innerHTML = '<div class="notice bad">عدد الإجابات ' + a.length + ' ولا يساوي عدد الفقرات ' + cur.n + '. الفراغ يُكتب «-».</div>'; return; }
    s.ans = a; s.absent = false; s.src = 'manual'; save(); updateEntryHead();
    box.innerHTML = '<div class="notice ok">حُفظت إجابات ' + esc(s.name) + '.</div>';
    var nxt = cur.students.filter(function (x) { return !x.ans; })[0];
    $('#qs').innerHTML = stuOptions(cur, nxt ? nxt.no : null); $('#qa').value = ''; $('#qa').focus();
  }

  /* ---------- المسح بالكاميرا ---------- */
  function loadBitmap(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return viaImg(file); });
    }
    return viaImg(file);
  }
  function viaImg(file) {
    return new Promise(function (res, rej) {
      var u = URL.createObjectURL(file), im = new Image();
      im.onload = function () { res(im); setTimeout(function () { URL.revokeObjectURL(u); }, 2000); };
      im.onerror = function () { rej(new Error('img')); }; im.src = u;
    });
  }
  function toDom(c) {
    var d = document.createElement('canvas'); d.width = c.width; d.height = c.height; d.getContext('2d').drawImage(c, 0, 0); return d;
  }
  var scanBusy = false;
  function scanFiles(files) {
    if (!files || !files.length) return;
    var geom = Sheet.geom(cur.n), testId = cur.id;
    Array.prototype.forEach.call(files, function (f) { ui.scans.push({ id: uid(), name: f.name, file: f, state: 'wait', testId: testId }); });
    drawScans(); pump(geom);
  }
  function pump(geom) {
    if (scanBusy) return;
    var c = ui.scans.filter(function (x) { return x.state === 'wait'; })[0];
    if (!c) return;
    scanBusy = true; c.state = 'work'; drawScans();
    setTimeout(function () {
      loadBitmap(c.file).then(function (bmp) {
        var res = OMR.scan(bmp, geom);
        c.res = res; c.file = null;
        if (!res.ok) { c.state = 'fail'; }
        else {
          c.state = 'done'; c.choice = {}; c.touched = {}; c.ov = toDom(OMR.overlay(res, 320)); c.crops = {};
          var t = getTest(c.testId);
          if (t && res.id && findStu(t, res.id)) c.stuNo = res.id; else if (res.id) c.stuNo = 'add:' + res.id; else c.stuNo = '';
        }
      }).catch(function () { c.state = 'fail'; c.res = { message: 'تعذّر فتح الصورة.' }; }).then(function () {
        scanBusy = false; drawScans(); pump(geom);
      });
    }, 30);
  }
  function itemFinal(c, i) { return c.touched[i] ? c.choice[i] : c.res.items[i].ans; }
  function pendingCount(c) { var k = 0; c.res.items.forEach(function (it, i) { if (it.status === 'review' && !c.touched[i]) k++; }); return k; }
  function drawScans() {
    var box = $('#scans'); if (!box) return;
    var list = ui.scans.filter(function (c) { return cur && c.testId === cur.id && c.state !== 'saved'; });
    box.innerHTML = list.map(function (c) {
      if (c.state === 'wait') return '<div class="scan">⏳ في الانتظار: ' + esc(c.name) + '</div>';
      if (c.state === 'work') return '<div class="scan">⏳ جارٍ القراءة: ' + esc(c.name) + '…</div>';
      if (c.state === 'fail') return '<div class="scan"><div class="notice bad">' + esc(c.res.message || 'فشلت القراءة') + '</div><div class="btns"><button class="btn alt sm" data-act="scandrop" data-id="' + c.id + '">إغلاق</button></div></div>';
      var r = c.res, pend = pendingCount(c), warn = [];
      if (r.sharp < 4) warn.push('الصورة غير حادة. الأفضل إعادة التصوير بتثبيت اليد والتركيز على الورقة.');
      if (r.alignMin < 0.18) warn.push('انطباق الورقة على الشبكة ضعيف (ورقة مثنية أو مائلة جدًا). راجع النتيجة بعناية أو أعد التصوير.');
      var blanks = r.items.map(function (it, i) { return it.status === 'blank' ? i + 1 : 0; }).filter(Boolean);
      var s = typeof c.stuNo === 'number' ? findStu(cur, c.stuNo) : null;
      var reviewHtml = r.items.map(function (it, i) {
        if (it.status !== 'review') return '';
        var v = c.touched[i] ? c.choice[i] : null;
        return '<div class="rv" data-crop="' + i + '"><b style="min-width:2.2em">' + (i + 1) + '</b><span class="cropslot"></span><div><div class="rsn">' + esc(it.note || 'يحتاج مراجعة') + '</div><div class="ch">' +
          [1, 2, 3, 4, 0].map(function (k) { return '<button class="' + (!c.touched[i] && it.ans === k ? 'sug' : '') + '" aria-pressed="' + (v === k) + '" data-act="pick" data-id="' + c.id + '" data-i="' + i + '" data-k="' + k + '" aria-label="الفقرة ' + (i + 1) + ': ' + (k ? LET[k] : 'بلا إجابة') + '">' + (k ? LET[k] : 'فارغ') + '</button>'; }).join('') + '</div></div></div>';
      }).join('');
      var selVal = c.stuNo;
      return '<div class="scan" data-card="' + c.id + '"><div class="top2"><div class="ovslot"></div><div>' +
        '<h3>' + esc(c.name) + '</h3>' +
        '<p class="hint">قُرئ الرقم: <b class="num">' + (r.id !== null ? r.id : 'تعذّر') + '</b>' + (s ? ' — ' + esc(s.name) : '') + ' · الفقرات المقروءة: ' + r.items.filter(function (x) { return x.status === 'ok'; }).length + ' · للمراجعة: ' + r.items.filter(function (x) { return x.status === 'review'; }).length + ' · فارغة: ' + r.items.filter(function (x) { return x.status === 'blank'; }).length + '</p>' +
        warn.map(function (w) { return '<div class="notice">' + esc(w) + '</div>'; }).join('') +
        (blanks.length ? '<p class="hint">فقرات بلا تظليل (تُحتسب بلا إجابة): ' + blanks.join('، ') + '</p>' : '') +
        '<label for="sel' + c.id + '">الطالب</label><select id="sel' + c.id + '" data-act="selstu" data-id="' + c.id + '">' + stuOptions(cur, typeof selVal === 'number' ? selVal : -1, r.id && !findStu(cur, r.id) ? r.id : null).replace('<option value="">', '<option value=""' + (selVal === '' ? ' selected' : '') + '>') + '</select>' +
        '</div></div>' + (reviewHtml ? '<h3 style="margin-top:12px">فقرات تحتاج قرارك</h3>' + reviewHtml : '<div class="notice ok">لا فقرات للمراجعة.</div>') +
        '<div class="btns"><button class="btn" data-act="scansave" data-id="' + c.id + '"' + (pend || selVal === '' ? ' disabled' : '') + '>' +
        (pend ? 'راجع ' + pend + ' فقرة أولًا' : selVal === '' ? 'اختر الطالب' : (s && s.ans ? 'استبدال إجابات الطالب' : 'اعتماد وحفظ')) + '</button><button class="btn alt" data-act="scandrop" data-id="' + c.id + '">تجاهل</button></div></div>';
    }).join('');
    list.forEach(function (c) {
      if (c.state !== 'done') return;
      var card = box.querySelector('[data-card="' + c.id + '"]'); if (!card) return;
      card.querySelector('.ovslot').appendChild(c.ov);
      card.querySelectorAll('.rv').forEach(function (rv) {
        var i = +rv.dataset.crop;
        if (!c.crops[i]) c.crops[i] = toDom(OMR.cropItem(c.res, i));
        rv.querySelector('.cropslot').appendChild(c.crops[i]);
      });
    });
  }
  function scanSave(id) {
    var c = ui.scans.filter(function (x) { return x.id === id; })[0]; if (!c || !cur) return;
    var s, v = c.stuNo;
    if (typeof v === 'string' && v.indexOf('add:') === 0) {
      var no = +v.slice(4), nm = prompt('الرقم ' + no + ' غير موجود في القائمة. اكتب اسم الطالب:', 'طالب ' + no);
      if (nm === null) return;
      s = { no: no, name: nm.trim() || 'طالب ' + no, ans: null, absent: false }; cur.students.push(s); sortStu(cur);
    } else s = findStu(cur, v);
    if (!s) return;
    s.ans = c.res.items.map(function (it, i) { return itemFinal(c, i) || 0; }); s.absent = false; s.src = 'scan';
    save(); c.state = 'saved'; c.ov = null; c.crops = null; toast('حُفظت إجابات ' + s.name); updateEntryHead(); drawScans();
  }

  /* ---------- التحليل ---------- */
  var VERD = { ok: 'جيدة', rev: 'تحتاج مراجعة', rej: 'ضعيفة', key: 'راجع المفتاح' };
  function relText(kr, m) {
    if (kr === null) return 'تعذّر حساب الثبات (لا تباين في الدرجات).';
    var s = kr >= 0.8 ? 'ثبات جيد' : kr >= 0.7 ? 'ثبات مقبول' : kr >= 0.6 ? 'ثبات ضعيف يصلح لاختبار صفي قصير مع الحذر' : 'ثبات منخفض: الفروق الفردية في هذا الاختبار غير موثوقة';
    return s + ' (KR-20 = ' + kr.toFixed(2) + ').' + (m < 20 ? ' عدد الفقرات قليل (' + m + ')، وهذا وحده يخفض الثبات.' : '');
  }
  function analysisTexts(a) {
    var o = [], meanP = a.items.reduce(function (s, x) { return s + x.P; }, 0) / a.items.length;
    o.push('متوسط صعوبة الفقرات P = ' + meanP.toFixed(2) + (meanP < 0.3 ? ' (الاختبار صعب)' : meanP > 0.75 ? ' (الاختبار سهل)' : ' (مستوى صعوبة معتدل)') + '.');
    o.push(relText(a.kr, a.m));
    var by = function (st) { return a.items.filter(function (x) { return x.st === st; }).map(function (x) { return x.n; }); };
    if (by('key').length) o.push('فقرات بتمييز سالب (تحقق من المفتاح أولًا): ' + by('key').join('، ') + '.');
    if (by('rej').length) o.push('فقرات ضعيفة التمييز (تُعاد صياغتها أو تُحذف): ' + by('rej').join('، ') + '.');
    if (by('rev').length) o.push('فقرات تحتاج مراجعة بدائلها أو صعوبتها: ' + by('rev').join('، ') + '.');
    var low = a.outs.filter(function (x) { return x.avg !== null && x.avg < 0.6; });
    if (low.length) o.push('نتاجات دون الإتقان (أقل من 60%): ' + low.map(function (x) { return x.name + ' (' + pct(x.avg) + ')'; }).join('، ') + '.');
    return o;
  }
  function analysisFor(t) { return Stats.analyze(t); }
  function viewAnalysis(m) {
    var t = cur, a = analysisFor(t);
    if (!a.ok) { m.innerHTML = '<div class="card empty"><h2>التحليل غير جاهز</h2><p>' + esc(a.reason) + '</p><div class="btns" style="justify-content:center"><button class="btn" data-act="tab" data-tab="setup">المفتاح والإعداد</button><button class="btn alt" data-act="tab" data-tab="entry">الإدخال</button></div></div>'; return; }
    var h = '<div class="card"><div class="btns" style="margin:0">' + (t.bank ? '<button class="btn" data-act="banklog">سجّل جودة الفقرات في البنك</button>' : '') + '<button class="btn' + (t.bank ? ' alt' : '') + '" data-act="report">تقرير مطبوع</button><button class="btn alt" data-act="xlsx">تصدير Excel</button><button class="btn alt" data-act="csv">CSV للدرجات</button></div></div>';
    if (a.smallN) h += '<div class="notice">عدد الطلبة المحلَّلين ' + a.N + '، وهو أقل من 30. مؤشرات الفقرات (التمييز خاصة) غير مستقرة وتؤخذ دليلًا أوليًا لا حكمًا نهائيًا.</div>';
    var skip = t.students.filter(function (s) { return !s.absent && !(s.ans && s.ans.length === t.n); }).length;
    if (skip) h += '<div class="notice">' + skip + ' طالبًا حاضرًا لم تُدخل إجاباتهم بعد، ولم يدخلوا في التحليل.</div>';
    if (a.m < t.n) h += '<div class="notice">حُلِّلت ' + a.m + ' فقرة من ' + t.n + ' لأن الباقي بلا مفتاح.</div>';
    h += '<div class="subtabs">' + [['sum', 'الملخص'], ['items', 'الفقرات'], ['stu', 'الطلبة'], ['out', 'النتاجات']].map(function (x) { return '<button class="chip" data-act="atab" data-a="' + x[0] + '" aria-pressed="' + (ui.atab === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>';
    var p = a.perItem;
    if (ui.atab === 'sum') {
      var K = function (l, v) { return '<div class="kpi"><div class="v">' + v + '</div><div class="l">' + l + '</div></div>'; };
      var maxc = Math.max.apply(null, a.bins.map(function (b) { return b.count; })) || 1;
      h += '<div class="card"><div class="kpis">' + K('عدد الطلبة', a.N) + K('الفقرات المحلَّلة', a.m) + K('المتوسط من ' + fmt(a.total, 0), fmt(a.meanMark)) + K('الانحراف المعياري', fmt(a.sdMark)) +
        K('الوسيط', fmt(a.median * p)) + K('أدنى / أعلى', fmt(a.min * p, 1) + ' / ' + fmt(a.max * p, 1)) + K('ثبات KR-20', fmt(a.kr)) + K('الخطأ المعياري SEM', a.sem === null ? '—' : fmt(a.sem * p)) + K('نسبة النجاح (50% فأكثر)', pct(a.pass)) +
        K('الالتواء', fmt(a.skew)) + K('التفلطح', fmt(a.kurt)) + K('فقرات جيدة (من ' + a.m + ')', a.counts.ok) + '</div></div>' +
        '<div class="card"><h2>توزيع الدرجات (عدد الفقرات الصحيحة)</h2><div class="hist">' + a.bins.map(function (b) { return '<div><span class="num">' + b.count + '</span><i style="height:' + Math.round(b.count / maxc * 95) + '%"></i><span class="num" style="color:var(--muted)">' + b.from + '–' + b.to + '</span></div>'; }).join('') + '</div></div>' +
        '<div class="card"><h2>قراءة النتائج</h2><ul>' + analysisTexts(a).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
        '<p class="hint">الحكم على الفقرة يعتمد معيارين معًا: معامل التمييز D (مجموعتا 27% العليا والدنيا) وارتباط الفقرة المصحَّح بباقي الاختبار r. مع صعوبة P وفعالية البدائل. هي مؤشرات مساعدة لا قرارات آلية.</p></div>';
    } else if (ui.atab === 'items') {
      h += '<div class="card"><h2>تحليل الفقرات</h2><p class="hint">اضغط أي فقرة لترى بدائلها وسبب الحكم.</p><div class="tw"><table><thead><tr><th>الفقرة</th><th>المفتاح</th><th>الصعوبة P</th><th>التمييز D</th><th>الارتباط r</th><th>الحكم</th></tr></thead><tbody>' +
        a.items.map(function (x) {
          var open = ui.openItem === x.n, r = '<tr class="clk" data-act="item" data-n="' + x.n + '" tabindex="0"><td>' + x.n + '</td><td>' + x.keyL + '</td><td class="num">' + fmt(x.P) + '</td><td class="num">' + fmt(x.D) + '</td><td class="num">' + fmt(x.r) + '</td><td><span class="tag ' + x.st + '">' + VERD[x.st] + '</span></td></tr>';
          if (open) {
            r += '<tr><td colspan="6" style="white-space:normal;text-align:start;background:var(--bg)"><table><thead><tr><th>البديل</th><th>العدد</th><th>النسبة</th><th></th><th>العليا</th><th>الدنيا</th><th>ملاحظة</th></tr></thead><tbody>' +
              x.opts.map(function (o) { return '<tr><td>' + o.l + (o.isKey ? ' ✓' : '') + '</td><td class="num">' + o.count + '</td><td class="num">' + pct(o.pct) + '</td><td style="width:90px"><div class="bar' + (o.isKey ? ' k' : '') + '"><i style="width:' + Math.round(o.pct * 100) + '%"></i></div></td><td class="num">' + pct(o.hp) + '</td><td class="num">' + pct(o.lp) + '</td><td>' + (o.flag === 'dead' ? 'غير فعّال' : o.flag === 'up' ? 'يجذب الأقوياء' : o.isKey ? 'الإجابة الصحيحة' : '') + '</td></tr>'; }).join('') +
              '</tbody></table><ul>' + x.reasons.map(function (z) { return '<li>' + esc(z) + '</li>'; }).join('') + '</ul>' + (t.bank && t.bank.ids[x.i] ? '<p class="hint">رمز الفقرة في البنك: <span class="num">' + esc(t.bank.ids[x.i]) + '</span></p>' : '') + '</td></tr>';
          }
          return r;
        }).join('') + '</tbody></table></div></div>';
    } else if (ui.atab === 'stu') {
      var rows = a.rows.slice(); if (ui.sortRank) rows.sort(function (x, y) { return x.rank - y.rank || x.s.no - y.s.no; }); else rows.sort(function (x, y) { return x.s.no - y.s.no; });
      h += '<div class="card"><h2>الطلبة</h2><div class="btns" style="margin:0 0 10px"><button class="chip" data-act="sortrank" aria-pressed="' + ui.sortRank + '">ترتيب حسب الدرجة</button></div><div class="tw"><table><thead><tr><th>الرقم</th><th class="l">الاسم</th><th>الصحيحة</th><th>العلامة / ' + fmt(a.total, 0) + '</th><th>%</th><th>الترتيب</th>' +
        a.outs.map(function (o) { return '<th>' + esc(o.name) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (r) {
          return '<tr><td>' + r.s.no + '</td><td class="l">' + esc(r.s.name) + '</td><td class="num">' + r.tot + ' / ' + a.m + '</td><td class="num">' + fmt(r.mark) + '</td><td class="num">' + pct(r.pct) + '</td><td>' + r.rank + '</td>' +
            r.out.map(function (v) { return '<td class="num">' + (v === null ? '—' : pct(v) + (v < 0.6 ? ' ▾' : '')) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div><p class="hint">▾ تعني دون حد الإتقان (60%).</p></div>';
    } else {
      h += '<div class="card"><h2>النتاجات</h2>' + (a.outs.length ? '<div class="tw"><table><thead><tr><th class="l">النتاج</th><th>الفقرات</th><th>متوسط الإتقان</th><th>دون الإتقان</th></tr></thead><tbody>' + a.outs.map(function (o) {
        return '<tr><td class="l">' + esc(o.name) + '</td><td>' + o.count + '</td><td class="num">' + pct(o.avg) + '</td><td>' + o.low + ' من ' + a.N + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="hint">لم تُضف نتاجات. أضفها من قسم الإعداد.</p>') + '</div>';
    }
    m.innerHTML = h;
  }

  /* ---------- التقرير المطبوع ---------- */
  function reportHtml(t, a) {
    var p = a.perItem, d = new Date().toLocaleDateString('ar-JO');
    var h = '<div class="rp"><h1>تقرير تحليل الاختبار</h1><div class="hd">' + esc([db.set.school, t.title, t.subject, t.cls].filter(Boolean).join(' · ')) + '<br>' + (db.set.teacher ? 'المعلم: ' + esc(db.set.teacher) + ' · ' : '') + 'التاريخ: ' + d + '</div>';
    h += '<h2>١. المؤشرات العامة</h2><table><tbody>' + [
      ['عدد الطلبة المحلَّلين', a.N], ['عدد الفقرات المحلَّلة', a.m + ' من ' + t.n], ['المتوسط الحسابي', fmt(a.meanMark) + ' من ' + fmt(a.total, 0)], ['الانحراف المعياري', fmt(a.sdMark)], ['الوسيط', fmt(a.median * p)],
      ['أدنى / أعلى علامة', fmt(a.min * p, 1) + ' / ' + fmt(a.max * p, 1)], ['معامل الثبات KR-20', fmt(a.kr)], ['الخطأ المعياري للقياس', a.sem === null ? '—' : fmt(a.sem * p)], ['نسبة النجاح (50% فأكثر)', pct(a.pass)] ]
      .reduce(function (s, r, i, arr) { return i % 2 ? s : s + '<tr><th>' + r[0] + '</th><td class="num">' + r[1] + '</td>' + (arr[i + 1] ? '<th>' + arr[i + 1][0] + '</th><td class="num">' + arr[i + 1][1] + '</td>' : '<td></td><td></td>') + '</tr>'; }, '') + '</tbody></table>';
    if (a.smallN) h += '<p>تنبيه: عدد الطلبة ' + a.N + ' أقل من 30، فمؤشرات الفقرات أولية وغير مستقرة.</p>';
    h += '<h2>٢. قراءة النتائج</h2><ul>' + analysisTexts(a).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
    var bad = a.items.filter(function (x) { return x.st !== 'ok'; });
    h += '<h2>٣. الفقرات التي تحتاج قرارًا (' + bad.length + ' من ' + a.m + ')</h2>';
    h += bad.length ? '<table class="sm"><thead><tr><th>الفقرة</th><th>P</th><th>D</th><th>r</th><th>الحكم</th><th class="l">السبب</th></tr></thead><tbody>' + bad.map(function (x) {
      return '<tr><td>' + x.n + '</td><td class="num">' + fmt(x.P) + '</td><td class="num">' + fmt(x.D) + '</td><td class="num">' + fmt(x.r) + '</td><td>' + VERD[x.st] + '</td><td class="l" style="white-space:normal">' + esc(x.reasons.join(' ')) + '</td></tr>'; }).join('') + '</tbody></table>' : '<p>جميع الفقرات جيدة بالمعيارين.</p>';
    if (a.outs.length) h += '<h2>٤. النتاجات</h2><table><thead><tr><th class="l">النتاج</th><th>الفقرات</th><th>متوسط الإتقان</th><th>عدد الطلبة دون الإتقان</th></tr></thead><tbody>' + a.outs.map(function (o) { return '<tr><td class="l">' + esc(o.name) + '</td><td>' + o.count + '</td><td class="num">' + pct(o.avg) + '</td><td>' + o.low + '</td></tr>'; }).join('') + '</tbody></table>';
    h += '<div class="pb"></div><h2>ملحق (١): جدول الفقرات</h2><table class="sm"><thead><tr><th>الفقرة</th><th>المفتاح</th><th>P</th><th>D</th><th>r</th><th>الحكم</th><th>أ</th><th>ب</th><th>ج</th><th>د</th><th>بلا</th></tr></thead><tbody>' + a.items.map(function (x) {
      var cnt = [1, 2, 3, 4, 0].map(function (k) { var o = x.opts.filter(function (q) { return q.k === k; })[0]; return o ? pct(o.pct) : '—'; });
      return '<tr><td>' + x.n + '</td><td>' + x.keyL + '</td><td class="num">' + fmt(x.P) + '</td><td class="num">' + fmt(x.D) + '</td><td class="num">' + fmt(x.r) + '</td><td>' + VERD[x.st] + '</td>' + cnt.map(function (c) { return '<td class="num">' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
    h += '<div class="pb"></div><h2>ملحق (٢): الطلبة</h2><table class="sm"><thead><tr><th>الرقم</th><th class="l">الاسم</th><th>الصحيحة</th><th>العلامة</th><th>%</th><th>الترتيب</th>' + a.outs.map(function (o) { return '<th>' + esc(o.name) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      a.rows.slice().sort(function (x, y) { return x.s.no - y.s.no; }).map(function (r) { return '<tr><td>' + r.s.no + '</td><td class="l">' + esc(r.s.name) + '</td><td class="num">' + r.tot + '</td><td class="num">' + fmt(r.mark) + '</td><td class="num">' + pct(r.pct) + '</td><td>' + r.rank + '</td>' + r.out.map(function (v) { return '<td class="num">' + pct(v) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
    return h;
  }
  function doPrint(html, sheets) {
    var p = $('#print'); p.innerHTML = html;
    var st = document.createElement('style'); st.id = 'pagectl';
    st.textContent = sheets ? '@page{size:A4;margin:0}.sheet{height:296.6mm!important;box-shadow:none!important}.sheet:last-child{page-break-after:auto;break-after:auto}' : '@page{size:A4;margin:12mm}';
    document.head.appendChild(st);
    var done = function () { p.innerHTML = ''; st.remove(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(function () { window.print(); }, 150);
  }

  /* ---------- ورقة الإجابة ---------- */
  var sheetOpt = { mode: 'blank', copies: 1 };
  function viewSheet(m) {
    var t = cur, g = Sheet.geom(t.n), hasS = t.students.length > 0;
    var examCard = t.bank ? '<div class="card"><h2>ورقة الأسئلة (من البنك)</h2><p class="hint">تُطبع أسئلة الاختبار ' + t.n + ' فقرة بخيارات أ ب ج د، والطالب يظلّل إجابته في ورقة الإجابة أدناه.</p><div class="btns"><button class="btn" data-act="printexam">طباعة ورقة الأسئلة</button><button class="btn alt" data-act="printkey">طباعة المفتاح بالتعليل وجدول المواصفات</button></div></div>' : '';
    m.innerHTML = examCard + '<div class="card"><h2>طباعة ورقة الإجابة</h2><p class="hint">' + t.n + ' فقرة في ' + g.cols + ' أعمدة. اطبعها بحجم A4 بنسبة 100% (بلا «ملاءمة الصفحة») وعلى ورقة بيضاء. الورقة المطبوعة لكل طالب يأتي رقمه مظلَّلًا مسبقًا فلا يخطئ في تظليله.</p>' +
      '<div class="chips"><button class="chip" data-act="smode" data-m="blank" aria-pressed="' + (sheetOpt.mode === 'blank') + '">نسخ فارغة</button><button class="chip" data-act="smode" data-m="stu" aria-pressed="' + (sheetOpt.mode === 'stu') + '"' + (hasS ? '' : ' disabled') + '>ورقة لكل طالب (' + t.students.length + ')</button></div>' +
      (sheetOpt.mode === 'blank' ? '<div style="max-width:200px;margin-top:10px"><label for="cp">عدد النسخ</label><input id="cp" type="number" min="1" max="200" value="' + sheetOpt.copies + '"></div>' : '') +
      '<div class="btns"><button class="btn" data-act="printsheets">طباعة</button></div></div>' +
      '<div class="card"><h2>معاينة</h2><div class="pvwrap" id="pvw"><div class="pv" id="pv"></div></div></div>';
    var first = sheetOpt.mode === 'stu' && hasS ? t.students[0] : null;
    $('#pv').innerHTML = Sheet.sheetHtml(t, g, first);
    var w = $('#pvw').clientWidth, k = Math.min(1, w / 793.7);
    $('#pv').style.transform = 'scale(' + k + ')'; $('#pvw').style.height = Math.round(1122.5 * k) + 'px';
    var cp = $('#cp'); if (cp) cp.addEventListener('change', function () { sheetOpt.copies = Math.max(1, Math.min(200, parseInt(cp.value, 10) || 1)); cp.value = sheetOpt.copies; });
  }
  function printSheets() {
    var t = cur, g = Sheet.geom(t.n), html = '';
    if (sheetOpt.mode === 'stu') t.students.forEach(function (s) { html += Sheet.sheetHtml(t, g, s); });
    else for (var i = 0; i < sheetOpt.copies; i++) html += Sheet.sheetHtml(t, g, null);
    doPrint(html, true);
  }

  /* ---------- التصدير ---------- */
  function exportXlsx(t, a) {
    var p = a.perItem, wb = XLSX.utils.book_new();
    var sum = [['البند', 'القيمة'], ['عنوان الاختبار', t.title], ['المادة', t.subject], ['الصف', t.cls], ['عدد الطلبة المحلَّلين', a.N], ['عدد الفقرات المحلَّلة', a.m], ['العلامة الكلية', a.total], ['المتوسط', a.meanMark], ['الانحراف المعياري', a.sdMark], ['الوسيط', a.median * p], ['أدنى', a.min * p], ['أعلى', a.max * p], ['KR-20', a.kr], ['SEM', a.sem === null ? '' : a.sem * p], ['نسبة النجاح', a.pass], ['الالتواء', a.skew], ['التفلطح', a.kurt]];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), 'الملخص');
    var st = [['الرقم', 'الاسم', 'الصحيحة', 'العلامة', 'النسبة', 'الترتيب'].concat(a.outs.map(function (o) { return o.name; }))];
    a.rows.slice().sort(function (x, y) { return x.s.no - y.s.no; }).forEach(function (r) { st.push([r.s.no, r.s.name, r.tot, r.mark, r.pct, r.rank].concat(r.out.map(function (v) { return v === null ? '' : v; }))); });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(st), 'الطلاب');
    var it = [['الفقرة', 'المفتاح', 'الصعوبة P', 'التمييز D', 'الارتباط r', 'الثبات عند الحذف', 'الحكم', 'الأسباب']];
    a.items.forEach(function (x) { it.push([x.n, x.keyL, x.P, x.D, x.r, x.krDel === undefined ? '' : x.krDel, VERD[x.st], x.reasons.join(' ')]); });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(it), 'الفقرات');
    var op = [['الفقرة', 'البديل', 'صحيح', 'العدد', 'النسبة', 'المجموعة العليا', 'المجموعة الدنيا', 'ملاحظة']];
    a.items.forEach(function (x) { x.opts.forEach(function (o) { op.push([x.n, o.l, o.isKey ? 'نعم' : '', o.count, o.pct, o.hp, o.lp, o.flag === 'dead' ? 'غير فعّال' : o.flag === 'up' ? 'يجذب الأقوياء' : '']); }); });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(op), 'البدائل');
    if (a.outs.length) {
      var ou = [['النتاج', 'عدد الفقرات', 'متوسط الإتقان', 'عدد الطلبة دون 60%']]; a.outs.forEach(function (o) { ou.push([o.name, o.count, o.avg === null ? '' : o.avg, o.low]); });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ou), 'النتاجات');
    }
    var an = [['الرقم', 'الاسم'].concat(t.key.map(function (k, i) { return i + 1; })), ['', 'المفتاح'].concat(t.key.map(function (k) { return k ? LET[k] : ''; }))];
    t.students.forEach(function (s) { an.push([s.no, s.name].concat(s.ans ? s.ans.map(function (v) { return v ? LET[v] : ''; }) : [])); });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(an), 'الإجابات');
    wb.Workbook = { Views: [{ RTL: true }] };
    var out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    download(safeName(t.title) + ' - تحليل.xlsx', new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }
  function exportCsv(t, a) {
    var q = function (v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var lines = [['الرقم', 'الاسم', 'الصحيحة', 'العلامة', 'النسبة', 'الترتيب'].concat(a.outs.map(function (o) { return o.name; })).map(q).join(',')];
    a.rows.slice().sort(function (x, y) { return x.s.no - y.s.no; }).forEach(function (r) { lines.push([r.s.no, r.s.name, r.tot, r.mark, Math.round(r.pct * 1000) / 10, r.rank].concat(r.out.map(function (v) { return v === null ? '' : Math.round(v * 1000) / 10; })).map(q).join(',')); });
    download(safeName(t.title) + ' - الدرجات.csv', new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  }
  function backup() { download('نسخة_تحليل_' + new Date().toISOString().slice(0, 10) + '.json', new Blob([JSON.stringify(db)], { type: 'application/json' })); toast('نُزّلت النسخة الاحتياطية'); }
  function restoreFile(f) {
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var d = JSON.parse(rd.result);
        if (!d || !Array.isArray(d.tests)) throw 0;
        if (!confirm('ستُدمج النسخة: الاختبارات المطابقة بالمعرّف تُستبدل بما في النسخة، وغيرها تُضاف. متابعة؟')) return;
        d.tests.forEach(function (nt) {
          if (!nt || !nt.id || !Array.isArray(nt.key) || !Array.isArray(nt.students)) return;
          var i = db.tests.findIndex(function (x) { return x.id === nt.id; }); if (i >= 0) db.tests[i] = nt; else db.tests.push(nt);
        });
        if (d.set && !db.set.teacher && !db.set.school) db.set = d.set;
        if (d.bankLog) db.bankLog = Object.assign(db.bankLog || {}, d.bankLog);
        save(); render(); toast('تمت الاستعادة');
      } catch (e) { toast('الملف ليس نسخة احتياطية صالحة'); }
    };
    rd.readAsText(f);
  }

  /* ---------- بنك الأسئلة (من دوسياتي) ---------- */
  var BX = null, bankLoading = false, LETS = ['أ', 'ب', 'ج', 'د'];
  ui.bank = { grade: '', subject: '', sel: {}, n: 20, alloc: null, seed: 1, shuffle: false, excl: true, drawn: null, target: null, title: '', total: 0 };
  function withBank(cb) {
    if (BX) return cb();
    if (bankLoading) return; bankLoading = true;
    fetch('bank.json').then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (raw) { BX = Bank.index(raw); bankLoading = false; cb(); })
      .catch(function () { bankLoading = false; toast('تعذّر تحميل بنك الأسئلة'); });
  }
  function gShort(g) { return String(g).replace('الصف ', '').replace(' الأساسي', ''); }
  function selIds() { return BX.units.filter(function (u) { return ui.bank.sel[u.id]; }).map(function (u) { return u.id; }); }
  function exclMap() {
    var m = {}, lg = db.bankLog || {};
    if (ui.bank.excl) Object.keys(lg).forEach(function (id) { var v = lg[id]; if (v.N >= 20 && (v.st === 'key' || v.st === 'rej')) m[id] = 1; });
    return m;
  }
  function ensureAlloc() {
    var b = ui.bank, ids = selIds();
    if (!ids.length) { b.alloc = null; return; }
    var okk = b.alloc && Object.keys(b.alloc).every(function (k) { return ids.indexOf(k.split('|')[0]) >= 0; }) && ids.every(function (id) { return Object.keys(b.alloc).some(function (k) { return k.split('|')[0] === id; }); });
    if (!okk) b.alloc = Bank.allocate(BX, ids, b.n);
  }
  function allocSum() { var s = 0; Object.keys(ui.bank.alloc || {}).forEach(function (k) { s += ui.bank.alloc[k]; }); return s; }
  function viewBank(m) {
    if (!BX) { m.innerHTML = '<div class="card empty">جارٍ تحميل البنك…</div>'; withBank(function () { render(); }); return; }
    var b = ui.bank, grades = ['', 'الثامن', 'التاسع', 'العاشر'], subs = [''];
    BX.units.forEach(function (u) { if (subs.indexOf(u.subject) < 0) subs.push(u.subject); });
    var us = BX.units.filter(function (u) { return (!b.grade || gShort(u.grade) === b.grade) && (!b.subject || u.subject === b.subject); });
    var h = '<div class="card"><h2>١. اختر الوحدات</h2><p class="hint">بنك دوسياتي: ' + Object.keys(BX.byId).length + ' فقرة في ' + BX.units.length + ' وحدة، كل فقرة مربوطة بنتاج ومستوى بلوم، ولكل بديل خاطئ تعليل. (' + esc(BX.src) + ')</p>' +
      '<div class="chips">' + grades.map(function (g) { return '<button class="chip" data-act="bgrade" data-v="' + g + '" aria-pressed="' + (b.grade === g) + '">' + (g || 'كل الصفوف') + '</button>'; }).join('') + '</div>' +
      '<div class="chips">' + subs.map(function (g) { return '<button class="chip" data-act="bsubj" data-v="' + esc(g) + '" aria-pressed="' + (b.subject === g) + '">' + (g || 'كل المواد') + '</button>'; }).join('') + '</div>' +
      '<div class="ul">' + us.map(function (u) { return '<button class="urow" data-act="bunit" data-id="' + u.id + '" aria-pressed="' + !!b.sel[u.id] + '"><b>' + esc(u.subject) + ' · ' + gShort(u.grade) + '</b> · الوحدة ' + esc(u.unitNo) + ': ' + esc(u.title) + '<span>' + u.items.length + ' فقرة · ' + Object.keys(u.outcomes).length + ' نتاجات</span></button>'; }).join('') + '</div></div>';
    var ids = selIds(); ensureAlloc();
    if (ids.length) {
      var avail = 0; ids.forEach(function (id) { avail += BX.byUnit[id].items.length; });
      h += '<div class="card"><h2>٢. وزّع الفقرات على النتاجات</h2><div class="grid g2" style="align-items:end"><div><label for="bn">عدد فقرات الاختبار (حتى ' + Math.min(100, avail) + ')</label><input id="bn" type="number" inputmode="numeric" min="1" max="' + Math.min(100, avail) + '" value="' + b.n + '" data-bk="n"></div>' +
        '<div><button class="btn alt" data-act="bauto">توزيع تلقائي</button></div></div>' +
        '<div class="tw" style="margin-top:12px"><table><thead><tr><th>الوحدة</th><th class="l">النتاج</th><th>المتاح</th><th>العدد</th></tr></thead><tbody>' +
        Object.keys(b.alloc).map(function (k) {
          var p = k.split('|'), u = BX.byUnit[p[0]], av = u.items.filter(function (i) { return String(i.o) === p[1]; }).length;
          return '<tr><td>' + esc(u.id) + '</td><td class="l" style="white-space:normal;min-width:220px">' + p[1] + '. ' + esc(Bank.plain(u.outcomes[p[1]])) + '</td><td>' + av + '</td><td><input type="number" inputmode="numeric" min="0" max="' + av + '" value="' + b.alloc[k] + '" data-bk="a" data-key="' + k + '" data-av="' + av + '" style="width:76px;min-height:38px;padding:4px 8px" aria-label="عدد فقرات النتاج ' + p[1] + ' من ' + esc(u.id) + '"></td></tr>';
        }).join('') + '</tbody></table></div><p class="hint">المجموع: <b class="num" id="bsum">' + allocSum() + '</b> فقرة. عند السحب لا تتجاوز الفقرات الثلاث من المقطع الواحد ما أمكن، وتتبع نسب بلوم نسب الاختبارات الذاتية في دوسياتي.</p>' +
        '<label style="display:flex;gap:8px;align-items:center;font-weight:500;margin-top:8px"><input type="checkbox" data-bk="excl"' + (b.excl ? ' checked' : '') + ' style="width:20px;height:20px"> استبعد الفقرات التي حُكم عليها بـ«ضعيفة» أو «راجع المفتاح» في تحليل سابق (بعدد طلبة 20 فأكثر)' + (Object.keys(exclMap()).length ? ' — مستبعد الآن ' + Object.keys(exclMap()).length : '') + '</label>' +
        '<label style="display:flex;gap:8px;align-items:center;font-weight:500;margin-top:4px"><input type="checkbox" data-bk="shuffle"' + (b.shuffle ? ' checked' : '') + ' style="width:20px;height:20px"> اخلط ترتيب الفقرات (بدل ترتيبها بحسب النتاجات)</label>' +
        '<div class="btns"><button class="btn" data-act="bdraw"' + (allocSum() < 1 ? ' disabled' : '') + '>سحب الأسئلة</button></div></div>';
    }
    if (b.drawn && b.drawn.length) {
      var d = b.drawn, kd = Bank.keyDist(d), ld = Bank.lvlDist(d), lg = db.bankLog || {};
      h += '<div class="card" id="bres"><h2>٣. الاختبار المسحوب (' + d.length + ' فقرة)</h2>' +
        '<div class="kpis"><div class="kpi"><div class="v">' + ld['ت'] + ' / ' + ld['ط'] + ' / ' + ld['ح'] + '</div><div class="l">تذكّر / تطبيق / تحليل</div></div><div class="kpi"><div class="v">' + kd.join(' / ') + '</div><div class="l">توزّع المفتاح أ / ب / ج / د</div></div>' + timeKpiHtml(d) + '</div><p class="hint">أزمنة الفقرات تقديرية: قراءة الفقرة وبدائلها بسرعة طالب (150 كلمة في الدقيقة) + زمن تفكير بحسب المستوى + زمن حساب إن كثرت الأرقام. عدّلها يدويًا لكل فقرة، وستُعايَر لاحقًا من أزمنة طلبتك الفعلية.</p>' +
        '<div class="grid g3" style="margin-top:12px"><div><label for="bt">عنوان الاختبار</label><input id="bt" type="text" data-bk="title" value="' + esc(b.title || defaultTitle()) + '"></div><div><label for="btot">العلامة الكلية</label><input id="btot" type="number" inputmode="decimal" min="1" data-bk="total" value="' + (b.total || d.length) + '"></div><div><label for="bmin">زمن الاختبار (دقيقة)</label><input id="bmin" type="number" inputmode="numeric" min="1" data-bk="minutes" value="' + (b.minutes || recMinutes(d)) + '"></div></div>' +
        '<div class="btns"><button class="btn" data-act="bcreate">إنشاء الاختبار في «تحليل»</button><button class="btn alt" data-act="bprint">طباعة ورقة الأسئلة</button><button class="btn alt" data-act="bprintkey">طباعة المفتاح والمواصفات</button><button class="btn alt" data-act="bredraw">سحبة أخرى</button></div>' +
        '<div style="margin-top:12px">' + d.map(function (it, i) {
          var u = BX.byUnit[it.u], v = lg[it.id];
          return '<div class="bq"><div class="bqh"><b class="num">' + (i + 1) + '</b><span class="btag">' + esc(it.u) + ' · نتاج ' + it.o + '</span><span class="btag">' + Bank.LVL[it.lvl] + '</span><label class="btag" style="display:inline-flex;gap:4px;align-items:center;margin:0;font-weight:500">⏱ <input type="number" inputmode="numeric" min="10" max="600" value="' + itemSecs(it) + '" data-bk="sec" data-id="' + it.id + '" aria-label="زمن الفقرة ' + (i + 1) + ' بالثواني" style="width:64px;min-height:30px;padding:0 6px"> ث</label>' + (v ? '<span class="btag">آخر تحليل: P ' + v.P.toFixed(2) + ' · D ' + v.D.toFixed(2) + ' (ن=' + v.N + ')</span>' : '') + '<button class="btn alt sm" data-act="brep" data-i="' + i + '">استبدال</button></div>' +
            '<div class="bqq">' + Bank.rich(it.q) + '</div><div class="bqo">' + it.op.map(function (o, k) { return '<span' + (k === it.a ? ' class="bk"' : '') + '>' + LETS[k] + ') ' + Bank.rich(o) + (k === it.a ? ' ✓' : '') + '</span>'; }).join('') + '</div></div>';
        }).join('') + '</div></div>';
    }
    m.innerHTML = h;
  }
  function itemSecs(it) { var o = (db.bankTimes || {})[it.id]; return o > 0 ? o : Bank.secs(it); }
  function sumSecs(items) { var t = 0; items.forEach(function (i) { t += itemSecs(i); }); return t; }
  /* زمن الاختبار الموصى به: مجموع الأزمنة + 15% لتظليل الورقة والمراجعة، مقرَّبًا لأعلى إلى خمس دقائق */
  function recMinutes(items) { return Math.max(5, Math.ceil(sumSecs(items) * 1.15 / 300) * 5); }
  function timeKpiHtml(d) { var sc = sumSecs(d); return '<div class="kpi"><div class="v" id="btime">' + Math.round(sc / 60) + ' د</div><div class="l">الزمن المقدَّر للإجابة · الموصى به للاختبار <b class="num">' + recMinutes(d) + '</b> دقيقة</div></div>'; }
  function defaultTitle() { var ids = selIds(); return ids.map(function (id) { return BX.byUnit[id].title; }).join(' + ').slice(0, 70) + ' — اختبار'; }
  function bankChange(el) {
    var b = ui.bank, k = el.dataset.bk;
    if (k === 'n') { var mx = 0; selIds().forEach(function (id) { mx += BX.byUnit[id].items.length; }); b.n = Math.max(1, Math.min(100, mx, parseInt(el.value, 10) || b.n)); b.alloc = null; b.drawn = null; render(); }
    else if (k === 'a') { var av = +el.dataset.av; b.alloc[el.dataset.key] = Math.max(0, Math.min(av, parseInt(el.value, 10) || 0)); el.value = b.alloc[el.dataset.key]; b.drawn = null; var sm = $('#bsum'); if (sm) sm.textContent = allocSum(); var res = $('#bres'); if (res) res.remove(); }
    else if (k === 'excl') b.excl = el.checked;
    else if (k === 'shuffle') b.shuffle = el.checked;
    else if (k === 'sec') { var sv = parseInt(el.value, 10); db.bankTimes = db.bankTimes || {}; if (sv >= 10 && sv <= 600) db.bankTimes[el.dataset.id] = sv; else { delete db.bankTimes[el.dataset.id]; el.value = itemSecs(BX.byId[el.dataset.id]); } save(); var bt = $('#btime'); if (bt) { bt.textContent = Math.round(sumSecs(b.drawn) / 60) + ' د'; bt.nextElementSibling.querySelector('.num').textContent = recMinutes(b.drawn); } if (!b.minutesTouched) { var bm = $('#bmin'); if (bm) bm.value = recMinutes(b.drawn); b.minutes = 0; } }
    else if (k === 'minutes') { b.minutes = parseFloat(el.value) > 0 ? parseFloat(el.value) : 0; b.minutesTouched = !!b.minutes; }
    else if (k === 'title') b.title = el.value;
    else if (k === 'total') b.total = parseFloat(el.value) > 0 ? parseFloat(el.value) : 0;
  }
  function bankToggleUnit(id) { var b = ui.bank; b.sel[id] = !b.sel[id]; b.alloc = null; b.drawn = null; render(); }
  function bankAuto() { var b = ui.bank; b.alloc = Bank.allocate(BX, selIds(), b.n); b.drawn = null; render(); }
  function bankDraw(again) {
    var b = ui.bank; if (allocSum() < 1) { toast('وزّع فقرة واحدة على الأقل'); return; }
    if (again) b.seed += 1013;
    var d = Bank.drawBest(BX, b.alloc, { seed: b.seed, exclude: exclMap(), shuffleOrder: b.shuffle });
    b.drawn = d.items; b.target = d.target; b.minutes = 0; b.minutesTouched = false;
    if (d.short) toast('البنك لا يكفي ' + d.short + ' فقرة بعد الاستبعاد. خفّف الاستبعاد أو عدّل التوزيع');
    render(); var r = $('#bres'); if (r) r.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function bankReplace(i) {
    var b = ui.bank, nw = Bank.replaceOne(BX, b.drawn, i, (Date.now() & 0xffff) + i, exclMap());
    if (!nw) { toast('لا بديل متاح من النتاج نفسه'); return; }
    b.drawn[i] = nw; if (!b.minutesTouched) b.minutes = 0; render();
  }
  function buildBankTest(save) {
    var b = ui.bank, d = b.drawn, subs = [], cls = [], t = newTest();
    selIds().forEach(function (id) { var u = BX.byUnit[id]; if (subs.indexOf(u.subject) < 0) subs.push(u.subject); if (cls.indexOf(gShort(u.grade)) < 0) cls.push(gShort(u.grade)); });
    t.title = b.title || defaultTitle(); t.subject = subs.join(' / '); t.cls = 'الصف ' + cls.join(' و');
    t.n = d.length; t.total = b.total || d.length; t.key = d.map(function (i) { return i.a + 1; });
    var g = {}, order = [];
    d.forEach(function (it, ix) { var k = it.u + '|' + it.o; if (!g[k]) { g[k] = []; order.push(k); } g[k].push(ix); });
    var multi = selIds().length > 1;
    t.outcomes = order.map(function (k) { var p = k.split('|'), u = BX.byUnit[p[0]]; return { name: (multi ? '[' + u.id + '] ' : '') + Bank.plain(u.outcomes[p[1]]), items: g[k] }; });
    t.minutes = b.minutes || recMinutes(d);
    t.bank = { ids: d.map(function (i) { return i.id; }), secs: d.map(itemSecs), src: BX.src };
    return t;
  }
  function bankPseudoTest() { return buildBankTest(false); }
  function bankCreate() {
    var t = buildBankTest(true); db.tests.push(t); save(); toast('أُنشئ الاختبار. أضف الطلبة من «الإعداد» ثم اطبع الأوراق'); go('#/t/' + t.id + '/sheet');
  }
  function bankLogSave(t) {
    var a = analysisFor(t); if (!a.ok) { toast(a.reason); return; }
    db.bankLog = db.bankLog || {};
    a.items.forEach(function (x) { var id = t.bank.ids[x.i]; if (id) db.bankLog[id] = { P: x.P, D: x.D, r: x.r, st: x.st, N: a.N, d: Date.now(), t: t.title }; });
    save(); toast('سُجّلت نتائج ' + a.items.length + ' فقرة في البنك' + (a.N < 20 ? ' (عدد الطلبة أقل من 20، فلن تُستبعد بها فقرات)' : ''));
  }

  /* ورقة الأسئلة المطبوعة */
  function examHtml(t) {
    var items = t.bank.ids.map(function (id) { return BX.byId[id]; }).filter(Boolean);
    var h = '<div class="rp exam"><div class="eh"><div>' + esc(db.set.school || '') + '</div><div>' + esc(db.set.teacher ? 'المعلم: ' + db.set.teacher : '') + '</div></div><h1>' + esc(t.title) + '</h1><div class="hd">' + esc([t.subject, t.cls].filter(Boolean).join(' · ')) + ' · ' + items.length + ' فقرة · العلامة الكلية ' + esc(t.total) + (t.minutes ? ' · الزمن ' + esc(t.minutes) + ' دقيقة' : '') + '</div>' +
      '<div class="ef"><span>الاسم: ................................................</span><span>الشعبة: ..........</span><span>التاريخ: ..../..../........</span></div>' +
      '<p class="ei">اقرأ كل فقرة جيدًا ثم ظلّل الدائرة التي تدل على الإجابة الصحيحة في ورقة الإجابة. لكل فقرة إجابة واحدة صحيحة.</p>';
    items.forEach(function (it, i) {
      var short = it.op.every(function (o) { return Bank.plain(o).length <= 26; });
      h += '<div class="eq"><div class="en">' + (i + 1) + '</div><div class="eb"><div class="et">' + Bank.rich(it.q) + '</div><div class="eo ' + (short ? 'c4' : 'c2') + '">' + it.op.map(function (o, k) { return '<span>' + LETS[k] + ') ' + Bank.rich(o) + '</span>'; }).join('') + '</div></div></div>';
    });
    return h + '<p class="ei" style="text-align:center;margin-top:10px">— انتهت الأسئلة —</p></div>';
  }
  /* المفتاح بالتعليل وجدول المواصفات */
  function keyHtml(t) {
    var items = t.bank.ids.map(function (id) { return BX.byId[id]; }), n = items.length;
    var h = '<div class="rp"><h1>مفتاح الإجابة وجدول المواصفات</h1><div class="hd">' + esc([db.set.school, t.title, t.subject, t.cls].filter(Boolean).join(' · ')) + '</div>';
    h += '<h2>١. مفتاح الإجابة</h2><table class="sm"><tbody>';
    for (var r = 0; r < n; r += 10) {
      h += '<tr>'; for (var c = r; c < Math.min(n, r + 10); c++) h += '<th>' + (c + 1) + '</th><td><b>' + (t.key[c] ? LETS[t.key[c] - 1] : '—') + '</b></td>'; h += '</tr>';
    }
    h += '</tbody></table><h2>٢. جدول المواصفات</h2><table class="sm"><thead><tr><th class="l">النتاج</th><th>أرقام الفقرات</th><th>العدد</th><th>تذكّر وفهم</th><th>تطبيق</th><th>تحليل</th><th>الزمن المقدَّر (د)</th></tr></thead><tbody>';
    var tot = { 'ت': 0, 'ط': 0, 'ح': 0 }, secArr = (t.bank.secs && t.bank.secs.length === n) ? t.bank.secs : items.map(itemSecs), totSec = 0;
    t.outcomes.forEach(function (o) {
      var l = { 'ت': 0, 'ط': 0, 'ح': 0 }; o.items.forEach(function (ix) { if (items[ix]) { l[items[ix].lvl]++; tot[items[ix].lvl]++; } });
      h += '<tr><td class="l" style="white-space:normal">' + esc(o.name) + '</td><td class="num">' + esc(rangeStr(o.items)) + '</td><td>' + o.items.length + '</td><td>' + l['ت'] + '</td><td>' + l['ط'] + '</td><td>' + l['ح'] + '</td><td class="num">' + Math.round(o.items.reduce(function (a, ix) { return a + (secArr[ix] || 0); }, 0) / 60) + '</td></tr>';
      o.items.forEach(function (ix) { totSec += secArr[ix] || 0; });
    });
    h += '<tr><th class="l">المجموع</th><th></th><th>' + n + '</th><th>' + tot['ت'] + ' (' + Math.round(100 * tot['ت'] / n) + '%)</th><th>' + tot['ط'] + ' (' + Math.round(100 * tot['ط'] / n) + '%)</th><th>' + tot['ح'] + ' (' + Math.round(100 * tot['ح'] / n) + '%)</th><th>' + Math.round(totSec / 60) + (t.minutes ? ' (المقرَّر ' + esc(t.minutes) + ')' : '') + '</th></tr></tbody></table>';
    h += '<div class="pb"></div><h2>٣. تعليل البدائل</h2>';
    items.forEach(function (it, i) {
      var k = t.key[i] ? t.key[i] - 1 : it.a;
      h += '<div class="kx"><b>' + (i + 1) + '.</b> ' + Bank.rich(it.q) + '<div>الإجابة الصحيحة: <b>' + LETS[k] + ') ' + Bank.rich(it.op[k]) + '</b></div>' +
        '<ul>' + it.op.map(function (o, j) { return j !== k && it.fb[j] ? '<li>' + LETS[j] + ') ' + Bank.rich(it.fb[j]) + '</li>' : ''; }).join('') + '</ul></div>';
    });
    return h + '</div>';
  }

  /* ---------- الاختبار الإلكتروني ----------
     الخادم: Apps Script يملكه المعلم (code.gs). يخزّن أرقام الطلبة ورموزهم وإجاباتهم فقط، لا الأسماء ولا مفتاح الإجابة. التصحيح هنا عند المعلم. */
  var GKEY = 'tahlil.gas';
  var GAS_RE = /^https:\/\/script\.google\.com\/(a\/[\w.-]+\/)?macros\/s\/[\w-]+\/exec$/;
  function gasCfg() { try { return JSON.parse(localStorage.getItem(GKEY)) || {}; } catch (e) { return {}; } }
  function gasPut(c) { try { if (c) localStorage.setItem(GKEY, JSON.stringify(c)); else localStorage.removeItem(GKEY); } catch (e) { toast('تعذّر حفظ إعدادات الخادم على الجهاز'); } }
  var GERR = { auth: 'كلمة السر غير صحيحة، أو لم تغيّر قيمة KEY في الكود.', nosetup: 'لم تشغّل الدالة setup بعد في Apps Script.', busy: 'الخادم مشغول، أعد المحاولة بعد لحظات.', exists: 'رقم النشر مستخدم من قبل.', none: 'الاختبار غير موجود على الخادم.', def: 'بيانات الأسئلة غير صالحة.', codes: 'رموز الطلبة غير صالحة.', minutes: 'زمن الاختبار غير صالح.', id: 'رقم النشر غير صالح.', server: 'خطأ داخل الخادم.' };
  function gerr(j) { return GERR[j.e] || ('خطأ: ' + j.e); }
  function gcall(body) {
    var c = gasCfg(); body.k = c.key;
    return fetch(c.url, { method: 'POST', body: JSON.stringify(body) }).then(function (r) { return r.text(); }, function () { throw new Error('تعذّر الاتصال بالخادم. تحقق من الإنترنت.'); }).then(function (txt) {
      var j; try { j = JSON.parse(txt); } catch (e) { throw new Error('ردّ غير مفهوم من الخادم. تأكد أن الرابط ينتهي بـ /exec وأن الوصول «أي شخص».'); }
      return j;
    });
  }
  function examLink(o) {
    var base = location.href.replace(/[#?].*$/, '').replace(/[^\/]*$/, '') + 'exam/', m = o.url.match(/^https:\/\/script\.google\.com\/macros\/s\/([\w-]+)\/exec$/);
    return base + '?e=' + o.id + (m ? '&g=' + m[1] : '&u=' + encodeURIComponent(o.url));
  }
  function qrSvg(text) {
    try { var q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); } catch (e) { return ''; }
  }
  function genCodes(t) {
    var used = {}, map = {};
    t.students.forEach(function (s) { var c; do { var a = new Uint32Array(1); crypto.getRandomValues(a); c = String(100000 + a[0] % 900000); } while (used[c]); used[c] = 1; map[s.no] = c; });
    return map;
  }
  function hhmm(ts) { return ts ? new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'; }
  function median(a) { a = a.slice().sort(function (x, y) { return x - y; }); var n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : 0; }

  function viewOnline(m) {
    var t = cur, c = gasCfg(), o = t.online;
    if (!t.bank) { m.innerHTML = '<div class="card empty"><h2>الاختبار الإلكتروني لاختبارات البنك</h2><p>يلزم نص الأسئلة لعرضها على الطالب، وهو متوفر لاختبارات تُنشأ من «بنك الأسئلة». أنشئ اختبارًا من البنك ثم عُد هنا.</p><button class="btn" data-act="bank">فتح بنك الأسئلة</button></div>'; return; }
    var h = '';
    if (!c.url) {
      h += '<div class="card"><h2>١. ربط خادم الاختبار (مرة واحدة)</h2><p class="hint">الخادم ملف صغير في حسابك على جوجل (Apps Script) يستقبل إجابات الطلبة. لا يحوي أسماء الطلبة ولا مفتاح الإجابة، والتصحيح يجري عندك فقط.</p>' +
        '<ol class="ol"><li>افتح <b dir="ltr">script.google.com</b> بحسابك وأنشئ مشروعًا جديدًا.</li><li>اضغط «نسخ كود الخلفية» أدناه، ثم احذف الكود الموجود في Code.gs والصق بدله.</li><li>غيّر كلمة السر في السطر الأول <b dir="ltr">var KEY = \'CHANGE-ME\'</b> إلى كلمة سر خاصة بك.</li><li>اختر الدالة <b dir="ltr">setup</b> من القائمة العلوية ثم «تشغيل»، ووافق على الصلاحيات (مرة واحدة).</li><li>من «نشر» اختر «نشر جديد» ثم النوع «تطبيق ويب»، التنفيذ باسمي، ومن لديه صلاحية: «أي شخص». انسخ الرابط الذي ينتهي بـ <b dir="ltr">/exec</b>.</li><li>الصق الرابط وكلمة السر في الحقلين أدناه.</li></ol>' +
        '<div class="btns"><button class="btn alt" data-act="gcode">نسخ كود الخلفية</button><button class="btn alt" data-act="gcodedl">تنزيله كملف</button></div>' +
        '<div class="grid g2" style="margin-top:12px"><div style="grid-column:1/-1"><label for="g-url">رابط التطبيق (ينتهي بـ /exec)</label><input id="g-url" type="url" dir="ltr" placeholder="https://script.google.com/macros/s/…/exec"></div>' +
        '<div><label for="g-key">كلمة السر (KEY)</label><input id="g-key" type="password" dir="ltr" autocomplete="off"></div></div><div class="btns"><button class="btn" data-act="gsave">حفظ وفحص الاتصال</button></div><div id="gmsg" aria-live="polite"></div></div>';
      m.innerHTML = h; return;
    }
    h += '<div class="card"><div class="btns" style="margin:0;align-items:center"><span class="hint" style="margin:0">الخادم مرتبط ✓</span><button class="btn alt sm" data-act="gtest">فحص الاتصال</button><button class="btn alt sm" data-act="gclear">تغيير الخادم</button></div><div id="gmsg" aria-live="polite"></div></div>';
    if (!o) h += publishCard(t); else h += liveCard(t, o);
    m.innerHTML = h;
    if (o) { drawStat(); refreshStat(); ui.poll = setInterval(function () { if (!document.hidden) refreshStat(); }, 15000); }
  }

  function publishCard(t) {
    var n = t.bank.ids.length, nst = t.students.length;
    var h = '<div class="card"><h2>٢. نشر الاختبار</h2>';
    if (!nst) return h + '<p class="hint">أضف قائمة الطلبة أولًا من «الإعداد»، فيُنشأ لكل طالب رمز دخول خاص.</p><button class="btn" data-act="tab" data-tab="setup">الذهاب إلى الإعداد</button></div>';
    h += '<p class="hint">يُرسَل إلى الخادم: نص ' + n + ' فقرة بلا مفتاح، وأرقام ' + nst + ' طلاب مع رمز لكل طالب. تبقى الأسماء والمفتاح على جهازك.</p>' +
      '<div class="grid g2"><div><label for="o-min">الزمن بالدقائق</label><input id="o-min" type="number" inputmode="numeric" min="1" max="600" data-o="min" value="' + (t.minutes || recMinutes(t.bank.ids.map(function (id) { return BX && BX.byId[id]; }).filter(Boolean))) + '"></div>' +
      '<div style="display:flex;align-items:flex-end"><label style="display:flex;gap:8px;align-items:center;margin:0 0 10px"><input type="checkbox" id="o-shuf" checked style="width:20px;height:20px"> ترتيب أسئلة مختلف لكل طالب</label></div></div>' +
      '<div class="notice">العدّاد يبدأ عند دخول الطالب برمزه ويُحسب على ساعة الخادم، فلا ينفع تغيير ساعة الجهاز. بعد النشر لا يمكن تعديل الأسئلة؛ للتعديل انشر نسخة جديدة.</div>' +
      '<div class="btns"><button class="btn" data-act="opub">نشر الاختبار الآن</button></div><div id="omsg" aria-live="polite"></div></div>';
    return h;
  }
  function liveCard(t, o) {
    var link = examLink(o), n = t.bank.ids.length;
    var h = '<div class="card"><h2>٢. الاختبار منشور</h2><p class="hint">' + n + ' فقرة · ' + esc(o.minutes) + ' دقيقة · نُشر ' + hhmm(o.created) + (o.shuffle ? ' · ترتيب مختلف لكل طالب' : '') + '</p>' +
      '<label for="o-link">رابط الطلبة</label><input id="o-link" type="text" readonly dir="ltr" value="' + esc(link) + '" onfocus="this.select()">' +
      '<div class="btns"><button class="btn" data-act="ocopy">نسخ الرابط</button><button class="btn alt" data-act="oslips">طباعة بطاقات الرموز</button><button class="btn alt" data-act="oposter">طباعة رمز QR للعرض</button></div>' +
      '<div class="qrbox" id="oqr" aria-label="رمز QR لرابط الاختبار">' + qrSvg(link) + '</div></div>';
    h += '<div class="card"><h2>٣. المتابعة</h2><div id="ostat"></div>' +
      '<div class="btns"><button class="btn alt" data-act="orefresh">تحديث الآن</button><button class="btn alt" data-act="otoggle" id="otog">…</button></div></div>';
    h += '<div class="card"><h2>٤. سحب النتائج إلى التحليل</h2><p class="hint">تُسحب إجابات من سلّم أو انتهى وقته فقط. يُستبدل ما أُدخل سابقًا لهؤلاء الطلبة.</p>' +
      '<div class="btns"><button class="btn" data-act="opull">سحب النتائج</button><button class="btn alt" data-act="tab" data-tab="analysis">الذهاب إلى التحليل</button></div><div id="pullmsg" aria-live="polite">' + (o.pulled ? '<div class="notice ok">آخر سحب ' + hhmm(o.pulled.t) + ': ' + o.pulled.n + ' طالبًا.</div>' : '') + '</div></div>';
    h += calCard(t);
    h += '<div class="card"><h2>إدارة النشر</h2><div class="btns" style="margin:0"><button class="btn alt" data-act="onew">نشر جديد (نسخة أخرى)</button><button class="btn danger" data-act="oremove">حذف النشر من الخادم</button></div><p class="hint">«نشر جديد» يفصل هذا الاختبار عن الخادم ويبقي نتائجك محفوظة هنا. «الحذف» يمسح من الخادم الأسئلة والرموز والإجابات غير المسحوبة.</p></div>';
    return h;
  }

  function stuRows(t) { return t.students.slice().sort(function (a, b) { return a.no - b.no; }); }
  function drawStat() {
    var box = $('#ostat'); if (!box || !cur || !cur.online) return;
    var t = cur, o = t.online, st = ui.ostat && ui.ostat.id === o.id ? ui.ostat : null;
    if (!st) { box.innerHTML = '<p class="hint">جارٍ التحميل…</p>'; return; }
    if (st.err) { box.innerHTML = '<div class="notice bad">' + esc(st.err) + '</div>'; return; }
    var by = {}; st.res.list.forEach(function (x) { by[x.no] = x; });
    var cnt = { new: 0, run: 0, done: 0, over: 0 };
    var rows = stuRows(t).map(function (s) {
      var x = by[s.no], k = x ? x.st : 'new'; cnt[k]++;
      var lab = { new: '<span class="tag">لم يبدأ</span>', run: '<span class="tag rev">يجيب ' + (x ? x.k : 0) + '/' + st.res.n + '</span>', done: '<span class="tag ok">سلّم ✓</span>', over: '<span class="tag key">انتهى الوقت</span>' }[k];
      return '<tr><td>' + s.no + '</td><td class="l nm">' + esc(s.name) + '</td><td class="num">' + esc(o.codes[s.no] || '—') + '</td><td>' + lab + '</td><td class="num">' + (x && x.last ? hhmm(x.last) : '—') + '</td><td>' + (k !== 'new' ? '<button class="btn alt sm" data-act="oreset" data-no="' + s.no + '" aria-label="إعادة فتح المحاولة لـ ' + esc(s.name) + '">إعادة فتح</button>' : '') + '</td></tr>';
    }).join('');
    box.innerHTML = '<div class="kpis"><div class="kpi"><div class="v">' + cnt.done + '</div><div class="l">سلّموا</div></div><div class="kpi"><div class="v">' + cnt.run + '</div><div class="l">يجيبون الآن</div></div><div class="kpi"><div class="v">' + cnt.over + '</div><div class="l">انتهى وقتهم</div></div><div class="kpi"><div class="v">' + cnt.new + '</div><div class="l">لم يبدؤوا</div></div></div>' +
      '<div class="tw" style="margin-top:10px"><table><thead><tr><th>الرقم</th><th class="l">الاسم</th><th>الرمز</th><th>الحالة</th><th>آخر حفظ</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div><p class="hint">آخر تحديث ' + hhmm(st.t) + ' · يتجدد كل 15 ثانية.</p>';
    var tg = $('#otog'); if (tg) tg.textContent = st.res.status === 'open' ? 'إغلاق باب الدخول' : 'فتح باب الدخول';
  }
  function refreshStat() {
    var t = cur; if (!t || !t.online) return;
    var id = t.online.id;
    gcall({ a: 'status', id: id }).then(function (j) {
      if (!cur || !cur.online || cur.online.id !== id) return;
      ui.ostat = j.ok ? { id: id, t: Date.now(), res: j } : { id: id, t: Date.now(), err: gerr(j) };
      drawStat();
    }, function (e) { if (cur && cur.online && cur.online.id === id) { ui.ostat = { id: id, t: Date.now(), err: e.message }; drawStat(); } });
  }
  function omsg(html) { var b = $('#omsg'); if (b) b.innerHTML = html; }
  function gmsg(html) { var b = $('#gmsg') || $('#omsg'); if (b) b.innerHTML = html; }

  function onlineSaveCfg() {
    var url = ($('#g-url').value || '').trim(), key = ($('#g-key').value || '').trim();
    if (!GAS_RE.test(url)) { gmsg('<div class="notice bad">الرابط غير صحيح. يجب أن يبدأ بـ https://script.google.com ويحوي /macros/s/ وينتهي بـ /exec.</div>'); return; }
    if (!key || key === 'CHANGE-ME') { gmsg('<div class="notice bad">أدخل كلمة السر التي وضعتها مكان KEY في الكود.</div>'); return; }
    gasPut({ url: url, key: key }); gmsg('<div class="notice">جارٍ فحص الاتصال…</div>');
    gcall({ a: 'ping' }).then(function (j) {
      if (!j.ok) { gasPut(null); gmsg('<div class="notice bad">' + esc(gerr(j)) + '</div>'); return; }
      if (!j.ready) { gasPut(null); gmsg('<div class="notice bad">الخادم يعمل لكنك لم تشغّل الدالة setup بعد.</div>'); return; }
      toast('رُبط الخادم بنجاح'); render();
    }, function (e) { gasPut(null); gmsg('<div class="notice bad">' + esc(e.message) + '</div>'); });
  }
  function onlinePublish() {
    var t = cur, c = gasCfg(), mins = parseInt($('#o-min').value, 10), shuf = $('#o-shuf').checked;
    if (!(mins >= 1 && mins <= 600)) { omsg('<div class="notice bad">أدخل زمنًا بين 1 و600 دقيقة.</div>'); return; }
    withBank(function () {
      var items = t.bank.ids.map(function (id) { return BX.byId[id]; });
      if (items.some(function (x) { return !x; })) { omsg('<div class="notice bad">بعض فقرات الاختبار لم تعد في البنك الحالي. أعد بناء الاختبار.</div>'); return; }
      var codes = genCodes(t), id = uid().replace(/[^a-z0-9]/g, '').slice(-9).padStart(8, 'x');
      var def = { items: items.map(function (it) { return { q: it.q, op: it.op }; }) };
      omsg('<div class="notice">جارٍ النشر…</div>');
      gcall({ a: 'publish', id: id, title: t.title, minutes: mins, def: def, shuffle: shuf, codes: t.students.map(function (s) { return { no: s.no, code: codes[s.no] }; }) }).then(function (j) {
        if (!j.ok) { omsg('<div class="notice bad">' + esc(gerr(j)) + '</div>'); return; }
        t.minutes = mins; t.online = { id: id, url: c.url, created: Date.now(), minutes: mins, shuffle: shuf, codes: codes }; save(); ui.ostat = null; toast('نُشر الاختبار'); render();
      }, function (e) { omsg('<div class="notice bad">' + esc(e.message) + '</div>'); });
    });
  }
  function onlinePull() {
    var t = cur, o = t.online, box = $('#pullmsg');
    box.innerHTML = '<div class="notice">جارٍ السحب…</div>';
    gcall({ a: 'results', id: o.id }).then(function (j) {
      if (!j.ok) { box.innerHTML = '<div class="notice bad">' + esc(gerr(j)) + '</div>'; return; }
      var rows = j.rows.filter(function (r) { return findStu(t, r.no) && r.ans.length === t.n; });
      if (!rows.length) { box.innerHTML = '<div class="notice">لا نتائج جاهزة للسحب بعد.</div>'; return; }
      var over = rows.filter(function (r) { var s = findStu(t, r.no); return s.ans && s.src !== 'online' && s.ans.some(function (v) { return v; }); }).length;
      if (over && !confirm(over + ' طالبًا لديهم إجابات مُدخلة يدويًا أو بالمسح وستُستبدل بإجاباتهم الإلكترونية. متابعة؟')) { box.innerHTML = ''; return; }
      rows.forEach(function (r) {
        var s = findStu(t, r.no);
        s.ans = r.ans.split('').map(Number); s.tm = r.tm ? r.tm.split(',').map(Number) : null; s.absent = false; s.src = 'online';
      });
      o.pulled = { t: Date.now(), n: rows.length }; save();
      box.innerHTML = '<div class="notice ok">سُحبت إجابات ' + rows.length + ' طالبًا. يمكنك الآن فتح «التحليل».</div>';
      var cc = $('#calcard'); if (cc) cc.outerHTML = calCard(t);
    }, function (e) { box.innerHTML = '<div class="notice bad">' + esc(e.message) + '</div>'; });
  }

  /* معايرة أزمنة الفقرات من الأزمنة الفعلية (وسيط، بشرط ≥10 طلاب) */
  function calStats(t) {
    var n = t.n, per = [], i;
    for (i = 0; i < n; i++) per.push([]);
    var cnt = 0;
    t.students.forEach(function (s) { if (s.src === 'online' && s.tm && s.tm.length === n) { cnt++; s.tm.forEach(function (v, ix) { if (v > 0 && v <= 600) per[ix].push(v); }); } });
    return { cnt: cnt, med: per.map(function (a) { return a.length >= 10 ? median(a) : 0; }) };
  }
  function calCard(t) {
    if (!t.bank) return '';
    var c = calStats(t);
    if (c.cnt < 10) return '<div class="card" id="calcard"><h2>معايرة الأزمنة</h2><p class="hint">بعد سحب أزمنة 10 طلاب على الأقل تُقارن الأزمنة الفعلية بالمقدَّرة ويمكن اعتمادها لاختباراتك القادمة. المتوفر الآن: ' + c.cnt + '.</p></div>';
    var est = 0, act = 0;
    t.bank.ids.forEach(function (id, i) { est += (t.bank.secs && t.bank.secs[i]) || 0; act += c.med[i] || (t.bank.secs && t.bank.secs[i]) || 0; });
    return '<div class="card" id="calcard"><h2>معايرة الأزمنة</h2><p class="hint">مجموع الأزمنة المقدَّرة وقت البناء ' + Math.round(est / 60) + ' دقيقة، ومجموع الوسيط الفعلي ' + Math.round(act / 60) + ' دقيقة (من ' + c.cnt + ' طالبًا). الأزمنة تشمل القراءة والتردد، وتُعتمد في «بنك الأسئلة» لاختباراتك القادمة فقط.</p><div class="btns"><button class="btn" data-act="ocal">اعتماد الأزمنة الفعلية في البنك</button></div></div>';
  }
  function onlineCal() {
    var t = cur, c = calStats(t), k = 0; db.bankTimes = db.bankTimes || {};
    t.bank.ids.forEach(function (id, i) { if (c.med[i] > 0) { db.bankTimes[id] = Math.max(15, Math.min(300, Math.round(c.med[i] / 5) * 5)); k++; } });
    save(); toast('اعتُمدت أزمنة ' + k + ' فقرة في البنك');
  }

  function slipsHtml(t, o) {
    var link = examLink(o), qr = qrSvg(link), short = link.replace(/^https?:\/\//, '').replace(/\?.*$/, '');
    var h = '<div class="rp"><h1>بطاقات رموز الدخول</h1><div class="hd">' + esc([db.set.school, t.title, t.subject, t.cls].filter(Boolean).join(' · ')) + ' · الزمن ' + esc(o.minutes) + ' دقيقة</div><div class="slips">';
    stuRows(t).forEach(function (s) {
      h += '<div class="slip"><div class="qr">' + qr + '</div><div class="sb"><div class="sn">' + esc(s.name) + '</div><div>رمز الدخول: <b class="sc">' + esc(o.codes[s.no] || '') + '</b></div><div class="su" dir="ltr">' + esc(short) + '</div><div class="ss">امسح الرمز أو افتح الرابط، ثم اكتب رمزك. العدّاد يبدأ عند الدخول.</div></div></div>';
    });
    return h + '</div></div>';
  }
  function posterHtml(t, o) {
    var link = examLink(o);
    return '<div class="rp poster"><h1>' + esc(t.title) + '</h1><div class="hd">' + esc([t.subject, t.cls].filter(Boolean).join(' · ')) + ' · الزمن ' + esc(o.minutes) + ' دقيقة</div><div class="pq">' + qrSvg(link) + '</div><p class="hd">امسح الرمز بكاميرا هاتفك ثم أدخل رمزك الخاص</p></div>';
  }
  function onlineChange(el) {
    if (el.dataset.o === 'min') { var v = parseInt(el.value, 10); if (v >= 1 && v <= 600) { cur.minutes = v; save(); } else el.value = cur.minutes || ''; }
  }
  function onlineAct(act, el) {
    var t = cur, o = t.online;
    switch (act) {
      case 'gsave': onlineSaveCfg(); break;
      case 'gtest': gmsg('<div class="notice">جارٍ الفحص…</div>'); gcall({ a: 'ping' }).then(function (j) { gmsg(j.ok ? '<div class="notice ok">الاتصال سليم.</div>' : '<div class="notice bad">' + esc(gerr(j)) + '</div>'); }, function (e) { gmsg('<div class="notice bad">' + esc(e.message) + '</div>'); }); break;
      case 'gclear': if (confirm('فصل الخادم عن هذا الجهاز؟ الاختبارات المنشورة تبقى على الخادم.')) { gasPut(null); render(); } break;
      case 'gcode': fetch('code.gs.txt').then(function (r) { return r.text(); }).then(function (s) { return navigator.clipboard.writeText(s); }).then(function () { toast('نُسخ الكود. الصقه في Code.gs'); }, function () { toast('تعذّر النسخ. استعمل «تنزيله كملف»'); }); break;
      case 'gcodedl': fetch('code.gs.txt').then(function (r) { return r.blob(); }).then(function (b) { download('Code.gs', b); }); break;
      case 'opub': onlinePublish(); break;
      case 'ocopy': navigator.clipboard.writeText(examLink(o)).then(function () { toast('نُسخ الرابط'); }, function () { var i = $('#o-link'); i.select(); toast('حدّد الرابط وانسخه'); }); break;
      case 'oslips': doPrint(slipsHtml(t, o), false); break;
      case 'oposter': doPrint(posterHtml(t, o), false); break;
      case 'orefresh': refreshStat(); break;
      case 'otoggle': var cur0 = ui.ostat && ui.ostat.res ? ui.ostat.res.status : 'open'; gcall({ a: 'setstatus', id: o.id, status: cur0 === 'open' ? 'closed' : 'open' }).then(function (j) { if (j.ok) { toast(j.status === 'open' ? 'فُتح باب الدخول' : 'أُغلق باب الدخول (من بدأ يكمل)'); refreshStat(); } else toast(gerr(j)); }, function (e) { toast(e.message); }); break;
      case 'opull': onlinePull(); break;
      case 'ocal': onlineCal(); break;
      case 'oreset': var s = findStu(t, +el.dataset.no); if (confirm('إعادة فتح محاولة «' + s.name + '»؟ تُمسح إجاباته على الخادم ويبدأ من جديد برمزه نفسه.')) gcall({ a: 'reset', id: o.id, no: s.no }).then(function (j) { toast(j.ok ? 'أُعيد فتح المحاولة' : gerr(j)); refreshStat(); }, function (e) { toast(e.message); }); break;
      case 'onew': if (confirm('فصل هذا الاختبار عن الخادم لنشره من جديد؟ الإجابات التي سحبتها تبقى في التحليل، وما لم تسحبه يبقى على الخادم ولا يُسحب بعد ذلك.')) { delete t.online; save(); ui.ostat = null; render(); } break;
      case 'oremove': if (confirm('حذف الأسئلة والرموز والإجابات غير المسحوبة من الخادم نهائيًا؟ اسحب النتائج أولًا.')) gcall({ a: 'remove', id: o.id }).then(function (j) { if (j.ok || j.e === 'none') { delete t.online; save(); ui.ostat = null; toast('حُذف النشر من الخادم'); render(); } else toast(gerr(j)); }, function (e) { toast(e.message); }); break;
    }
  }

  /* ---------- الأحداث ---------- */
  document.addEventListener('change', onChange);
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('tr.clk,.tcard') && e.target === e.target) { e.preventDefault(); e.target.click(); }
    if (e.key === 'Enter' && e.target.id === 'qa') { e.preventDefault(); quickSave(); }
  });
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]'); if (!el || el.tagName === 'INPUT' || el.tagName === 'SELECT') return;
    var act = el.dataset.act, t = cur;
    switch (act) {
      case 'back': go('#/'); break;
      case 'tab': go('#/t/' + t.id + '/' + el.dataset.tab); break;
      case 'new': var nt = newTest(); db.tests.push(nt); save(); go('#/t/' + nt.id + '/setup'); break;
      case 'open': go('#/t/' + el.dataset.id); break;
      case 'dup': e.stopPropagation(); var s0 = getTest(el.dataset.id), cp = JSON.parse(JSON.stringify(s0)); cp.id = uid(); cp.title += ' (نسخة)'; cp.created = Date.now(); db.tests.push(cp); save(); render(); toast('نُسخ الاختبار'); break;
      case 'del': e.stopPropagation(); var d0 = getTest(el.dataset.id); if (confirm('حذف «' + d0.title + '» نهائيًا مع إجابات طلبته؟ لا يمكن التراجع.')) { db.tests = db.tests.filter(function (x) { return x.id !== d0.id; }); save(); render(); } break;
      case 'backup': backup(); break;
      case 'setn': var inp = $('#f-n'); inp.value = el.dataset.n; inp.dispatchEvent(new Event('change', { bubbles: true })); break;
      case 'keycell': var i = +el.dataset.i; t.key[i] = (t.key[i] + 1) % 5; save(); el.querySelector('b').textContent = t.key[i] ? LET[t.key[i]] : '·'; el.classList.toggle('on', !!t.key[i]); el.setAttribute('aria-label', 'الفقرة ' + (i + 1) + ': ' + (t.key[i] ? LET[t.key[i]] : 'بلا مفتاح')); $('#f-key').value = t.key.map(function (k) { return k ? LET[k] : '-'; }).join(''); $('#keyinfo').innerHTML = '<p class="hint">' + keyed(t) + ' من ' + t.n + ' فقرة لها مفتاح.</p>' + (keyed(t) < t.n ? '<div class="notice">' + (t.n - keyed(t)) + ' فقرة بلا مفتاح ولن تُحلَّل.</div>' : ''); break;
      case 'addout': t.outcomes.push({ name: 'نتاج ' + (t.outcomes.length + 1), items: [] }); save(); drawOuts(); break;
      case 'delout': t.outcomes.splice(+el.dataset.i, 1); save(); drawOuts(); break;
      case 'roster': var pr = applyRoster(t, $('#f-roster').value); if (pr) { $('#f-roster').value = rosterText(t); $('#rosterinfo').innerHTML = t.students.length + ' طالبًا في القائمة.' + (pr.warn.length ? '<div class="notice">' + esc(pr.warn.join('. ')) + '</div>' : ''); } break;
      case 'emode': ui.entryMode = el.dataset.m; render(); break;
      case 'mcell': cycleCell(el); break;
      case 'quick': quickSave(); break;
      case 'pastego': pasteGo(); break;
      case 'pick': var c = ui.scans.filter(function (x) { return x.id === el.dataset.id; })[0]; c.touched[+el.dataset.i] = true; c.choice[+el.dataset.i] = +el.dataset.k; drawScans(); break;
      case 'scansave': scanSave(el.dataset.id); break;
      case 'scandrop': ui.scans = ui.scans.filter(function (x) { return x.id !== el.dataset.id; }); drawScans(); break;
      case 'atab': ui.atab = el.dataset.a; render(); break;
      case 'item': var n = +el.dataset.n; ui.openItem = ui.openItem === n ? null : n; render(); break;
      case 'sortrank': ui.sortRank = !ui.sortRank; render(); break;
      case 'report': var a = analysisFor(t); doPrint(reportHtml(t, a), false); break;
      case 'xlsx': exportXlsx(t, analysisFor(t)); break;
      case 'csv': exportCsv(t, analysisFor(t)); break;
      case 'smode': sheetOpt.mode = el.dataset.m; render(); break;
      case 'printsheets': printSheets(); break;
      case 'bank': go('#/bank'); break;
      case 'bgrade': ui.bank.grade = el.dataset.v; render(); break;
      case 'bsubj': ui.bank.subject = el.dataset.v; render(); break;
      case 'bunit': bankToggleUnit(el.dataset.id); break;
      case 'bauto': bankAuto(); break;
      case 'bdraw': bankDraw(false); break;
      case 'bredraw': bankDraw(true); break;
      case 'brep': bankReplace(+el.dataset.i); break;
      case 'bcreate': bankCreate(); break;
      case 'bprint': withBank(function () { doPrint(examHtml(bankPseudoTest()), false); }); break;
      case 'bprintkey': withBank(function () { doPrint(keyHtml(bankPseudoTest()), false); }); break;
      case 'printexam': withBank(function () { doPrint(examHtml(t), false); }); break;
      case 'printkey': withBank(function () { doPrint(keyHtml(t), false); }); break;
      case 'banklog': bankLogSave(t); break;
      default: if (t && /^(g|o)[a-z]+$/.test(act)) onlineAct(act, el);
    }
  });
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el.dataset && el.dataset.act === 'selstu') {
      var c = ui.scans.filter(function (x) { return x.id === el.dataset.id; })[0];
      c.stuNo = el.value === '' ? '' : (el.value.indexOf('add:') === 0 ? el.value : parseInt(el.value, 10)); drawScans();
    }
  });

  /* ---------- الإقلاع ---------- */
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(function () {});
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
  window.__tahlil = { get db() { return db; }, render: render, scanFiles: scanFiles };
  render();
})();
