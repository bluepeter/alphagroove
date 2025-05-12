import { PatternDefinition } from '../types.js';
import { Bar, Signal } from '../types.js';

/**
 * Configuration for the Quick Fall entry pattern.
 * @interface QuickFallEntryConfig
 * @property {number} percentDecrease - The minimum percentage decrease required to trigger an entry (e.g., 0.3 for 0.3%)
 * @property {number} maxBars - The maximum number of bars to look back for the fall
 * @property {string} direction - Trading direction ('long' or 'short')
 */
export interface QuickFallEntryConfig {
  percentDecrease: number;
  maxBars: number;
  direction: 'long' | 'short';
}

/**
 * Detects a quick fall in price over a specified number of bars.
 *
 * @param bars - Array of price bars to analyze
 * @param config - Configuration options for the pattern
 * @returns Signal | null - Entry signal if pattern is detected, null otherwise
 *
 * @example
 * ```typescript
 * const result = detectQuickFallEntry(bars, { percentDecrease: 0.5, maxBars: 5, direction: 'short' });
 * if (result) {
 *   console.log(`Entry signal at ${result.timestamp} with price ${result.price}`);
 * }
 * ```
 */
export function detectQuickFallEntry(bars: Bar[], config: QuickFallEntryConfig): Signal | null {
  if (bars.length < config.maxBars) {
    return null;
  }

  // Look back N minutes to find price decreases
  for (let i = config.maxBars - 1; i < bars.length; i++) {
    const lookbackBars = bars.slice(i - (config.maxBars - 1), i + 1);
    const maxOpen = Math.max(...lookbackBars.map(bar => bar.open));
    const currentLow = bars[i].low;
    const fallPct = Number((((maxOpen - currentLow) / maxOpen) * 100).toFixed(2));

    // For both long and short, we look for the same price fall pattern
    if (fallPct >= config.percentDecrease) {
      // Found a fall that exceeds our threshold - return appropriate signal
      return {
        timestamp: bars[i].timestamp,
        // For short we enter at the low, for long we also enter at the low (buying at the bottom)
        price: currentLow,
        type: 'entry',
        direction: config.direction,
      };
    }
  }

  return null;
}

/**
 * Creates the SQL query for the quick fall pattern based on the given configuration
 */
export function createSqlQuery(config: QuickFallEntryConfig): string {
  // Calculate the fall percentage threshold - same for both directions
  const fallThreshold = config.percentDecrease / 100;

  // We always check for the same fall metrics in both directions,
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
    -- Always look for a quick fall, but based on direction we select the appropriate entry price
    WHERE ((market_open - five_min_low) / market_open) >= ${fallThreshold}
  `;
}

/**
 * Quick Fall Pattern Definition
 *
 * This pattern looks for a rapid price decrease within the first few minutes of trading,
 * depending on the direction setting.
 * It detects a configurable percentage fall in the first few minutes for short positions, or a fall for
 * long positions (buying the dip).
 *
 * @example
 * ```typescript
 * // Get pattern with custom configuration
 * const pattern = quickFallPattern;
 * pattern.updateConfig({ percentDecrease: 0.5, maxBars: 3, direction: 'long' });
 * ```
 */
export const quickFallPattern: PatternDefinition & {
  config: QuickFallEntryConfig;
  updateConfig: (newConfig: Partial<QuickFallEntryConfig>) => PatternDefinition;
} = {
  name: 'Quick Fall',
  description: 'Detects a configurable percentage fall in the first few minutes of trading',
  // Will be set from config system
  config: {
    percentDecrease: 0,
    maxBars: 0,
    direction: 'short',
  },
  direction: 'short',
  sql: '',
  updateConfig(newConfig: Partial<QuickFallEntryConfig>) {
    const updatedConfig = { ...this.config, ...newConfig };
    return {
      ...this,
      config: updatedConfig,
      direction: updatedConfig.direction,
      sql: createSqlQuery(updatedConfig),
    };
  },
};
