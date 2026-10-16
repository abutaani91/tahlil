/* sw.js — صفحة الطالب فقط: خفيفة وتعمل لو انقطع الإنترنت بعد أول فتح */
var VERSION = 4;
var CACHE = 'tahlil-exam-v' + VERSION;
var FILES = ['./', 'index.html', 'exam.css', 'exam.js', '../icons/icon-192.png',
  '../fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2', '../fonts/ibm-plex-sans-arabic-arabic-600-normal.woff2',
  '../fonts/ibm-plex-sans-arabic-latin-400-normal.woff2', '../fonts/ibm-plex-sans-arabic-latin-600-normal.woff2'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf('tahlil-exam-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(function (r) { return r || fetch(e.request); }));
});
