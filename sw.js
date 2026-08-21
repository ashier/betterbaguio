var CACHE = 'betterbaguio-v0.1.0-projects';
var CORE = [
  '/', '/services/', '/government/', '/statistics/', '/projects/', '/legislative/', '/budget/', '/contact/',
  '/assets/css/better-baguio.css', '/assets/js/site-shell.js', '/assets/js/weather-hero.js', '/assets/js/projects-tracker.js',
  '/data/prism/projects.json',
  '/assets/images/logo/better-baguio-mark.png',
  '/manifest.webmanifest'
];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) { return cache.addAll(CORE); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (key) { return key !== CACHE; }).map(function (key) { return caches.delete(key); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).then(function (response) {
    if (response.ok && new URL(event.request.url).origin === self.location.origin) {
      caches.open(CACHE).then(function (cache) { cache.put(event.request, response.clone()); });
    }
    return response;
  }).catch(function () { return caches.match(event.request).then(function (hit) { return hit || caches.match('/'); }); }));
});
