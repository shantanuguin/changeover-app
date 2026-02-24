
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
    "S-01": { supervisor: "WASANA" },
    "S-01A": { supervisor: "WASANA" },
    "S-02": { supervisor: "SOHORAB" },
    "S-03": { supervisor: "SOHEL" },
    "S-04": { supervisor: "HIMAYIT/AHMAD" },
    "S-05": { supervisor: "BALISTER/FARUK" },
    "S-06": { supervisor: "SHAKIL/MUSUM" },
    "S-07": { supervisor: "NAGENDER" },
    "S-07A": { supervisor: "KAMAL" },
    "S-08": { supervisor: "BALISTER/FARUK" },
    "S-09": { supervisor: "SUMI" },
    "S-10": { supervisor: "RAJ KUMAR" },
    "S-11": { supervisor: "KAMAL/MUNSAF" },
    "S-12": { supervisor: "DHARAMEDER" },
    "S-13": { supervisor: "SUMON/DEVRAJ" },
    "S-14": { supervisor: "SHARIF" },
    "S-15": { supervisor: "KAMAL/MUNSAF" },
    "S-16": { supervisor: "RAHMAN" },
    "S-16A": { supervisor: "RHANIA" },
    "S-17": { supervisor: "SHAKIL/MUSUM" },
    "S-18": { supervisor: "JAKIR" },
    "S-19": { supervisor: "ALAMGIR" },
    "S-20": { supervisor: "GAYANI/KAZAL" },
    "S-21": { supervisor: "SUMON/DEVRAJ" },
    "S-22": { supervisor: "ASHRAFUL" },
    "S-23": { supervisor: "RUMA" },
    "S-24": { supervisor: "NASIR" },
    "S-25": { supervisor: "AKBAR" },
    "S-26": { supervisor: "HIMAYIT/AHMAD" },
    "S-28": { supervisor: "RUPNANAYAN" },
    "S-29": { supervisor: "SUBA" },
    "S-30": { supervisor: "RAZIB" },
    "S-31": { supervisor: "AKESH" },
    "S-32": { supervisor: "KALU" }
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

// --- Fuzzy Match Helpers ---
const levenshtein = (a, b) => {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1,     // insertion
                    matrix[i - 1][j] + 1      // deletion
                );
            }
        }
    }
    return matrix[b.length][a.length];
};

const getSimilarity = (s1, s2) => {
    let longer = s1, shorter = s2;
    if (s1.length < s2.length) { longer = s2; shorter = s1; }
    let longerLength = longer.length;
    if (longerLength === 0) return 1.0;
    return (longerLength - levenshtein(longer, shorter)) / parseFloat(longerLength);
};

