import { Bar, Signal } from '../types.js';

export interface QuickRiseEntryConfig {
  percentIncrease: number;
  maxBars: number;
}

export function detectQuickRiseEntry(
  bars: Bar[],
  config: QuickRiseEntryConfig = { percentIncrease: 0.5, maxBars: 5 }
): Signal | null {
  if (bars.length < config.maxBars) {
    return null;
  }

  // Look back 5 minutes to find price increases
  for (let i = config.maxBars - 1; i < bars.length; i++) {
    const lookbackBars = bars.slice(i - (config.maxBars - 1), i + 1);
    const minOpen = Math.min(...lookbackBars.map(bar => bar.open));
    const currentHigh = bars[i].high;
    const risePct = ((currentHigh - minOpen) / minOpen) * 100;

    if (risePct >= config.percentIncrease) {
      return {
        timestamp: bars[i].timestamp,
        price: currentHigh,
        type: 'entry',
      };
    }
  }

  return null;
}

export interface PatternDefinition {
  name: string;
  description: string;
  sql: string;
}

export const quickRisePattern: PatternDefinition = {
  name: 'Quick Rise',
  description: 'Detects when price rises 0.5% from the 5-minute low',
  sql: `
    SELECT 
      year,
      COUNT(*) as match_count,
      SUM(CASE WHEN open >= min_open_5min * 1.005 AND exit_price IS NOT NULL 
        THEN ((exit_price - open) / open * 100) END) as total_returns
    FROM price_changes
    WHERE open >= min_open_5min * 1.005  -- 0.5% rise
      AND exit_price IS NOT NULL
      AND exit_time IS NOT NULL
    GROUP BY year
  `,
};
