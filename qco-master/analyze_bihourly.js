import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';

const filePath = "c:/Users/Shantanu/Desktop/changeover/planning-input/1. IE Docket Format -S2554MESS6651WV.xlsx";

try {
    const buf = readFileSync(filePath);
    const workbook = XLSX.read(buf, { type: 'buffer' });

    console.log("All Sheet Names:", workbook.SheetNames);

    const biSheetName = workbook.SheetNames.find(name =>
        name.toUpperCase().includes('BI') || name.toUpperCase().includes('HOURLY')
    );

    if (biSheetName) {
        console.log(`\nFound target sheet: "${biSheetName}"`);
        const sheet = workbook.Sheets[biSheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        console.log("\n--- First 20 Rows ---");
        data.slice(0, 20).forEach((row, i) => {
            console.log(`Row ${i}:`, JSON.stringify(row));
        });

    } else {
        console.log("\nNo sheet found matching 'BI' or 'HOURLY'.");
    }

} catch (e) {
    console.error("Error:", e);
}