const lookupLineBySupervisor = (supName) => {
    if (!supName) return "Unassigned";

    // 1. Normalize input: Replace any non-alphabetic char with a space
    const namePart = supName.toUpperCase().replace(/[^A-Z]/g, ' ').trim();
    // Get the words which are likely the name (ignoring short tokens like "S" or "R")
    const words = namePart.split(/\s+/).filter(w => w.length > 2 && w !== 'LINE' && w !== 'UNIT' && w !== 'NEW');

    if (words.length === 0) return supName;

    // 2. Exact/Substring Match in the registry
    // Split registry names by '/' to compare individual names (e.g., "GAYANI/KAZAL" -> ["GAYANI", "KAZAL"])
    for (const [sup, line] of Object.entries(SUPERVISOR_TO_LINE)) {
        const supParts = sup.replace(/[^A-Z\/]/g, '').split('/').filter(p => p.length > 0);
        for (const word of words) {
            for (const part of supParts) {
                if (word === part || word.includes(part) || part.includes(word)) {
                    return `${sup} ${line}`;
                }
            }
        }
    }

    // 3. Fuzzy Match — also split registry names by '/'
    let bestMatchLine = null;
    let bestMatchName = null;
    let highestSim = 0;

    for (const [sup, line] of Object.entries(SUPERVISOR_TO_LINE)) {
        const supParts = sup.replace(/[^A-Z\/]/g, '').split('/').filter(p => p.length >= 3);

        for (const word of words) {
            for (const part of supParts) {
                const sim = getSimilarity(word, part);
                if (sim > highestSim && sim >= 0.5) {
                    highestSim = sim;
                    bestMatchLine = line;
                    bestMatchName = sup;
                }
            }
        }
    }

    // Return the resolved Name + S-code (e.g., "MONJURUL S-09")
    if (bestMatchLine) {
        return `${bestMatchName} ${bestMatchLine}`;
    }

    return supName;
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

                    let dynamicPlanStart = COL_PLAN_START;
                    let foundFirstDate = false;

                    for (let c = 2; c < dateRow.length; c++) {
                        let dateVal = dateRow[c];
                        let jsDate = null;
                        if (dateVal instanceof Date) jsDate = dateVal;
                        else if (typeof dateVal === 'number') jsDate = excelDateToJSDate(dateVal);

                        const dayName = cleanString(dayRow[c]);

                        if (jsDate && isValidDate(jsDate)) {
                            if (!foundFirstDate) {
                                dynamicPlanStart = c;
                                foundFirstDate = true;
                            }
                            dateMap.set(c, { date: jsDate, day: dayName, isHoliday: isFriday(dayName) });
                        }
                    }

                    // 2. Scan Styles — Dynamically detect supervisor rows
                    let currentUnit = "Main Unit";

                    // Find all supervisor rows: rows where Column A has a non-empty value
                    // Each supervisor block is 3 rows: [style names] [targets] [manpower]
                    const supervisorRows = [];
                    for (let r = 4; r <= Math.min(rawData.length - 1, ROW_STYLE_END); r++) {
                        const cellA = cleanString(rawData[r][COL_LINE_CTX]);
                        if (cellA.length === 0) continue;

                        // Skip header/summary rows
                        const lower = cellA.toLowerCase();
                        if (lower.includes('ttl') || lower.includes('budget') ||
                            lower.includes('activity') || lower.includes('requirement') ||
                            lower.includes('physical line') || lower.includes('current running') ||
                            lower.includes('sidney')) continue;

                        // Track unit changes
                        if (lower.includes('main unit')) { currentUnit = "Main Unit"; continue; }
                        if (lower.includes('sub unit') || lower.includes('sub-unit')) { currentUnit = "Sub Unit"; continue; }

                        supervisorRows.push({ row: r, cellA, unit: currentUnit });
                    }

                    // Process each supervisor row block (3 rows: style, target, manpower)
                    for (const supRow of supervisorRows) {
                        const r = supRow.row;
                        const cellA = supRow.cellA;
                        currentUnit = supRow.unit;
                        let currentSupervisor = cellA;

                        let physicalLine = lookupLineBySupervisor(currentSupervisor);
                        let currentRunningStyle = cleanString(rawData[r][COL_CURR_STYLE]);
                        const rowStyle = rawData[r] || [];
                        const rowTarget = rawData[r + 1] || [];
                        const rowManpower = rawData[r + 2] || [];

                        let activeStyle = null;

                        for (let c = dynamicPlanStart; c < rowStyle.length; c++) {
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

                        // If no new style was ever encountered, but there is a currentRunningStyle,
                        // create a placeholder so the line still appears on the board.
                        if (!activeStyle && currentRunningStyle) {
                            const firstDateKey = Array.from(dateMap.keys())[0];
                            const lastDateKey = Array.from(dateMap.keys()).pop();
                            const firstDate = firstDateKey ? dateMap.get(firstDateKey).date : new Date();
                            const lastDate = lastDateKey ? dateMap.get(lastDateKey).date : new Date();

                            activeStyle = {
                                id: `${sheetName}-R${r}-Placeholder`,
                                styleName: currentRunningStyle,
                                sheetName,
                                unit: currentUnit,
                                physicalLine: physicalLine,
                                supervisor: currentSupervisor,
                                currentRunningStyle,
                                quantity: '',
                                totalTarget: 0,
                                totalManpower: 0,
                                dailyPlans: [],
                                startDate: firstDate,
                                endDate: lastDate,
                                rowIndex: r,
                                colIndex: dynamicPlanStart,
                                remarks: [],
                                anomalies: []
                            };
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
    document.getElementById('stat-manpower').textContent = avgManpowerPerStyle;

    // --- Render Critical Items (Enhanced Anomalies + Remarks) ---
    if (allCriticalItems.length === 0) {
        // Build from current data if not yet populated
        const detectedAnomalies = detectAnomalies(data);
        const remarkItems = [];
        data.forEach(s => {
            if (s.remarks) remarkItems.push(...s.remarks.map(r => ({ text: r, styleName: s.styleName, line: s.physicalLine })));
        });
        allCriticalItems = [
            ...detectedAnomalies,
            ...remarkItems.map(r => ({ type: 'remark', severity: 'info', message: r.text, styleName: r.styleName, line: r.line, suggestedAction: '', rule: 'User remark from Excel sheet' }))
        ];
    }

    document.getElementById('anomaly-count').textContent = allCriticalItems.filter(i => i.severity === 'critical' || i.severity === 'warning').length;

    const anomalyList = document.getElementById('anomaly-list');
    const filtered = currentAnomalyFilter === 'all' ? allCriticalItems : allCriticalItems.filter(i => i.severity === currentAnomalyFilter);
    renderAnomalyItems(anomalyList, filtered);

    // --- Style Daily Targets Matrix ---
    const matrixContainer = document.getElementById('dashboard-matrix');
    if (matrixContainer) {
        matrixContainer.innerHTML = `
            <div class="p-6 border-b border-slate-100 flex justify-between items-center bg-white/50">
                <h4 class="text-slate-900 font-bold flex items-center gap-2">
                    <i data-lucide="bar-chart-2" class="w-5 h-5 text-blue-500"></i>
                    Style Daily Targets
                </h4>
            </div>
            <div class="flex-1 overflow-auto custom-scrollbar p-1">
                <table class="w-full text-left text-xs whitespace-nowrap border-separate border-spacing-0">
                    <thead class="bg-slate-50 text-slate-500 sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th class="p-4 sticky left-0 bg-slate-50 border-r border-slate-200 z-20 font-bold uppercase tracking-widest text-[10px]">Style / Line</th>
                            <th class="p-4 text-center border-r border-slate-200 font-bold uppercase tracking-widest text-[10px]">MP</th>
                            ${calendarData.slice(0, 14).map(d => `
                                <th class="p-4 text-center border-l border-slate-200/50 ${d.isHoliday ? 'text-rose-500 bg-rose-50/50' : ''}">
                                    <div class="font-bold">${d.date.getDate()}</div>
                                    <div class="text-[9px] uppercase tracking-tighter">${d.date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                                </th>
                            `).join('')}
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${data.slice(0, 30).map(style => {
            const styleAvgMp = style.dailyPlans.length ? Math.round(style.totalManpower / style.dailyPlans.length) : 0;
            return `
                            <tr class="hover:bg-blue-50/30 transition-all group">
                                <td class="p-4 font-medium text-slate-700 sticky left-0 bg-white border-r border-slate-100 z-10 group-hover:bg-blue-50 transition-colors">
                                    <div class="truncate w-40 font-bold text-slate-900 group-hover:text-blue-600 transition-colors" title="${style.styleName}">${style.styleName}</div>
                                    <div class="text-[10px] text-slate-400 font-mono tracking-tight">${style.physicalLine}</div>
                                </td>
                                <td class="p-4 text-orange-500 font-mono font-bold text-center border-r border-slate-100">${styleAvgMp}</td>
                                ${calendarData.slice(0, 14).map(d => {
                const plan = style.dailyPlans.find(p => p.date.getTime() === d.date.getTime());
                return `
                                    <td class="p-4 text-center border-l border-slate-100 font-mono text-slate-400 relative">
                                        ${plan ? `<span class="text-emerald-600 font-bold text-sm leading-none">${plan.target}</span>` : '<span class="opacity-10">-</span>'}
                                    </td>`;
            }).join('')}
                            </tr>`;
        }).join('')}
                    </tbody>
                </table>
            </div>
            <div class="p-3 bg-slate-50/50 border-t border-slate-100 text-[10px] text-slate-400 text-right font-medium tracking-wide">
                Showing top 30 styles • Next 14 production days
            </div>
        `;
    }

    // --- Factory Daily Goals ---
    const goalsContainer = document.getElementById('dashboard-goals');
    if (goalsContainer) {
        goalsContainer.innerHTML = `
            <div class="p-6 border-b border-slate-100 flex justify-between items-center bg-white/50">
                <h4 class="text-slate-900 font-bold flex items-center gap-2">
                    <i data-lucide="target" class="w-5 h-5 text-emerald-500"></i>
                    Factory Daily Goals
                </h4>
            </div>
            <div class="flex-1 overflow-auto rounded-xl custom-scrollbar p-2">
                <table class="w-full text-left text-xs border-separate border-spacing-0">
                    <thead class="bg-slate-50 text-slate-500 sticky top-0 shadow-sm">
                        <tr>
                            <th class="p-4 font-bold uppercase tracking-widest text-[10px] rounded-tl-xl text-slate-400">Date</th>
                            <th class="p-4 font-bold uppercase tracking-widest text-[10px] text-right text-slate-400">Target</th>
                            <th class="p-4 font-bold uppercase tracking-widest text-[10px] text-right rounded-tr-xl text-slate-400">MP</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${calendarData.slice(0, 14).map(d => `
                            <tr class="hover:bg-blue-50/30 transition-all group">
                                <td class="p-4 font-mono text-slate-700">
                                    <span class="${d.isHoliday ? 'text-rose-500 font-bold' : 'group-hover:text-blue-600 transition-colors'}">${d.date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}</span>
                                </td>
                                <td class="p-4 text-right font-mono text-emerald-600 font-bold text-sm">${d.target.toLocaleString()}</td>
                                <td class="p-4 text-right font-mono text-orange-500 font-medium">${d.mp.toLocaleString()}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }
    if (window.lucide) window.lucide.createIcons();
};

const renderTimeline = () => {
    if (!currentData) return;
    const container = document.getElementById('timeline-container');
    container.innerHTML = '';
    container.className = 'flex flex-col h-[75vh] bg-[#0f172a] border border-slate-800 rounded-lg overflow-hidden relative text-slate-300 shadow-2xl';

    const validData = currentData.filter(d => d.startDate && d.endDate && (d.totalTarget > 0 || d.totalManpower > 0 || d.id.includes('Placeholder')));

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

    const lanes = Array.from(new Set(validData.map(d => d.physicalLine || 'Unassigned'))).sort();

    const controls = document.createElement('div');
    controls.className = 'flex justify-between items-center p-4 border-b border-slate-800 bg-[#1e293b] sticky top-0 z-40';
    controls.innerHTML = `
        <h3 class="text-slate-300 font-medium font-mono flex items-center gap-2">
            <i data-lucide="calendar" class="w-4 h-4"></i> Production Schedule
        </h3>
        <div class="flex items-center gap-4">
            <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="changeoverMarkersToggle" ${showChangeoverMarkers ? 'checked' : ''} class="w-4 h-4 accent-red-500 rounded">
                <span class="text-xs text-slate-400 font-mono">Show Changeovers</span>
            </label>
            <div class="text-xs text-slate-500 font-mono">
                ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}
            </div>
        </div>
    `;

    // Bind event listener to the newly created toggle
    const toggle = controls.querySelector('#changeoverMarkersToggle');
    if (toggle) {
        toggle.addEventListener('change', (e) => {
            showChangeoverMarkers = e.target.checked;
            renderTimeline();
        });
    }

    container.appendChild(controls);

    const scrollArea = document.createElement('div');
    scrollArea.className = 'flex-1 overflow-auto relative custom-scrollbar';
    scrollArea.setAttribute('data-lenis-prevent', 'true');
    container.appendChild(scrollArea);

    if (showChangeoverMarkers && currentSuggestions.length > 0) {
        // --- CHANGEOVER MATRIX VIEW ---
        // Get unique changeover dates (ignoring time)
        const dateSet = new Set();
        currentSuggestions.forEach(s => {
            const dStr = s.suggestedDate.toISOString().split('T')[0];
            dateSet.add(dStr);
        });
        const dates = Array.from(dateSet).sort().map(d => new Date(d));

        const colWidth = 200;
        const contentWidth = dates.length * colWidth;

        const innerContainer = document.createElement('div');
        innerContainer.style.width = `${contentWidth}px`;
        innerContainer.style.minHeight = '100%';
        innerContainer.className = 'relative';
        scrollArea.appendChild(innerContainer);

        const headerRow = document.createElement('div');
        headerRow.className = 'sticky top-0 z-20 flex bg-[#1e293b] border-b border-slate-700 h-10';

        const cornerBox = document.createElement('div');
        cornerBox.className = 'w-48 flex-shrink-0 border-r border-slate-700 bg-[#1e293b] sticky left-0 z-30 flex items-center px-4 font-bold text-[10px] text-slate-400 uppercase tracking-wider';
        cornerBox.textContent = 'Resource';
        headerRow.appendChild(cornerBox);

        dates.forEach(d => {
            const dayCell = document.createElement('div');
            dayCell.className = `flex-shrink-0 border-r border-slate-800 flex flex-col justify-center items-center text-[10px] font-mono text-red-300 bg-red-900/10`;
            dayCell.style.width = `${colWidth}px`;
            dayCell.innerHTML = `<div>${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}</div><div class="text-[8px] uppercase">${d.toLocaleDateString('en-US', { weekday: 'short' })}</div>`;
            headerRow.appendChild(dayCell);
        });
        innerContainer.appendChild(headerRow);

        lanes.forEach(lane => {
            const laneRow = document.createElement('div');
            laneRow.className = 'relative border-b border-slate-800/50 flex';

            const laneHeader = document.createElement('div');
            laneHeader.className = 'sticky left-0 z-10 bg-[#0f172a] border-r border-slate-700 w-48 flex-shrink-0 p-3 flex flex-col justify-center';
            laneHeader.innerHTML = `<div class="text-xs font-bold text-slate-300 truncate" title="${lane}">${lane}</div>`;
            laneRow.appendChild(laneHeader);

            const laneContent = document.createElement('div');
            laneContent.className = 'relative flex-grow h-24 bg-[#020617] flex';

            dates.forEach(d => {
                const cell = document.createElement('div');
                cell.className = 'h-full flex-shrink-0 border-r border-slate-800/30 p-2 relative group matrix-cell';
                cell.style.width = `${colWidth}px`;

                // Find suggestion for this Lane + Date
                const dStr = d.toISOString().split('T')[0];
                const sugs = currentSuggestions.filter(s => s.line === lane && s.suggestedDate.toISOString().split('T')[0] === dStr);

                if (sugs.length > 0) {
                    const sug = sugs[0];
                    cell.innerHTML = `
                        <div class="w-full h-full rounded border border-red-500/20 bg-red-500/5 p-3 flex flex-col justify-center gap-1.5 cursor-pointer hover:bg-red-500/10 transition-colors shadow-sm">
                            <div class="text-[9px] font-bold text-slate-500 strike-through truncate" title="${sug.fromStyle}">${sug.fromStyle}</div>
                            <div class="text-[11px] font-bold text-red-400 truncate flex items-center gap-1" title="${sug.toStyle}">
                                <i data-lucide="arrow-right-circle" class="w-3 h-3"></i>
                                ${sug.toStyle}
                            </div>
                            <div class="flex items-center gap-2 mt-1">
                                <span class="text-[8px] bg-red-900/40 text-red-300 px-1.5 py-0.5 rounded-full">${sug.bufferDays}d buffer</span>
                                <span class="text-[8px] text-slate-500">${Math.round(sug.confidence * 100)}% conf</span>
                            </div>
                        </div>
                    `;
                }

                laneContent.appendChild(cell);
            });

            laneRow.appendChild(laneContent);
            innerContainer.appendChild(laneRow);
        });
    } else {
        // --- STANDARD GANTT TIMELINE VIEW ---
        const dayWidth = 50;
        const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
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
    }

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

// ============================================================
// FEATURE 3: Enhanced Anomaly Detection
// ============================================================
let currentAnomalyFilter = 'all';
let allCriticalItems = [];

const detectAnomalies = (data) => {
    const anomalies = [];
    if (!data || !data.length) return anomalies;

    const lineStyles = new Map();
    data.forEach(s => {
        const key = s.physicalLine || 'Unassigned';
        if (!lineStyles.has(key)) lineStyles.set(key, []);
        lineStyles.get(key).push(s);
    });

    data.forEach(s => {
        // Existing: holiday production
        if (s.anomalies) {
            s.anomalies.forEach(a => anomalies.push({
                ...a, severity: a.severity || 'warning',
                styleName: s.styleName, line: s.physicalLine,
                suggestedAction: 'Review holiday schedule',
                rule: 'Production scheduled on a holiday (Friday)'
            }));
        }
        // No start date
        if (!s.startDate) {
            anomalies.push({
                type: 'no_start_date', severity: 'critical',
                message: `Style "${s.styleName}" has no start date`, styleName: s.styleName,
                line: s.physicalLine, suggestedAction: 'Assign a start date in the planning sheet',
                rule: 'Every style must have a valid start date'
            });
        }
        // Zero-target working days
        s.dailyPlans.forEach(day => {
            if (!day.isHoliday && day.target === 0 && day.manpower > 0) {
                anomalies.push({
                    type: 'zero_target', severity: 'warning',
                    message: `Zero target on ${day.date.toLocaleDateString()} with ${day.manpower} workers`,
                    styleName: s.styleName, line: s.physicalLine,
                    suggestedAction: 'Set a production target or mark as non-working day',
                    rule: 'Working days with assigned manpower should have a target > 0'
                });
            }
        });
        // Manpower drops > 30%
        for (let i = 1; i < s.dailyPlans.length; i++) {
            const prev = s.dailyPlans[i - 1], curr = s.dailyPlans[i];
            if (prev.manpower > 0 && curr.manpower > 0) {
                const drop = (prev.manpower - curr.manpower) / prev.manpower;
                if (drop > 0.3) {
                    anomalies.push({
                        type: 'manpower_drop', severity: 'critical',
                        message: `Manpower dropped ${Math.round(drop * 100)}% (${prev.manpower}→${curr.manpower}) on ${curr.date.toLocaleDateString()}`,
                        styleName: s.styleName, line: s.physicalLine,
                        suggestedAction: 'Verify manpower allocation or plan for reduced output',
                        rule: 'Manpower drops exceeding 30% between consecutive days flag potential issues'
                    });
                }
            }
        }
    });

    // Overlapping styles on same line
    lineStyles.forEach((styles, line) => {
        for (let i = 0; i < styles.length; i++) {
            for (let j = i + 1; j < styles.length; j++) {
                const a = styles[i], b = styles[j];
                if (a.startDate && a.endDate && b.startDate && b.endDate) {
                    if (a.startDate <= b.endDate && b.startDate <= a.endDate) {
                        anomalies.push({
                            type: 'overlap', severity: 'warning',
                            message: `"${a.styleName}" and "${b.styleName}" overlap on line ${line}`,
                            styleName: a.styleName, line,
                            suggestedAction: 'Stagger style start dates to avoid resource conflicts',
                            rule: 'Two styles should not run simultaneously on the same production line'
                        });
                    }
                }
            }
        }
    });
    return anomalies;
};

const filterAnomalies = (severity) => {
    currentAnomalyFilter = severity;
    const list = document.getElementById('anomaly-list');
    if (!list) return;

    // Update filter button states
    document.querySelectorAll('#anomalyFilters button').forEach(btn => {
        btn.classList.remove('bg-slate-900', 'text-white', 'shadow-lg');
        btn.classList.add('bg-white/60', 'text-slate-600');
        if (btn.dataset.filter === severity) {
            btn.classList.add('bg-slate-900', 'text-white', 'shadow-lg');
            btn.classList.remove('bg-white/60', 'text-slate-600');
        }
    });

    const filtered = severity === 'all' ? allCriticalItems : allCriticalItems.filter(i => i.severity === severity);
    renderAnomalyItems(list, filtered);
};

const renderAnomalyItems = (container, items) => {
    container.innerHTML = '';
    if (items.length === 0) {
        container.innerHTML = '<div class="text-slate-400 text-center py-12 italic">No items match this filter.</div>';
        return;
    }
    const severityConfig = {
        critical: { icon: '🔴', bg: 'bg-red-50/50', border: 'border-red-200', text: 'text-red-800', badge: 'bg-red-100 text-red-700' },
        warning: { icon: '🟠', bg: 'bg-amber-50/50', border: 'border-amber-200', text: 'text-amber-800', badge: 'bg-amber-100 text-amber-700' },
        info: { icon: '🔵', bg: 'bg-blue-50/50', border: 'border-blue-200', text: 'text-blue-800', badge: 'bg-blue-100 text-blue-700' },
        medium: { icon: '🟠', bg: 'bg-amber-50/50', border: 'border-amber-200', text: 'text-amber-800', badge: 'bg-amber-100 text-amber-700' }
    };
    items.slice(0, 100).forEach(item => {
        const cfg = severityConfig[item.severity] || severityConfig.info;
        const div = document.createElement('div');
        div.className = `flex items-start p-4 rounded-2xl text-sm border transition-all hover:bg-white group ${cfg.bg} ${cfg.border} ${cfg.text}`;
        div.innerHTML = `
            <div class="text-lg mr-3 mt-0.5 shrink-0">${cfg.icon}</div>
            <div class="flex-1">
                <div class="flex justify-between items-start mb-1">
                    <span class="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">${item.styleName || 'System'}</span>
                    <div class="flex items-center gap-2">
                        <span class="text-[10px] font-mono px-2 py-0.5 rounded ${cfg.badge} uppercase tracking-wider">${item.severity}</span>
                        <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-white/80 border border-slate-100 text-slate-500 uppercase tracking-wider">${item.line || '-'}</span>
                    </div>
                </div>
                <p class="text-slate-600 leading-relaxed">${item.message}</p>
                ${item.suggestedAction ? `<p class="text-xs text-slate-400 mt-1 italic">💡 ${item.suggestedAction}</p>` : ''}
                ${item.rule ? `<span class="inline-block mt-1 text-[10px] text-slate-400 cursor-help border-b border-dashed border-slate-300" title="${item.rule}">Why?</span>` : ''}
            </div>`;
        container.appendChild(div);
    });
};

// ============================================================
// FEATURE 1 & 2: Changeover Suggestion Engine + Modal
// ============================================================
let currentSuggestions = [];
let acceptedSuggestions = [];
let suggestionsChart = null;

// --- Phase 6: Style Analysis Helpers ---

/**
 * Compare two style names and return a similarity score (0.0–1.0).
 * Same prefix family → higher score → shorter changeover expected.
 */
const getStyleSimilarity = (styleA, styleB) => {
    if (!styleA || !styleB) return 0;
    const a = styleA.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const b = styleB.toUpperCase().replace(/[^A-Z0-9]/g, '');

    // Check prefix match (first 4–6 chars)
    const prefixLen = Math.min(6, a.length, b.length);
    if (prefixLen < 2) return 0.2;

    const prefA = a.substring(0, prefixLen);
    const prefB = b.substring(0, prefixLen);

    if (prefA === prefB) return 1.0;

    // Partial prefix
    const p4A = a.substring(0, 4), p4B = b.substring(0, 4);
    if (p4A === p4B) return 0.8;

    const p2A = a.substring(0, 2), p2B = b.substring(0, 2);
    if (p2A === p2B) return 0.5;

    return 0.2;
};

/**
 * Assess the complexity of a style based on its data.
 * Returns { level: 'low'|'medium'|'high', score: 0.0–1.0 }
 */
const getStyleComplexity = (style) => {
    if (!style) return { level: 'low', score: 0.2 };

    const days = style.dailyPlans?.length || 0;
    const target = style.totalTarget || 0;
    const mpValues = (style.dailyPlans || []).map(d => d.manpower).filter(m => m > 0);
    const mpVariance = mpValues.length > 1 ?
        Math.sqrt(mpValues.reduce((sum, v) => sum + Math.pow(v - (mpValues.reduce((a, b) => a + b, 0) / mpValues.length), 2), 0) / mpValues.length) / (mpValues.reduce((a, b) => a + b, 0) / mpValues.length || 1) : 0;

    let score = 0;

    // More production days = more complex
    if (days > 20) score += 0.3;
    else if (days > 10) score += 0.2;
    else score += 0.1;

    // Higher target = more complex
    if (target > 10000) score += 0.3;
    else if (target > 5000) score += 0.2;
    else score += 0.1;

    // High manpower variance = complex staffing
    if (mpVariance > 0.3) score += 0.2;
    else if (mpVariance > 0.15) score += 0.1;

    // Clamp to 0–1
    score = Math.min(1, Math.max(0, score));

    const level = score >= 0.6 ? 'high' : score >= 0.35 ? 'medium' : 'low';
    return { level, score };
};

// --- Phase 1: Data Validation & Preprocessing ---

/**
 * Validate a line's data quality. Returns { score: 0–100, issues: string[] }
 */
const validateLineData = (line, styles) => {
    const issues = [];
    let score = 100;

    // Check: at least 2 styles with complete dates
    const withDates = styles.filter(s => s.startDate && s.endDate);
    if (withDates.length < 2) {
        issues.push(`Only ${withDates.length} style(s) with complete dates — need ≥2 for changeover detection`);
        score -= 40;
    }

    // Check: date range covers ≥7 days
    if (withDates.length >= 2) {
        const minDate = new Date(Math.min(...withDates.map(s => s.startDate)));
        const maxDate = new Date(Math.max(...withDates.map(s => s.endDate)));
        const rangeDays = (maxDate - minDate) / (1000 * 60 * 60 * 24);
        if (rangeDays < 7) {
            issues.push(`Date range is only ${Math.round(rangeDays)} days — need ≥7 for meaningful analysis`);
            score -= 15;
        }
    }

    // Check: supervisor mapping resolved (S-code, not raw text)
    if (!line.startsWith('S-') && !line.includes(' S-')) {
        issues.push(`Supervisor "${line}" not mapped to an official S-code`);
        score -= 20;
    }

    // Check: daily plan consistency
    styles.forEach(s => {
        if (s.dailyPlans && s.dailyPlans.length > 0 && s.totalTarget > 0) {
            const dailySum = s.dailyPlans.reduce((sum, d) => sum + d.target, 0);
            const ratio = dailySum / s.totalTarget;
            if (ratio < 0.5 || ratio > 2.0) {
                issues.push(`Style "${s.styleName}": daily targets sum (${dailySum}) differs significantly from totalTarget (${s.totalTarget})`);
                score -= 5;
            }
        }
        // Missing dates
        if (!s.startDate) {
            issues.push(`Style "${s.styleName}" missing start date`);
            score -= 10;
        }
        if (!s.endDate) {
            issues.push(`Style "${s.styleName}" missing end date`);
            score -= 10;
        }
    });

    // Check: overlapping styles (only flag if DIFFERENT styles overlap on the same line)
    const sorted = withDates.sort((a, b) => a.startDate - b.startDate);
    for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i].endDate > sorted[i + 1].startDate && sorted[i].styleName !== sorted[i + 1].styleName) {
            issues.push(`"${sorted[i].styleName}" and "${sorted[i + 1].styleName}" overlap`);
            score -= 10;
        }
    }

    return { score: Math.max(0, score), issues };
};

/**
 * Impute missing dates from context (adjacent styles and daily plans).
 */
const imputeMissingDates = (styles) => {
    const sorted = [...styles].sort((a, b) => {
        const aDate = a.startDate || a.endDate || new Date(0);
        const bDate = b.startDate || b.endDate || new Date(0);
        return aDate - bDate;
    });

    for (let i = 0; i < sorted.length; i++) {
        const s = sorted[i];

        // Use dailyPlans to find actual last/first production day
        if (s.dailyPlans && s.dailyPlans.length > 0) {
            const activeDays = s.dailyPlans.filter(d => d.target > 0 || d.manpower > 0);
            if (activeDays.length > 0) {
                if (!s.startDate) {
                    s.startDate = activeDays[0].date;
                }
                if (!s.endDate) {
                    s.endDate = activeDays[activeDays.length - 1].date;
                }
            }
        }

        // Infer from adjacent styles
        if (!s.endDate && i < sorted.length - 1 && sorted[i + 1].startDate) {
            const nextStart = new Date(sorted[i + 1].startDate);
            nextStart.setDate(nextStart.getDate() - 1);
            s.endDate = nextStart;
        }
        if (!s.startDate && i > 0 && sorted[i - 1].endDate) {
            const prevEnd = new Date(sorted[i - 1].endDate);
            prevEnd.setDate(prevEnd.getDate() + 1);
            s.startDate = prevEnd;
        }
    }

    return sorted;
};

// --- Phase 2: Working-Day-Aware Gap Calculation ---

/**
 * Count working days between two dates, excluding holidays (Fridays).
 */
const getWorkingDayGap = (fromDate, toDate) => {
    if (!fromDate || !toDate) return 0;
    const start = new Date(fromDate);
    const end = new Date(toDate);
    let workingDays = 0;
    const current = new Date(start);
    current.setDate(current.getDate() + 1); // Start from the day AFTER fromDate

    while (current < end) {
        const dayOfWeek = current.getDay();
        // Friday = 5 (typical holiday in this context)
        if (dayOfWeek !== 5) {
            workingDays++;
        }
        current.setDate(current.getDate() + 1);
    }
    return workingDays;
};

const SHIFT_HOURS = 8; // Hours per working day

/**
 * Analyze manpower trend at the boundary of a style.
 * Returns { declining: boolean, ramping: boolean, trend: number (-1 to 1) }
 */
const analyzeBoundaryTrend = (style, position) => {
    const plans = style.dailyPlans?.filter(d => d.manpower > 0) || [];
    if (plans.length < 2) return { declining: false, ramping: false, trend: 0 };

    if (position === 'end') {
        // Check last 3 days for declining manpower
        const tail = plans.slice(-3);
        if (tail.length >= 2) {
            const firstMP = tail[0].manpower;
            const lastMP = tail[tail.length - 1].manpower;
            const change = (lastMP - firstMP) / firstMP;
            return { declining: change < -0.15, ramping: false, trend: change };
        }
    } else if (position === 'start') {
        // Check first 3 days for ramping manpower
        const head = plans.slice(0, 3);
        if (head.length >= 2) {
            const firstMP = head[0].manpower;
            const lastMP = head[head.length - 1].manpower;
            const change = (lastMP - firstMP) / firstMP;
            return { declining: false, ramping: change > 0.15, trend: change };
        }
    }
    return { declining: false, ramping: false, trend: 0 };
};

// --- Phase 3: Multi-Factor Confidence Scoring ---

/**
 * Calculate a multi-factor weighted confidence score.
 */
const calculateConfidence = (from, to, gapWorkingDays, lineQuality) => {
    const factors = {};

    // Factor 1: Data Quality (weight 0.25)
    factors.dataQuality = Math.min(1, (lineQuality.score || 0) / 100);

    // Factor 2: Gap Reasonability (weight 0.30)
    // Ideal changeover gap is 1–3 working days
    if (gapWorkingDays >= 1 && gapWorkingDays <= 3) {
        factors.gapReasonability = 1.0;
    } else if (gapWorkingDays === 0) {
        factors.gapReasonability = 0.3; // No gap — very tight
    } else if (gapWorkingDays <= 5) {
        factors.gapReasonability = 0.7;
    } else if (gapWorkingDays <= 10) {
        factors.gapReasonability = 0.5; // Long gap — line may be idle
    } else {
        factors.gapReasonability = 0.2; // Very long gap
    }

    // Factor 3: Boundary Consistency (weight 0.25)
    const fromTrend = analyzeBoundaryTrend(from, 'end');
    const toTrend = analyzeBoundaryTrend(to, 'start');
    let boundaryScore = 0.5; // Neutral default
    if (fromTrend.declining) boundaryScore += 0.25; // Clean wind-down
    if (toTrend.ramping) boundaryScore += 0.25; // Clean ramp-up
    factors.boundaryConsistency = Math.min(1, boundaryScore);

    // Factor 4: Volume (weight 0.10)
    const fromTarget = from.totalTarget || 0;
    if (fromTarget > 10000) factors.volumeFactor = 1.0;
    else if (fromTarget > 5000) factors.volumeFactor = 0.7;
    else if (fromTarget > 1000) factors.volumeFactor = 0.5;
    else factors.volumeFactor = 0.3;

    // Factor 5: Style Similarity (weight 0.10)
    factors.styleSimilarity = getStyleSimilarity(from.styleName, to.styleName);

    // Weighted sum
    const weights = {
        dataQuality: 0.25,
        gapReasonability: 0.30,
        boundaryConsistency: 0.25,
        volumeFactor: 0.10,
        styleSimilarity: 0.10
    };

    let confidence = 0;
    for (const [key, weight] of Object.entries(weights)) {
        confidence += weight * (factors[key] || 0);
    }

    return {
        score: Math.min(1, Math.max(0, confidence)),
        factors
    };
};

// --- Phase 4: Dynamic Suggested Dates ---

/**
 * Calculate a smart suggested changeover date based on style complexity and similarity.
 */
const calculateSuggestedDate = (from, to) => {
    // Find the actual last production day (from dailyPlans)
    const activeDays = (from.dailyPlans || []).filter(d => d.target > 0 || d.manpower > 0);
    const lastProductionDay = activeDays.length > 0 ?
        activeDays[activeDays.length - 1].date : from.endDate;

    if (!lastProductionDay) return null;

    const similarity = getStyleSimilarity(from.styleName, to.styleName);
    const complexity = getStyleComplexity(from);

    // Base buffer in working days
    let bufferDays;
    if (similarity >= 0.8) {
        bufferDays = 1; // Same family → quick changeover
    } else if (complexity.level === 'high') {
        bufferDays = 3; // Complex style → needs more time
    } else if (complexity.level === 'medium') {
        bufferDays = 2;
    } else {
        bufferDays = 1;
    }

    // Advance from last production day, skipping holidays (Fridays)
    const suggested = new Date(lastProductionDay);
    let daysAdded = 0;
    while (daysAdded < bufferDays) {
        suggested.setDate(suggested.getDate() + 1);
        if (suggested.getDay() !== 5) { // Skip Fridays
            daysAdded++;
        }
    }

    return { date: suggested, bufferDays, similarityUsed: similarity, complexityUsed: complexity.level };
};

// --- Main Suggestion Engine (Refactored) ---

const suggestChangeover = () => {
    if (!fullData || fullData.length === 0) return [];

    const statusEl = document.getElementById('suggestStatus');
    if (statusEl) statusEl.textContent = 'Analyzing...';

    const suggestions = [];
    const lineStyles = new Map();
    const lineQuality = new Map();

    // Group by production line
    fullData.forEach(s => {
        const key = s.physicalLine || 'Unassigned';
        if (!lineStyles.has(key)) lineStyles.set(key, []);
        lineStyles.get(key).push(s);
    });

    lineStyles.forEach((styles, line) => {
        // Phase 1: Validate & impute
        const quality = validateLineData(line, styles);
        lineQuality.set(line, quality);

        // Impute missing dates
        const imputed = imputeMissingDates(styles);

        // Filter to styles with valid dates
        const sorted = imputed.filter(s => s.startDate && s.endDate)
            .sort((a, b) => a.startDate - b.startDate);

        // Need at least 2 styles for changeover detection
        if (sorted.length < 2) return;

        for (let i = 0; i < sorted.length - 1; i++) {
            const from = sorted[i], to = sorted[i + 1];

            // Skip if same style repeating — no actual changeover needed
            if (from.styleName === to.styleName) continue;

            // Phase 2: Working-day gap
            const gapWorkingDays = getWorkingDayGap(from.endDate, to.startDate);
            const gapHours = (to.startDate - from.endDate) / (1000 * 60 * 60);
            const gapWorkingHours = gapWorkingDays * SHIFT_HOURS;

            // Phase 3: Multi-factor confidence
            const conf = calculateConfidence(from, to, gapWorkingDays, quality);

            // Phase 6: Style analysis
            const similarity = getStyleSimilarity(from.styleName, to.styleName);
            const fromComplexity = getStyleComplexity(from);
            const toComplexity = getStyleComplexity(to);

            // Build rich reason string
            let reasons = [];
            if (gapWorkingDays === 0) {
                reasons.push(`⚠️ No working-day buffer between styles`);
            } else if (gapWorkingDays <= 2) {
                reasons.push(`Tight gap: ${gapWorkingDays} working day(s) (${Math.round(gapHours)}h total)`);
            } else if (gapWorkingDays > 7) {
                reasons.push(`Large gap: ${gapWorkingDays} working days — line may be idle`);
            } else {
                reasons.push(`${gapWorkingDays} working day(s) gap (${Math.round(gapHours)}h total)`);
            }

            if (from.totalTarget > 5000) reasons.push(`High-volume completing (${(from.totalTarget / 1000).toFixed(1)}k pcs)`);
            if (similarity >= 0.8) reasons.push(`Same style family — quick changeover expected`);
            if (fromComplexity.level === 'high') reasons.push(`Complex outgoing style`);

            const fromBoundary = analyzeBoundaryTrend(from, 'end');
            const toBoundary = analyzeBoundaryTrend(to, 'start');
            if (fromBoundary.declining) reasons.push(`MP winding down at end`);
            if (toBoundary.ramping) reasons.push(`MP ramping up at start`);

            // Phase 4: Smart suggested date
            const suggestedCalc = calculateSuggestedDate(from, to);
            const suggestedDate = suggestedCalc?.date || new Date(from.endDate.getTime() + 4 * 60 * 60 * 1000);

            // Determine if quality is sufficient
            const qualityOK = quality.score >= 50;

            suggestions.push({
                id: `sug-${line}-${i}`,
                fromStyle: from.styleName,
                toStyle: to.styleName,
                line,
                fromEnd: from.endDate,
                toStart: to.startDate,
                suggestedDate,
                reason: reasons.join(' | '),
                confidence: conf.score,
                confidenceFactors: conf.factors,
                gapWorkingDays,
                gapHours: Math.round(gapHours),
                styleSimilarity: similarity,
                fromComplexity: fromComplexity.level,
                toComplexity: toComplexity.level,
                bufferDays: suggestedCalc?.bufferDays || 1,
                lineQualityScore: quality.score,
                lineQualityIssues: quality.issues,
                qualityOK,
                accepted: false
            });
        }
    });

    currentSuggestions = suggestions;
    if (statusEl) statusEl.textContent = `${suggestions.length} suggestions`;

    return suggestions;
};

const renderSuggestionsModal = (suggestions) => {
    const modal = document.getElementById('suggestionsModal');
    const overlay = document.getElementById('suggestionsOverlay');
    if (!modal || !overlay) return;

    const tbody = document.getElementById('suggestionsTableBody');
    if (tbody) {
        // Build a quality badge helper
        const qualityBadge = (score) => {
            if (score >= 80) return `<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-700" title="Data quality: ${score}/100">●${score}</span>`;
            if (score >= 50) return `<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-700" title="Data quality: ${score}/100">●${score}</span>`;
            return `<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700" title="Data quality: ${score}/100">●${score}</span>`;
        };

        const complexityTag = (level) => {
            const cfg = { low: 'bg-slate-100 text-slate-500', medium: 'bg-blue-100 text-blue-600', high: 'bg-purple-100 text-purple-700' };
            return `<span class="px-1 py-0.5 rounded text-[9px] font-bold ${cfg[level] || cfg.low}">${level}</span>`;
        };

        // Warning rows for low quality
        const lowQualityLines = [...new Set(suggestions.filter(s => !s.qualityOK).map(s => s.line))];
        const warningHTML = lowQualityLines.length > 0 ? `
            <tr class="bg-amber-50/80">
                <td colspan="6" class="p-2 text-xs text-amber-700">
                    ⚠️ <strong>${lowQualityLines.length} line(s)</strong> have low data quality (score < 50): ${lowQualityLines.join(', ')}. Suggestions for these lines may be unreliable.
                </td>
            </tr>
        ` : '';

        tbody.innerHTML = warningHTML + suggestions.map((s, i) => {
            // Confidence hover tooltip with factor breakdown
            const factors = s.confidenceFactors || {};
            const tooltipLines = [
                `Data Quality: ${Math.round((factors.dataQuality || 0) * 100)}%`,
                `Gap Reasonability: ${Math.round((factors.gapReasonability || 0) * 100)}%`,
                `Boundary Consistency: ${Math.round((factors.boundaryConsistency || 0) * 100)}%`,
                `Volume Factor: ${Math.round((factors.volumeFactor || 0) * 100)}%`,
                `Style Similarity: ${Math.round((factors.styleSimilarity || 0) * 100)}%`
            ].join('&#10;');

            const rowClass = s.qualityOK ? '' : 'opacity-60';

            return `
            <tr class="border-b border-slate-100 hover:bg-blue-50/30 transition-colors ${rowClass}">
                <td class="p-3">
                    <div class="flex items-center gap-1.5">
                        <span class="font-mono text-xs text-slate-500">${s.line}</span>
                        ${qualityBadge(s.lineQualityScore)}
                    </div>
                </td>
                <td class="p-3">
                    <div class="flex flex-col gap-0.5">
                        <div>
                            <span class="font-bold text-slate-800 text-sm">${s.fromStyle}</span>
                            ${complexityTag(s.fromComplexity)}
                            <span class="text-slate-400 mx-1">→</span>
                            <span class="font-bold text-blue-700 text-sm">${s.toStyle}</span>
                            ${complexityTag(s.toComplexity)}
                        </div>
                        <span class="text-[10px] text-slate-400">${s.gapWorkingDays} working day(s) gap · ${s.bufferDays}d buffer</span>
                    </div>
                </td>
                <td class="p-3 font-mono text-sm text-slate-700">${s.suggestedDate.toLocaleDateString()}</td>
                <td class="p-3 text-xs text-slate-500 max-w-[250px]">${s.reason}</td>
                <td class="p-3">
                    <div class="flex items-center gap-1 cursor-help" title="${tooltipLines}">
                        <div class="w-16 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                            <div class="h-full rounded-full ${s.confidence > 0.7 ? 'bg-emerald-500' : s.confidence > 0.5 ? 'bg-amber-500' : 'bg-red-500'}" style="width:${s.confidence * 100}%"></div>
                        </div>
                        <span class="text-[10px] text-slate-400">${Math.round(s.confidence * 100)}%</span>
                    </div>
                </td>
                <td class="p-3">
                    <div class="flex gap-1">
                        <button onclick="window.PlanningLogic.acceptSuggestion('${s.id}')" class="px-2 py-1 rounded-lg text-xs font-bold ${s.accepted ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'} transition-colors">
                            ${s.accepted ? '✓ Accepted' : 'Accept'}
                        </button>
                        <button onclick="window.PlanningLogic.rejectSuggestion('${s.id}')" class="px-2 py-1 rounded-lg text-xs font-bold bg-red-50 text-red-600 hover:bg-red-100 transition-colors">✕</button>
                    </div>
                </td>
            </tr>
        `}).join('');
    }

    overlay.classList.add('active');
    modal.classList.add('active');
    if (window.gsap) gsap.fromTo(modal, { scale: 0.9, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(1.7)' });
};

const closeSuggestionsModal = () => {
    const modal = document.getElementById('suggestionsModal');
    const overlay = document.getElementById('suggestionsOverlay');
    if (modal) modal.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
};

const acceptSuggestion = (id) => {
    const sug = currentSuggestions.find(s => s.id === id);
    if (sug) {
        sug.accepted = true;
        if (!acceptedSuggestions.find(a => a.id === id)) acceptedSuggestions.push(sug);

        // Format line, e.g. "Line 1" -> "1"
        let lineRaw = sug.line.replace(/Line\s*/gi, '').trim();
        let lineFormatted = "S-XX";

        // If the line already looks like an S-code (S-01, S-09, etc)
        const sMatch = lineRaw.match(/S-\w+/i);
        if (sMatch) {
            lineFormatted = sMatch[0].toUpperCase();
        } else {
            // If it's just a number, prepend S-
            const numMatch = lineRaw.match(/^\d+$/);
            if (numMatch) {
                lineFormatted = `S-${numMatch[0].padStart(2, '0')}`;
            } else {
                // If we couldn't resolve it to an S-code, just use the raw text but clean it up
                // (This happens if lookupLineBySupervisor returned the raw name)
                lineFormatted = lineRaw.replace(/[^\w-]/g, '');
            }
        }

        // Last 3 characters of current style
        const currentSub = sug.fromStyle && sug.fromStyle !== 'New' ? sug.fromStyle.toString().slice(-3).toUpperCase() : "XXX";

        // Last 3 characters of upcoming style
        const upcomingSub = sug.toStyle ? sug.toStyle.toString().slice(-3).toUpperCase() : "XXX";

        // Construct search term: e.g. "S-09-123-456"
        const searchTerm = `${lineFormatted}-${currentSub}-${upcomingSub}`;

        // Redirect to schedule.html with query parameter
        window.location.href = `schedule.html?q=${encodeURIComponent(searchTerm)}`;
    }
};

const rejectSuggestion = (id) => {
    currentSuggestions = currentSuggestions.filter(s => s.id !== id);
    acceptedSuggestions = acceptedSuggestions.filter(a => a.id !== id);
    renderSuggestionsModal(currentSuggestions);
};



// ============================================================
// FEATURE 7: Session Persistence (IndexedDB)
// ============================================================
const DB_NAME = 'PlanningPortalDB';
const DB_STORE = 'sessions';

const openDB = () => new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => e.target.result.createObjectStore(DB_STORE, { keyPath: 'id' });
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
});

const saveSession = async () => {
    try {
        const db = await openDB();
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).put({
            id: 'latest',
            parsedData: fullData,
            suggestions: currentSuggestions,
            acceptedSuggestions,
            timestamp: new Date().toISOString()
        });
        await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
        showToast('Session saved successfully', 'success');
    } catch (e) { console.error('Save session error:', e); showToast('Failed to save session', 'error'); }
};

const restoreSession = async () => {
    try {
        const db = await openDB();
        const tx = db.transaction(DB_STORE, 'readonly');
        const req = tx.objectStore(DB_STORE).get('latest');
        return new Promise((resolve) => {
            req.onsuccess = () => {
                const session = req.result;
                if (session && session.parsedData) {
                    // Re-hydrate dates
                    session.parsedData.forEach(s => {
                        if (s.startDate) s.startDate = new Date(s.startDate);
                        if (s.endDate) s.endDate = new Date(s.endDate);
                        s.dailyPlans?.forEach(d => { if (d.date) d.date = new Date(d.date); });
                    });
                    resolve(session);
                } else resolve(null);
            };
            req.onerror = () => resolve(null);
        });
    } catch { return null; }
};

const clearSession = async () => {
    try {
        const db = await openDB();
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).delete('latest');
    } catch (e) { console.error(e); }
};

