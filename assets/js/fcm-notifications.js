/**
 * FCM Notifications Module
 * Handles permission requests, token management, and foreground message display.
 * 
 * Usage: Include this script, then call initFCM() after Firebase is initialized.
 */

const FCM_VAPID_KEY = 'BDYMjTSGQ8IxPCTS3dasWodoDW6Z_VZEYOkWMZx6Xec29DCyVdiiIrYNLB6dlb_hCPdfKbbF6OHSAEGLsptuoeQ';

let fcmMessaging = null;

/**
 * Initialize FCM: register service worker, request permission, save token.
 * Call this after firebase.initializeApp() and after `db` is available.
 */
async function initFCM() {
    try {
        // Check browser support
        if (!('Notification' in window) || !('serviceWorker' in navigator)) {
            console.warn('[FCM] Browser does not support notifications');
            return;
        }

        // Register service worker — resolve path relative to site root
        const swPath = new URL('/firebase-messaging-sw.js', window.location.origin).href;
        const swRegistration = await navigator.serviceWorker.register(swPath, { scope: '/' });
        console.log('[FCM] Service worker registered');

        // Get messaging instance (compat SDK)
        fcmMessaging = firebase.messaging();

        // Request permission
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.warn('[FCM] Notification permission denied');
            return;
        }

        // Get token
        const token = await fcmMessaging.getToken({
            vapidKey: FCM_VAPID_KEY,
            serviceWorkerRegistration: swRegistration
        });

        if (token) {
            console.log('[FCM] Token obtained:', token.substring(0, 20) + '...');
            await saveTokenToFirestore(token);
        } else {
            console.warn('[FCM] No token available');
        }

        // Listen for foreground messages
        fcmMessaging.onMessage((payload) => {
            console.log('[FCM] Foreground message:', payload);
            showFCMToast(payload);
        });

    } catch (error) {
        console.error('[FCM] Init error:', error);
    }
}

/**
 * Save FCM token to Firestore fcm_tokens collection.
 * Uses the token itself as the document ID to avoid duplicates.
 */
async function saveTokenToFirestore(token) {
    if (!db) {
        console.warn('[FCM] Firestore not available, cannot save token');
        return;
    }

    try {
        await db.collection('fcm_tokens').doc(token).set({
            token: token,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            userAgent: navigator.userAgent,
            // Store user info if available
            userName: (typeof currentUser !== 'undefined' && currentUser?.name) ? currentUser.name : 'Unknown'
        }, { merge: true });
        console.log('[FCM] Token saved to Firestore');
    } catch (error) {
        console.error('[FCM] Error saving token:', error);
    }
}

/**
 * Show a toast notification for foreground messages.
 */
function showFCMToast(payload) {
    const title = payload.notification?.title || 'Notification';
    const body = payload.notification?.body || '';

    const toast = document.createElement('div');
    toast.className = 'fixed top-5 right-5 z-[9999] max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 transform translate-x-full transition-transform duration-500';
    toast.innerHTML = `
        <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                <i data-lucide="bell" class="w-5 h-5 text-white"></i>
            </div>
            <div class="flex-1 min-w-0">
                <p class="text-sm font-bold text-slate-900">${title}</p>
                <p class="text-xs text-slate-500 mt-0.5 line-clamp-2">${body}</p>
            </div>
            <button onclick="this.closest('div.fixed').remove()" class="p-1 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0">
                <i data-lucide="x" class="w-4 h-4 text-slate-400"></i>
            </button>
        </div>
    `;

    document.body.appendChild(toast);

    // Slide in
    requestAnimationFrame(() => {
        toast.classList.remove('translate-x-full');
    });

    // Try to create lucide icons if available
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // Auto-remove after 8 seconds
    setTimeout(() => {
        toast.classList.add('translate-x-full');
        setTimeout(() => toast.remove(), 500);
    }, 8000);
}

/**
 * Send a notification to all subscribed users via the backend.
 * Called from startOperation() when it's the FIRST operation.
 */
async function sendStartNotification(qcoId, opName, qcoData) {
    try {
        const settings = JSON.parse(localStorage.getItem('appSettings')) || {};
        const backendUrl = settings.backendUrl || (typeof BACKEND_URL !== 'undefined' ? BACKEND_URL : 'http://localhost:3000');

        const lineName = qcoData?.lineNumber || 'Unknown Line';
        const styleName = qcoData?.upcomingStyle || 'Unknown Style';
        const qcoNumber = qcoData?.qcoNumber || qcoId;

        const response = await fetch(`${backendUrl}/api/send-notification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: `🔄 Changeover Started — ${lineName}`,
                body: `${qcoNumber} | Style: ${styleName} | First operation "${opName}" has begun.`,
                qcoId: qcoId,
                data: {
                    qcoId,
                    qcoNumber,
                    lineName,
                    styleName,
                    opName,
                    startedAt: new Date().toISOString()
                }
            })
        });

        const result = await response.json();
        if (result.success) {
            console.log(`[FCM] Notification sent to ${result.successCount} devices`);
        } else {
            console.warn('[FCM] Notification send failed:', result.message);
        }
    } catch (error) {
        console.error('[FCM] Error sending notification:', error);
        // Don't block the operation start if notification fails
    }
}
