// Shared QCO Loader with Pagination & Full-Database Search
class QCOLoader {
    constructor(config) {
        this.selectElementId = config.selectElementId || 'qcoSelector';
        this.searchInputId = config.searchInputId || 'qcoSearch';
        this.onSelect = config.onSelect || (() => { });
        this.pageSize = config.pageSize || 30;
        this.lastVisible = null;
        this.isLoading = false;
        this.hasMore = true;
        this.allLoadedIds = new Set(); // track IDs already in the dropdown
        this.searchTerm = '';
        this.searchTimeout = null;

        this.init();
    }

    async init() {
        this.selectElement = document.getElementById(this.selectElementId);
        this.searchInput = document.getElementById(this.searchInputId);

        if (!this.selectElement) return;

        // Reset state
        this.selectElement.innerHTML = '<option value="">Select QCO...</option>';

        // Listeners
        this.selectElement.addEventListener('change', (e) => this.handleChange(e));

        if (this.searchInput) {
            this.searchInput.addEventListener('input', (e) => this.handleSearch(e));
        }

        await this.loadMore();
    }

    async loadMore() {
        if (this.isLoading || !this.hasMore || typeof db === 'undefined' || !db) return;
        this.isLoading = true;

        try {
            let query = db.collection('changeovers')
                .orderBy('createdAt', 'desc')
                .limit(this.pageSize);

            if (this.lastVisible) {
                query = query.startAfter(this.lastVisible);
            }

            const snapshot = await query.get();

            if (snapshot.empty) {
                this.hasMore = false;
                this.updateLoadMoreOption(false);
                this.isLoading = false;
                return;
            }

            this.lastVisible = snapshot.docs[snapshot.docs.length - 1];

            // Remove the "load more" option temporarily
            const loadMoreOpt = this.selectElement.querySelector('option[value="load_more"]');
            if (loadMoreOpt) loadMoreOpt.remove();

            snapshot.forEach(doc => {
                if (this.allLoadedIds.has(doc.id)) return; // skip duplicates
                const data = doc.data();
                this.allLoadedIds.add(doc.id);

                const opt = document.createElement('option');
                opt.value = doc.id;
                const last4 = (data.upcomingStyle || '').slice(-4);
                opt.textContent = `${data.qcoNumber || doc.id} - ${last4}`;
                this.selectElement.appendChild(opt);
            });

            // Re-add load more if we might have more
            if (snapshot.size === this.pageSize) {
                this.updateLoadMoreOption(true);
            } else {
                this.hasMore = false;
            }

        } catch (error) {
            console.error('QCOLoader Error:', error);
        } finally {
            this.isLoading = false;
        }
    }

    updateLoadMoreOption(show) {
        let opt = this.selectElement.querySelector('option[value="load_more"]');
        if (show) {
            if (!opt) {
                opt = document.createElement('option');
                opt.value = "load_more";
                opt.textContent = "Load more...";
                opt.className = "text-blue-600 font-semibold bg-slate-50";
                this.selectElement.appendChild(opt);
            }
        } else if (opt) {
            opt.remove();
        }
    }

    handleChange(event) {
        const val = event.target.value;
        if (val === 'load_more') {
            // Revert selection so they can click it again if needed
            event.target.value = "";
            this.loadMore();
            return;
        }
        if (val) {
            this.onSelect(val);
        }
    }

    /**
     * Search handler — always queries Firestore for maximum coverage.
     * 1. Tries exact match on qcoNumber
     * 2. Tries prefix range match on qcoNumber (startAt / endAt)
     * 3. Tries exact match on upcomingStyle
     * 4. Tries prefix range match on upcomingStyle
     * If any match is found, it's added to the dropdown (if not already there) and auto-selected.
     */
    handleSearch(event) {
        const term = (event.target.value || '').trim().toUpperCase();
        this.searchTerm = term;

        if (this.searchTimeout) clearTimeout(this.searchTimeout);

        if (!term) {
            // Reset to default list
            this.reset();
            return;
        }

        this.searchTimeout = setTimeout(async () => {
            if (typeof db === 'undefined' || !db) return;

            try {
                let foundDoc = null;

                // 1. Exact match on qcoNumber
                let snap = await db.collection('changeovers')
                    .where('qcoNumber', '==', term)
                    .limit(1)
                    .get();

                if (!snap.empty) {
                    foundDoc = snap.docs[0];
                }

                // 2. Prefix match on qcoNumber (case-sensitive — QCO numbers are uppercase)
                if (!foundDoc) {
                    snap = await db.collection('changeovers')
                        .orderBy('qcoNumber')
                        .startAt(term)
                        .endAt(term + '\uf8ff')
                        .limit(1)
                        .get();
                    if (!snap.empty) {
                        foundDoc = snap.docs[0];
                    }
                }

                // 3. Exact match on upcomingStyle
                if (!foundDoc) {
                    snap = await db.collection('changeovers')
                        .where('upcomingStyle', '==', term)
                        .limit(1)
                        .get();
                    if (!snap.empty) {
                        foundDoc = snap.docs[0];
                    }
                }

                // 4. Prefix match on upcomingStyle
                if (!foundDoc) {
                    snap = await db.collection('changeovers')
                        .orderBy('upcomingStyle')
                        .startAt(term)
                        .endAt(term + '\uf8ff')
                        .limit(1)
                        .get();
                    if (!snap.empty) {
                        foundDoc = snap.docs[0];
                    }
                }

                if (foundDoc) {
                    const data = foundDoc.data();
                    const docId = foundDoc.id;

                    // Add to dropdown if not already present
                    if (!this.allLoadedIds.has(docId)) {
                        this.allLoadedIds.add(docId);
                        const opt = document.createElement('option');
                        opt.value = docId;
                        const last4 = (data.upcomingStyle || '').slice(-4);
                        opt.textContent = `${data.qcoNumber || docId} - ${last4}`;
                        // Insert after the first "Select QCO" option
                        this.selectElement.insertBefore(opt, this.selectElement.children[1]);
                    }

                    this.selectElement.value = docId;
                    this.onSelect(docId);

                    if (typeof Swal !== 'undefined') {
                        const last4 = (data.upcomingStyle || '').slice(-4);
                        Swal.fire({
                            icon: 'success',
                            title: `Found: ${data.qcoNumber || docId} - ${last4}`,
                            toast: true,
                            position: 'top-end',
                            timer: 2000,
                            showConfirmButton: false
                        });
                    }
                } else {
                    if (typeof Swal !== 'undefined') {
                        Swal.fire({
                            icon: 'info',
                            title: 'Not Found',
                            text: `No changeover matches "${term}" in the database.`,
                            toast: true,
                            position: 'top-end',
                            timer: 3000,
                            showConfirmButton: false
                        });
                    }
                }
            } catch (e) {
                console.error('QCOLoader search error:', e);
            }
        }, 600);
    }

    reset() {
        this.selectElement.innerHTML = '<option value="">Select QCO...</option>';
        this.allLoadedIds.clear();
        this.lastVisible = null;
        this.hasMore = true;
        this.loadMore();
    }
}