const applyRestoredSession = (session) => {
    fullData = session.parsedData;
    currentData = fullData;
    currentSuggestions = session.suggestions || [];
    acceptedSuggestions = session.acceptedSuggestions || [];

    document.getElementById('uploadState')?.classList.add('hidden');
    document.getElementById('contentArea')?.classList.remove('hidden');
    const vc = document.getElementById('viewControls');
    if (vc) { vc.style.display = 'flex'; vc.style.opacity = '1'; }
    document.getElementById('searchContainer')?.classList.remove('hidden');
    enableSuggestBar();
    switchView('dashboard');
    showToast(`Session restored (${new Date(session.timestamp).toLocaleString()})`, 'success');
};

// ============================================================
// FEATURE 8: Export Enhanced Report
// ============================================================
const exportReport = (format) => {
    if (!fullData) return showToast('No data to export', 'error');

    if (format === 'csv') {
        let csv = 'Line,Supervisor,Style,Quantity,Start Date,End Date,Total Target,Avg Manpower,Anomalies\n';
        fullData.forEach(s => {
            const anomCount = (s.anomalies || []).length;
            csv += `"${s.physicalLine}","${s.supervisor}","${s.styleName}","${s.quantity}","${s.startDate?.toLocaleDateString() || ''}","${s.endDate?.toLocaleDateString() || ''}",${s.totalTarget},${s.dailyPlans.length ? Math.round(s.totalManpower / s.dailyPlans.length) : 0},${anomCount}\n`;
        });

        if (currentSuggestions.length > 0) {
            csv += '\n\nChangeover Suggestions\nLine,From Style,To Style,Suggested Date,Reason,Confidence,Status\n';
            currentSuggestions.forEach(s => {
                csv += `"${s.line}","${s.fromStyle}","${s.toStyle}","${s.suggestedDate?.toLocaleDateString() || ''}","${s.reason}",${Math.round(s.confidence * 100)}%,${s.accepted ? 'Accepted' : 'Pending'}\n`;
            });
        }
        downloadFile(csv, 'planning-report.csv', 'text/csv');
    } else if (format === 'excel') {
        if (!window.XLSX) return showToast('XLSX library not loaded', 'error');
        const wb = window.XLSX.utils.book_new();
        const scheduleData = fullData.map(s => ({
            Line: s.physicalLine, Supervisor: s.supervisor, Style: s.styleName,
            Quantity: s.quantity, 'Start Date': s.startDate?.toLocaleDateString() || '',
            'End Date': s.endDate?.toLocaleDateString() || '', 'Total Target': s.totalTarget,
            'Avg MP': s.dailyPlans.length ? Math.round(s.totalManpower / s.dailyPlans.length) : 0
        }));
        window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(scheduleData), 'Schedule');

        if (currentSuggestions.length > 0) {
            const sugData = currentSuggestions.map(s => ({
                Line: s.line, 'From Style': s.fromStyle, 'To Style': s.toStyle,
                'Suggested Date': s.suggestedDate?.toLocaleDateString() || '',
                Reason: s.reason, Confidence: Math.round(s.confidence * 100) + '%',
                Status: s.accepted ? 'Accepted' : 'Pending'
            }));
            window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(sugData), 'Suggestions');
        }
        window.XLSX.writeFile(wb, 'planning-report.xlsx');
    } else if (format === 'pdf') {
        window.print();
    }
};

