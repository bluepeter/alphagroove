import { Bar, Signal } from '../types.js';

export interface FixedTimeExitConfig {
  barsAfterEntry: number;
}

export function detectFixedTimeExit(
  bars: Bar[],
  entry: Signal,
  config: FixedTimeExitConfig = { barsAfterEntry: 10 }
): Signal | null {
  const entryIndex = bars.findIndex(bar => bar.timestamp === entry.timestamp);
  if (entryIndex === -1) {
    return null;
  }

  const exitIndex = entryIndex + config.barsAfterEntry;
  if (exitIndex >= bars.length) {
    return null;
  }

  return {
    timestamp: bars[exitIndex].timestamp,
    price: bars[exitIndex].close,
    type: 'exit',
  };
}

export interface PatternDefinition {
  name: string;
  description: string;
  sql: string;
}

export const fixedTimeExitPattern: PatternDefinition = {
  name: 'Fixed Time Exit',
  description: 'Exits exactly 10 minutes after entry (at 9:45am)',
  sql: `
    SELECT 
      year,
      COUNT(*) as match_count,
      SUM(CASE WHEN exit_price IS NOT NULL 
        THEN ((exit_price - open) / open * 100) END) as total_returns
    FROM price_changes
    WHERE exit_price IS NOT NULL
      AND exit_time IS NOT NULL
    GROUP BY year
  `,
};
