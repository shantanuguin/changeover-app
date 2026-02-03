import * as XLSX from 'xlsx';
import { StyleEntry, UnitType } from '../types';

// --- Constants based on Sheet Structure ---
const COL_LINE_CTX = 0; // Column A: Physical Line / Supervisor / Unit Header
const COL_CURR_STYLE = 1; // Column B: Current Running Style
const COL_PLAN_START = 10; // Column K: Planning Grid Starts (0-indexed 10 = K)

const ROW_DATE = 2; // Row 3 (0-indexed)
const ROW_DAY = 3; // Row 4 (0-indexed)
const ROW_STYLE_START = 8; // Row 9 (0-indexed)
const ROW_STYLE_END = 114; // Row 115 (0-indexed)
const ROW_STRIDE = 3; // Every 3 rows

// --- Helpers ---

const getCellValue = (cell: any): any => {
  if (cell === undefined || cell === null) return null;
  if (typeof cell === 'object' && cell.v !== undefined) return cell.v;
  return cell;
};

const cleanString = (val: any): string => {
  if (!val) return '';
  return String(val).trim();
};

const excelDateToJSDate = (serial: number): Date | null => {
  if (!serial || isNaN(serial)) return null;
  // Excel serial date adjustment
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date_info = new Date(utc_value * 1000);
  return new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate());
};

const isValidDate = (d: any): boolean => {
  return d instanceof Date && !isNaN(d.getTime());
};

const isFriday = (dayStr: string): boolean => {
  return /fri/i.test(dayStr);
};

// Heuristic to detect if a string is a "Remark" rather than a Style Name
const isRemark = (str: string): boolean => {
  const s = str.toLowerCase();
  return (
    s.includes('add') ||
    s.includes('between') ||
    s.includes('need to') ||
    s.includes('change') ||
    (s.split(' ').length > 4 && !s.includes('-')) // Long sentence-like string
  );
};

const isQuantity = (str: string): boolean => {
  const s = str.toLowerCase();
  return s.includes('pcs') || (/^\d+$/.test(s) && s.length < 6); // "300" or "300pcs"
};

// --- Core Processor ---