const downloadFile = (content, filename, type) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
};

// ============================================================
// FEATURE 4: Guided Tour
// ============================================================
const startTour = () => {
    if (!window.driver) return showToast('Tour library not loaded', 'error');
    const driverObj = window.driver.js.driver({
        showProgress: true, animate: true,
        popoverClass: 'planning-tour-popover',
        steps: [
            { element: '#uploadState', popover: { title: '📁 Upload Schedule', description: 'Start by uploading your Excel planning sheet. The system will parse supervisor, target, and manpower data automatically.', side: 'bottom' } },
            { element: '#suggestBar', popover: { title: '🔮 Changeover Suggestions', description: 'After upload, click "Analyze & Suggest" to get AI-powered changeover date recommendations.', side: 'bottom' } },
            { element: '#anomaly-list', popover: { title: '⚠️ Anomaly Detection', description: 'System automatically detects issues like holiday production, manpower drops, and overlapping styles. Filter by severity.', side: 'left' } },
            { element: '#viewControls', popover: { title: '👀 View Modes', description: 'Switch between Dashboard, Timeline, and Grid views for different perspectives on your data.', side: 'bottom' } },

        ]
    });
    driverObj.drive();
};

// ============================================================
// FEATURE 5: Column Mapping UI
// ============================================================
let pendingFile = null;

