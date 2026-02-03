
// --- Constants ---
const COL_LINE_CTX = 0; // Column A
const COL_CURR_STYLE = 1; // Column B
const COL_PLAN_START = 10; // Column K
const ROW_DATE = 2; // Row 3 (0-indexed)
const ROW_DAY = 3; // Row 4 (0-indexed)
const ROW_STYLE_START = 8; // Row 9
const ROW_STYLE_END = 114;
const ROW_STRIDE = 3;

// --- Data: Supervisor to Line Mapping ---
// Sourced from creation.html (User provided source of truth)
const RAW_LINE_SCHEDULES = {
    "S-01": { supervisor: "WASANA-1" },
    "S-01A": { supervisor: "WASANA-2" },
    "S-02": { supervisor: "SOHRAB" },
    "S-03": { supervisor: "SOHEL" },
    "S-04": { supervisor: "AHMAD" },
    "S-05": { supervisor: "OMAR FARUK" },
    "S-06": { supervisor: "SUMI" },
    "S-07": { supervisor: "NAGENDRA" },
    "S-07A": { supervisor: "KAMAL-2" },
    "S-08": { supervisor: "BALISTER" },
    "S-09": { supervisor: "MONJURUL" },
    "S-10": { supervisor: "RAJKUMAR" },
    "S-11": { supervisor: "KAMAL-1" },
    "S-12": { supervisor: "DARMENDRA" },
    "S-13": { supervisor: "SUMON" },
    "S-14": { supervisor: "SHARIF" },
    "S-15": { supervisor: "MUNSEF" },
    "S-16": { supervisor: "RAHAMAN" },
    "S-17": { supervisor: "MASUM" },
    "S-18": { supervisor: "DIANA" },
    "S-19": { supervisor: "ALAMGIR" },
    "S-20": { supervisor: "KAZAL" },
    "S-21": { supervisor: "DEVRAJ" },
    "S-22": { supervisor: "ASHRAFUL" },
    "S-23": { supervisor: "RUMA" },
    "S-24": { supervisor: "NASIR" },
    "S-25": { supervisor: "AKBAR" },
    "S-26": { supervisor: "HIMAYAT" },
    "S-28": { supervisor: "ROOP NARAYAN" },
    "S-29": { supervisor: "SUBA" },
    "S-30": { supervisor: "RAJIB" },
    "S-31": { supervisor: "AKASH" },
    "S-32": { supervisor: "KALU CHARAN" }
};

// Start Reverse Map for efficient lookup (Supervisor -> Line)
const SUPERVISOR_TO_LINE = {};
Object.entries(RAW_LINE_SCHEDULES).forEach(([line, data]) => {
    if (data.supervisor) {
        SUPERVISOR_TO_LINE[data.supervisor.toUpperCase()] = line;
    }
});

// --- State ---
let fullData = null;    // Original processed data
let currentData = null; // Filtered data for display
let currentView = 'dashboard';

// --- Helpers ---
export const getCellValue = (cell) => {
    if (cell === undefined || cell === null) return null;
    if (typeof cell === 'object' && cell.v !== undefined) return cell.v;
    return cell;
};

export const cleanString = (val) => {
    if (!val) return '';
    return String(val).trim();
};

export const excelDateToJSDate = (serial) => {
    if (!serial || isNaN(serial)) return null;
    const utc_days = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;
    const date_info = new Date(utc_value * 1000);
    return new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate());
};

export const isValidDate = (d) => {
    return d instanceof Date && !isNaN(d.getTime());
};

export const isFriday = (dayStr) => {
    return /fri/i.test(dayStr);
};

export const isRemark = (str) => {
    const s = str.toLowerCase();
    return (
        s.includes('add') ||
        s.includes('between') ||
        s.includes('need to') ||
        s.includes('change') ||
        (s.split(' ').length > 4 && !s.includes('-'))
    );
};

export const isQuantity = (str) => {
    const s = str.toLowerCase();
    return s.includes('pcs') || (/^\d+$/.test(s) && s.length < 6);
};

const lookupLineBySupervisor = (supName) => {
    if (!supName) return "Unassigned";
    const upper = supName.toUpperCase();

    // Direct match
    if (SUPERVISOR_TO_LINE[upper]) return SUPERVISOR_TO_LINE[upper];

    // Fuzzy / Partial match
    const match = Object.keys(SUPERVISOR_TO_LINE).find(key => upper.includes(key) || key.includes(upper));
    if (match) return SUPERVISOR_TO_LINE[match];

    return supName; // Fallback to name itself if no mapping found
};

