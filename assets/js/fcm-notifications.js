/**
 * FCM Notifications & PWA Install Module
 * Handles permission requests, token management, foreground messages,
 * and PWA install prompts for ALL platforms (iOS, Android, Desktop).
 * 
 * Usage: Include this script, then call initFCM() after Firebase is initialized.
 */

const FCM_VAPID_KEY = 'BDYMjTSGQ8IxPCTS3dasWodoDW6Z_VZEYOkWMZx6Xec29DCyVdiiIrYNLB6dlb_hCPdfKbbF6OHSAEGLsptuoeQ';

let fcmMessaging = null;
let fcmSwRegistration = null;
let _deferredInstallPrompt = null; // Captured beforeinstallprompt event

// --- Platform Detection ---
const _isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const _isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

// =====================================================
// PWA INSTALL PROMPT (Android / Desktop Chrome)
// =====================================================
// Capture the browser's install prompt before it auto-fires
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // Prevent the mini-infobar from appearing
    _deferredInstallPrompt = e;
    console.log('[PWA] Install prompt captured');
    showInstallButton();
});

// Hide install button if app is installed
window.addEventListener('appinstalled', () => {
    console.log('[PWA] App installed successfully');
    _deferredInstallPrompt = null;
    hideInstallButton();
});

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
            showIOSInstallPrompt();
            return;
        }

        // Step 1: Register service worker
        try {
            const swPath = new URL('/firebase-messaging-sw.js', window.location.origin).href;
            fcmSwRegistration = await navigator.serviceWorker.register(swPath, { scope: '/' });
            console.log('[FCM] Service worker registered');
        } catch (swError) {
            console.error('[FCM] Service worker registration failed:', swError.message);
            return;
        }

        // Step 2: Get messaging instance
        fcmMessaging = firebase.messaging();

        // Step 3: Listen for foreground messages (always safe to set up)
        fcmMessaging.onMessage((payload) => {
            console.log('[FCM] Foreground message:', payload);
            showFCMToast(payload);
        });

        // Step 4: Handle permission based on platform
        if (Notification.permission === 'granted') {
            // Already granted — just get token
            await _getTokenAndSave();
        } else if (Notification.permission === 'denied') {
            console.warn('[FCM] Notifications blocked by user');
        } else {
            // Permission is 'default' — show Enable Alerts button
            // (works on all platforms; iOS requires user gesture, and it's better UX everywhere)
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
        }
    }
}

/**
 * Save FCM token to Firestore fcm_tokens collection.
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

// =====================================================
// UI COMPONENTS
// =====================================================

/**
 * Show a toast notification for foreground messages.
 */
function showFCMToast(payload) {
    // Play notification sound on the RECEIVER's device
    playNotificationSound();

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

// =====================================================
// FLOATING ACTION BUTTONS (Install + Alerts)
// =====================================================

const _fabContainerStyle = `
    position: fixed; bottom: 24px; right: 24px; z-index: 9998;
    display: flex; flex-direction: column; gap: 12px; align-items: flex-end;
`;

function _getFabContainer() {
    let container = document.getElementById('pwa-fab-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'pwa-fab-container';
        container.style.cssText = _fabContainerStyle;
        document.body.appendChild(container);
    }
    return container;
}

function _createFab(id, icon, label, gradient) {
    const btn = document.createElement('button');
    btn.id = id;
    btn.innerHTML = `${icon} ${label}`;
    btn.style.cssText = `
        background: ${gradient};
        color: white; border: none; padding: 14px 20px; border-radius: 16px;
        font-family: 'Inter', sans-serif; font-weight: 600; font-size: 14px;
        display: flex; align-items: center; gap: 8px;
        box-shadow: 0 10px 25px rgba(15, 23, 42, 0.3);
        cursor: pointer; transition: all 0.2s; white-space: nowrap;
        animation: pwa-fab-in 0.4s ease-out;
    `;
    return btn;
}

// --- Install Button (Android / Desktop) ---
function showInstallButton() {
    if (document.getElementById('pwa-install-btn')) return;
    if (_isStandalone) return; // Already installed

    const container = _getFabContainer();
    const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
    const btn = _createFab('pwa-install-btn', icon, 'Install App', 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)');

    btn.addEventListener('click', async () => {
        if (!_deferredInstallPrompt) {
            // Fallback: browser doesn't support beforeinstallprompt or it wasn't captured
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: 'info',
                    title: 'Install App',
                    html: 'Use your browser menu:<br><strong>⋮ → "Install App"</strong> or <strong>"Add to Home Screen"</strong>',
                    confirmButtonColor: '#7c3aed'
                });
            }
            return;
        }
        _deferredInstallPrompt.prompt();
        const { outcome } = await _deferredInstallPrompt.userChoice;
        console.log('[PWA] Install prompt outcome:', outcome);
        _deferredInstallPrompt = null;
        if (outcome === 'accepted') {
            btn.innerHTML = '✅ Installed!';
            btn.style.background = 'linear-gradient(135deg, #059669 0%, #10b981 100%)';
            setTimeout(() => btn.remove(), 2000);
        }
    });

    container.appendChild(btn);
}

function hideInstallButton() {
    const btn = document.getElementById('pwa-install-btn');
    if (btn) btn.remove();
}

