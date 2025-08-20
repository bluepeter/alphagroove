import { PatternDefinition } from '../patterns/types.js';
import { MergedConfig } from './config'; // Import MergedConfig type

/**
 * Build entry signals query without exit calculations
 * All exit logic is now handled in JavaScript using bar-by-bar data
 */
export const buildAnalysisQuery = (
  options: MergedConfig,
  entryPatternDefinition: PatternDefinition
): string => {
  const { ticker, timeframe, from, to } = options;

  // Determine the base direction for SQL query calculations.
  // If 'llm_decides', SQL will calculate as if for 'long', and JS will adjust if LLM chooses 'short'.
  const sqlQueryBaseDirection: 'long' | 'short' =
    options.direction === 'llm_decides' ? 'long' : options.direction;

  const entryPatternName = entryPatternDefinition.name;

  // Interpolate common values into the entry pattern's SQL
  const entrySql = entryPatternDefinition.sql
    .replace(/{ticker}/g, ticker)
    .replace(/{timeframe}/g, timeframe)
    .replace(/{from}/g, from)
    .replace(/{to}/g, to)
    .replace(/{direction}/g, sqlQueryBaseDirection);

  if (entryPatternName === 'Fixed Time Entry') {
    // Logic for Fixed Time Entry - only get entry signals
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
      entry_signals AS (
        ${entrySql} -- This is the SQL from FixedTimeEntryPattern
      ),
      trading_days AS (
        SELECT 
          year,
          COUNT(DISTINCT trade_date) as total_trading_days
        FROM raw_data
        WHERE strftime(timestamp, '%w') NOT IN ('0', '6') AND strftime(timestamp, '%H:%M') = '09:30'
        GROUP BY year
      ),
      total_trading_days AS (
        SELECT SUM(total_trading_days) as total_trading_days FROM trading_days
      )
      SELECT 
        es.trade_date,
        es.year,
        es.open_price_at_entry as market_open,
        es.entry_price,
        es.entry_time,
        NULL as rise_pct,
        es.direction as direction,
        COALESCE(td.total_trading_days, 0) as total_trading_days,
        COALESCE(ttd.total_trading_days, 0) as all_trading_days
      FROM entry_signals es
      LEFT JOIN trading_days td ON es.year = td.year
      CROSS JOIN total_trading_days ttd
      ORDER BY es.trade_date, es.entry_time;
    `;
  }

  if (entryPatternName === 'Random Time Entry') {
    // Random Time Entry pattern has self-contained SQL with all required fields
    // Just return the interpolated SQL directly
    return entrySql;
  }

  // --- Quick Rise/Quick Fall Logic ---
  const isQuickFall = entryPatternName === 'Quick Fall';

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
    entry_signals AS (
      SELECT 
        trade_date,
        year,
        market_open,
        ${entryPriceField} as entry_price,
        entry_time,
        ${patternPctCalc},
        '${sqlQueryBaseDirection}' as direction
      FROM five_min_prices
      WHERE ${patternCondition}
    )
    SELECT 
      es.*,
      td.total_trading_days,
      ttd.total_trading_days as all_trading_days
    FROM entry_signals es
    LEFT JOIN trading_days td ON es.year = td.year
    CROSS JOIN total_trading_days ttd
    ORDER BY es.trade_date, es.entry_time;
  `;
};
