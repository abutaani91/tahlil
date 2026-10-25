/* sw.js — كاش أولًا، رقم إصدار واحد يُرفع بـ node bump.js */
var VERSION = 9;
var CACHE = 'tahlil-v' + VERSION;
var FILES = ['./', 'index.html', 'style.css', 'app.js', 'stats.js', 'sheet.js', 'forms.js', 'bank.js', 'bank.json', 'omr.js', 'qr.js', 'docx.js', 'logos.js', 'code.gs.txt', 'xlsx.min.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png',
  'fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2', 'fonts/ibm-plex-sans-arabic-arabic-500-normal.woff2',
  'fonts/ibm-plex-sans-arabic-arabic-600-normal.woff2', 'fonts/ibm-plex-sans-arabic-arabic-700-normal.woff2',
  'fonts/ibm-plex-sans-arabic-latin-400-normal.woff2', 'fonts/ibm-plex-sans-arabic-latin-500-normal.woff2',
  'fonts/ibm-plex-sans-arabic-latin-600-normal.woff2', 'fonts/ibm-plex-sans-arabic-latin-700-normal.woff2'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(function (r) { return r || fetch(e.request); }));
});
