import { PatternDefinition } from '../pattern-factory.js';
import { Bar, Signal } from '../types.js';

/**
 * Configuration options for the Quick Rise entry pattern.
 * @interface QuickRiseEntryConfig
 * @property {number} percentIncrease - The minimum percentage increase required to trigger the pattern (e.g., 0.3 for 0.3%)
 * @property {number} maxBars - The maximum number of bars to look back for the rise (default: 5 for 5-minute window)
 */
export interface QuickRiseEntryConfig {
  percentIncrease: number;
  maxBars: number;
}

/**
 * Default configuration for the Quick Rise pattern
 */
const DEFAULT_CONFIG: QuickRiseEntryConfig = {
  percentIncrease: 0.3,
  maxBars: 5,
};

/**
 * Detects a quick rise in price over a specified number of bars.
 *
 * @param bars - Array of price bars to analyze
 * @param config - Configuration options for the pattern
 * @returns Signal | null - Entry signal if pattern is detected, null otherwise
 *
 * @example
 * ```typescript
 * const result = detectQuickRiseEntry(bars, { percentIncrease: 0.5, maxBars: 5 });
 * if (result) {
 *   console.log(`Entry signal at ${result.timestamp} with price ${result.price}`);
 * }
 * ```
 */
export function detectQuickRiseEntry(
  bars: Bar[],
  config: QuickRiseEntryConfig = DEFAULT_CONFIG
): Signal | null {
  if (bars.length < config.maxBars) {
    return null;
  }

  // Look back N minutes to find price increases
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

/**
 * Creates an SQL query for the Quick Rise pattern with the specified configuration.
 *
 * @param config - Configuration options for the pattern
 * @returns string - The SQL query with the configured rise percentage
 */
const createSqlQuery = (config: QuickRiseEntryConfig = DEFAULT_CONFIG) => `
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
    WHERE (five_min_high - market_open) / market_open >= ${config.percentIncrease / 100}  -- Configurable rise percentage
    GROUP BY year
  )
  SELECT * FROM pattern_matches
`;

/**
 * Quick Rise Pattern Definition
 *
 * This pattern looks for a rapid price increase within the first few minutes of trading.
 * By default, it detects a 0.3% rise in the first 5 minutes, but these parameters
 * can be configured.
 *
 * @example
 * ```typescript
 * // Get pattern with custom configuration
 * const pattern = quickRisePattern;
 * pattern.updateConfig({ percentIncrease: 0.5, maxBars: 3 });
 * ```
 */
export const quickRisePattern: PatternDefinition & {
  config: QuickRiseEntryConfig;
  updateConfig: (newConfig: Partial<QuickRiseEntryConfig>) => void;
} = {
  name: 'Quick Rise',
  description: 'Detects a configurable percentage rise in the first few minutes of trading',
  config: { ...DEFAULT_CONFIG },
  sql: createSqlQuery(DEFAULT_CONFIG),
  updateConfig(newConfig: Partial<QuickRiseEntryConfig>) {
    this.config = { ...this.config, ...newConfig };
    this.sql = createSqlQuery(this.config);
  },
};
