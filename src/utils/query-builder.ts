export interface QueryOptions {
  ticker: string;
  timeframe: string;
  from: string;
  to: string;
  entryPattern?: string;
  exitPattern?: string;
  risePct?: string;
  direction?: 'long' | 'short';
}

export const buildAnalysisQuery = (options: QueryOptions): string => {
  const { ticker, timeframe, from, to, risePct, direction } = options;

  // Use the rise percentage directly, defaulting to 0.3 if not specified
  const riseThreshold = (risePct ? parseFloat(risePct) : 0.3) / 100;
  const isShort = direction === 'short';

  // For both directions, we look for the same pattern - a quick rise
  // But for short, we enter at a different price
  const riseCondition = `((five_min_high - market_open) / market_open) >= ${riseThreshold}`;

  // For both directions, calculate the rise percentage the same way
  const risePctCalc = `((five_min_high - market_open) / market_open) as rise_pct`;

  // Entry price is different based on direction
  const entryPriceField = 'five_min_high'; // Both long and short use the same price point

  // Return calculation differs by direction
  const returnPctCalc = isShort
    ? `((entry_price - exit_price) / entry_price) as return_pct` // For shorts, price decrease = profit
    : `((exit_price - entry_price) / entry_price) as return_pct`; // For longs, price increase = profit

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
      WHERE strftime(r.timestamp, '%H:%M') = '09:45'  -- Get exactly 9:45am bar
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
        ${risePctCalc},
        ${returnPctCalc}
      FROM exit_prices
      WHERE ${riseCondition}
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
        ${
          isShort
            ? 'SUM(CASE WHEN t.return_pct < 0 THEN 1 ELSE 0 END)::FLOAT / COUNT(*)::FLOAT as win_rate'
            : 'SUM(CASE WHEN t.return_pct >= 0 THEN 1 ELSE 0 END)::FLOAT / COUNT(*)::FLOAT as win_rate'
        }
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