// --- Core Processor ---
export const processWorkbook = async (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = window.XLSX.read(data, { type: 'array', cellDates: true });
                let allStyles = [];

                workbook.SheetNames.forEach(sheetName => {
                    const sheet = workbook.Sheets[sheetName];
                    const rawData = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

                    if (rawData.length < ROW_STYLE_START) return;

                    // 1. Parse Calendar
                    const dateMap = new Map();
                    const dateRow = rawData[ROW_DATE] || [];
                    const dayRow = rawData[ROW_DAY] || [];

                    for (let c = COL_PLAN_START; c < dateRow.length; c++) {
                        let dateVal = dateRow[c];
                        let jsDate = null;
                        if (dateVal instanceof Date) jsDate = dateVal;
                        else if (typeof dateVal === 'number') jsDate = excelDateToJSDate(dateVal);

                        const dayName = cleanString(dayRow[c]);

                        if (jsDate && isValidDate(jsDate)) {
                            dateMap.set(c, { date: jsDate, day: dayName, isHoliday: isFriday(dayName) });
                        }
                    }

                    // 2. Scan Styles
                    let currentUnit = "Main Unit";

                    for (let r = ROW_STYLE_START; r <= Math.min(rawData.length - 1, ROW_STYLE_END); r += ROW_STRIDE) {
                        const cellA = cleanString(rawData[r][COL_LINE_CTX]);
                        let currentSupervisor = "Unassigned";

                        if (cellA.toLowerCase().includes('main unit')) currentUnit = "Main Unit";
                        else if (cellA.toLowerCase().includes('sub unit')) currentUnit = "Sub Unit";

                        if (!cellA.toLowerCase().includes('unit') &&
                            !cellA.toLowerCase().includes('ttl') &&
                            !cellA.toLowerCase().includes('budget') &&
                            cellA.length > 0) {
                            currentSupervisor = cellA;
                        }

                        if (cellA.toLowerCase().includes('ttl qty')) continue;

                        let physicalLine = lookupLineBySupervisor(currentSupervisor);
                        let currentRunningStyle = cleanString(rawData[r][COL_CURR_STYLE]);
                        const rowStyle = rawData[r] || [];
                        const rowTarget = rawData[r + 1] || [];
                        const rowManpower = rawData[r + 2] || [];

                        let activeStyle = null;

                        for (let c = COL_PLAN_START; c < rowStyle.length; c++) {
                            const cellVal = getCellValue(rowStyle[c]);
                            const cellStr = cleanString(cellVal);
                            const calendar = dateMap.get(c);

                            const isRemarkText = isRemark(cellStr);
                            const isQtyText = isQuantity(cellStr);
                            const hasContent = cellStr.length > 0;
                            const isNewStyle = hasContent && !isRemarkText && !isQtyText;

                            if (isNewStyle) {
                                if (activeStyle) {
                                    if (calendar?.date) activeStyle.endDate = calendar.date;
                                    allStyles.push(activeStyle);
                                }
                                activeStyle = {
                                    id: `${sheetName}-R${r}-C${c}`,
                                    styleName: cellStr,
                                    sheetName,
                                    unit: currentUnit,
                                    physicalLine: physicalLine,
                                    supervisor: currentSupervisor,
                                    currentRunningStyle,
                                    quantity: '',
                                    totalTarget: 0,
                                    totalManpower: 0,
                                    dailyPlans: [],
                                    startDate: undefined,
                                    endDate: undefined,
                                    rowIndex: r,
                                    colIndex: c,
                                    remarks: [],
                                    anomalies: []
                                };
                                const rightCellVal = cleanString(getCellValue(rowStyle[c + 1]));
                                if (isQuantity(rightCellVal)) activeStyle.quantity = rightCellVal;
                            }

                            if (activeStyle) {
                                if (hasContent && isRemarkText) {
                                    activeStyle.remarks.push(`${calendar?.date.toLocaleDateString() ?? 'Unknown'}: ${cellStr}`);
                                }

                                if (calendar) {
                                    const targetVal = rowTarget[c];
                                    const mpVal = rowManpower[c];
                                    const targetNum = typeof targetVal === 'number' ? Math.round(targetVal) : Math.round(Number(targetVal) || 0);
                                    const mpNum = typeof mpVal === 'number' ? Math.round(mpVal) : Math.round(Number(mpVal) || 0);

                                    if (!activeStyle.startDate) activeStyle.startDate = calendar.date;
                                    activeStyle.endDate = calendar.date;

                                    if (targetNum > 0 || mpNum > 0 || !calendar.isHoliday) {
                                        activeStyle.dailyPlans.push({
                                            date: calendar.date,
                                            dayName: calendar.day,
                                            isHoliday: calendar.isHoliday,
                                            target: targetNum,
                                            manpower: mpNum
                                        });

                                        activeStyle.totalTarget += targetNum;
                                        activeStyle.totalManpower += mpNum;

                                        if (calendar.isHoliday && (targetNum > 0 || mpNum > 0)) {
                                            activeStyle.anomalies.push({
                                                type: 'holiday_production',
                                                severity: 'medium',
                                                message: `Production planned on holiday (${calendar.day})`
                                            });
                                        }
                                    }
                                }
                            }
                        }
                        if (activeStyle) allStyles.push(activeStyle);
                    }
                });

                // Post-Processing: Style Progression
                allStyles.sort((a, b) => {
                    if (a.physicalLine !== b.physicalLine) return a.physicalLine.localeCompare(b.physicalLine);
                    return (a.startDate || 0) - (b.startDate || 0);
                });

                for (let i = 1; i < allStyles.length; i++) {
                    const prev = allStyles[i - 1];
                    const curr = allStyles[i];
                    if (prev.physicalLine === curr.physicalLine) {
                        curr.currentRunningStyle = prev.styleName;
                    }
                }

                resolve(allStyles);
            } catch (err) {
                reject(err);
            }
        };
        reader.readAsArrayBuffer(file);
    });
};

