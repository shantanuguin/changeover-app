import { ProcessingConfig } from './types';

export const DEFAULT_CONFIG: ProcessingConfig = {
  headerKeywords: [
    'style', 'article', 'sku', 'item', 'style no', 'model', 'design',
    'po no', 'order no'
  ],
  dateFormats: [
    'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD-MMM-YY'
  ],
  shiftStart: '07:00',
  shiftEnd: '17:30'
};

export const COLORS = {
  primary: '#f97316', // Orange-500
  secondary: '#3b82f6', // Blue-500
  success: '#22c55e', // Green-500
  danger: '#ef4444', // Red-500
  warning: '#eab308', // Yellow-500
  dark: '#09090b', // Zinc-950
  panel: '#18181b', // Zinc-900
  border: '#27272a', // Zinc-800
};