// --- Notification Button (All platforms) ---
function showNotificationButton() {
    if (document.getElementById('fcm-enable-btn')) return;

    const container = _getFabContainer();
    const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`;
    const btn = _createFab('fcm-enable-btn', icon, 'Enable Alerts', 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)');

    btn.addEventListener('click', async () => {
        btn.innerHTML = '⏳ Requesting...';
        const granted = await requestNotificationPermission();
        if (granted) {
            btn.innerHTML = '✅ Alerts Enabled!';
            btn.style.background = 'linear-gradient(135deg, #059669 0%, #10b981 100%)';
            setTimeout(() => btn.remove(), 2000);
        } else {
            btn.innerHTML = '❌ Permission Denied';
            btn.style.background = 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)';
            setTimeout(() => {
                btn.innerHTML = `${icon} Enable Alerts`;
                btn.style.background = 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)';
            }, 3000);
        }
    });

    container.appendChild(btn);
}

function hideNotificationButton() {
    const btn = document.getElementById('fcm-enable-btn');
    if (btn) btn.remove();
}

// --- iOS Safari Install Banner ---
function showIOSInstallPrompt() {
    if (sessionStorage.getItem('pwa-install-dismissed')) return;

    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.style.cssText = `
        position: fixed; bottom: 0; left: 0; right: 0; z-index: 9999;
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
        color: white; padding: 16px 20px; font-family: 'Inter', sans-serif;
        display: flex; align-items: center; gap: 12px;
        box-shadow: 0 -4px 20px rgba(0,0,0,0.2);
        animation: pwa-fab-in 0.4s ease-out;
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

// =====================================================
// ANIMATION KEYFRAMES (injected once)
// =====================================================
(function injectFabAnimation() {
    if (document.getElementById('pwa-fab-keyframes')) return;
    const style = document.createElement('style');
    style.id = 'pwa-fab-keyframes';
    style.textContent = `
        @keyframes pwa-fab-in {
            from { opacity: 0; transform: translateY(20px) scale(0.9); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }
    `;
    document.head.appendChild(style);
})();

// =====================================================
// BACKEND NOTIFICATION SENDER
// =====================================================

// =====================================================
// NOTIFICATION SOUND
// =====================================================
function playNotificationSound() {
    try {
        const audio = new Audio('/assets/sounds/notification.mp3');
        audio.volume = 1.0;
        audio.play().catch(e => console.warn('[FCM] Sound play blocked (user gesture required):', e.message));
    } catch (e) {
        console.warn('[FCM] Sound error:', e);
    }
}

// =====================================================
// SUPERVISOR LOOKUP
// =====================================================
/**
 * Attempt to get supervisor name from RAW_LINE_SCHEDULES (defined in recorder/outorder pages).
 * Falls back to 'Unknown Supervisor' if not available.
 */
function getSupervisorName(qcoData) {
    // Get the RAW_LINE_SCHEDULES from the page scope if available
    const schedules = (typeof RAW_LINE_SCHEDULES !== 'undefined') ? RAW_LINE_SCHEDULES : {};

    // Determine line key: prefer explicit lineNumber field, then parse from qcoNumber
    let lineKey = (qcoData?.lineNumber || '').toString().trim().toUpperCase();

    if (!lineKey && qcoData?.qcoNumber) {
        const parts = qcoData.qcoNumber.split('-');
        if (parts[0].toUpperCase() === 'S' && parts.length >= 2) {
            lineKey = `S-${parts[1]}`;
            // Handle letter suffixes like S-01A
            if (parts[2] && /^[A-Z]$/.test(parts[2])) lineKey += parts[2];
        } else {
            lineKey = parts[0];
        }
    }

    // Normalize to S-XX format
    if (lineKey && !lineKey.startsWith('S-') && /^\d+[A-Z]?$/.test(lineKey)) {
        const num = lineKey.match(/\d+/)[0];
        const letter = lineKey.match(/[A-Z]$/) ? lineKey.match(/[A-Z]$/)[0] : '';
        lineKey = `S-${num.padStart(2, '0')}${letter}`;
    }

    return schedules[lineKey]?.supervisor || 'Unknown Supervisor';
}

/**
 * Get the first operation name from qcoData.operationsList.
 */
function getFirstOperationName(qcoData, fallbackOpName) {
    const ops = qcoData?.operationsList;
    if (Array.isArray(ops) && ops.length > 0) {
        const first = ops[0];
        return typeof first === 'string' ? first : (first?.name || fallbackOpName);
    }
    return fallbackOpName;
}

// =====================================================
// BACKEND NOTIFICATION SENDER
// =====================================================
/**
 * Send a notification to all subscribed users via the backend.
 * Called from startOperation() when it's the FIRST operation.
 * @param {boolean} isTest - if true, prefix message with [TEST]
 */
async function sendStartNotification(qcoId, opName, qcoData, isTest = false) {
    try {

        const settings = JSON.parse(localStorage.getItem('appSettings')) || {};
        const backendUrl = settings.backendUrl || (typeof BACKEND_URL !== 'undefined' ? BACKEND_URL : 'http://localhost:3000');

        const lineNumber = qcoData?.lineNumber || 'Unknown Line';
        const qcoNumber = qcoData?.qcoNumber || qcoId;
        const supervisorName = getSupervisorName(qcoData);
        const firstOp = getFirstOperationName(qcoData, opName);
        const testPrefix = isTest ? '[TEST] ' : '';

        const title = `🚨🚨${testPrefix}Changeover started in ${supervisorName} Line ${lineNumber}`;
        const body = `and the first operation is "${firstOp}" | QCO: ${qcoNumber}`;

        const response = await fetch(`${backendUrl}/api/send-notification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title,
                body,
                qcoId,
                data: {
                    qcoId,
                    qcoNumber,
                    lineNumber,
                    supervisorName,
                    firstOp,
                    title,
                    body,
                    sound: '/assets/sounds/notification.mp3',
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
