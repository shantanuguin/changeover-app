
// --- Constants ---
const COL_LINE_CTX = 0; // Column A
const COL_CURR_STYLE = 1; // Column B
const COL_PLAN_START = 10; // Column K
const ROW_DATE = 2; // Row 3 (0-indexed)
const ROW_DAY = 3; // Row 4 (0-indexed)
const ROW_STYLE_START = 8; // Row 9
const ROW_STYLE_END = 114;
const ROW_STRIDE = 3;

// --- State ---
let currentData = null;
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
                            dateMap.set(c, {
                                date: jsDate,
                                day: dayName,
                                isHoliday: isFriday(dayName)
                            });
                        }
                    }

                    // 2. Scan Styles
                    let currentUnit = "Main Unit";

                    for (let r = ROW_STYLE_START; r <= Math.min(rawData.length - 1, ROW_STYLE_END); r += ROW_STRIDE) {
                        const cellA = cleanString(rawData[r][COL_LINE_CTX]);
                        let currentSupervisor = "Unassigned";

                        if (cellA.toLowerCase().includes('main unit')) {
                            currentUnit = "Main Unit";
                        } else if (cellA.toLowerCase().includes('sub unit')) {
                            currentUnit = "Sub Unit";
                        }

                        if (!cellA.toLowerCase().includes('unit') &&
                            !cellA.toLowerCase().includes('ttl') &&
                            !cellA.toLowerCase().includes('budget') &&
                            cellA.length > 0) {
                            currentSupervisor = cellA;
                        }

                        if (cellA.toLowerCase().includes('ttl qty')) continue;

                        const currentRunningStyle = cleanString(rawData[r][COL_CURR_STYLE]);
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
                                    physicalLine: currentSupervisor,
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
                                if (isQuantity(rightCellVal)) {
                                    activeStyle.quantity = rightCellVal;
                                }
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
        currentData = data;

        // Hide upload, show controls & content
        document.getElementById('uploadState').classList.add('hidden');
        document.getElementById('contentArea').classList.remove('hidden');
        document.getElementById('viewControls').style.display = 'flex';

        switchView('dashboard');
    } catch (err) {
        if (window.showToast) window.showToast(err.message, 'error');
        else alert("Error parsing file: " + err.message);
        console.error(err);
        document.getElementById('loadingText').classList.add('hidden');
    }
};

export const switchView = (viewName) => {
    currentView = viewName;

    // Toggle Sections
    ['dashboard', 'timeline', 'grid'].forEach(v => {
        const section = document.getElementById(`view-${v}`);
        if (section) {
            if (v === viewName) {
                section.classList.remove('hidden');
                // Trigger animation if available (simple opacity transition handled by CSS usually)
                gsap.fromTo(section, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4 });
            } else {
                section.classList.add('hidden');
            }
        }
    });

    if (viewName === 'dashboard') renderDashboard();
    if (viewName === 'timeline') renderTimeline();
    if (viewName === 'grid') renderGrid();
};

const renderDashboard = () => {
    if (!currentData) return;

    let totalTarget = 0;
    let totalManpower = 0;
    let anomalies = [];

    currentData.forEach(s => {
        totalTarget += s.totalTarget;
        totalManpower += s.totalManpower;
        if (s.anomalies) anomalies.push(...s.anomalies.map(a => ({ ...a, styleName: s.styleName, line: s.physicalLine })));
    });

    document.getElementById('stat-styles').textContent = currentData.length;
    document.getElementById('stat-target').textContent = totalTarget.toLocaleString();
    document.getElementById('stat-manpower').textContent = totalManpower.toLocaleString();

    document.getElementById('anomaly-count').textContent = `${anomalies.length} issues`;
    const anomalyList = document.getElementById('anomaly-list');
    anomalyList.innerHTML = '';

    anomalies.forEach(a => {
        const div = document.createElement('div');
        div.className = 'flex items-start p-3 mb-2 bg-red-50 rounded-lg text-sm text-red-800';
        div.innerHTML = `<i data-lucide="alert-circle" class="w-4 h-4 mr-2 mt-0.5 text-red-600"></i>
                         <div>
                            <span class="font-bold block">${a.styleName} (${a.line})</span>
                            <span>${a.message}</span>
                         </div>`;
        anomalyList.appendChild(div);
    });

    lucide.createIcons();
};