export const processWorkbook = async (file: File): Promise<StyleEntry[]> => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });

  let allStyles: StyleEntry[] = [];

  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    // Convert to matrix, explicit nulls for empty cells
    const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

    if (rawData.length < ROW_STYLE_START) return;

    // 1. Parse Calendar (Row 3 & 4)
    const dateMap = new Map<number, { date: Date, day: string, isHoliday: boolean }>();
    const dateRow = rawData[ROW_DATE] || [];
    const dayRow = rawData[ROW_DAY] || [];

    for (let c = COL_PLAN_START; c < dateRow.length; c++) {
      let dateVal = dateRow[c];
      let jsDate: Date | null = null;

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

    // 2. Scan Context & Styles
    let currentUnit: UnitType = "Main Unit";

    // Iterate rows strictly from 9 to ~115 with stride 3
    for (let r = ROW_STYLE_START; r <= Math.min(rawData.length - 1, ROW_STYLE_END); r += ROW_STRIDE) {

      // -- Context Detection (Column A) --
      // We look at the cell in Column A at the current row 'r'.
      // If it contains "Main Unit" or "Sub Unit", update currentUnit.
      // Otherwise, if it has content, it's likely a Supervisor / Line Name.

      const cellA = cleanString(rawData[r][COL_LINE_CTX]);
      let currentSupervisor = "Unassigned";

      if (cellA.toLowerCase().includes('main unit')) {
        currentUnit = "Main Unit";
        // If the same cell also has a name, it's tricky, but usually these are Section Headers.
        // If it strictly says "Main Unit", we don't treat it as a supervisor line yet.
        // But often the header is on a row BEFORE the actual data.
        // The user said: "A column has two headers... lines below them correspond..."
        // So we persist `currentUnit`.
      } else if (cellA.toLowerCase().includes('sub unit')) {
        currentUnit = "Sub Unit";
      }

      // If it's NOT a header, it's a supervisor line.
      if (!cellA.toLowerCase().includes('unit') &&
        !cellA.toLowerCase().includes('ttl') &&
        !cellA.toLowerCase().includes('budget') &&
        cellA.length > 0) {
        currentSupervisor = cellA;
      }

      // Check "Footer" markers to stop/skip (though loop limit handles most)
      if (cellA.toLowerCase().includes('ttl qty')) continue;

      // -- Current Running Style (Column B) --
      const currentRunningStyle = cleanString(rawData[r][COL_CURR_STYLE]);

      // -- Scan Planning Grid (Col K -> End) --
      const rowStyle = rawData[r] || [];
      const rowTarget = rawData[r + 1] || [];   // Target is below style
      const rowManpower = rawData[r + 2] || []; // Manpower is below Target

      let activeStyle: StyleEntry | null = null;
      let activeStyleStartCol = -1;

      for (let c = COL_PLAN_START; c < rowStyle.length; c++) {
        const cellVal = getCellValue(rowStyle[c]);
        const cellStr = cleanString(cellVal);
        const calendar = dateMap.get(c);

        // Determine cell type
        const isRemarkText = isRemark(cellStr);
        const isQtyText = isQuantity(cellStr);
        const hasContent = cellStr.length > 0;

        // New Style Start: Has content, not a remark, not a qty
        // Note: Quantity is usually to the RIGHT of the style name.
        const isNewStyle = hasContent && !isRemarkText && !isQtyText;

        if (isNewStyle) {
          // Close previous style
          if (activeStyle) {
            // User Rule: "The end date logic is that it's the same day as the start of the other style"
            // So we set the end date of the CLOSING style to the CURRENT column's date (Step Start Date of new style)
            if (calendar?.date) {
              activeStyle.endDate = calendar.date;
            }
            allStyles.push(activeStyle);
          }

          // Init New Style
          activeStyle = {
            id: `${sheetName}-R${r}-C${c}`,
            styleName: cellStr,
            sheetName,
            unit: currentUnit,
            physicalLine: currentSupervisor, // Using Supervisor as Line Name for now as they are often synonymous in these sheets
            supervisor: currentSupervisor,
            currentRunningStyle,
            quantity: '', // Look for it in next cell
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
          activeStyleStartCol = c;

          // Check Immediate Right (Next Column) for Quantity
          const rightCellVal = cleanString(getCellValue(rowStyle[c + 1]));
          if (isQuantity(rightCellVal)) {
            activeStyle.quantity = rightCellVal;
          }
        }

        // If we have an active style, we capture Daily Plans & Remarks
        if (activeStyle) {
          // 1. Remarks (on the Style Row, but not the style name itself)
          if (hasContent && isRemarkText) {
            activeStyle.remarks.push(`${calendar?.date.toLocaleDateString() ?? 'Unknown Date'}: ${cellStr}`);
          }

          // 2. Daily Targets & Manpower
          // These exist for every day until the next style starts.
          // However, we only capture if we are NOT at the start column (unless style is 1 day long?)
          // Actually, for the start column `c`:
          // The user said: "Use Target for Day 1... M10 is target for day 2".
          // So YES, we capture target/mp at column `c` too.

          // Check if we stumbled into a new style's territory?
          // The loop handles `isNewStyle` checks first, so `activeStyle` is the *current* one at this specific column `c`.

          if (calendar) {
            const targetVal = rowTarget[c];
            const mpVal = rowManpower[c];

            // Round to nearest integer (No decimals)
            const targetNum = typeof targetVal === 'number' ? Math.round(targetVal) : Math.round(Number(targetVal) || 0);
            const mpNum = typeof mpVal === 'number' ? Math.round(mpVal) : Math.round(Number(mpVal) || 0);

            // Always extend end date if we are in this column, ensuring we capture the full span including holidays
            if (!activeStyle.startDate) activeStyle.startDate = calendar.date;
            activeStyle.endDate = calendar.date;

            // Add day if there is a plan OR if it's a valid workday (heuristic: if target > 0 or mp > 0 or not holiday)
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
      } // End Column Loop

      // Push final style of the row
      if (activeStyle) {
        allStyles.push(activeStyle);
      }

    } // End Row Loop
  });

  return allStyles;
};
