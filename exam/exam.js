/* صفحة الطالب — اختبار إلكتروني. لا تحتوي مفتاح الإجابة ولا أسماء الطلبة. */
(function () {
  'use strict';
  var LET = ['', 'أ', 'ب', 'ج', 'د'];
  var APP = document.getElementById('app');
  var P = new URLSearchParams(location.search);
  var examId = (P.get('e') || '').trim();
  var gas = P.get('u') || (P.get('g') ? 'https://script.google.com/macros/s/' + P.get('g') + '/exec' : '');
  var okGas = /^https:\/\/script\.google\.com\/(a\/[\w.-]+\/)?macros\/s\/[\w-]+\/exec$/.test(gas);
  var okId = /^[A-Za-z0-9_-]{4,40}$/.test(examId);
  var LSK = 'tahlil-exam:' + examId;
  var S = null, timers = {}, offline = false;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function rich(s) {
    return esc(s).replace(/&lt;ltr&gt;/g, '<span dir="ltr" style="unicode-bidi:isolate">').replace(/&lt;\/ltr&gt;/g, '</span>').replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>');
  }
  function toast(t) { var el = document.getElementById('toast'); el.textContent = t; el.className = 'on'; clearTimeout(timers.toast); timers.toast = setTimeout(function () { el.className = ''; }, 3500); }
  function lsGet() { try { return JSON.parse(localStorage.getItem(LSK) || 'null'); } catch (e) { return null; } }
  function lsSet(o) { try { localStorage.setItem(LSK, JSON.stringify(o)); } catch (e) { /* التخزين ممتلئ أو ممنوع */ } }

  /* ---------- الشبكة ---------- */
  function api(body, ms) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var to = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 20000);
    var t0 = Date.now();
    return fetch(gas, { method: 'POST', body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined, redirect: 'follow' })
      .then(function (r) { clearTimeout(to); return r.text(); })
      .then(function (txt) {
        var j; try { j = JSON.parse(txt); } catch (e) { throw { net: true }; }
        j._t0 = t0; j._t1 = Date.now();
        return j;
      }, function () { clearTimeout(to); throw { net: true }; });
  }
  function syncClock(j) {
    if (typeof j.now === 'number') S.offset = j.now - (j._t0 + j._t1) / 2;
    if (typeof j.deadline === 'number') S.deadline = j.deadline;
  }
  function remainMs() { return S.deadline - (Date.now() + S.offset); }

  /* ---------- ترتيب الأسئلة لكل طالب ---------- */
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function makeOrder(n, shuffle, seed) {
    var o = []; for (var i = 0; i < n; i++) o.push(i);
    if (!shuffle) return o;
    var r = mulberry(seed * 7919 + 13);
    for (var k = n - 1; k > 0; k--) { var j = Math.floor(r() * (k + 1)), t = o[k]; o[k] = o[j]; o[j] = t; }
    return o;
  }

  /* ---------- الشاشات ---------- */
  function screenError(msg) {
    APP.innerHTML = '<div class="box"><h1>تعذّر فتح الاختبار</h1><div class="msg bad">' + esc(msg) + '</div><p class="hint">اطلب من معلمك الرابط أو رمز QR مرة أخرى.</p></div>';
  }
  function screenLogin(note, kind) {
    var saved = lsGet(), code = saved && saved.code && !saved.submitted ? saved.code : '';
    APP.innerHTML = '<div class="box"><h1>اختبار إلكتروني</h1><p class="hint">أدخل رمز الدخول الخاص بك (6 أرقام) الذي أعطاك إياه المعلم.</p>' +
      '<div class="card"><label for="code">رمز الدخول</label><input id="code" class="code" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" value="' + esc(code) + '" aria-describedby="lm">' +
      '<div id="lm" aria-live="polite">' + (note ? '<div class="msg ' + (kind || 'bad') + '">' + esc(note) + '</div>' : '') + '</div>' +
      '<button class="btn full" id="go" style="margin-top:10px">' + (code ? 'متابعة الاختبار' : 'ابدأ') + '</button></div>' +
      '<p class="hint">عند الضغط على «ابدأ» يبدأ العدّاد ولا يتوقف. تُحفظ إجاباتك تلقائيًا، وإن انقطع الإنترنت فأكمل وسيُرسَل ما كتبته عند عودته.</p></div>';
    var inp = document.getElementById('code'), go = document.getElementById('go');
    inp.addEventListener('input', function () { inp.value = inp.value.replace(/[^0-9٠-٩]/g, '').replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 1632); }).slice(0, 6); });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go.click(); });
    go.addEventListener('click', function () { login(inp.value); });
    if (!code) inp.focus();
  }

  function login(code, tries) {
    tries = tries || 0;
    if (!/^[0-9]{6}$/.test(code)) { screenLogin('الرمز مكوّن من 6 أرقام.'); return; }
    var go = document.getElementById('go'); if (go) { go.disabled = true; go.textContent = 'جارٍ الاتصال…'; }
    api({ a: 'start', id: examId, code: code }).then(function (j) {
      if (!j.ok) {
        if (j.e === 'busy' && tries < 4) { setTimeout(function () { login(code, tries + 1); }, 1200 + tries * 800); return; }
        var m = { code: 'الرمز غير صحيح. تأكد من الأرقام.', none: 'هذا الاختبار غير موجود أو حُذف.', closed: 'أُغلق الاختبار ولا يمكن البدء الآن.', locked: 'محاولات كثيرة خاطئة. انتظر عدة دقائق ثم حاول.', busy: 'الخادم مشغول. حاول بعد لحظات.', nosetup: 'الخادم غير مهيّأ. أبلغ المعلم.', auth: 'خطأ في الإعداد. أبلغ المعلم.' }[j.e] || 'حدث خطأ غير متوقع. أبلغ المعلم.';
        screenLogin(m); return;
      }
      if (j.done) { lsSet({ code: code, submitted: true }); screenDone(j.late); return; }
      var items; try { items = JSON.parse(j.def).items; } catch (e) { screenLogin('تعذّر تحميل الأسئلة. حاول مرة أخرى.'); return; }
      S = { code: code, title: j.title, n: j.n, items: items, order: makeOrder(j.n, j.shuffle, j.seed), ans: [], tm: [], cur: 0, deadline: j.deadline, offset: 0, minSec: j.minSec || 0, lock: !!j.lock, dirty: false, saving: false, curStart: 0, submitting: false, last: '' };
      syncClock(j);
      var i, a = j.ans || '', t = (j.tm || '').split(',');
      for (i = 0; i < j.n; i++) { S.ans[i] = a.length === j.n ? +a.charAt(i) : 0; S.tm[i] = +t[i] || 0; }
      var loc = lsGet();
      if (loc && loc.code === code && loc.ans && loc.ans.length === j.n) { // محلي أحدث إن وُجد
        var la = 0, sa = 0; loc.ans.forEach(function (v) { if (v) la++; }); S.ans.forEach(function (v) { if (v) sa++; });
        if (la > sa) { S.ans = loc.ans.slice(); S.dirty = true; }
        if (typeof loc.cur === 'number') S.cur = Math.min(Math.max(0, loc.cur), j.n - 1);
        if (loc.tm && loc.tm.length === j.n) S.tm = S.tm.map(function (v, k) { return Math.max(v, loc.tm[k] || 0); });
      }
      persist(true); startExam();
    }, function () {
      var loc = lsGet();
      if (loc && loc.code === code && loc.items && !loc.submitted) { resumeLocal(loc); return; }
      screenLogin('لا يوجد اتصال بالإنترنت. اتصل بالشبكة ثم أعد المحاولة.');
    });
  }

  function persist(full) {
    var o = { code: S.code, ans: S.ans, tm: S.tm.map(function (v) { return Math.round(v); }), cur: S.cur, deadline: S.deadline, offset: S.offset, savedAt: Date.now(), submitted: false, minSec: S.minSec, lock: S.lock };
    if (full) { o.items = S.items; o.title = S.title; o.n = S.n; o.order = S.order; } else { var old = lsGet(); if (old && old.items) { o.items = old.items; o.title = old.title; o.n = old.n; o.order = old.order; } else { o.items = S.items; o.title = S.title; o.n = S.n; o.order = S.order; } }
    lsSet(o);
  }
  function resumeLocal(loc) {
    S = { code: loc.code, title: loc.title, n: loc.n, items: loc.items, order: loc.order, ans: loc.ans.slice(), tm: loc.tm.slice(), cur: loc.cur || 0, deadline: loc.deadline, offset: loc.offset || 0, minSec: loc.minSec || 0, lock: !!loc.lock, dirty: true, saving: false, curStart: 0, submitting: false, last: '' };
    // الساعة المحلية قد تغيّرت منذ آخر اتصال؛ نحافظ على الفرق الذي قيس سابقًا
    startExam();
    setOffline(true);
  }

  /* ---------- شاشة الاختبار ---------- */
  function startExam() {
    document.title = S.title || 'اختبار';
    APP.innerHTML = '<div class="bar"><div class="in"><div><b id="ttl"></b><div class="sv" id="sv" aria-live="polite"></div></div><div class="tmr" id="tmr" role="timer" aria-label="الزمن المتبقي">--:--</div></div></div>' +
      '<div class="qv" id="qv"></div><div class="act"><div class="in" id="acts"></div></div>';
    document.getElementById('ttl').textContent = S.title || '';
    S.curStart = document.hidden ? 0 : Date.now();
    drawQ(); tick();
    clearInterval(timers.tick); timers.tick = setInterval(tick, 500);
    clearInterval(timers.sync); timers.sync = setInterval(function () { if (S && !S.finished) sync(false); }, 15000);
  }
  function fmt(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (x < 10 ? '0' : '') + x;
  }
  var warned = {};
  function tick() {
    if (!S) return;
    var r = remainMs(), el = document.getElementById('tmr');
    if (el) { el.textContent = fmt(r); el.className = 'tmr' + (r <= 60000 ? ' w1' : r <= 300000 ? ' w5' : ''); }
    if (r <= 300000 && r > 0 && !warned[5]) { warned[5] = 1; toast('بقي 5 دقائق'); }
    if (r <= 60000 && r > 0 && !warned[1]) { warned[1] = 1; toast('بقيت دقيقة واحدة'); }
    if (document.getElementById('lk')) applyLock();
    if (r <= 0 && !S.submitting) { S.submitting = true; toast('انتهى الزمن، يجري تسليم إجاباتك'); submit(true); }
  }
  function flushTm() {
    if (!S || !S.curStart) return;
    var now = Date.now(), idx = S.order[S.cur];
    S.tm[idx] = Math.min(3600, (S.tm[idx] || 0) + (now - S.curStart) / 1000);
    S.curStart = document.hidden ? 0 : now;
  }
  document.addEventListener('visibilitychange', function () {
    if (!S) return;
    if (document.hidden) { flushTm(); S.curStart = 0; if (S.dirty) sync(false); }
    else { S.curStart = Date.now(); tick(); }
  });
  window.addEventListener('online', function () { if (S) sync(false); });
  window.addEventListener('offline', function () { if (S) setOffline(true); });

  function setOffline(v) {
    offline = v;
    var sv = document.getElementById('sv'); if (!sv) return;
    sv.textContent = v ? 'لا اتصال — إجاباتك محفوظة على جهازك وستُرسَل تلقائيًا' : (S && S.dirty ? 'جارٍ الحفظ…' : 'محفوظ ✓');
  }

  /* الحد الأدنى لزمن الفقرة: لا يُقبل ظلال الإجابة قبل مرور minSec ثانية من الوقت الفعلي على الفقرة */
  function lockLeft() {
    if (!S || !S.lock || !S.minSec) return 0;
    var idx = S.order[S.cur], el = S.curStart ? (Date.now() - S.curStart) / 1000 : 0;
    return Math.max(0, Math.ceil(S.minSec - ((S.tm[idx] || 0) + el)));
  }
  function applyLock() {
    var n = lockLeft(), box = document.getElementById('lk');
    document.querySelectorAll('.opt').forEach(function (b) { b.disabled = n > 0; b.setAttribute('aria-disabled', n > 0 ? 'true' : 'false'); if (n > 0) b.style.opacity = '.6'; else b.style.opacity = ''; });
    if (box) box.textContent = n > 0 ? 'اقرأ السؤال جيدًا: يمكنك الإجابة بعد ' + n + ' ثوانٍ' : '';
  }
  function drawQ() {
    var i = S.order[S.cur], it = S.items[i], a = S.ans[i], n = S.n;
    var h = '<div class="qn">السؤال ' + (S.cur + 1) + ' من ' + n + '</div><div class="qt">' + rich(it.q) + '</div>';
    it.op.forEach(function (o, k) {
      h += '<button class="opt" data-o="' + (k + 1) + '" aria-pressed="' + (a === k + 1) + '"><span class="lt" aria-hidden="true">' + LET[k + 1] + '</span><span>' + rich(o) + '</span></button>';
    });
    h += '<div id="lk" class="hint" aria-live="polite" style="min-height:22px"></div><div style="margin-top:4px"><button class="clr" data-clr="1"' + (a ? '' : ' disabled') + '>مسح إجابتي لهذا السؤال</button></div>';
    var done = 0; S.order.forEach(function (ix, p) { if (S.ans[ix]) done++; });
    h += '<details class="card"><summary>كل الأسئلة (أجبتَ عن ' + done + ' من ' + n + ')</summary><div class="grid">';
    for (var p = 0; p < n; p++) h += '<button class="nv' + (S.ans[S.order[p]] ? ' done' : '') + (p === S.cur ? ' cur' : '') + '" data-go="' + p + '" aria-label="السؤال ' + (p + 1) + (S.ans[S.order[p]] ? '، تمت الإجابة' : '') + '">' + (p + 1) + '</button>';
    h += '</div></details>';
    document.getElementById('qv').innerHTML = h;
    var last = S.cur === n - 1;
    document.getElementById('acts').innerHTML = '<button class="btn alt" data-nav="-1"' + (S.cur === 0 ? ' disabled' : '') + '>السابق</button>' +
      (last ? '<button class="btn" data-review="1">مراجعة وتسليم</button>' : '<button class="btn" data-nav="1">التالي</button>');
    if (!last) { /* زر مراجعة ثانوي داخل القائمة السفلية غير لازم: القائمة أعلاه تتيح التنقل */ }
    document.getElementById('acts').style.display = '';
    applyLock();
    window.scrollTo(0, 0);
  }

  function setAns(k) {
    if (lockLeft() > 0) return;
    var i = S.order[S.cur]; flushTm();
    S.ans[i] = S.ans[i] === k ? 0 : k; S.dirty = true; persist(false);
    setOffline(offline); drawQ(); window.scrollTo(0, window.scrollY);
    clearTimeout(timers.deb); timers.deb = setTimeout(function () { sync(false); }, 1200);
  }
  function go(p) { flushTm(); S.cur = Math.max(0, Math.min(S.n - 1, p)); persist(false); drawQ(); }

  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('button') : null; if (!t || !S) return;
    if (t.dataset.o) setAns(+t.dataset.o);
    else if (t.dataset.clr) { var i = S.order[S.cur]; if (S.ans[i]) { S.ans[i] = 0; S.dirty = true; persist(false); drawQ(); clearTimeout(timers.deb); timers.deb = setTimeout(function () { sync(false); }, 1200); } }
    else if (t.dataset.nav) go(S.cur + +t.dataset.nav);
    else if (t.dataset.go) go(+t.dataset.go);
    else if (t.dataset.review) review();
    else if (t.dataset.back) { drawQ(); document.getElementById('acts').style.display = ''; }
    else if (t.dataset.submit) { S.submitting = true; submit(false); }
  });

  function review() {
    flushTm();
    var miss = []; S.order.forEach(function (ix, p) { if (!S.ans[ix]) miss.push(p + 1); });
    var h = '<h2>مراجعة قبل التسليم</h2><div class="card"><p style="margin:0">أجبتَ عن <b>' + (S.n - miss.length) + '</b> من <b>' + S.n + '</b> سؤالًا.</p>' +
      (miss.length ? '<div class="msg warn">أسئلة بلا إجابة: ' + miss.map(function (m) { return '<button class="nv" style="min-height:36px;min-width:40px" data-go="' + (m - 1) + '">' + m + '</button>'; }).join(' ') + '</div>' : '<div class="msg ok">أجبتَ عن كل الأسئلة.</div>') +
      '<p class="hint">بعد التسليم لا يمكنك تغيير إجاباتك.</p></div>' +
      '<div style="display:flex;gap:10px"><button class="btn alt" data-back="1" style="flex:1">العودة للأسئلة</button><button class="btn" data-submit="1" style="flex:1">تسليم نهائي</button></div>';
    document.getElementById('qv').innerHTML = h; document.getElementById('acts').style.display = 'none'; window.scrollTo(0, 0);
  }

  /* ---------- الحفظ والتسليم ---------- */
  function payload() {
    flushTm();
    var a = '', i; for (i = 0; i < S.n; i++) a += (S.ans[i] >= 0 && S.ans[i] <= 4 ? S.ans[i] : 0);
    return { id: examId, code: S.code, ans: a, tm: S.tm.map(function (v) { return Math.round(v); }).join(',') };
  }
  function sync(final) {
    if (!S || S.saving) return Promise.resolve();
    S.saving = true; var p = payload(); p.a = final ? 'submit' : 'save'; var sent = p.ans;
    return api(p).then(function (j) {
      S.saving = false;
      if (j.ok) {
        syncClock(j); setOffline(false);
        if (S.last === sent || sent === payload().ans) S.dirty = false;
        S.last = sent;
        if (j.done && !final) { finish(false); return; }
        var sv = document.getElementById('sv'); if (sv) sv.textContent = S.dirty ? 'جارٍ الحفظ…' : 'محفوظ ✓';
        return j;
      }
      if (j.e === 'late' || j.done) { finish(true); return; }
      if (j.e === 'busy') { setOffline(true); return; }
      toast('تعذّر الحفظ (' + j.e + ')'); setOffline(true);
    }, function () { S.saving = false; setOffline(true); });
  }
  function submit(auto) {
    clearTimeout(timers.deb);
    var tryIt = function (k) {
      S.saving = false;
      sync(true).then(function (j) {
        if (document.getElementById('app') && !(S && S.finished)) {
          if (j && j.done) { finish(false); return; }
          if (S && !S.finished) {
            if (k >= 3 && !auto) { S.submitting = false; toast('لم يصل التسليم. تحقق من الاتصال ثم اضغط تسليم مرة أخرى.'); var sv = document.getElementById('sv'); if (sv) sv.textContent = 'لم يُسلَّم بعد'; return; }
            setTimeout(function () { tryIt(k + 1); }, Math.min(8000, 1500 * (k + 1)));
          }
        }
      });
    };
    tryIt(0);
  }
  function finish(late) {
    if (!S || S.finished) return;
    S.finished = true; clearInterval(timers.tick); clearInterval(timers.sync);
    lsSet({ code: S.code, submitted: true });
    screenDone(late);
  }
  function screenDone(late) {
    APP.innerHTML = '<div class="box"><h1>تم تسليم اختبارك</h1><div class="msg ok">' + (late ? 'انتهى الزمن وسُجّلت آخر إجاباتك المحفوظة.' : 'وصلت إجاباتك إلى معلمك.') + '</div>' +
      '<p class="hint">ستظهر النتيجة عند معلمك. يمكنك إغلاق هذه الصفحة.</p></div>';
  }

  /* ---------- البداية ---------- */
  if (!okId || !okGas) { screenError(!okId ? 'رابط الاختبار ناقص.' : 'عنوان الخادم في الرابط غير صالح.'); return; }
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(function () { /* اختياري */ });
  var sv0 = lsGet();
  if (sv0 && sv0.submitted) screenLogin('', 'ok');
  else screenLogin();
  window.__exam = { get S() { return S; } };
})();