const showColumnMapping = (file) => {
    pendingFile = file;
    const overlay = document.getElementById('columnMappingOverlay');
    if (overlay) {
        overlay.classList.remove('hidden');
        if (window.gsap) gsap.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.3 });
    }
};

const applyColumnMapping = async () => {
    const mapping = {
        supervisor: parseInt(document.getElementById('mapSupervisor')?.value || 0),
        style: parseInt(document.getElementById('mapStyle')?.value || 1),
        planStart: parseInt(document.getElementById('mapPlanStart')?.value || 10)
    };
    localStorage.setItem('planningColumnMapping', JSON.stringify(mapping));
    document.getElementById('columnMappingOverlay')?.classList.add('hidden');
    if (pendingFile) {
        const input = document.getElementById('fileInput');
        if (input) handleFileUpload(input);
    }
};

const closeColumnMapping = () => {
    document.getElementById('columnMappingOverlay')?.classList.add('hidden');
    pendingFile = null;
};

// ============================================================
// FEATURE 9: Timeline Changeover Markers
// ============================================================
let showChangeoverMarkers = false;

// ============================================================
// UI Helpers
// ============================================================
const showToast = (msg, type) => {
    const c = document.getElementById('toastContainer');
    if (!c) return;
    const colors = { success: 'bg-emerald-500', error: 'bg-red-500', info: 'bg-blue-500', warning: 'bg-amber-500' };
    const d = document.createElement('div');
    d.className = `toast p-4 rounded-xl shadow-lg text-white font-medium ${colors[type] || colors.info} transform translate-x-full pointer-events-auto`;
    d.textContent = msg;
    c.appendChild(d);
    if (window.gsap) {
        gsap.to(d, { x: 0, opacity: 1, duration: 0.5, ease: 'back.out' });
        gsap.to(d, { x: 200, opacity: 0, duration: 0.5, delay: 3, onComplete: () => d.remove() });
    } else {
        d.classList.add('show');
        setTimeout(() => d.remove(), 3500);
    }
};

