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
     * Search handler — queries Firestore for QCO numbers AND styles.
     * Supports:
     *   - QCO number search (prefix match)
     *   - Style number search (prefix match on currentStyle / upcomingStyle)
     *   - Combination search "X-Y" where X matches currentStyle and Y matches upcomingStyle
     * Shows a disambiguation modal when multiple matches are found.
     */
    handleSearch(event) {
        const term = (event.target.value || '').trim().toUpperCase();
        this.searchTerm = term;

        if (this.searchTimeout) clearTimeout(this.searchTimeout);

        if (!term) {
            this.reset();
            return;
        }

        this.searchTimeout = setTimeout(async () => {
            if (typeof db === 'undefined' || !db) return;

            try {
                const allMatches = new Map(); // docId -> { id, data }

                // Helper to add results to map without duplicates
                const addResults = (snap) => {
                    snap.forEach(doc => {
                        if (!allMatches.has(doc.id)) {
                            const data = doc.data();
                            if (data.status !== 'discarded') {
                                allMatches.set(doc.id, { id: doc.id, ...data });
                            }
                        }
                    });
                };

                // Detect combination query: "X-Y" where it's NOT a QCO number (QCO starts with S-)
                const isCombination = term.includes('-') && !term.startsWith('S-');
                let comboParts = null;
                if (isCombination) {
                    const dashIdx = term.indexOf('-');
                    comboParts = {
                        current: term.substring(0, dashIdx),
                        upcoming: term.substring(dashIdx + 1)
                    };
                }

                // 1. Prefix match on qcoNumber
                let snap = await db.collection('changeovers')
                    .orderBy('qcoNumber')
                    .startAt(term)
                    .endAt(term + '\uf8ff')
                    .limit(10)
                    .get();
                addResults(snap);

                // 2. Prefix match on currentStyle
                snap = await db.collection('changeovers')
                    .orderBy('currentStyle')
                    .startAt(term)
                    .endAt(term + '\uf8ff')
                    .limit(10)
                    .get();
                addResults(snap);

                // 3. Prefix match on upcomingStyle
                snap = await db.collection('changeovers')
                    .orderBy('upcomingStyle')
                    .startAt(term)
                    .endAt(term + '\uf8ff')
                    .limit(10)
                    .get();
                addResults(snap);

                // 4. For combination queries, also try matching each part separately
                if (comboParts && comboParts.current && comboParts.upcoming) {
                    // Search currentStyle matching the first part
                    snap = await db.collection('changeovers')
                        .orderBy('currentStyle')
                        .startAt(comboParts.current)
                        .endAt(comboParts.current + '\uf8ff')
                        .limit(30)
                        .get();
                    // Filter these results to only include those where upcomingStyle also matches
                    snap.forEach(doc => {
                        if (!allMatches.has(doc.id)) {
                            const data = doc.data();
                            const upcoming = (data.upcomingStyle || '').toUpperCase();
                            if (upcoming.startsWith(comboParts.upcoming) && data.status !== 'discarded') {
                                allMatches.set(doc.id, { id: doc.id, ...data });
                            }
                        }
                    });
                }

                // 5. If still nothing found, try partial/contains matching via broader load
                if (allMatches.size === 0) {
                    snap = await db.collection('changeovers')
                        .orderBy('createdAt', 'desc')
                        .limit(300)
                        .get();
                    snap.forEach(doc => {
                        const data = doc.data();
                        if (data.status === 'discarded') return;
                        const qco = (data.qcoNumber || '').toUpperCase();
                        const cur = (data.currentStyle || '').toUpperCase();
                        const up = (data.upcomingStyle || '').toUpperCase();

                        if (comboParts && comboParts.current && comboParts.upcoming) {
                            // Combination: both parts must match
                            if (cur.includes(comboParts.current) && up.includes(comboParts.upcoming)) {
                                allMatches.set(doc.id, { id: doc.id, ...data });
                            }
                        } else {
                            // Single term: match any field
                            if (qco.includes(term) || cur.includes(term) || up.includes(term)) {
                                allMatches.set(doc.id, { id: doc.id, ...data });
                            }
                        }
                    });
                }

                const matches = Array.from(allMatches.values());

                if (matches.length === 0) {
                    // Not found
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
                } else if (matches.length === 1) {
                    // Single match — auto-select
                    this._selectMatch(matches[0]);
                } else {
                    // Multiple matches — show disambiguation modal
                    this._showDisambiguationModal(matches, term);
                }

            } catch (e) {
                console.error('QCOLoader search error:', e);
            }
        }, 600);
    }

    /**
     * Auto-select a single match: add to dropdown, select it, fire callback.
     */
    _selectMatch(match) {
        const docId = match.id;
        const data = match;

        if (!this.allLoadedIds.has(docId)) {
            this.allLoadedIds.add(docId);
            const opt = document.createElement('option');
            opt.value = docId;
            const last4 = (data.upcomingStyle || '').slice(-4);
            opt.textContent = `${data.qcoNumber || docId} - ${last4}`;
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
    }

    /**
     * Show SweetAlert modal with a list of matching changeovers for disambiguation.
     */
    _showDisambiguationModal(matches, query) {
        if (typeof Swal === 'undefined') {
            // Fallback: select the first match
            this._selectMatch(matches[0]);
            return;
        }

        const listHtml = matches.slice(0, 10).map((m, i) => {
            const qco = m.qcoNumber || m.id;
            const line = m.lineNumber || '-';
            const cur = m.currentStyle || '-';
            const up = m.upcomingStyle || '-';
            const status = m.status || 'unknown';
            const statusColors = {
                'completed': '#10b981',
                'in-progress': '#3b82f6',
                'upcoming': '#8b5cf6',
                'pending': '#f59e0b'
            };
            const dotColor = statusColors[status] || '#94a3b8';
            return `
                <div data-idx="${i}" class="swal-match-item" style="
                    display:flex; align-items:center; gap:12px; padding:12px 16px;
                    border:1px solid #e2e8f0; border-radius:12px; cursor:pointer;
                    transition:all 0.2s; margin-bottom:8px; background:#fff;
                " onmouseover="this.style.borderColor='#3b82f6';this.style.background='#eff6ff'"
                   onmouseout="this.style.borderColor='#e2e8f0';this.style.background='#fff'">
                    <div style="width:8px;height:8px;border-radius:50%;background:${dotColor};flex-shrink:0"></div>
                    <div style="flex:1;min-width:0">
                        <div style="font-weight:700;font-size:13px;color:#1e293b">${qco}</div>
                        <div style="font-size:11px;color:#64748b;margin-top:2px">
                            Line ${line} · ${cur} → ${up}
                        </div>
                    </div>
                    <div style="font-size:10px;font-weight:600;color:${dotColor};text-transform:uppercase">${status}</div>
                </div>`;
        }).join('');

        Swal.fire({
            title: `${matches.length} Changeovers Found`,
            html: `
                <p style="color:#64748b;font-size:13px;margin-bottom:16px">
                    Multiple changeovers match "<strong>${query}</strong>". Select one:
                </p>
                <div id="swalMatchList" style="max-height:320px;overflow-y:auto;text-align:left">
                    ${listHtml}
                </div>`,
            showConfirmButton: false,
            showCancelButton: true,
            cancelButtonText: 'Cancel',
            width: 480,
            didOpen: () => {
                const items = Swal.getHtmlContainer().querySelectorAll('.swal-match-item');
                items.forEach(item => {
                    item.addEventListener('click', () => {
                        const idx = parseInt(item.getAttribute('data-idx'));
                        this._selectMatch(matches[idx]);
                        Swal.close();
                    });
                });
            }
        });
    }

    reset() {
        this.selectElement.innerHTML = '<option value="">Select QCO...</option>';
        this.allLoadedIds.clear();
        this.lastVisible = null;
        this.hasMore = true;
        this.loadMore();
    }
}
