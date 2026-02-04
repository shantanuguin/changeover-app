import * as XLSX from 'xlsx';
import { ParsedOBData, Operation, SectionGroup, MergedOperation } from '../types';

// --- CONFIGURATION ---
const COL_A = 0; // OB: Section Marker
const COL_B = 1; // OB: Operation Name
const COL_C = 2; // OB: SMV
const IDX_MACHINE = 6; // OB: Machine Type (Col G)
const IDX_QTY = 9; // OB: Quantity (Col J)

const BI_COL_NAME = 1; // Bi-Hourly: Operation Name (Col B)
const BI_COL_REF = 4;  // Bi-Hourly: Floor Ref (Col E)

const TERMINATION_KEYWORDS = ['EOL-TB', 'END OF LINE', 'END OF LINE-TB', 'EOLTB'];
const MATCH_THRESHOLD = 0.45; // 0.0 to 1.0. Lower = looser matching.

// --- UTILITIES ---

// Normalize string for comparison
const normalize = (str: string) => str?.toString().toLowerCase().trim().replace(/\s+/g, ' ') || '';

// Dice Coefficient for Fuzzy Matching (good for spelling errors/abbreviations)
const getSimilarity = (s1: string, s2: string): number => {
  const a = normalize(s1).replace(/\s/g, '');
  const b = normalize(s2).replace(/\s/g, '');
  
  if (!a.length && !b.length) return 1;
  if (!a.length || !b.length) return 0;
  if (a === b) return 1;

  const getBigrams = (str: string) => {
    const bigrams = new Map();
    for (let i = 0; i < str.length - 1; i++) {
      const bigram = str.substring(i, i + 2);
      const count = bigrams.has(bigram) ? bigrams.get(bigram) + 1 : 1;
      bigrams.set(bigram, count);
    }
    return bigrams;
  };

  const bgA = getBigrams(a);
  const bgB = getBigrams(b);
  let intersection = 0;

  bgA.forEach((count, bigram) => {
    if (bgB.has(bigram)) {
      intersection += Math.min(count, bgB.get(bigram));
    }
  });

  return (2 * intersection) / (a.length - 1 + b.length - 1);
};

// --- MAIN PARSER ---

