// firebase-messaging-sw.js — Service Worker for FCM + Safe Runtime Caching
// Must be at the ROOT of the domain for scope to cover all pages

const CACHE_NAME = 'qco-pwa-v2';

// PWA lifecycle
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
    // Clean up old caches and claim clients
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// =====================================================
// SAFE RUNTIME CACHING (no cache.addAll, no navigate intercept)
// Only caches JS, CSS, images, and fonts AFTER successful network load.
// Never intercepts page navigation — iOS Safari requires this.
// =====================================================
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    if (event.request.mode === 'navigate') return; // NEVER touch navigation
    if (!event.request.url.startsWith(self.location.origin)) return;

    // Skip API calls and Firebase SDK requests
    const url = event.request.url;
    if (url.includes('/api/') ||
        url.includes('firestore.googleapis.com') ||
        url.includes('fcm.googleapis.com') ||
        url.includes('gstatic.com')) return;

    // Only cache static assets (JS, CSS, images, sounds, fonts)
    const isStaticAsset = url.match(/\.(js|css|png|jpg|jpeg|svg|gif|ico|woff2?|ttf|mp3|json)(\?.*)?$/i);
    if (!isStaticAsset) return;

    event.respondWith(
        caches.open(CACHE_NAME).then(cache =>
            cache.match(event.request).then(cached => {
                const fetchPromise = fetch(event.request).then(response => {
                    if (response.ok) cache.put(event.request, response.clone());
                    return response;
                }).catch(() => cached); // Network fail → serve cache

                return cached || fetchPromise; // Cache first for static assets
            })
        )
    );
});

// =====================================================
// FIREBASE CLOUD MESSAGING
// =====================================================
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyCayfWGQP1t3oBU9eFj-3Ww0uu7nSl3Q4g",
    authDomain: "sidneymailer.firebaseapp.com",
    projectId: "sidneymailer",
    storageBucket: "sidneymailer.firebasestorage.app",
    messagingSenderId: "911316068119",
    appId: "1:911316068119:web:ce23dbe663dc385a81f952"
});

const messaging = firebase.messaging();

// Handle background messages (when app is NOT in focus)
messaging.onBackgroundMessage((payload) => {
    console.log('[SW] Background message received:', payload);

    // Build notification from either notification or data payload
    const n = payload.notification || {};
    const d = payload.data || {};

    const notificationTitle = d.title || n.title || 'Changeover Alert';
    const notificationOptions = {
        body: d.body || n.body || 'A changeover operation has started.',
        icon: '/assets/icons/icon-192.png',
        badge: '/assets/icons/icon-72.png',
        tag: d.qcoId || 'changeover-notification',
        data: d,
        vibrate: [200, 100, 200],
        requireInteraction: true,
        actions: [
            { action: 'view', title: 'View Details' }
        ]
    };

    // Always show our custom notification (suppress the automatic one by returning)
    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const url = '/outside/change.html';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes('change.html')) {
                    return client.focus();
                }
            }
            return clients.openWindow(url);
        })
    );
});
