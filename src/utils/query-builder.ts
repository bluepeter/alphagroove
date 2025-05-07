interface QueryOptions {
  ticker: string;
  timeframe: string;
  from: string;
  to: string;
  entryPattern?: string;
  exitPattern?: string;
}

export const buildAnalysisQuery = (options: QueryOptions): string => {
  const { ticker, timeframe, from, to } = options;

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
    individual_trades AS (
      SELECT 
        trade_date,
        year,
        market_open,
        five_min_high as entry_price,
        exit_price,
        entry_time,
        exit_time,
        ((five_min_high - market_open) / market_open * 100) as rise_pct,
        ((exit_price - five_min_high) / five_min_high * 100) as return_pct
      FROM exit_prices
      WHERE (five_min_high - market_open) / market_open >= 0.003  -- 0.3% rise
    ),
    yearly_stats AS (
      SELECT 
        t.year,
        d.total_trading_days,
        COUNT(*) as match_count,
        MIN(t.rise_pct) as min_rise_pct,
        MAX(t.rise_pct) as max_rise_pct,
        AVG(t.rise_pct) as avg_rise_pct,
        MIN(t.return_pct) as min_return,
        MAX(t.return_pct) as max_return,
        AVG(t.return_pct) as avg_return
      FROM individual_trades t
      JOIN trading_days d ON t.year = d.year
      GROUP BY t.year, d.total_trading_days
    )
    SELECT 
      t.*,
      y.total_trading_days,
      y.match_count,
      y.min_rise_pct,
      y.max_rise_pct,
      y.avg_rise_pct,
      y.min_return,
      y.max_return,
      y.avg_return
    FROM individual_trades t
    JOIN yearly_stats y ON t.year = y.year
    ORDER BY t.trade_date, t.entry_time;`;
};
