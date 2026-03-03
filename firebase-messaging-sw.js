// firebase-messaging-sw.js — Service Worker for FCM Push Notifications
// Must be at the ROOT of the domain for scope to cover all pages
//
// IMPORTANT: This service worker handles ONLY Firebase Cloud Messaging.
// No offline caching — iOS Safari service worker caching causes SSL/navigation errors.

// PWA lifecycle — keep it simple
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
    // Clean up any old caches from previous versions
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
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
