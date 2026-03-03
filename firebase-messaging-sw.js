// firebase-messaging-sw.js — Unified Service Worker for PWA + FCM
// Must be at the ROOT of the domain for scope to cover all pages

// PWA lifecycle
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

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

    const notificationTitle = payload.notification?.title || 'Changeover Alert';
    const notificationOptions = {
        body: payload.notification?.body || 'A changeover operation has started.',
        icon: '/assets/icons/icon-192.png',
        badge: '/assets/icons/icon-72.png',
        tag: payload.data?.qcoId || 'changeover-notification',
        data: payload.data || {},
        vibrate: [200, 100, 200],
        actions: [
            { action: 'view', title: 'View Details' }
        ]
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const url = '/outside/change.html';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Focus existing change.html window if available
            for (const client of clientList) {
                if (client.url.includes('change.html')) {
                    return client.focus();
                }
            }
            // Otherwise open new window
            return clients.openWindow(url);
        })
    );
});
