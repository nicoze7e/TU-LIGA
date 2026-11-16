// Guarda la "cáscara" de la web para que abra rápido. Los datos siempre se piden a la red.
var CACHE = 'liga-v4';
var BASE = ['./', 'index.html', 'estilos.css', 'app.js', 'roles.js', 'captura.html', 'config.js', 'demo-datos.js', 'manifest.webmanifest', 'icon-192.png', 'icon-180.png', 'logo.svg'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(BASE); })); self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }));
  self.clients.claim();
});
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(function (r) { var c = r.clone(); caches.open(CACHE).then(function (x) { x.put(e.request, c); }); return r; }).catch(function () { return caches.match(e.request); }));
});
