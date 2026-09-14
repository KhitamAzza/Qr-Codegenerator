const CACHE_NAME = 'qr-generator-v2';
const urlsToCache = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js'
];

// Install
self.addEventListener('install', event => {
    self.skipWaiting(); // activate the new SW immediately instead of waiting for all tabs to close
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Caching app shell');
                return cache.addAll(urlsToCache);
            })
            .catch(err => {
                console.error('Cache addAll failed:', err);
            })
    );
});

// Fetch - network-first: always try to get the latest file first, and only
// fall back to the cache if there's no network (offline). This is the
// opposite of before (cache-first), which was silently serving old app.js
// forever even after the file on disk changed.
self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request)
            .then(response => {
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});

// Activate
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim()) // take control of already-open tabs right away
    );
});