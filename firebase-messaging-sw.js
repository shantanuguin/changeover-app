// firebase-messaging-sw.js — Unified Service Worker for PWA + FCM
// Must be at the ROOT of the domain for scope to cover all pages

// =====================================================
// OFFLINE CACHE — Cache core assets for PWA reliability
// =====================================================
const CACHE_NAME = 'qco-pwa-v1';
const CORE_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/assets/icons/icon-192.png',
    '/assets/icons/icon-512.png',
    '/assets/icons/icon-72.png',
    '/assets/js/fcm-notifications.js',
    '/assets/js/qco-loader.js',
    '/assets/js/qco-alert.js',
    '/assets/js/firebase-config.js'
];

// On install: pre-cache core assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(CORE_ASSETS))
            .then(() => self.skipWaiting())
            .catch(err => {
                console.warn('[SW] Cache addAll failed (some assets may not exist yet):', err);
                self.skipWaiting();
            })
    );
});

// On activate: clean old caches and claim clients
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// Fetch strategy: Only serve cached static assets when offline.
// IMPORTANT: Do NOT intercept navigation requests — this breaks iOS Safari SSL.
self.addEventListener('fetch', (event) => {
    // Only handle GET requests for same-origin static assets
    if (event.request.method !== 'GET') return;
    if (event.request.mode === 'navigate') return; // Never intercept page navigation
    if (!event.request.url.startsWith(self.location.origin)) return;
    if (event.request.url.includes('/api/')) return;

    // Only use cache as fallback when network fails (for static assets only)
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
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

    // If the payload has a `notification` object, Firebase SDK will automatically 
    // display a system notification. We only manually show for pure data payloads.
    if (!payload.notification && payload.data) {
        const notificationTitle = payload.data.title || 'Changeover Alert';
        const notificationOptions = {
            body: payload.data.body || 'A changeover operation has started.',
            icon: '/assets/icons/icon-192.png',
            badge: '/assets/icons/icon-72.png',
            tag: payload.data.qcoId || 'changeover-notification',
            data: payload.data || {},
            vibrate: [200, 100, 200],
            actions: [
                { action: 'view', title: 'View Details' }
            ]
        };

        return self.registration.showNotification(notificationTitle, notificationOptions);
    }
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
