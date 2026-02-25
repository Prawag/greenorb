const CACHE_NAME = 'greenorb-v3';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/globe.svg',
    '/manifest.json',
];

// Install: cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch: network-first for API calls, cache-first for assets
self.addEventListener('fetch', (event) => {
    const { request } = event;

    // Never cache API calls or external requests
    if (
        request.url.includes('generativelanguage.googleapis.com') ||
        request.url.includes('fonts.googleapis.com') ||
        request.url.includes('fonts.gstatic.com') ||
        request.method !== 'GET'
    ) {
        return;
    }

    event.respondWith(
        caches.match(request).then((cached) => {
            const fetchPromise = fetch(request).then((response) => {
                if (response && response.status === 200 && response.type === 'basic') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                }
                return response;
            }).catch(() => cached);

            return cached || fetchPromise;
        })
    );
});
