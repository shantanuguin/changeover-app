const xlsx = require('xlsx');
const path = 'c:/Users/Shantanu/Desktop/changeover/outside/SSLR - M142.xlsx';
const workbook = xlsx.readFile(path);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

// Range Y1:AB2 (inclusive)
// Y=24, Z=25, AA=26, AB=27 (0-indexed columns)
// Rows 0 and 1 (1 and 2 1-indexed)

const range = { s: { c: 24, r: 0 }, e: { c: 27, r: 20 } }; // Reading more rows to be safe
const data = xlsx.utils.sheet_to_json(worksheet, { header: 1, range: range });

console.log(JSON.stringify(data, null, 2));
