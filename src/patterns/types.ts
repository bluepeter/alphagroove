export interface Bar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Signal {
  timestamp: string;
  price: number;
  type: 'entry' | 'exit';
  direction?: 'long' | 'short';
}

export interface PatternResult {
  entry: Signal | null;
  exit: Signal | null;
  bars: Bar[];
}