export const parseOBFile = async (file: File): Promise<ParsedOBData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });

        // 1. Sheet Identification
        const obSheetName = workbook.SheetNames.find(name => 
          name.toUpperCase().includes('OB') || name.toUpperCase().includes('MAIN')
        ) || workbook.SheetNames[0];

        const biSheetName = workbook.SheetNames.find(name => 
          name.toUpperCase().includes('BI') || name.toUpperCase().includes('HOURLY')
        );

        // --- STEP 1: PARSE OB SHEET (The Database of Ops) ---
        const obWorksheet = workbook.Sheets[obSheetName];
        const obData = XLSX.utils.sheet_to_json(obWorksheet, { header: 1, defval: '' }) as any[][];

        // Metadata extraction
        let styleNumber = 'Unknown';
        for (let i = 0; i < Math.min(20, obData.length); i++) {
          const rowStr = JSON.stringify(obData[i]).toUpperCase();
          if (rowStr.includes('STYLE')) {
             const row = obData[i];
             const cellIndex = row.findIndex((c:any) => String(c).toUpperCase().includes('STYLE'));
             if (cellIndex !== -1 && row[cellIndex+1]) styleNumber = String(row[cellIndex+1]).trim();
          }
        }

        // Find OB Header
        let obHeaderIdx = -1;
        for (let i = 0; i < obData.length; i++) {
          if (obData[i].some((cell:any) => String(cell).toUpperCase().includes('OPERATION'))) {
            obHeaderIdx = i; break;
          }
        }
        if (obHeaderIdx === -1) {
           obHeaderIdx = obData.findIndex(row => JSON.stringify(row).toUpperCase().includes('SMV'));
        }

        // Extract OB Operations
        const obOperations: MergedOperation[] = [];
        const machineCounts: Record<string, number> = {};
        let manpower = 0;
        let currentSection = 'UNCLASSIFIED';

        if (obHeaderIdx !== -1) {
          for (let i = obHeaderIdx + 1; i < obData.length; i++) {
            const row = obData[i];
            if (!row || row.length === 0) continue;

            const cellA = String(row[COL_A] || '').trim();
            const cellB = String(row[COL_B] || '').trim();
            const machineVal = String(row[IDX_MACHINE] || '').trim();

            if (TERMINATION_KEYWORDS.some(k => normalize(cellA) === normalize(k))) break;

            // Section Detection (Col A is text)
            const isNumericA = !isNaN(parseFloat(cellA)) && isFinite(parseFloat(cellA));
            if (cellA.length > 0 && !isNumericA) {
              currentSection = cellA.toUpperCase();
              if (cellB === '') continue; // Header row
            }

            // Operation Extraction
            if (cellB.length > 0) {
               const smv = parseFloat(row[COL_C] || '0');
               const qty = parseFloat(row[IDX_QTY] || '0');
               const mType = String(row[IDX_MACHINE] || 'MANUAL').trim() || 'MANUAL';

               obOperations.push({
                 id: `OB-${i}`,
                 section: currentSection,
                 name: cellB,
                 smv,
                 machineType: mType,
                 quantity: qty,
                 sequenceIndex: i, // Original OB Index
                 source: 'OB'
               });

               // Stats
               manpower += qty;
               if (mType.toUpperCase() !== 'MANUAL') {
                 machineCounts[mType] = (machineCounts[mType] || 0) + qty;
               }
            }
          }
        }

        // --- STEP 2: PARSE BI-HOURLY SHEET (The Sequence Master) ---
        let biHourlyOps: { name: string; ref: string; originalIdx: number }[] = [];
        
        if (biSheetName) {
           const biWorksheet = workbook.Sheets[biSheetName];
           const biData = XLSX.utils.sheet_to_json(biWorksheet, { header: 1, defval: '' }) as any[][];
           
           // Find Header
           let biHeaderIdx = 0;
           for(let i = 0; i < Math.min(biData.length, 20); i++) {
               if (String(biData[i][BI_COL_NAME] || '').toUpperCase().includes('OPERATION')) {
                   biHeaderIdx = i + 1; break;
               }
           }

           for (let i = biHeaderIdx; i < biData.length; i++) {
              const row = biData[i];
              if (!row) continue;
              const name = String(row[BI_COL_NAME] || '').trim();
              const ref = String(row[BI_COL_REF] || '').trim();
              
              if (!name || name.length < 2 || name.toUpperCase().includes('OPERATION')) continue;

              biHourlyOps.push({ name, ref, originalIdx: i });
           }
        }

        // --- STEP 3: MATCHING & SEQUENCING ---
        
        // We will build the Final Ordered List here.
        // We iterate through Bi-Hourly Ops. For each, we find the best OB Match.
        // We consume OB matches so they aren't used twice.
        
        const finalOperations: MergedOperation[] = [];
        const usedObIds = new Set<string>();

        // 3a. Process Bi-Hourly Sequence
        biHourlyOps.forEach((biOp, idx) => {
            let bestMatch: MergedOperation | null = null;
            let bestScore = 0;

            // Find best available match in OB
            for (const obOp of obOperations) {
                if (usedObIds.has(obOp.id)) continue;

                const score = getSimilarity(biOp.name, obOp.name);
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = obOp;
                }
            }

            if (bestMatch && bestScore >= MATCH_THRESHOLD) {
                usedObIds.add(bestMatch.id);
                finalOperations.push({
                    ...bestMatch,
                    biMachineRef: biOp.ref,
                    sequenceIndex: idx,
                    source: 'Merged'
                });
            } else {
                // If present in Bi-Hourly but completely missing in OB, 
                // we technically don't have SMV/Machine data. 
                // We'll skip adding a phantom op to avoid corrupting data calculations, 
                // OR we could add a placeholder. 
                // Decision: Skip, as OB is the source of truth for machines.
            }
        });

        // 3b. Append Orphaned OB Operations
        // (Operations in OB that were NOT in Bi-Hourly)
        // We append them at the end, preserving their relative OB order.
        const orphans = obOperations.filter(op => !usedObIds.has(op.id));
        orphans.forEach((op, idx) => {
            finalOperations.push({
                ...op,
                sequenceIndex: 9999 + idx,
                source: 'OB'
            });
        });

        // --- STEP 4: DYNAMIC SECTION GROUPING ---
        // "Show me according to sections like there could be 2 back part sections..."
        // We iterate the final list. If the section name changes, we start a new group.
        
        const finalSections: SectionGroup[] = [];
        
        if (finalOperations.length > 0) {
            let currentGroup: SectionGroup = {
                sectionName: finalOperations[0].section,
                operations: []
            };

            finalOperations.forEach((op, index) => {
                // If section changes (and it's not the very first item)
                if (index > 0 && op.section !== finalOperations[index - 1].section) {
                    // Push old group
                    finalSections.push(currentGroup);
                    // Start new group
                    currentGroup = {
                        sectionName: op.section,
                        operations: []
                    };
                }
                currentGroup.operations.push(op);
            });
            // Push final group
            finalSections.push(currentGroup);
        }

        // --- RETURN RESULT ---
        resolve({
          filename: file.name,
          styleNumber,
          totalSMV: 0, 
          target: 0,
          operations: obOperations.map(o => ({
             // Legacy map for stats
             serialNumber: 0,
             name: o.name,
             smv: o.smv,
             machineType: o.machineType,
             quantity: o.quantity
          })),
          machineCounts,
          manpower: Math.round(manpower),
          sections: finalSections
        });

      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = (error) => reject(error);
    reader.readAsBinaryString(file);
  });
};