// --- UI Handlers ---

export const handleFileUpload = async (input) => {
    const file = input.files[0];
    if (!file) return;

    document.getElementById('loadingText').classList.remove('hidden');

    try {
        const data = await processWorkbook(file);
        fullData = data;
        currentData = data;

        // Hide upload, show controls & content
        document.getElementById('uploadState').classList.add('hidden');
        document.getElementById('contentArea').classList.remove('hidden');
        document.getElementById('viewControls').style.display = 'flex';
        document.getElementById('viewControls').style.opacity = '1';

        // Show Search
        const searchInput = document.getElementById('searchContainer');
        if (searchInput) searchInput.classList.remove('hidden');

        switchView('dashboard');
    } catch (err) {
        if (window.showToast) window.showToast(err.message, 'error');
        else alert("Error parsing file: " + err.message);
        console.error(err);
        document.getElementById('loadingText').classList.add('hidden');
    }
};

export const handleSearch = (query) => {
    if (!fullData) return;

    const q = query.toLowerCase().trim();
    if (!q) {
        currentData = fullData;
    } else {
        currentData = fullData.filter(item =>
            (item.styleName && item.styleName.toLowerCase().includes(q)) ||
            (item.physicalLine && item.physicalLine.toLowerCase().includes(q)) ||
            (item.supervisor && item.supervisor.toLowerCase().includes(q)) ||
            (item.currentRunningStyle && item.currentRunningStyle.toLowerCase().includes(q))
        );
    }

    if (window._searchTimeout) clearTimeout(window._searchTimeout);
    window._searchTimeout = setTimeout(() => {
        if (currentView === 'dashboard') renderDashboard();
        if (currentView === 'timeline') renderTimeline();
        if (currentView === 'grid') renderGrid();
    }, 300);
};

export const switchView = (viewName) => {
    currentView = viewName;

    ['dashboard', 'timeline', 'grid'].forEach(v => {
        const section = document.getElementById(`view-${v}`);
        if (section) {
            if (v === viewName) {
                section.classList.remove('hidden');
                if (window.gsap) gsap.fromTo(section, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4 });
            } else {
                section.classList.add('hidden');
            }
        }

        const btn = document.getElementById(`btn-${v}`);
        if (btn) {
            if (v === viewName) {
                btn.classList.add('bg-slate-900', 'text-white', 'shadow-xl');
                btn.classList.remove('bg-white/60', 'text-slate-600');
            } else {
                btn.classList.remove('bg-slate-900', 'text-white', 'shadow-xl');
                btn.classList.add('bg-white/60', 'text-slate-600');
            }
        }
    });

    if (viewName === 'dashboard') renderDashboard();
    if (viewName === 'timeline') renderTimeline();
    if (viewName === 'grid') renderGrid();
};

