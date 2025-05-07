import { PatternDefinition } from '../pattern-factory.js';
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
    const risePct = Number((((currentHigh - minOpen) / minOpen) * 100).toFixed(2));

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

export const quickRisePattern: PatternDefinition = {
  name: 'Quick Rise',
  description: 'Detects a 0.3% rise in the first 5 minutes of trading',
  sql: `
    WITH market_open_prices AS (
      SELECT 
        trade_date,
        year,
        open as market_open,
        timestamp as market_open_time
      FROM raw_data
      WHERE strftime(timestamp, '%H:%M') = '09:30'
    ),
    five_min_prices AS (
      SELECT 
        m.trade_date,
        m.year,
        m.market_open,
        r.high as five_min_high,
        r.timestamp as entry_time
      FROM market_open_prices m
      JOIN raw_data r ON m.trade_date = r.trade_date
      WHERE strftime(r.timestamp, '%H:%M') = '09:35'
    ),
    exit_prices AS (
      SELECT 
        f.trade_date,
        f.year,
        f.market_open,
        f.five_min_high,
        f.entry_time,
        r.close as exit_price,
        r.timestamp as exit_time
      FROM five_min_prices f
      JOIN raw_data r ON f.trade_date = r.trade_date
      WHERE strftime(r.timestamp, '%H:%M') = '09:45'  -- Get exactly 9:45am bar
    ),
    pattern_matches AS (
      SELECT 
        year,
        COUNT(*) as match_count,
        MIN((five_min_high - market_open) / market_open * 100) as min_rise_pct,
        MAX((five_min_high - market_open) / market_open * 100) as max_rise_pct,
        AVG((five_min_high - market_open) / market_open * 100) as avg_rise_pct,
        MIN((exit_price - five_min_high) / five_min_high * 100) as min_return,
        MAX((exit_price - five_min_high) / five_min_high * 100) as max_return,
        AVG((exit_price - five_min_high) / five_min_high * 100) as avg_return
      FROM exit_prices
      WHERE (five_min_high - market_open) / market_open >= 0.003  -- 0.3% rise
      GROUP BY year
    )
    SELECT * FROM pattern_matches
  `,
};
