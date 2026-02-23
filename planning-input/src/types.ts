export interface ParsedSheet {
  name: string;
  data: any[][];
}

export interface CellLineage {
  sheet: string;
  row: number;
  col: number;
  value: any;
  ref: string;
}

export interface DailyPlan {
  date: Date;
  dayName: string;
  isHoliday: boolean;
  target: number;
  manpower: number;
}

export type UnitType = 'Main Unit' | 'Sub Unit';

export interface StyleEntry {
  id: string;
  styleName: string; // The planned style

  // Context
  sheetName: string;
  unit: UnitType; // Main Unit or Sub Unit
  physicalLine: string;
  supervisor: string;
  currentRunningStyle: string; // From Column B

  // Metrics
  quantity: number | string; // Captured from adjacent cell
  totalTarget: number;
  totalManpower: number;

  // Timeline
  startDate?: Date;
  endDate?: Date;
  dailyPlans: DailyPlan[];

  // Metadata
  rowIndex: number;
  colIndex: number;
  remarks: string[]; // From unstructured text
  anomalies: Anomaly[];
}

export interface Anomaly {
  type: 'overlap' | 'gap' | 'regression' | 'phantom' | 'missing_date' | 'target_mismatch' | 'holiday_production';
  severity: 'high' | 'medium' | 'low';
  message: string;
}

export interface ProcessingConfig {
  shiftStart: string;
  shiftEnd: string;
  headerKeywords?: string[];
  dateFormats?: string[];
}

export type ViewMode = 'dashboard' | 'timeline' | 'grid';

export interface ChatMessage {
  id: string;
  role: 'user' | 'model' | 'system';
  text: string;
  isThinking?: boolean;
  timestamp: number;
}