// --- RENDERERS ---

const renderDashboard = () => {
    if (!currentData) return;
    const data = currentData;

    // 1. Calculate Aggregate Metrics
    let totalTarget = 0;
    let totalManpower = 0;
    let anomalies = [];
    let remarks = [];
    const supervisors = new Set();
    const uniqueStyles = new Set();

    // Daily Stats Map
    const dailyStats = new Map();

    data.forEach(s => {
        totalTarget += s.totalTarget;
        totalManpower += s.totalManpower;
        supervisors.add(s.supervisor);
        uniqueStyles.add(s.styleName);

        if (s.anomalies) anomalies.push(...s.anomalies.map(a => ({ ...a, styleName: s.styleName, line: s.physicalLine })));
        if (s.remarks) remarks.push(...s.remarks.map(r => ({ text: r, styleName: s.styleName, line: s.physicalLine })));

        // Factory Daily Goals Calculation
        s.dailyPlans.forEach(day => {
            const dateKey = day.date.toISOString().split('T')[0];
            const current = dailyStats.get(dateKey) || { date: day.date, target: 0, mp: 0 };
            current.target += day.target;
            current.mp += day.manpower;
            dailyStats.set(dateKey, current);
        });
    });

    // Sort Daily Stats by Date
    const calendarData = Array.from(dailyStats.values()).sort((a, b) => a.date - b.date);

    // Calc Avg MP
    const avgManpowerPerStyle = Math.round(data.reduce((acc, style) => {
        const styleAvg = style.dailyPlans.length ? style.totalManpower / style.dailyPlans.length : 0;
        return acc + styleAvg;
    }, 0) / (data.length || 1));

    // --- Update KPI Cards ---
    document.getElementById('stat-styles').textContent = uniqueStyles.size;
    document.getElementById('stat-target').textContent = (totalTarget / 1000).toFixed(1) + 'k';
    document.getElementById('stat-manpower').textContent = Math.round(totalManpower / (data.length || 1)); // Avg instead of total? Or total? React used Avg MP calc differently. Sticking to total for now if matching label, but label says "Total Manpower" in HTML. Wait, React said "Avg Line Manpower".
    // Actually, let's match React logic for the 3rd card:
    const card3Label = document.querySelector('#stat-manpower').parentElement.parentElement.querySelector('p');
    if (card3Label) card3Label.textContent = "AVG LINE MANPOWER";
    document.getElementById('stat-manpower').textContent = avgManpowerPerStyle;

    document.getElementById('anomaly-count').textContent = `${anomalies.length} issues`;

    // --- Render Critical Items (Anomalies + Remarks) ---
    const anomalyList = document.getElementById('anomaly-list');
    anomalyList.innerHTML = '';

    const criticalItems = [];
    anomalies.forEach(a => criticalItems.push({ type: 'error', ...a }));
    remarks.forEach(r => criticalItems.push({ type: 'warning', message: r.text, ...r }));

    if (criticalItems.length === 0) {
        anomalyList.innerHTML = '<div class="text-slate-500 text-sm italic">No issues found.</div>';
    } else {
        criticalItems.slice(0, 50).forEach(item => {
            const isErr = item.type === 'error';
            const div = document.createElement('div');
            div.className = `flex items-start p-3 mb-2 rounded-lg text-xs border ${isErr ? 'bg-red-50 border-red-100 text-red-800' : 'bg-amber-50 border-amber-100 text-amber-800'}`;
            div.innerHTML = `
                <i data-lucide="${isErr ? 'alert-circle' : 'message-square'}" class="w-4 h-4 mr-2 mt-0.5 ${isErr ? 'text-red-500' : 'text-amber-500'}"></i>
                <div>
                    <span class="font-bold block ${isErr ? 'text-red-700' : 'text-amber-700'}">${item.styleName} (${item.line})</span>
                    <span class="opacity-90">${item.message}</span>
                </div>`;
            anomalyList.appendChild(div);
        });
    }

    // --- NEW: Style Daily Targets Matrix (Insert into DOM dynamically if not exists) ---
    let matrixContainer = document.getElementById('dashboard-matrix');
    if (!matrixContainer) {
        // Create container if missing (it is missing in original HTML)
        const dashboardView = document.getElementById('view-dashboard');
        // We need to insert it BEFORE the grid of cards at the bottom? No, typically below the stats.
        // Let's create a new full-width section.
        const newSection = document.createElement('div');
        newSection.id = 'dashboard-matrix';
        newSection.className = 'col-span-1 md:col-span-4 bg-white/60 p-6 rounded-2xl border border-white/50 h-96 flex flex-col mb-6 glass-card';
        // Insert after the KPI grid
        const kpiGrid = dashboardView.querySelector('.grid');
        kpiGrid.parentNode.insertBefore(newSection, kpiGrid.nextSibling);
        matrixContainer = newSection;
    }

    // Render Matrix HTML
    matrixContainer.innerHTML = `
        <h4 class="text-slate-800 font-bold mb-4 flex items-center gap-2"><i data-lucide="bar-chart-2" class="w-4 h-4 text-blue-500"></i> Style Daily Targets</h4>
        <div class="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white/50 custom-scrollbar">
            <table class="w-full text-left text-xs whitespace-nowrap">
                <thead class="bg-slate-50 text-slate-500 sticky top-0 z-10 shadow-sm">
                    <tr>
                        <th class="p-3 sticky left-0 bg-slate-50 border-r border-slate-200 z-20">Style / Line</th>
                        <th class="p-3 text-center border-r border-slate-200">MP</th>
                        ${calendarData.slice(0, 14).map(d => `
                            <th class="p-3 text-center border-l border-slate-200/50 ${d.isHoliday ? 'text-red-500 bg-red-50/50' : ''}">
                                <div class="font-bold">${d.date.getDate()}</div>
                                <div class="text-[9px] uppercase">${d.date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                            </th>
                        `).join('')}
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${data.slice(0, 20).map(style => {
        const styleAvgMp = style.dailyPlans.length ? Math.round(style.totalManpower / style.dailyPlans.length) : 0;
        return `
                        <tr class="hover:bg-blue-50/30 transition-colors">
                            <td class="p-3 font-medium text-slate-700 sticky left-0 bg-white border-r border-slate-100 z-10">
                                <div class="truncate w-32 font-bold text-blue-900" title="${style.styleName}">${style.styleName}</div>
                                <div class="text-[10px] text-slate-400 truncate w-32">${style.physicalLine}</div>
                            </td>
                            <td class="p-3 text-orange-500 font-mono font-bold text-center border-r border-slate-100">${styleAvgMp}</td>
                            ${calendarData.slice(0, 14).map(d => {
            const plan = style.dailyPlans.find(p => p.date.getTime() === d.date.getTime());
            return `
                                <td class="p-3 text-center border-l border-slate-100 font-mono text-slate-400 relative group">
                                    ${plan ? `<span class="text-emerald-600 font-bold">${plan.target}</span>` : '<span class="opacity-20">-</span>'}
                                </td>`;
        }).join('')}
                        </tr>`;
    }).join('')}
                </tbody>
            </table>
        </div>
        <div class="mt-2 text-[10px] text-slate-400 text-right">Top 20 Styles • Next 14 Days</div>
    `;

    // --- NEW: Factory Daily Goals (Insert or Update) ---
    // In React this was a separate card. In HTML we might need a container.
    // The previous code put 'anomaly-list' in a card. We can repurpose/add.
    // Let's create `dashboard-goals` container if missing.
    let goalsContainer = document.getElementById('dashboard-goals');
    if (!goalsContainer) {
        const goalsDiv = document.createElement('div');
        goalsDiv.id = 'dashboard-goals';
        goalsDiv.className = 'bg-white rounded-2xl p-6 border border-slate-200 shadow-sm h-80 flex flex-col';
        // Append to the 2-col grid at bottom.
        // Currently the bottom grid is: [Anomalies] [ ? ]
        // The HTML structure has a grid with 2 cols. Left is anomalies. Right is... unassigned?
        // Let's check `planning.html` structure... 
        // Logic: Find the grid containing 'anomaly-list' and append to it.
        const anomalyCard = document.getElementById('anomaly-list').parentElement;
        const parentGrid = anomalyCard.parentElement;
        if (parentGrid) {
            parentGrid.appendChild(goalsDiv);
        }
        goalsContainer = goalsDiv;
    }

    goalsContainer.innerHTML = `
        <h4 class="text-slate-800 font-bold mb-4 flex items-center gap-2"><i data-lucide="target" class="w-4 h-4 text-emerald-500"></i> Factory Daily Goals</h4>
        <div class="flex-1 overflow-auto rounded-xl border border-slate-100 bg-slate-50/50 custom-scrollbar">
            <table class="w-full text-left text-xs">
                <thead class="bg-white text-slate-500 sticky top-0 shadow-sm">
                    <tr>
                        <th class="p-3 font-medium">Date</th>
                        <th class="p-3 font-medium text-right">Target</th>
                        <th class="p-3 font-medium text-right">MP</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${calendarData.slice(0, 14).map(d => `
                        <tr class="hover:bg-white transition-colors">
                            <td class="p-3 font-mono text-slate-600">
                                <span class="${d.isHoliday ? 'text-red-500' : ''}">${d.date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}</span>
                            </td>
                            <td class="p-3 text-right font-mono text-emerald-600 font-bold">${d.target.toLocaleString()}</td>
                            <td class="p-3 text-right font-mono text-orange-500">${d.mp.toLocaleString()}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

    if (window.lucide) window.lucide.createIcons();
};

const renderTimeline = () => {
    if (!currentData) return;
    const container = document.getElementById('timeline-container');
    container.innerHTML = '';
    container.className = 'flex flex-col h-[75vh] bg-[#0f172a] border border-slate-800 rounded-lg overflow-hidden relative text-slate-300 shadow-2xl';

    const validData = currentData.filter(d => d.startDate && d.endDate && (d.totalTarget > 0 || d.totalManpower > 0));

    if (validData.length === 0) {
        container.innerHTML = '<div class="p-8 text-center text-slate-500">No matching scheduling data found.</div>';
        return;
    }

    let minDate = validData[0].startDate;
    let maxDate = validData[0].endDate;

    validData.forEach(s => {
        if (s.startDate < minDate) minDate = s.startDate;
        if (s.endDate > maxDate) maxDate = s.endDate;
    });

    const startDate = new Date(minDate);
    startDate.setDate(startDate.getDate() - 2);
    const endDate = new Date(maxDate);
    endDate.setDate(endDate.getDate() + 5);

    const dayWidth = 50;
    const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

    const lanes = Array.from(new Set(validData.map(d => d.physicalLine || 'Unassigned'))).sort();

    const controls = document.createElement('div');
    controls.className = 'flex justify-between items-center p-4 border-b border-slate-800 bg-[#1e293b] sticky top-0 z-40';
    controls.innerHTML = `
        <h3 class="text-slate-300 font-medium font-mono flex items-center gap-2">
            <i data-lucide="calendar" class="w-4 h-4"></i> Production Schedule
        </h3>
        <div class="text-xs text-slate-500 font-mono">
            ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}
        </div>
    `;
    container.appendChild(controls);

    const scrollArea = document.createElement('div');
    scrollArea.className = 'flex-1 overflow-auto relative custom-scrollbar';
    container.appendChild(scrollArea);

    const contentWidth = totalDays * dayWidth;
    const innerContainer = document.createElement('div');
    innerContainer.style.width = `${contentWidth}px`;
    innerContainer.style.minHeight = '100%';
    innerContainer.className = 'relative';
    scrollArea.appendChild(innerContainer);

    const headerRow = document.createElement('div');
    headerRow.className = 'sticky top-0 z-20 flex bg-[#1e293b] border-b border-slate-700 h-10';

    const cornerBox = document.createElement('div');
    cornerBox.className = 'w-32 flex-shrink-0 border-r border-slate-700 bg-[#1e293b] sticky left-0 z-30 flex items-center px-4 font-bold text-[10px] text-slate-400 uppercase tracking-wider';
    cornerBox.textContent = 'Resource';
    headerRow.appendChild(cornerBox);

    for (let i = 0; i < totalDays; i++) {
        const d = new Date(startDate.getTime() + (i * 86400000));
        const isFri = d.getDay() === 5;
        const dayCell = document.createElement('div');
        dayCell.className = `flex-shrink-0 border-r border-slate-800 flex flex-col justify-center items-center text-[10px] font-mono ${isFri ? 'bg-red-900/20 text-red-500' : 'text-slate-500'}`;
        dayCell.style.width = `${dayWidth}px`;
        dayCell.innerHTML = `<div>${d.getDate()}</div><div>${d.toLocaleDateString('en-US', { weekday: 'narrow' })}</div>`;
        headerRow.appendChild(dayCell);
    }
    innerContainer.appendChild(headerRow);

    lanes.forEach(lane => {
        const laneRow = document.createElement('div');
        laneRow.className = 'relative border-b border-slate-800/50 flex';

        const laneHeader = document.createElement('div');
        laneHeader.className = 'sticky left-0 z-10 bg-[#0f172a] border-r border-slate-700 w-32 flex-shrink-0 p-3 flex flex-col justify-center group hover:bg-slate-800 transition-colors cursor-pointer';

        const laneStyles = validData.filter(d => d.physicalLine === lane);
        const unitName = laneStyles[0]?.unit || '';

        laneHeader.innerHTML = `
            <div class="text-xs font-bold text-slate-300 truncate" title="${lane}">${lane}</div>
            <div class="text-[9px] text-slate-500 mt-1 uppercase tracking-wider">${unitName}</div>
        `;
        laneRow.appendChild(laneHeader);

        const laneContent = document.createElement('div');
        laneContent.className = 'relative flex-grow h-24 bg-[#020617]';

        const gridBg = document.createElement('div');
        gridBg.className = 'absolute inset-0 flex pointer-events-none';
        for (let i = 0; i < totalDays; i++) {
            const d = new Date(startDate.getTime() + (i * 86400000));
            const isFri = d.getDay() === 5;
            const bgCell = document.createElement('div');
            bgCell.className = `h-full border-r border-slate-800/30 flex-shrink-0 ${isFri ? 'bg-red-900/10' : ''}`;
            bgCell.style.width = `${dayWidth}px`;
            gridBg.appendChild(bgCell);
        }
        laneContent.appendChild(gridBg);

        laneStyles.forEach(style => {
            const diffTime = style.startDate - startDate;
            const startDayIndex = diffTime / (1000 * 60 * 60 * 24);
            const durationTime = style.endDate - style.startDate;
            const durationDays = (durationTime / (1000 * 60 * 60 * 24)) + 1;

            const left = startDayIndex * dayWidth;
            const width = Math.max(30, durationDays * dayWidth);

            const hasError = style.anomalies && style.anomalies.some(a => a.severity === 'high');
            const hasWarn = style.anomalies && style.anomalies.length > 0;
            const borderColor = hasError ? 'border-red-500' : hasWarn ? 'border-amber-500' : 'border-blue-500';
            const bgColor = hasError ? 'bg-red-500/20' : hasWarn ? 'bg-amber-500/20' : 'bg-blue-500/20';
            const textColor = hasError ? 'text-red-200' : hasWarn ? 'text-amber-200' : 'text-blue-200';

            const bar = document.createElement('div');
            bar.className = `absolute top-4 h-16 rounded border-l-4 cursor-pointer overflow-hidden group transition-all duration-200 hover:z-50 hover:shadow-2xl hover:scale-[1.01] ${borderColor} ${bgColor} bg-slate-900 shadow-md`;
            bar.style.left = `${left}px`;
            bar.style.width = `${width - 2}px`;

            bar.innerHTML = `
                <div class="p-2">
                    <div class="flex justify-between items-start">
                        <span class="font-bold text-[10px] text-white truncate w-full block" title="${style.styleName}">${style.styleName}</span>
                    </div>
                    <div class="flex gap-2 mt-2 text-[9px] ${textColor} opacity-80">
                        <span>T: ${(style.totalTarget / 1000).toFixed(1)}k</span>
                        <span>Now: ${style.currentRunningStyle ? style.currentRunningStyle.substring(0, 8) : 'New'}</span>
                    </div>
                </div>
            `;

            bar.onclick = () => openStyleModal(style);
            laneContent.appendChild(bar);
        });

        laneRow.appendChild(laneContent);
        innerContainer.appendChild(laneRow);
    });

    if (window.lucide) window.lucide.createIcons();
};

const renderGrid = () => {
    if (!currentData) return;
    const container = document.getElementById('view-grid');
    const cardContainer = container.querySelector('.glass-card');
    cardContainer.innerHTML = `
        <h3 class="text-xl font-heading font-bold text-slate-900 mb-6">Detailed Grid</h3>
        <div id="grid-content"></div>
    `;

    // Group by Line/Supervisor
    const groups = new Map();
    currentData.forEach(s => {
        // Use Physical Line for grouping if available, else Supervisor
        const key = s.physicalLine || s.supervisor || 'Unassigned';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(s);
    });

    const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });

    const gridLayout = document.createElement('div');
    gridLayout.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-[fadeIn_0.3s_ease-out]';

    sortedKeys.forEach((key) => {
        const styles = groups.get(key);
        const supervisor = styles[0]?.supervisor || 'Unknown';
        const unit = styles[0]?.unit || 'N/A';
        const totalTarget = styles.reduce((acc, s) => acc + s.totalTarget, 0);

        const card = document.createElement('div');
        card.className = 'bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col h-[500px] hover:border-blue-300 hover:shadow-lg transition-all';

        card.innerHTML = `
            <div class="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-start sticky top-0 z-10">
                <div>
                    <h3 class="text-slate-800 font-bold text-lg truncate w-40" title="${key} • ${supervisor}">${key}</h3>
                    <div class="flex items-center gap-2 text-xs text-slate-500 mt-1">
                        <span class="px-1.5 py-0.5 rounded border border-slate-200 bg-white font-mono">${supervisor}</span>
                        <span>• ${styles.length} Styles</span>
                    </div>
                </div>
                <div class="text-right">
                    <div class="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Target</div>
                    <div class="text-emerald-600 font-mono font-bold">${(totalTarget / 1000).toFixed(1)}k</div>
                </div>
            </div>
        `;

        const listDiv = document.createElement('div');
        listDiv.className = 'flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar';

        const table = document.createElement('table');
        table.className = 'w-full text-xs text-left';
        table.innerHTML = `
            <thead class="text-slate-400 sticky top-0 bg-white shadow-sm z-0">
                <tr>
                    <th class="p-2 pb-3 pl-3 font-medium">Style</th>
                    <th class="p-2 pb-3 text-right font-medium">Qty</th>
                    <th class="p-2 pb-3 text-right font-medium">Start</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-slate-100"></tbody>
        `;

        const tbody = table.querySelector('tbody');
        styles.forEach(style => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 cursor-pointer group transition-colors';
            tr.onclick = () => openStyleModal(style);

            const startDateStr = style.startDate ? style.startDate.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' }) : '-';
            const runStyle = style.currentRunningStyle ? style.currentRunningStyle : 'New Start';

            tr.innerHTML = `
                <td class="p-2 pl-3">
                    <div class="font-medium text-slate-700 group-hover:text-blue-600 truncate w-32" title="${style.styleName}">${style.styleName}</div>
                    <div class="text-[10px] text-slate-400 truncate w-32" title="Running: ${runStyle}"><i class="inline-block w-2 border-l border-b border-slate-300 h-2 mr-1"></i>${runStyle}</div>
                </td>
                <td class="p-2 text-right font-mono text-slate-500">${style.quantity}</td>
                <td class="p-2 text-right font-mono text-slate-400">${startDateStr}</td>
            `;
            tbody.appendChild(tr);
        });

        listDiv.appendChild(table);
        card.appendChild(listDiv);
        gridLayout.appendChild(card);
    });

    document.getElementById('grid-content').appendChild(gridLayout);
};

