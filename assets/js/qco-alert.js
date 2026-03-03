// qco-alert.js
// Monitors active QCOs across the application and alerts if they are discarded

(function () {
    let alertInterval = null;
    let currentlyAlertingQCO = null;

    function getActiveQCONumber() {
        // Try to find the active QCO based on common global variables used across different pages
        if (typeof currentQCOId !== 'undefined' && currentQCOId) return currentQCOId;
        if (typeof currentQCONumber !== 'undefined' && currentQCONumber) return currentQCONumber;
        if (typeof qcoId !== 'undefined' && qcoId) return qcoId;
        if (typeof existingQCORef !== 'undefined' && existingQCORef) return existingQCORef.id || existingQCORef.qcoNumber;

        // Try to get from URL params
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('qco')) return urlParams.get('qco');
        if (urlParams.has('id')) return urlParams.get('id');

        return null;
    }

    async function checkQCOStatus() {
        console.log('[qco-alert] checkQCOStatus triggered.');
        const qcoNumber = getActiveQCONumber();
        console.log('[qco-alert] getActiveQCONumber returned:', qcoNumber);
        if (!qcoNumber) return;

        try {
            // Check Firebase if available — only need db to be initialized
            const hasDb = typeof db !== 'undefined' && db !== null;

            console.log('[qco-alert] hasDb:', hasDb);

            if (hasDb) {
                console.log('[qco-alert] Querying Firebase for QCO:', qcoNumber);
                const doc = await db.collection('changeovers').doc(qcoNumber).get();
                console.log('[qco-alert] doc.exists?', doc.exists);
                if (doc.exists) {
                    const data = doc.data();
                    console.log('[qco-alert] data.status:', data.status);
                    if (data.status === 'discarded') {
                        triggerAlert(qcoNumber, data.movedTo);
                    }
                }
            } else {
                console.log('[qco-alert] Falling back to localStorage...');
                // Fallback to localStorage check if Firebase is not connected or db is not initialized
                const localData = localStorage.getItem('changeovers');
                if (localData) {
                    const changeovers = JSON.parse(localData);
                    const qco = changeovers.find(c => c.qcoNumber === qcoNumber || c.id === qcoNumber);
                    if (qco) {
                        console.log('[qco-alert] Local QCO found. Status:', qco.status);
                    }
                    if (qco && qco.status === 'discarded') {
                        triggerAlert(qcoNumber, qco.movedTo);
                    }
                }
            }
        } catch (error) {
            console.error("[qco-alert] Error checking QCO discarded status:", error);
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
            confirmButtonText: newQco ? 'Go to New QCO' : 'I Understand',
            confirmButtonColor: newQco ? '#2563eb' : '#ef4444',
            allowOutsideClick: false,
            backdrop: `
                rgba(0,0,123,0.4)
                left top
                no-repeat
            `
        }).then((result) => {
            currentlyAlertingQCO = null;
            if (result.isConfirmed && newQco) {
                if (typeof window.handleExistingQCOSelect === 'function') {
                    // creation.html
                    const selectEl = document.getElementById('existingQCOSelect');
                    if (selectEl) selectEl.value = newQco;
                    window.handleExistingQCOSelect(newQco);
                } else if (typeof window.handleQCOChange === 'function') {
                    // All other pages that have handleQCOChange
                    const selectEl = document.getElementById('qcoSelector');
                    if (selectEl) selectEl.value = newQco;

                    // Some pages expect a second saveToStorage parameter, others don't.
                    // Passing `true` as second argument is harmless for those that don't expect it.
                    window.handleQCOChange(newQco, true);
                } else {
                    // Fallback for pages without JS selection handlers (e.g., pure URL driven pages)
                    const urlParams = new URLSearchParams(window.location.search);
                    if (urlParams.has('qco')) urlParams.set('qco', newQco);
                    if (urlParams.has('id')) urlParams.set('id', newQco);

                    if (urlParams.has('qco') || urlParams.has('id')) {
                        window.location.search = urlParams.toString();
                    } else {
                        // If no params, try to set local storage and reload as a very last resort
                        localStorage.setItem('currentQCO', newQco);
                        window.location.reload();
                    }
                }
            }
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
