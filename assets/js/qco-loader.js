// Shared QCO Loader with Pagination & Search
class QCOLoader {
    constructor(config) {
        this.selectElementId = config.selectElementId || 'qcoSelector';
        this.searchInputId = config.searchInputId || 'qcoSearch';
        this.onSelect = config.onSelect || (() => {});
        this.pageSize = config.pageSize || 10;
        this.lastVisible = null;
        this.isLoading = false;
        this.hasMore = true;
        this.allChangeovers = [];
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
        this.selectElement.innerHTML += '<option value="load_more" disabled>Scroll for more...</option>';
        
        // Listeners
        this.selectElement.addEventListener('change', (e) => this.handleChange(e));
        
        // Add scroll listener for pagination on the select dropdown
        // (Note: pure <select> dropdowns don't fire scroll events reliably across browsers. 
        // We will load more when the user focuses or clicks if they are near the bottom,
        // or we can implement an IntersectionObserver if we build a custom dropdown)
        
        if (this.searchInput) {
            this.searchInput.addEventListener('input', (e) => this.handleSearch(e));
        }

        await this.loadMore();
    }

    async loadMore() {
        if (this.isLoading || !this.hasMore || !typeof db !== 'undefined') return;
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
                const data = doc.data();
                this.allChangeovers.push({ id: doc.id, ...data });
                
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
                opt.textContent = "Load 10 more...";
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

    handleSearch(event) {
        const term = (event.target.value || '').toUpperCase().trim();
        this.searchTerm = term;

        if (this.searchTimeout) clearTimeout(this.searchTimeout);

        if (!term) {
            // Reset to default list
            this.reset();
            return;
        }

        this.searchTimeout = setTimeout(async () => {
            // First check local loaded items
            const localMatch = this.allChangeovers.find(q => {
                return (q.qcoNumber || '').toUpperCase().includes(term) ||
                       (q.upcomingStyle || '').toUpperCase().includes(term);
            });

            if (localMatch) {
                this.selectElement.value = localMatch.id;
                this.onSelect(localMatch.id);
            } else {
                // Query Firestore directly
                try {
                    const snap = await db.collection('changeovers')
                                         .where('qcoNumber', '==', term)
                                         .get();
                    if (!snap.empty) {
                        const doc = snap.docs[0];
                        const data = doc.data();
                        
                        // Add to list and select
                        const opt = document.createElement('option');
                        opt.value = doc.id;
                        const last4 = (data.upcomingStyle || '').slice(-4);
                        opt.textContent = `${data.qcoNumber || doc.id} - ${last4}`;
                        
                        // Insert after the first "Select QCO" option
                        this.selectElement.insertBefore(opt, this.selectElement.children[1]);
                        this.selectElement.value = doc.id;
                        
                        this.allChangeovers.push({ id: doc.id, ...data });
                        this.onSelect(doc.id);
                        
                        if (typeof Swal !== 'undefined') {
                            Swal.fire({ icon: 'success', title: 'Found from Database', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
                        }
                    } else {
                        if (typeof Swal !== 'undefined') {
                            Swal.fire({ icon: 'error', title: 'Not Found', text: 'No QCO matches that exact number in the database.', toast: true, position: 'top-end', timer: 3000, showConfirmButton: false });
                        }
                    }
                } catch (e) {
                    console.error('Search error:', e);
                }
            }
        }, 600);
    }

    reset() {
        this.selectElement.innerHTML = '<option value="">Select QCO...</option>';
        this.allChangeovers = [];
        this.lastVisible = null;
        this.hasMore = true;
        this.loadMore();
    }
}
