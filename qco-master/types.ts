export interface Operation {
  serialNumber: number; // Kept for backward compatibility if needed
  name: string;
  smv: number;
  machineType: string;
  quantity: number;
}

export interface StyleMetadata {
  styleNumber: string;
  totalSMV: number;
  target: number;
}

export interface MergedOperation {
  id: string;
  section: string;
  name: string;
  smv: number;
  machineType: string;
  quantity: number;
  biMachineRef?: string;
  sequenceIndex: number; 
  source: 'OB' | 'BiHourly' | 'Merged';
}

export interface SectionGroup {
  sectionName: string;
  operations: MergedOperation[];
}

export interface ParsedOBData extends StyleMetadata {
  filename: string;
  operations: Operation[]; // Flat list for legacy calculations
  machineCounts: Record<string, number>; // Map of Machine Name -> Quantity
  manpower: number; // allotedWP (Sum of Col J)
  sections: SectionGroup[]; // New structured data
}

export interface MachineComparison {
  machineType: string;
  currentQty: number;
  upcomingQty: number;
  diff: number; // upcoming - current
  status: 'SURPLUS' | 'NEED' | 'OK';
}

export interface QCOData {
  qcoNumber: string;
  lineNumber: string;
  currentStyle: ParsedOBData;
  upcomingStyle: ParsedOBData;
  machineSummary: MachineComparison[];
  timestamp: Date;
}

export interface SaveResult {
  success: boolean;
  message: string;
  id?: string;
}