const renderTimeline = () => {
    if (!currentData) return;
    const container = document.getElementById('timeline-container');
    container.innerHTML = '';

    // Find min/max dates
    let minDate = new Date();
    let maxDate = new Date();

    currentData.forEach(s => {
        if (s.startDate && s.startDate < minDate) minDate = s.startDate;
        if (s.endDate && s.endDate > maxDate) maxDate = s.endDate;
    });

    // Create day headers
    const dayWidth = 40;
    const days = [];
    for (let d = new Date(minDate); d <= maxDate; d.setDate(d.getDate() + 1)) {
        days.push(new Date(d));
    }

    const header = document.createElement('div');
    header.className = 'flex border-b border-gray-200 mb-4 sticky top-0 bg-white z-10';
    header.style.width = `max-content`;

    const labelPlaceholder = document.createElement('div');
    labelPlaceholder.style.width = '200px';
    labelPlaceholder.className = 'flex-shrink-0 p-2 font-bold text-gray-500 bg-gray-50';
    labelPlaceholder.textContent = 'Line / Style';
    header.appendChild(labelPlaceholder);

    days.forEach(day => {
        const cell = document.createElement('div');
        cell.style.width = `${dayWidth}px`;
        cell.className = `flex-shrink-0 text-center text-xs p-1 border-r border-gray-100 ${isFriday(day.toLocaleDateString('en-US', { weekday: 'short' })) ? 'bg-red-50 text-red-600' : ''}`;
        cell.innerHTML = `<div>${day.getDate()}</div><div class="text-[10px] text-gray-400">${day.toLocaleDateString('en-US', { weekday: 'short' })}</div>`;
        header.appendChild(cell);
    });
    container.appendChild(header);

    // Rows
    const sortedData = [...currentData].sort((a, b) => a.physicalLine.localeCompare(b.physicalLine));

    sortedData.forEach(style => {
        const row = document.createElement('div');
        row.className = 'flex items-center hover:bg-gray-50 transition border-b border-gray-50';
        row.style.width = 'max-content';

        const label = document.createElement('div');
        label.style.width = '200px';
        label.className = 'flex-shrink-0 p-2 text-sm truncate border-r border-gray-100';
        label.innerHTML = `<div class="font-medium text-gray-900">${style.physicalLine}</div><div class="text-xs text-gray-500">${style.styleName}</div>`;
        row.appendChild(label);

        // Calculate offset and width
        const diffTime = Math.abs(style.startDate - minDate);
        const dayOffset = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        const durationTime = Math.abs(style.endDate - style.startDate);
        const durationDays = Math.ceil(durationTime / (1000 * 60 * 60 * 24)) + 1; // +1 inclusive

        // Spacer
        const spacer = document.createElement('div');
        spacer.style.width = `${dayOffset * dayWidth}px`;
        row.appendChild(spacer);

        // Bar
        const bar = document.createElement('div');
        bar.style.width = `${durationDays * dayWidth}px`;
        bar.className = 'h-8 rounded bg-blue-500 shadow-sm mx-0.5 cursor-pointer hover:bg-blue-600 transition relative group';
        bar.onclick = () => openStyleModal(style);

        // Tooltip
        bar.innerHTML = `<div class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-20 pointer-events-none">
            ${style.styleName} (${durationDays} days)
        </div>`;

        row.appendChild(bar);
        container.appendChild(row);
    });
};

const renderGrid = () => {
    if (!currentData) return;
    const tbody = document.getElementById('grid-body');
    tbody.innerHTML = '';

    currentData.forEach(style => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50 cursor-pointer transition';
        tr.onclick = () => openStyleModal(style);

        tr.innerHTML = `
            <td class="px-6 py-4 font-medium text-gray-900">${style.physicalLine}</td>
            <td class="px-6 py-4 text-blue-600 font-medium">${style.styleName}</td>
            <td class="px-6 py-4 text-gray-500">${style.currentRunningStyle || '-'}</td>
            <td class="px-6 py-4 text-right font-mono">${style.totalTarget}</td>
            <td class="px-6 py-4 text-right font-mono">${style.totalManpower}</td>
            <td class="px-6 py-4 text-xs text-gray-500">
                ${style.startDate ? style.startDate.toLocaleDateString() : ''} - 
                ${style.endDate ? style.endDate.toLocaleDateString() : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });
};

const openStyleModal = (style) => {
    document.getElementById('modal-title').textContent = style.styleName;
    document.getElementById('modal-subtitle').textContent = style.physicalLine;
    document.getElementById('modal-supervisor').textContent = style.supervisor;
    document.getElementById('modal-unit').textContent = style.unit;
    document.getElementById('modal-target').textContent = style.totalTarget;
    document.getElementById('modal-manpower').textContent = style.totalManpower;

    const tableBody = document.getElementById('modal-daily-table');
    tableBody.innerHTML = '';

    style.dailyPlans.forEach(day => {
        const tr = document.createElement('tr');
        tr.className = day.isHoliday ? 'bg-red-50' : '';
        tr.innerHTML = `
            <td class="px-4 py-2 font-mono text-gray-600">
                ${day.date.toLocaleDateString()} <span class="text-xs text-gray-400 ml-1">${day.dayName}</span>
            </td>
            <td class="px-4 py-2 text-right text-green-600 font-medium">${day.target}</td>
            <td class="px-4 py-2 text-right text-orange-600 font-medium">${day.manpower}</td>
        `;
        tableBody.appendChild(tr);
    });

    const modal = document.getElementById('styleModal');
    const overlay = document.getElementById('modalOverlay');
    if (modal) {
        modal.classList.add('active');
        modal.classList.remove('hidden');
    }
    if (overlay) overlay.classList.add('active');
};


// Bind to Window for HTML access
window.PlanningLogic = {
    processWorkbook,
    handleFileUpload,
    switchView,
    openStyleModal
};