const enableSuggestBar = () => {
    const bar = document.getElementById('suggestBar');
    const btn = document.getElementById('suggestBtn');
    if (bar) bar.classList.remove('hidden');
    if (btn) { btn.disabled = false; btn.classList.add('animate-pulse'); setTimeout(() => btn.classList.remove('animate-pulse'), 3000); }
    const status = document.getElementById('suggestStatus');
    if (status) status.textContent = 'Ready';

    // Show additional controls
    const saveBtn = document.getElementById('saveSessionBtn');
    if (saveBtn) saveBtn.classList.remove('hidden');
    const exportBtn = document.getElementById('exportDropdownBtn');
    if (exportBtn) exportBtn.classList.remove('hidden');
};

// ============================================================
// FEATURE 10: Unified PlanningLogic API
// ============================================================
window.PlanningLogic = {
    // Core
    parseExcel: processWorkbook,
    processWorkbook,
    handleFileUpload,
    handleSearch,
    switchView,
    openStyleModal,
    // Feature 1-2: Suggestions
    suggestChangeoverDates: suggestChangeover,
    suggestChangeover,
    renderSuggestionsModal,
    closeSuggestionsModal,
    acceptSuggestion,
    rejectSuggestion,
    // Feature 3: Anomalies
    detectAnomalies,
    filterAnomalies,
    // Feature 4: Tour
    startTour,
    // Feature 5: Column Mapping
    showColumnMapping,
    applyColumnMapping,
    closeColumnMapping,
    // Feature 6: What-If

    // Feature 7: Session
    saveSession,
    restoreSession,
    clearSession,
    // Feature 8: Export
    exportReport
};

