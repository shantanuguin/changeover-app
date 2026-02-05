// Empty Service Worker to resolve 404 errors
self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', () => {
    return self.clients.claim();
});

self.addEventListener('fetch', () => {
    // No-op
});
