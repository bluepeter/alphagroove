import { PatternDefinition } from '../pattern-factory.js';
import { Bar, Signal } from '../types.js';

/**
 * Configuration for the Fixed Time Entry pattern.
 * @interface FixedTimeEntryConfig
 * @property {string} time - The time to enter the market (e.g., "12:00")
 */
export interface FixedTimeEntryConfig {
  time: string; // HH:MM format
}

/**
 * Detects if the current bar's time matches the configured entry time.
 *
 * @param bars - Array of price bars to analyze. Only the last bar is relevant.
 * @param config - Configuration options for the pattern.
 * @param direction - Trading direction ('long' or 'short')
 * @returns Signal | null - Entry signal if pattern is detected, null otherwise
 *
 * @example
 * ```typescript
 * const result = detectFixedTimeEntry(bars, { time: "12:00" }, 'long');
 * if (result) {
 *   console.log(`Entry signal at ${result.timestamp} with price ${result.price}`);
 * }
 * ```
 */
export function detectFixedTimeEntry(
  bars: Bar[],
  config: FixedTimeEntryConfig,
  direction: 'long' | 'short'
): Signal | null {
  if (bars.length === 0) {
    return null;
  }

  const lastBar = bars[bars.length - 1];
  const barTime = new Date(lastBar.timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false, // Use 24-hour format for comparison
  });

  if (barTime === config.time) {
    return {
      timestamp: lastBar.timestamp,
      price: lastBar.close, // Enter at the close of the bar that matches the time
      type: 'entry',
      direction: direction,
    };
  }

  return null;
}

/**
 * Creates the SQL query for the fixed time entry pattern based on the given configuration
 */
export function createSqlQuery(
  config: FixedTimeEntryConfig,
  _patternSpecificDirection: 'long' | 'short'
): string {
  const entryTime = config.time;

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
        strftime(column0, '%Y') as year,
        strftime(column0, '%H:%M') as bar_time
      FROM read_csv_auto('tickers/{ticker}/{timeframe}.csv', header=false)
      WHERE column0 >= '{from} 00:00:00'
        AND column0 <= '{to} 23:59:59'
    )
    SELECT
      timestamp as entry_time,
      trade_date,
      year,
      open as open_price_at_entry,
      close as entry_price,
      '{direction}' as direction
    FROM raw_data
    WHERE bar_time = '${entryTime}'
  `;
}

/**
 * Fixed Time Entry Pattern Definition
 *
 * This pattern triggers an entry at a specific time of day.
 *
 * @example
 * ```typescript
 * // Get pattern with custom configuration
 * const pattern = fixedTimeEntryPattern;
 * pattern.updateConfig({ time: "12:00" }); // Direction is handled globally or by strategy
 * ```
 */
export const fixedTimeEntryPattern: PatternDefinition & {
  config: FixedTimeEntryConfig;
  updateConfig: (newConfig: Partial<FixedTimeEntryConfig>) => PatternDefinition;
} = {
  name: 'Fixed Time Entry',
  description: 'Triggers an entry at a specific time of day.',
  config: {
    time: '12:00',
  },
  direction: 'long',
  sql: '',
  detect: (bars: Bar[], config: FixedTimeEntryConfig, direction: 'long' | 'short') =>
    detectFixedTimeEntry(bars, config, direction),
  updateConfig(newConfig: Partial<FixedTimeEntryConfig>) {
    const updatedConfig = { ...this.config, ...newConfig };
    // Ensure a defined direction for SQL query generation during config update.
    // The actual strategy execution might use a different direction passed at runtime.
    return {
      ...this,
      config: updatedConfig,
      sql: createSqlQuery(updatedConfig, this.direction ?? 'long'), // Pass a direction, though it will be ignored if placeholder used and replaced
    };
  },
};
