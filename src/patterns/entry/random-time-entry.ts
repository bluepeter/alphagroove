import { PatternDefinition } from '../types';
import { Bar } from '../../utils/calculations';

export interface RandomTimeEntryConfig {
  startTime: string; // e.g., "09:30"
  endTime: string; // e.g., "15:30"
}

/**
 * Generates a random time between startTime and endTime for each trading day
 */
export const generateRandomTimeForDay = (
  date: string,
  startTime: string,
  endTime: string
): string => {
  // Use date as seed for consistent randomness per day
  const dateHash = date.split('-').reduce((acc, part) => acc + parseInt(part, 10), 0);
  const seed = dateHash * 9301 + 49297; // Simple LCG parameters
  const random = (seed % 233280) / 233280; // Normalize to [0, 1)

  // Parse start and end times
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);

  // Convert to minutes from midnight
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  // Generate random time within range
  const randomMinutes = Math.floor(startMinutes + random * (endMinutes - startMinutes));

  // Convert back to HH:MM format
  const hours = Math.floor(randomMinutes / 60);
  const minutes = randomMinutes % 60;

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

/**
 * Creates SQL query for random time entry detection
 * This query calculates a deterministic random time for each trading day
 */
export const createSqlQuery = (config: RandomTimeEntryConfig, direction: string): string => {
  // Parse start and end times to get minute ranges
  const [startHour, startMin] = config.startTime.split(':').map(Number);
  const [endHour, endMin] = config.endTime.split(':').map(Number);
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  const timeRangeMinutes = endMinutes - startMinutes;

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
    ),
    trading_days AS (
      SELECT 
        year,
        COUNT(DISTINCT trade_date) as total_trading_days
      FROM raw_data
      WHERE strftime(timestamp, '%H:%M') = '09:30'
        AND strftime(timestamp, '%w') NOT IN ('0', '6')
      GROUP BY year
    ),
    total_trading_days AS (
      SELECT SUM(total_trading_days) as total_trading_days
      FROM trading_days
    ),
    daily_random_times AS (
      SELECT DISTINCT
        trade_date,
        year,
        -- Calculate deterministic random time for each day
        -- Use date hash as seed for consistent randomness per day
        (
          CAST(SUBSTR(trade_date, 1, 4) AS INTEGER) + 
          CAST(SUBSTR(trade_date, 6, 2) AS INTEGER) + 
          CAST(SUBSTR(trade_date, 9, 2) AS INTEGER)
        ) * 9301 + 49297 AS date_seed,
        -- Calculate random minutes within the specified range
        ${startMinutes} + ((
          CAST(SUBSTR(trade_date, 1, 4) AS INTEGER) + 
          CAST(SUBSTR(trade_date, 6, 2) AS INTEGER) + 
          CAST(SUBSTR(trade_date, 9, 2) AS INTEGER)
        ) * 9301 + 49297) % ${timeRangeMinutes} AS random_minutes,
        -- Convert random minutes back to HH:MM format
        LPAD(CAST((${startMinutes} + ((
            CAST(SUBSTR(trade_date, 1, 4) AS INTEGER) + 
            CAST(SUBSTR(trade_date, 6, 2) AS INTEGER) + 
            CAST(SUBSTR(trade_date, 9, 2) AS INTEGER)
          ) * 9301 + 49297) % ${timeRangeMinutes}) / 60 AS VARCHAR), 2, '0') || ':' ||
        LPAD(CAST((${startMinutes} + ((
            CAST(SUBSTR(trade_date, 1, 4) AS INTEGER) + 
            CAST(SUBSTR(trade_date, 6, 2) AS INTEGER) + 
            CAST(SUBSTR(trade_date, 9, 2) AS INTEGER)
          ) * 9301 + 49297) % ${timeRangeMinutes}) % 60 AS VARCHAR), 2, '0') AS random_time
      FROM raw_data
    ),
    entry_signals AS (
      SELECT 
        r.trade_date,
        r.year,
        r.open as market_open,
        r.close as entry_price,
        r.timestamp as entry_time,
        0.0 as pattern_pct_change,
        '${direction}' as direction
      FROM raw_data r
      JOIN daily_random_times drt ON r.trade_date = drt.trade_date
      WHERE r.bar_time = drt.random_time
    )
    SELECT 
      es.*,
      td.total_trading_days,
      ttd.total_trading_days as all_trading_days
    FROM entry_signals es
    LEFT JOIN trading_days td ON es.year = td.year
    CROSS JOIN total_trading_days ttd
    ORDER BY es.trade_date, es.entry_time
  `;
};

/**
 * Detects random time entry signals
 */
export const detectRandomTimeEntry = (
  bars: Bar[],
  config: RandomTimeEntryConfig,
  direction: 'long' | 'short',
  targetDate?: string
): Bar | null => {
  if (!bars || bars.length === 0) return null;

  // If targetDate is provided, generate random time for that specific date
  let randomTime: string;
  if (targetDate) {
    randomTime = generateRandomTimeForDay(targetDate, config.startTime, config.endTime);
  } else {
    // Fallback: use first bar's date
    const firstBarDate = bars[0].timestamp.split(' ')[0];
    randomTime = generateRandomTimeForDay(firstBarDate, config.startTime, config.endTime);
  }

  // Find the bar that matches the random time
  for (const bar of bars) {
    const barTime = bar.timestamp.split(' ')[1].substring(0, 5); // Extract HH:MM
    if (barTime === randomTime) {
      return bar;
    }
  }

  return null;
};

/**
 * Random Time Entry Pattern Definition
 */
export const randomTimeEntryPattern: PatternDefinition & {
  config: RandomTimeEntryConfig;
  updateConfig: (newConfig: Partial<RandomTimeEntryConfig>) => PatternDefinition;
} = {
  name: 'Random Time Entry',
  description: 'Triggers an entry at a random time each trading day within specified hours.',
  config: {
    startTime: '09:30', // Market open
    endTime: '15:30', // 30 minutes before close
  },
  direction: 'long',
  sql: '',
  updateConfig(newConfig: Partial<RandomTimeEntryConfig> & Record<string, any>) {
    const updatedConfig = { ...this.config };

    // Handle 'start-time' and 'startTime' keys
    if ('start-time' in newConfig && newConfig['start-time']) {
      updatedConfig.startTime = newConfig['start-time'] as string;
    } else if (newConfig.startTime) {
      updatedConfig.startTime = newConfig.startTime;
    }

    // Handle 'end-time' and 'endTime' keys
    if ('end-time' in newConfig && newConfig['end-time']) {
      updatedConfig.endTime = newConfig['end-time'] as string;
    } else if (newConfig.endTime) {
      updatedConfig.endTime = newConfig.endTime;
    }

    // Validate time format
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(updatedConfig.startTime)) {
      throw new Error('startTime must be in HH:MM format');
    }
    if (!timeRegex.test(updatedConfig.endTime)) {
      throw new Error('endTime must be in HH:MM format');
    }

    // Validate that start time is before end time
    const [startHour, startMin] = updatedConfig.startTime.split(':').map(Number);
    const [endHour, endMin] = updatedConfig.endTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    if (startMinutes >= endMinutes) {
      throw new Error('startTime must be before endTime');
    }

    return {
      ...this,
      config: updatedConfig,
      sql: createSqlQuery(updatedConfig, this.direction ?? 'long'),
    };
  },
};