// ============================================================
// Enhanced handleFileUpload (override)
// ============================================================
const _origHandleFileUpload = handleFileUpload;

// Patch: after file upload, enable suggest bar + run enhanced anomalies
const patchedInit = () => {
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            document.getElementById('loadingText')?.classList.remove('hidden');
            try {
                const data = await processWorkbook(file);
                fullData = data;
                currentData = data;

                // Enhanced anomalies (Feature 3)
                const anomalies = detectAnomalies(data);
                const remarks = [];
                data.forEach(s => {
                    if (s.remarks) remarks.push(...s.remarks.map(r => ({ text: r, styleName: s.styleName, line: s.physicalLine })));
                });
                allCriticalItems = [
                    ...anomalies,
                    ...remarks.map(r => ({ type: 'remark', severity: 'info', message: r.text, styleName: r.styleName, line: r.line, suggestedAction: '', rule: 'User remark from Excel sheet' }))
                ];

                document.getElementById('uploadState')?.classList.add('hidden');
                document.getElementById('contentArea')?.classList.remove('hidden');
                const vc = document.getElementById('viewControls');
                if (vc) { vc.style.display = 'flex'; vc.style.opacity = '1'; }
                document.getElementById('searchContainer')?.classList.remove('hidden');

                enableSuggestBar();
                switchView('dashboard');
            } catch (err) {
                showToast('Error parsing file: ' + err.message, 'error');
                console.error(err);
                document.getElementById('loadingText')?.classList.add('hidden');
            }
        });
    }



    // Suggest button
    const suggestBtn = document.getElementById('suggestBtn');
    if (suggestBtn) {
        suggestBtn.addEventListener('click', () => {
            const sug = suggestChangeover();
            renderSuggestionsModal(sug);
        });
    }

    // Export buttons
    document.querySelectorAll('[data-export]').forEach(btn => {
        btn.addEventListener('click', () => exportReport(btn.dataset.export));
    });

    // Anomaly filter buttons
    document.querySelectorAll('#anomalyFilters button').forEach(btn => {
        btn.addEventListener('click', () => filterAnomalies(btn.dataset.filter));
    });

    // Tour button
    const tourBtn = document.getElementById('tourBtn');
    if (tourBtn) tourBtn.addEventListener('click', startTour);

    // Save session button
    const saveBtn = document.getElementById('saveSessionBtn');
    if (saveBtn) saveBtn.addEventListener('click', saveSession);

    // Changeover markers toggle handled inside renderTimeline

    // Column mapping buttons
    const applyMapBtn = document.getElementById('applyMappingBtn');
    if (applyMapBtn) applyMapBtn.addEventListener('click', applyColumnMapping);
    const cancelMapBtn = document.getElementById('cancelMappingBtn');
    if (cancelMapBtn) cancelMapBtn.addEventListener('click', closeColumnMapping);

    // Check for saved session (Feature 7)
    restoreSession().then(session => {
        if (session) {
            const restoreBar = document.getElementById('restoreSessionBar');
            if (restoreBar) {
                restoreBar.classList.remove('hidden');
                document.getElementById('restoreSessionBtn')?.addEventListener('click', () => {
                    applyRestoredSession(session);
                    restoreBar.classList.add('hidden');
                });
                document.getElementById('dismissSessionBtn')?.addEventListener('click', () => {
                    restoreBar.classList.add('hidden');
                    clearSession();
                });
            }
        }
    });
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', patchedInit);
