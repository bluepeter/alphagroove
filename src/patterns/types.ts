export interface Bar {
  timestamp: string; // Full timestamp, e.g., "2023-05-01 09:35:00"
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trade_date: string; // YYYY-MM-DD extracted by SQL
}

export interface Signal {
  timestamp: string;
  price: number;
  type: 'entry' | 'exit';
  direction?: 'long' | 'short';
}

export interface PatternDefinition {
  name: string;
  description: string;
  sql: string;
  defaultConfig?: Record<string, any>;
  info?: () => string;
  direction?: 'long' | 'short';
}
