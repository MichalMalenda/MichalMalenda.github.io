// In development, always fetch from the network and do not enable offline support.
// This is because caching would make development more difficult (changes would not
// be reflected on the first load after each change).
self.addEventListener('fetch', () => { });
const CACHE_NAME = 'blazor-cache-v' + new Date().getTime();
self.addEventListener('install', event => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName.startsWith('blazor-cache-v') && cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

self.addEventListener('fetch', event => {
    // Force network requests for framework files
    if (event.request.url.includes('_framework/') ||
        event.request.url.includes('.dll') ||
        event.request.url.includes('.wasm')) {
        event.respondWith(
            fetch(event.request, { cache: 'no-cache' })
        );
    }
});                })
            );
        })
    );
});