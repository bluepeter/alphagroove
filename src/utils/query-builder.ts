import { PatternDefinition } from '../patterns/types.js';
import { MergedConfig } from './config'; // Import MergedConfig type

// Remove QueryOptions if it's no longer used or replace its usages with MergedConfig
// export interface QueryOptions { ... }

// Config format used by the new configuration system - REMOVED as it's imported
// export type MergedConfig = Record<string, any>;

export const buildAnalysisQuery = (
  options: MergedConfig,
  entryPatternDefinition: PatternDefinition,
  _exitPatternDefinition: PatternDefinition
): string => {
  const { ticker, timeframe, from, to } = options;

  // Determine the base direction for SQL query calculations.
  // If 'llm_decides', SQL will calculate as if for 'long', and JS will adjust if LLM chooses 'short'.
  const sqlQueryBaseDirection: 'long' | 'short' =
    options.direction === 'llm_decides' ? 'long' : options.direction;

  const entryPatternName = entryPatternDefinition.name;

  // Extract exit strategy configurations
  const exitStrategies = options.exitStrategies || { enabled: ['maxHoldTime'] };
  const enabledExitStrategies = exitStrategies.enabled || ['maxHoldTime'];

  // Determine hold minutes from the exitStrategies config
  let holdMinutes = 60; // Default
  if (
    enabledExitStrategies.includes('maxHoldTime') &&
    exitStrategies.maxHoldTime &&
    typeof exitStrategies.maxHoldTime.minutes === 'number'
  ) {
    holdMinutes = exitStrategies.maxHoldTime.minutes;
  } else if (enabledExitStrategies.includes('maxHoldTime')) {
    console.warn(
      'Warning: maxHoldTime is enabled but minutes not configured properly. Using default 60 minutes.'
    );
  }

  // Interpolate common values into the entry pattern's SQL
  const entrySql = entryPatternDefinition.sql
    .replace(/{ticker}/g, ticker)
    .replace(/{timeframe}/g, timeframe)
    .replace(/{from}/g, from)
    .replace(/{to}/g, to)
    .replace(/{direction}/g, sqlQueryBaseDirection); // Use sqlQueryBaseDirection

  if (entryPatternName === 'Fixed Time Entry') {
    // Logic for Fixed Time Entry
    // It already produces entry_time, trade_date, year, entry_price, direction
    // We need to calculate exit_time and join for exit_price

    const returnPctCalc =
      sqlQueryBaseDirection === 'short'
        ? `((entry_price - exit_price) / entry_price) as return_pct`
        : `((exit_price - entry_price) / entry_price) as return_pct`;

    return `
      WITH raw_data_for_exit AS (
        SELECT 
          column0::TIMESTAMP as timestamp,
          column1::DOUBLE as open,
          column2::DOUBLE as high,
          column3::DOUBLE as low,
          column4::DOUBLE as close,
          column5::BIGINT as volume,
          strftime(column0, '%Y-%m-%d') as trade_date,
          strftime(column0, '%Y') as year
        FROM read_csv_auto('tickers/${ticker}/${timeframe}.csv', header=false)
        WHERE column0 >= '${from} 00:00:00'
          AND column0 <= '${to} 23:59:59'
      ),
      entry_signals AS (
        ${entrySql} -- This is the SQL from FixedTimeEntryPattern
      ),
      exit_times AS (
        SELECT
          es.*,
          es.entry_time + INTERVAL '${holdMinutes} minutes' as calculated_exit_timestamp
        FROM entry_signals es
      ),
      exit_prices AS (
        SELECT 
          et.*,
          rd.close as exit_price,
          rd.timestamp as exit_time
        FROM exit_times et
        JOIN raw_data_for_exit rd ON et.trade_date = rd.trade_date 
          AND rd.timestamp = (
            SELECT MIN(rde.timestamp) 
            FROM raw_data_for_exit rde 
            WHERE rde.trade_date = et.trade_date AND rde.timestamp >= et.calculated_exit_timestamp
          ) -- Find first bar at or after calculated_exit_timestamp
        WHERE rd.timestamp <= (et.entry_time + INTERVAL '1 day') -- Ensure exit is on same or next day if market closes
      ),
      individual_trades AS (
        SELECT 
          ep.trade_date,
          ep.year,
          ep.open_price_at_entry as market_open,
          ep.entry_price,
          ep.exit_price,
          ep.entry_time,
          ep.exit_time,
          NULL as rise_pct,
          ${returnPctCalc},
          ep.direction as direction
        FROM exit_prices ep
      ),
      trading_days AS (
        SELECT 
          year,
          COUNT(DISTINCT trade_date) as total_trading_days
        FROM raw_data_for_exit -- Use the broader raw_data for this count
        WHERE strftime(timestamp, '%w') NOT IN ('0', '6') AND strftime(timestamp, '%H:%M') = '09:30' -- Count actual trading days
        GROUP BY year
      ),
      total_trading_days AS (
        SELECT SUM(total_trading_days) as total_trading_days FROM trading_days
      ),
      yearly_stats AS (
        SELECT 
          t.year,
          COALESCE(td.total_trading_days, 0) as total_trading_days,
          COALESCE(ttd.total_trading_days, 0) as all_trading_days,
          COUNT(*) as match_count,
          MIN(t.rise_pct * 100) as min_rise_pct, -- Will be 0
          MAX(t.rise_pct * 100) as max_rise_pct, -- Will be 0
          AVG(t.rise_pct * 100) as avg_rise_pct, -- Will be 0
          MIN(t.return_pct * 100) as min_return,
          MAX(t.return_pct * 100) as max_return,
          AVG(t.return_pct * 100) as avg_return,
          MEDIAN(t.return_pct * 100) as median_return,
          CASE WHEN COUNT(*) > 1 THEN STDDEV(t.return_pct * 100) ELSE 0 END as std_dev_return,
          SUM(CASE WHEN t.return_pct >= 0 THEN 1 ELSE 0 END)::FLOAT / COUNT(*)::FLOAT as win_rate
        FROM individual_trades t
        LEFT JOIN trading_days td ON t.year = td.year
        CROSS JOIN total_trading_days ttd -- Might need a fallback if no trading_days
        GROUP BY t.year, td.total_trading_days, ttd.total_trading_days
      )
      SELECT 
        t.*,
        COALESCE(y.total_trading_days, (SELECT total_trading_days FROM total_trading_days LIMIT 1), 0) as total_trading_days, -- Fallback for total_trading_days
        COALESCE(y.all_trading_days, (SELECT total_trading_days FROM total_trading_days LIMIT 1), 0) as all_trading_days,   -- Fallback for all_trading_days
        y.match_count,
        y.min_rise_pct,
        y.max_rise_pct,
        y.avg_rise_pct,
        y.min_return,
        y.max_return,
        y.avg_return,
        y.median_return,
        y.std_dev_return,
        y.win_rate
      FROM individual_trades t
      LEFT JOIN yearly_stats y ON t.year = y.year
      ORDER BY t.trade_date, t.entry_time;
    `;
  }

  // --- Quick Rise/Quick Fall Logic ---
  const isQuickFall = entryPatternName === 'Quick Fall'; // Adjusted to use name

  let threshold = 0.3;
  if (isQuickFall) {
    if (options['quick-fall'] && options['quick-fall']['fall-pct']) {
      threshold = options['quick-fall']['fall-pct'];
    } else if (options.fallPct !== undefined) {
      threshold = parseFloat(options.fallPct as string);
    }
  } else {
    // Assuming Quick Rise or other future patterns that might use rise-pct
    if (options['quick-rise'] && options['quick-rise']['rise-pct']) {
      threshold = options['quick-rise']['rise-pct'];
    } else if (options.risePct !== undefined) {
      threshold = parseFloat(options.risePct as string);
    }
  }
  threshold = threshold / 100;

  let patternCondition, patternPctCalc, entryPriceField;
  if (isQuickFall) {
    patternCondition = `((market_open - five_min_low) / market_open) >= ${threshold}`;
    patternPctCalc = `((market_open - five_min_low) / market_open) as rise_pct`;
    entryPriceField = 'five_min_low';
  } else {
    patternCondition = `((five_min_high - market_open) / market_open) >= ${threshold}`;
    patternPctCalc = `((five_min_high - market_open) / market_open) as rise_pct`;
    entryPriceField = 'five_min_high';
  }

  const entryHour = 9;
  const entryMinute = 35;
  let exitHour = entryHour;
  let exitMinute = entryMinute + parseInt(String(holdMinutes), 10);
  if (exitMinute >= 60) {
    exitHour += Math.floor(exitMinute / 60);
    exitMinute = exitMinute % 60;
  }
  const exitTimeString = `${exitHour.toString().padStart(2, '0')}:${exitMinute.toString().padStart(2, '0')}`;

  const returnPctCalc =
    sqlQueryBaseDirection === 'short'
      ? `((entry_price - exit_price) / entry_price) as return_pct`
      : `((exit_price - entry_price) / entry_price) as return_pct`;

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
      FROM read_csv_auto('tickers/${ticker}/${timeframe}.csv', header=false)
      WHERE column0 >= '${from} 00:00:00'
        AND column0 <= '${to} 23:59:59'
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
    ),
    exit_prices AS (
      SELECT 
        f.trade_date,
        f.year,
        f.market_open,
        f.five_min_high,
        f.five_min_low,
        f.entry_time,
        r.close as exit_price,
        r.timestamp as exit_time
      FROM five_min_prices f
      JOIN raw_data r ON f.trade_date = r.trade_date
      WHERE strftime(r.timestamp, '%H:%M') = '${exitTimeString}'
    ),
    individual_trades AS (
      SELECT 
        trade_date,
        year,
        market_open,
        ${entryPriceField} as entry_price,
        exit_price,
        entry_time,
        exit_time,
        ${patternPctCalc},
        ${returnPctCalc},
        '${sqlQueryBaseDirection}' as direction
      FROM exit_prices
      WHERE ${patternCondition}
    ),
    yearly_stats AS (
      SELECT 
        t.year,
        d.total_trading_days,
        ttd.total_trading_days as all_trading_days,
        COUNT(*) as match_count,
        MIN(t.rise_pct * 100) as min_rise_pct,
        MAX(t.rise_pct * 100) as max_rise_pct,
        AVG(t.rise_pct * 100) as avg_rise_pct,
        MIN(t.return_pct * 100) as min_return,
        MAX(t.return_pct * 100) as max_return,
        AVG(t.return_pct * 100) as avg_return,
        MEDIAN(t.return_pct * 100) as median_return,
        CASE WHEN COUNT(*) > 1 THEN STDDEV(t.return_pct * 100) ELSE 0 END as std_dev_return,
        SUM(CASE WHEN t.return_pct >= 0 THEN 1 ELSE 0 END)::FLOAT / COUNT(*)::FLOAT as win_rate
      FROM individual_trades t
      JOIN trading_days d ON t.year = d.year
      CROSS JOIN total_trading_days ttd
      GROUP BY t.year, d.total_trading_days, ttd.total_trading_days
    )
    SELECT 
      t.*,
      y.total_trading_days,
      y.all_trading_days,
      y.match_count,
      y.min_rise_pct,
      y.max_rise_pct,
      y.avg_rise_pct,
      y.min_return,
      y.max_return,
      y.avg_return,
      y.median_return,
      y.std_dev_return,
      y.win_rate
    FROM individual_trades t
    JOIN yearly_stats y ON t.year = y.year
    ORDER BY t.trade_date, t.entry_time;
  `;
};
