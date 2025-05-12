import { PatternDefinition } from '../types.js';
import { Bar, Signal } from '../types.js';

/**
 * Configuration for the Quick Rise entry pattern.
 * @interface QuickRiseEntryConfig
 * @property {number} percentIncrease - The minimum percentage increase required to trigger an entry (e.g., 0.3 for 0.3%)
 * @property {number} maxBars - The maximum number of bars to look back for the rise
 * @property {string} direction - Trading direction ('long' or 'short')
 */
export interface QuickRiseEntryConfig {
  percentIncrease: number;
  maxBars: number;
  direction: 'long' | 'short';
}

/**
 * Detects a quick rise in price over a specified number of bars.
 *
 * @param bars - Array of price bars to analyze
 * @param config - Configuration options for the pattern
 * @returns Signal | null - Entry signal if pattern is detected, null otherwise
 *
 * @example
 * ```typescript
 * const result = detectQuickRiseEntry(bars, { percentIncrease: 0.5, maxBars: 5, direction: 'long' });
 * if (result) {
 *   console.log(`Entry signal at ${result.timestamp} with price ${result.price}`);
 * }
 * ```
 */
export function detectQuickRiseEntry(bars: Bar[], config: QuickRiseEntryConfig): Signal | null {
  if (bars.length < config.maxBars) {
    return null;
  }

  // Look back N minutes to find price increases
  for (let i = config.maxBars - 1; i < bars.length; i++) {
    const lookbackBars = bars.slice(i - (config.maxBars - 1), i + 1);
    const minOpen = Math.min(...lookbackBars.map(bar => bar.open));
    const currentHigh = bars[i].high;
    const risePct = Number((((currentHigh - minOpen) / minOpen) * 100).toFixed(2));

    // For both long and short, we look for the same price rise pattern
    if (risePct >= config.percentIncrease) {
      // Found a rise that exceeds our threshold - return appropriate signal
      return {
        timestamp: bars[i].timestamp,
        // For long we enter at the high, for short we also enter at the high (shorting at the peak)
        price: currentHigh,
        type: 'entry',
        direction: config.direction,
      };
    }
  }

  return null;
}

/**
 * Creates the SQL query for the quick rise pattern based on the given configuration
 */
export function createSqlQuery(config: QuickRiseEntryConfig): string {
  // Calculate the rise percentage threshold - same for both directions
  const riseThreshold = config.percentIncrease / 100;

  // We always check for the same rise/fall metrics in both directions,
  // but the entry prices and trade direction change
  return `
    WITH raw_data AS (
      SELECT 
        column0::TIMESTAMP as timestamp,
        column1::DOUBLE as open,
        column2::DOUBLE as high,
        column3::DOUBLE as low,
        column4::DOUBLE as close,
        column5::BIGINT as volume,
        strftime(column0, '%Y-%m-%d') as trade_date,
        strftime(column0, '%Y') as year
      FROM read_csv_auto('tickers/{ticker}/{timeframe}.csv', header=false)
      WHERE column0 >= '{from} 00:00:00'
        AND column0 <= '{to} 23:59:59'
    ),
    trading_days AS (
      SELECT 
        year,
        COUNT(DISTINCT trade_date) as total_trading_days
      FROM raw_data
      WHERE strftime(timestamp, '%H:%M') = '09:30'  -- Only count days with market open
        AND strftime(timestamp, '%w') NOT IN ('0', '6')  -- Exclude weekends
      GROUP BY year
    ),
    total_trading_days AS (
      SELECT SUM(total_trading_days) as total_trading_days
      FROM trading_days
    ),
    market_open_prices AS (
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
        r.low as five_min_low,
        r.timestamp as entry_time
      FROM market_open_prices m
      JOIN raw_data r ON m.trade_date = r.trade_date
      WHERE strftime(r.timestamp, '%H:%M') = '09:35'
    )
    -- Always look for a quick rise, but based on direction we select the appropriate entry price
    WHERE ((five_min_high - market_open) / market_open) >= ${riseThreshold}
  `;
}

/**
 * Quick Rise Pattern Definition
 *
 * This pattern looks for a rapid price increase or decrease within the first few minutes of trading,
 * depending on the direction setting.
 * It detects a configurable percentage rise in the first few minutes for long positions, or a rise
 * for short positions (shorting at the peak).
 *
 * @example
 * ```typescript
 * // Get pattern with custom configuration
 * const pattern = quickRisePattern;
 * pattern.updateConfig({ percentIncrease: 0.5, maxBars: 3, direction: 'short' });
 * ```
 */
export const quickRisePattern: PatternDefinition & {
  config: QuickRiseEntryConfig;
  updateConfig: (newConfig: Partial<QuickRiseEntryConfig>) => PatternDefinition;
} = {
  name: 'Quick Rise',
  description: 'Detects a configurable percentage rise in the first few minutes of trading',
  // Will be set from config system
  config: {
    percentIncrease: 0,
    maxBars: 0,
    direction: 'long',
  },
  direction: 'long',
  sql: '',
  updateConfig(newConfig: Partial<QuickRiseEntryConfig>) {
    const updatedConfig = { ...this.config, ...newConfig };
    return {
      ...this,
      config: updatedConfig,
      direction: updatedConfig.direction,
      sql: createSqlQuery(updatedConfig),
    };
  },
};
