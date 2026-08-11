const CACHE_NAME = 'dinner-recipe-cache-v6';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/db.js',
  './js/router.js',
  './js/constants.js',
  './js/ui.js',
  './js/firebase-config.js',
  './js/views/list.js',
  './js/views/form.js',
  './js/views/detail.js',
  './js/views/tags.js',
  './js/views/settings.js',
  './js/views/import.js',
  './js/views/calendar.js',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// ネットワーク優先: オンライン時は常に最新を取得し、取れた分だけキャッシュを更新する。
// オフライン時のみキャッシュにフォールバックする(stale-while-revalidateだと1つ前の
// バージョンを掴んだまま更新に気づきにくいため、開発中の取り違えを避ける狙いもある)。
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
