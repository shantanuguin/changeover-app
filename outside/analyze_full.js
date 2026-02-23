const XLSX = require('xlsx');
const fs = require('fs');

const filePath = "c:/Users/Shantanu/Desktop/changeover/planning-input/1. IE Docket Format -S2554MESS6651WV.xlsx";

try {
    const workbook = XLSX.read(fs.readFileSync(filePath), { type: 'buffer' });
    const biSheetName = workbook.SheetNames.find(name =>
        name.toUpperCase().includes('BI') || name.toUpperCase().includes('HOURLY')
    );

    if (biSheetName) {
        const sheet = workbook.Sheets[biSheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        console.log("--- FULL BIHOURLY OPERATIONS (Col A=S NO, Col B=Operation) ---");
        let opCount = 0;
        data.forEach((row, i) => {
            if (i < 3) return; // Skip metadata rows
            const colA = row[0];
            const colB = row[1];
            if (colB && String(colB).length > 1 && String(colB) !== "0") {
                opCount++;
                console.log(`Pos ${opCount}: Row ${i}, S_NO=${colA}, Name="${colB}"`);
            }
        });
        console.log(`\nTotal extracted: ${opCount} operations`);
    }
} catch (e) {
    console.error("Error:", e);
}
