#!/usr/bin/env node

import { execSync } from 'child_process';

import { Command } from 'commander';

import { quickRisePattern } from './patterns/entry/quick-rise.js';
import { fixedTimeExitPattern } from './patterns/exit/fixed-time.js';

interface ReadSpyOptions {
  from: string;
  to: string;
}

const program = new Command();

program
  .name('alphagroove')
  .description(
    'A command-line research and strategy toolkit for exploring intraday trading patterns'
  )
  .version('0.1.0');

program
  .command('read-spy')
  .description('Read SPY data with date filtering')
  .requiredOption('--from <date>', 'Start date (YYYY-MM-DD)')
  .requiredOption('--to <date>', 'End date (YYYY-MM-DD)')
  .action(async (options: ReadSpyOptions) => {
    try {
      // First, get the statistics and pattern matches from DuckDB
      const query = `
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
          FROM read_csv_auto('tickers/SPY/SPY_full_1min_adjsplit.csv', header=false)
          WHERE column0 >= '${options.from} 00:00:00'
            AND column0 <= '${options.to} 23:59:59'
        ),
        daily_stats AS (
          SELECT 
            trade_date,
            year,
            COUNT(*) as bar_count,
            MIN(low) as day_low,
            MAX(high) as day_high,
            SUM(volume) as day_volume,
            ((MAX(high) - MIN(low)) / MIN(low) * 100) as day_range_pct,
            MIN(timestamp) as day_start,
            MAX(timestamp) as day_end
          FROM raw_data
          GROUP BY trade_date, year
        ),
        yearly_stats AS (
          SELECT 
            year,
            COUNT(*) as total_bars,
            COUNT(DISTINCT trade_date) as trading_days,
            MIN(day_low) as min_price,
            MAX(day_high) as max_price,
            SUM(day_volume) as total_volume,
            AVG(day_range_pct) as avg_daily_range,
            COUNT(CASE WHEN day_range_pct > 1.0 THEN 1 END) as significant_move_days,
            MIN(day_start) as first_bar,
            MAX(day_end) as last_bar
          FROM daily_stats
          GROUP BY year
        ),
        price_changes AS (
          SELECT 
            timestamp,
            open,
            close,
            trade_date,
            year,
            MIN(open) OVER (
              ORDER BY timestamp ASC 
              ROWS BETWEEN 4 PRECEDING AND CURRENT ROW
            ) as min_open_5min,
            LEAD(close, 10) OVER (
              PARTITION BY trade_date 
              ORDER BY timestamp
            ) as exit_price,
            LEAD(timestamp, 10) OVER (
              PARTITION BY trade_date 
              ORDER BY timestamp
            ) as exit_time
          FROM raw_data
        ),
        pattern_matches AS (
          ${quickRisePattern.sql}
        )
        SELECT 
          y.year,
          y.total_bars,
          y.trading_days,
          y.min_price,
          y.max_price,
          y.total_volume,
          y.avg_daily_range,
          y.significant_move_days,
          y.first_bar,
          y.last_bar,
          COALESCE(p.match_count, 0) as match_count,
          COALESCE(p.total_returns, 0) as total_returns
        FROM yearly_stats y
        LEFT JOIN pattern_matches p ON y.year = p.year
        ORDER BY y.year;
      `;

      const result = execSync(`duckdb -json -c "${query}"`, {
        encoding: 'utf-8',
        maxBuffer: 100 * 1024 * 1024,
      });
      const yearlyStats = JSON.parse(result);

      // Process and display results by year
      console.log(`\nSPY Analysis (${options.from} to ${options.to}):`);
      console.log(`Entry Pattern: ${quickRisePattern.name}`);
      console.log(`Exit Pattern: ${fixedTimeExitPattern.name}`);

      let totalStats = {
        total_bars: 0,
        trading_days: 0,
        min_price: Infinity,
        max_price: -Infinity,
        total_volume: 0,
        avg_daily_range: 0,
        significant_move_days: 0,
        total_matches: 0,
        total_returns: 0,
      };

      for (const stats of yearlyStats) {
        // Update total statistics
        totalStats.total_bars += stats.total_bars;
        totalStats.trading_days += stats.trading_days;
        totalStats.min_price = Math.min(totalStats.min_price, stats.min_price);
        totalStats.max_price = Math.max(totalStats.max_price, stats.max_price);
        totalStats.total_volume += stats.total_volume;
        totalStats.avg_daily_range += stats.avg_daily_range * stats.trading_days; // Weighted average
        totalStats.significant_move_days += stats.significant_move_days;
        totalStats.total_matches += stats.match_count;
        totalStats.total_returns += stats.total_returns;

        console.log(`\n${stats.year} Summary:`);
        console.log(`Total bars: ${stats.total_bars}`);
        console.log(`Trading days: ${stats.trading_days}`);
        console.log(`Price range: $${stats.min_price.toFixed(2)} - $${stats.max_price.toFixed(2)}`);
        console.log(`Average daily range: ${stats.avg_daily_range.toFixed(2)}%`);
        console.log(
          `Days with >1% range: ${stats.significant_move_days} (${((stats.significant_move_days / stats.trading_days) * 100).toFixed(1)}% of days)`
        );
        console.log(`Pattern matches: ${stats.match_count}`);
        if (stats.match_count > 0) {
          const avgReturn = stats.total_returns / stats.match_count;
          console.log(`Average pattern return: ${avgReturn.toFixed(2)}%`);
        }
      }

      // Display overall statistics
      console.log('\nOverall Summary:');
      console.log(`Total bars: ${totalStats.total_bars}`);
      console.log(`Trading days: ${totalStats.trading_days}`);
      console.log(
        `Price range: $${totalStats.min_price.toFixed(2)} - $${totalStats.max_price.toFixed(2)}`
      );
      console.log(
        `Average daily range: ${(totalStats.avg_daily_range / totalStats.trading_days).toFixed(2)}%`
      );
      console.log(
        `Days with >1% range: ${totalStats.significant_move_days} (${((totalStats.significant_move_days / totalStats.trading_days) * 100).toFixed(1)}% of days)`
      );
      console.log(`Total pattern matches: ${totalStats.total_matches}`);
      if (totalStats.total_matches > 0) {
        console.log(
          `Overall average return: ${(totalStats.total_returns / totalStats.total_matches).toFixed(2)}%`
        );
      }

      // Note about detailed matches
      console.log('\nNote: Run with a shorter date range to see detailed pattern matches.');
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

program.parse();
