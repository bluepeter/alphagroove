import { Bar, Signal } from '../types.js';

export interface QuickRiseEntryConfig {
  percentIncrease: number;
  maxBars: number;
}

export function detectQuickRiseEntry(
  bars: Bar[],
  config: QuickRiseEntryConfig = { percentIncrease: 0.3, maxBars: 5 }
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
  description: 'Detects when price rises 0.3% from 9:30am open to 9:35am high',
  sql: `
    WITH daily_matches AS (
      SELECT 
        f.trade_date,
        f.year,
        f.market_open,
        f.five_min_high as entry_price,
        e.exit_price,
        CASE 
          WHEN f.five_min_high >= f.market_open * 1.003 AND e.exit_price IS NOT NULL 
          THEN ((e.exit_price - f.five_min_high) / f.five_min_high * 100)  -- Calculate return from entry to exit
          ELSE NULL
        END as trade_return,
        ((f.five_min_high - f.market_open) / f.market_open * 100) as rise_pct
      FROM five_min_prices f
      JOIN exit_prices e ON f.trade_date = e.trade_date
      WHERE f.five_min_high >= f.market_open * 1.003  -- 0.3% rise
        AND e.exit_price IS NOT NULL
        AND e.exit_time IS NOT NULL
    )
    SELECT 
      year,
      COUNT(DISTINCT trade_date) as match_count,
      SUM(trade_return) as total_returns,
      MIN(rise_pct) as min_rise_pct,
      MAX(rise_pct) as max_rise_pct,
      AVG(rise_pct) as avg_rise_pct,
      MIN(trade_return) as min_return,
      MAX(trade_return) as max_return,
      AVG(trade_return) as avg_return,
      MIN(entry_price) as min_entry,
      MAX(entry_price) as max_entry,
      MIN(exit_price) as min_exit,
      MAX(exit_price) as max_exit
    FROM daily_matches
    GROUP BY year
  `,
};