export const openStyleModal = (style) => {
    document.getElementById('modal-title').textContent = style.styleName;
    document.getElementById('modal-subtitle').textContent = `Line: ${style.physicalLine} (${style.supervisor})`;

    const setSafe = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    setSafe('modal-supervisor', style.supervisor);
    setSafe('modal-unit', style.unit);
    setSafe('modal-target', style.totalTarget.toLocaleString());
    setSafe('modal-manpower', style.totalManpower.toLocaleString());

    const tableBody = document.getElementById('modal-daily-table');
    if (tableBody) {
        tableBody.innerHTML = '';
        style.dailyPlans.forEach(day => {
            const tr = document.createElement('tr');
            tr.className = `border-b border-slate-100 ${day.isHoliday ? 'bg-red-50' : ''}`;
            tr.innerHTML = `
                <td class="px-4 py-2 font-mono text-slate-600 text-sm">
                    ${day.date.toLocaleDateString()} <span class="text-xs text-slate-400 ml-1 transform uppercase">${day.dayName}</span>
                </td>
                <td class="px-4 py-2 text-right text-emerald-600 font-mono text-sm">${day.target}</td>
                <td class="px-4 py-2 text-right text-orange-600 font-mono text-sm">${day.manpower}</td>
            `;
            tableBody.appendChild(tr);
        });
    }

    const modal = document.getElementById('styleModal');
    const overlay = document.getElementById('modalOverlay');
    if (modal) {
        modal.classList.add('active');
        overlay.classList.add('active');
        if (window.gsap) {
            gsap.fromTo(modal, { scale: 0.9, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(1.7)' });
        }
    }
};

window.PlanningLogic = {
    processWorkbook,
    handleFileUpload,
    handleSearch,
    switchView,
    openStyleModal
};
