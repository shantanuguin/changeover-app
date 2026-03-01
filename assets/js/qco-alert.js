// qco-alert.js
// Monitors active QCOs across the application and alerts if they are discarded

(function () {
    let alertInterval = null;
    let currentlyAlertingQCO = null;

    function getActiveQCONumber() {
        // Try to find the active QCO based on common global variables used across different pages
        if (window.currentQCOId) return window.currentQCOId;
        if (window.currentQCONumber) return window.currentQCONumber;
        if (window.qcoId) return window.qcoId;
        if (window.existingQCORef) return window.existingQCORef.id || window.existingQCORef.qcoNumber;

        // Try to get from URL params
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('qco')) return urlParams.get('qco');
        if (urlParams.has('id')) return urlParams.get('id');

        return null;
    }

    async function checkQCOStatus() {
        const qcoNumber = getActiveQCONumber();
        if (!qcoNumber) return;

        try {
            // Check Firebase if available
            if (window.db && window.isFirebaseConnected) {
                const doc = await window.db.collection('changeovers').doc(qcoNumber).get();
                if (doc.exists) {
                    const data = doc.data();
                    if (data.status === 'discarded') {
                        triggerAlert(qcoNumber, data.movedTo);
                    }
                }
            } else {
                // Fallback to localStorage check if Firebase is not connected or db is not initialized
                const localData = localStorage.getItem('changeovers');
                if (localData) {
                    const changeovers = JSON.parse(localData);
                    const qco = changeovers.find(c => c.qcoNumber === qcoNumber || c.id === qcoNumber);
                    if (qco && qco.status === 'discarded') {
                        triggerAlert(qcoNumber, qco.movedTo);
                    }
                }
            }
        } catch (error) {
            console.error("Error checking QCO discarded status:", error);
        }
    }

    function triggerAlert(discardedQco, newQco) {
        // Prevent stacking alerts
        if (Swal.isVisible() && currentlyAlertingQCO === discardedQco) return;

        currentlyAlertingQCO = discardedQco;

        let redirectHtml = '';
        if (newQco) {
            redirectHtml = `<p class="mt-4 text-sm font-bold text-gray-700">This has been moved to: <br><span class="text-blue-600 border border-blue-200 bg-blue-50 px-2 py-1 rounded inline-block mt-1">${newQco}</span></p>`;
        }

        Swal.fire({
            icon: 'error',
            title: 'Discarded Changeover',
            html: `<p>You are viewing a discarded QCO <b>(${discardedQco})</b>. This record is no longer active.</p>${redirectHtml}`,
            confirmButtonText: 'I Understand',
            confirmButtonColor: '#ef4444',
            allowOutsideClick: false,
            backdrop: `
                rgba(0,0,123,0.4)
                left top
                no-repeat
            `
        }).then(() => {
            currentlyAlertingQCO = null;
        });
    }

    // Start monitoring only when document is ready
    function initQCOAlert() {
        // Initial check after 2 seconds to allow pages to load data
        setTimeout(checkQCOStatus, 2000);

        // Check every 10 seconds
        alertInterval = setInterval(checkQCOStatus, 10000);
    }

    // Export so other pages can trigger it manually
    window.checkQCOStatus = checkQCOStatus;

    // Initialize when DOM is available
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initQCOAlert);
    } else {
        initQCOAlert();
    }
})();
