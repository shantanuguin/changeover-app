const XLSX = require('xlsx');
const fs = require('fs');

const filePath = "c:/Users/Shantanu/Desktop/changeover/planning-input/1. IE Docket Format -S2554MESS6651WV.xlsx";

try {
    const workbook = XLSX.read(fs.readFileSync(filePath), { type: 'buffer' });

    console.log("Sheet Names:", workbook.SheetNames);

    const biSheetName = workbook.SheetNames.find(name =>
        name.toUpperCase().includes('BI') || name.toUpperCase().includes('HOURLY')
    );

    if (biSheetName) {
        console.log(`\nFound BIHOURLY Sheet: "${biSheetName}"`);
        const sheet = workbook.Sheets[biSheetName];

        // Read headers (first 20 lines) to find the structure
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        console.log("\n--- First 20 Rows ---");
        data.slice(0, 20).forEach((row, i) => {
            console.log(`Row ${i}:`, JSON.stringify(row));
        });

    } else {
        console.log("\nNO BIHOURLY SHEET FOUND.");
    }
} catch (e) {
    console.error("Error:", e);
}
