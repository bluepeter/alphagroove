#!/usr/bin/env node

import { execSync } from 'child_process';
import { Command } from 'commander';
import { getEntryPattern, getExitPattern } from './patterns/pattern-factory.js';
import {
  printHeader,
  printYearlySummary,
  printOverallSummary,
  printFooter,
} from './utils/output.js';

interface AnalysisOptions {
  from: string;
  to: string;
  entryPattern?: string;
  exitPattern?: string;
}

const program = new Command();

program
  .name('alphagroove')
  .description(
    'A command-line research and strategy toolkit for exploring intraday trading patterns'
  )
  .version('0.1.0')
  .requiredOption('--from <date>', 'Start date (YYYY-MM-DD)')
  .requiredOption('--to <date>', 'End date (YYYY-MM-DD)')
  .option('--entry-pattern <pattern>', 'Entry pattern to use (default: quick-rise)', 'quick-rise')
  .option('--exit-pattern <pattern>', 'Exit pattern to use (default: fixed-time)', 'fixed-time')
  .action(async (options: AnalysisOptions) => {
    try {
      // Get the appropriate patterns based on command line options
      const entryPattern = getEntryPattern(options.entryPattern || 'quick-rise');
      const exitPattern = getExitPattern(options.exitPattern || 'fixed-time');

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
            MIN(timestamp) as day_start,
            MAX(timestamp) as day_end
          FROM raw_data
          WHERE strftime(timestamp, '%H:%M') BETWEEN '09:30' AND '16:00'  -- Only count regular market hours
          GROUP BY trade_date, year
        ),
        yearly_stats AS (
          SELECT 
            year,
            SUM(bar_count) as total_bars,  -- Sum the daily bar counts
            COUNT(DISTINCT trade_date) as trading_days,
            MIN(day_low) as min_price,
            MAX(day_high) as max_price,
            SUM(day_volume) as total_volume,
            MIN(day_start) as first_bar,
            MAX(day_end) as last_bar
          FROM daily_stats
          GROUP BY year
        ),
        pattern_matches AS (
          ${entryPattern.sql}
        )
        SELECT 
          y.year,
          y.trading_days,
          COALESCE(p.match_count, 0) as match_count,
          p.min_rise_pct,
          p.max_rise_pct,
          p.avg_rise_pct,
          p.min_return,
          p.max_return,
          p.avg_return
        FROM yearly_stats y
        LEFT JOIN pattern_matches p ON y.year = p.year
        ORDER BY y.year;`;

      const result = execSync(`duckdb -json -c "${query}"`, {
        encoding: 'utf-8',
        maxBuffer: 100 * 1024 * 1024,
      });

      const yearlyStats = JSON.parse(result);

      // Print header
      printHeader(entryPattern.name, exitPattern.name, options.from, options.to);

      // Process and display results by year
      let totalStats = {
        trading_days: 0,
        total_matches: 0,
        total_return_sum: 0,
      };

      for (const stats of yearlyStats) {
        // Update total statistics
        totalStats.trading_days += stats.trading_days;
        totalStats.total_matches += stats.match_count;
        if (stats.match_count > 0) {
          totalStats.total_return_sum += stats.avg_return * stats.match_count;
        }

        // Print yearly summary
        printYearlySummary(stats);
      }

      // Print overall summary
      printOverallSummary(totalStats);

      // Print footer
      printFooter();
    } catch (error) {
      console.error('Error during analysis:', error);
      if (error instanceof Error) {
        console.error('Error details:', error.message);
        console.error('Stack trace:', error.stack);
      }
      process.exit(1);
    }
  });

program.parse();
