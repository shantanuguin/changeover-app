/**
 * FCM Notifications Module
 * Handles permission requests, token management, and foreground message display.
 * 
 * Usage: Include this script, then call initFCM() after Firebase is initialized.
 * On iOS PWA, call requestNotificationPermission() from a user gesture (button tap).
 */

const FCM_VAPID_KEY = 'BDYMjTSGQ8IxPCTS3dasWodoDW6Z_VZEYOkWMZx6Xec29DCyVdiiIrYNLB6dlb_hCPdfKbbF6OHSAEGLsptuoeQ';

let fcmMessaging = null;
let fcmSwRegistration = null;

// --- Platform Detection ---
const _isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const _isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

/**
 * Initialize FCM: register service worker and set up foreground listener.
 * On non-iOS or if permission is already granted, also auto-requests token.
 * On iOS PWA, waits for user gesture via requestNotificationPermission().
 */
async function initFCM() {
    try {
        // Check browser support
        if (!('Notification' in window) || !('serviceWorker' in navigator)) {
            console.warn('[FCM] Browser does not support notifications');
            return;
        }

        // iOS detection — FCM requires PWA installation on iOS
        if (_isIOS && !_isStandalone) {
            console.log('[FCM] iOS detected but not running as PWA — skipping FCM init');
            showInstallPrompt();
            return;
        }

        // Step 1: Register service worker
        try {
            const swPath = new URL('/firebase-messaging-sw.js', window.location.origin).href;
            fcmSwRegistration = await navigator.serviceWorker.register(swPath, { scope: '/' });
            console.log('[FCM] Service worker registered');
        } catch (swError) {
            console.error('[FCM] Service worker registration failed:', swError.message);
            console.error('[FCM] Ensure firebase-messaging-sw.js exists at the root of your domain');
            return;
        }

        // Step 2: Get messaging instance
        fcmMessaging = firebase.messaging();

        // Step 3: Listen for foreground messages (always safe to set up)
        fcmMessaging.onMessage((payload) => {
            console.log('[FCM] Foreground message:', payload);
            showFCMToast(payload);
        });

        // Step 4: Auto-request permission on non-iOS (or if already granted)
        if (!_isIOS) {
            // On desktop/Android, auto-request is fine
            await requestNotificationPermission();
        } else if (Notification.permission === 'granted') {
            // iOS PWA with already-granted permission — just get token
            await _getTokenAndSave();
        } else {
            // iOS PWA without permission — show the enable button
            console.log('[FCM] iOS PWA detected — waiting for user gesture to request permission');
            showNotificationButton();
        }

    } catch (error) {
        console.error('[FCM] Init error:', error);
    }
}

/**
 * Request notification permission and get FCM token.
 * MUST be called from a user gesture (button click) on iOS.
 */
async function requestNotificationPermission() {
    try {
        if (!fcmMessaging || !fcmSwRegistration) {
            console.warn('[FCM] FCM not initialized yet. Call initFCM() first.');
            return false;
        }

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.warn('[FCM] Notification permission denied');
            return false;
        }

        await _getTokenAndSave();
        hideNotificationButton();
        return true;

    } catch (error) {
        console.error('[FCM] Permission request error:', error);
        return false;
    }
}

/**
 * Internal: Get FCM token and save to Firestore.
 */
async function _getTokenAndSave() {
    try {
        const token = await fcmMessaging.getToken({
            vapidKey: FCM_VAPID_KEY,
            serviceWorkerRegistration: fcmSwRegistration
        });

        if (token) {
            console.log('[FCM] Token obtained:', token.substring(0, 20) + '...');
            await saveTokenToFirestore(token);
        } else {
            console.warn('[FCM] No token available — ensure FCM API is enabled in Google Cloud Console');
        }
    } catch (tokenError) {
        console.error('[FCM] Token retrieval failed:', tokenError.message);
        if (tokenError.message.includes('push service')) {
            console.error('[FCM] ⚠️  FIX: Enable these APIs in Google Cloud Console → APIs & Services → Library:');
            console.error('[FCM]    1. "Firebase Cloud Messaging API" (NOT the Legacy one)');
            console.error('[FCM]    2. "Firebase Installations API"');
            console.error('[FCM]    Project: sidneymailer | URL: https://console.cloud.google.com/apis/library?project=sidneymailer');
        }
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
    const title = payload.notification?.title || payload.data?.title || 'Notification';
    const body = payload.notification?.body || payload.data?.body || '';

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
    requestAnimationFrame(() => toast.classList.remove('translate-x-full'));

    if (typeof lucide !== 'undefined') lucide.createIcons();

    setTimeout(() => {
        toast.classList.add('translate-x-full');
        setTimeout(() => toast.remove(), 500);
    }, 8000);
}

/**
 * Show "Enable Notifications" floating button for iOS PWA.
 */
function showNotificationButton() {
    // Don't duplicate
    if (document.getElementById('fcm-enable-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'fcm-enable-btn';
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg> Enable Alerts`;
    btn.style.cssText = `
        position: fixed; bottom: 24px; right: 24px; z-index: 9999;
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
        color: white; border: none; padding: 14px 20px; border-radius: 16px;
        font-family: 'Inter', sans-serif; font-weight: 600; font-size: 14px;
        display: flex; align-items: center; gap: 8px;
        box-shadow: 0 10px 25px rgba(15, 23, 42, 0.3);
        cursor: pointer; transition: all 0.2s;
    `;
    btn.addEventListener('click', async () => {
        btn.innerHTML = '<span style="animation: spin 1s linear infinite; display:inline-block;">⏳</span> Requesting...';
        const granted = await requestNotificationPermission();
        if (granted) {
            btn.innerHTML = '✅ Alerts Enabled!';
            btn.style.background = 'linear-gradient(135deg, #059669 0%, #10b981 100%)';
            setTimeout(() => btn.remove(), 2000);
        } else {
            btn.innerHTML = '❌ Permission Denied';
            btn.style.background = 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)';
            setTimeout(() => btn.remove(), 3000);
        }
    });

    document.body.appendChild(btn);
}

/**
 * Hide the notification enable button after permission is granted.
 */
function hideNotificationButton() {
    const btn = document.getElementById('fcm-enable-btn');
    if (btn) btn.remove();
}

/**
 * Show install prompt for iOS Safari (not in standalone mode).
 */
function showInstallPrompt() {
    // Don't show if it's already been dismissed this session
    if (sessionStorage.getItem('pwa-install-dismissed')) return;

    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.style.cssText = `
        position: fixed; bottom: 0; left: 0; right: 0; z-index: 9999;
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
        color: white; padding: 16px 20px; font-family: 'Inter', sans-serif;
        display: flex; align-items: center; gap: 12px;
        box-shadow: 0 -4px 20px rgba(0,0,0,0.2);
    `;
    banner.innerHTML = `
        <div style="flex:1; min-width:0;">
            <p style="font-weight:700; font-size:14px; margin:0;">Install QCO Portal</p>
            <p style="font-size:12px; opacity:0.7; margin:4px 0 0 0;">Tap <strong>Share ↗</strong> then <strong>"Add to Home Screen"</strong> to enable notifications</p>
        </div>
        <button id="pwa-install-dismiss" style="background:rgba(255,255,255,0.15); border:none; color:white; padding:8px 14px; border-radius:10px; font-size:12px; font-weight:600; cursor:pointer;">Got it</button>
    `;

    document.body.appendChild(banner);
    document.getElementById('pwa-install-dismiss').addEventListener('click', () => {
        banner.remove();
        sessionStorage.setItem('pwa-install-dismissed', '1');
    });
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
    }
}
