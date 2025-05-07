#!/usr/bin/env node

import { execSync } from 'child_process';

import { Command } from 'commander';

import { getEntryPattern, getExitPattern } from './patterns/pattern-factory.js';
import {
  printHeader,
  printYearHeader,
  printTradeDetails,
  printYearSummary,
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

      const result = execSync(`duckdb -json -c "${query}"`, {
        encoding: 'utf-8',
        maxBuffer: 100 * 1024 * 1024,
      });

      const trades = JSON.parse(result);

      // Print header
      printHeader(entryPattern.name, exitPattern.name, options.from, options.to);

      // Process and display trades by year
      let totalStats = {
        trading_days: 0,
        total_matches: 0,
        total_return_sum: 0,
      };

      let currentYear = '';
      let yearStats = null;
      let seenYears = new Set();

      for (const trade of trades) {
        // If we're starting a new year, print the previous year's summary
        if (trade.year !== currentYear) {
          if (yearStats) {
            printYearSummary(yearStats);
          }
          currentYear = trade.year;
          yearStats = {
            year: trade.year,
            trading_days: trade.total_trading_days,
            match_count: trade.match_count,
            min_rise_pct: trade.min_rise_pct,
            max_rise_pct: trade.max_rise_pct,
            avg_rise_pct: trade.avg_rise_pct,
            min_return: trade.min_return,
            max_return: trade.max_return,
            avg_return: trade.avg_return,
          };
          printYearHeader(trade.year);

          // Only add trading days and match count once per year
          if (!seenYears.has(trade.year)) {
            seenYears.add(trade.year);
            totalStats.trading_days += trade.total_trading_days;
            totalStats.total_matches += trade.match_count;
          }
        }

        // Update total return sum
        totalStats.total_return_sum += trade.return_pct;

        // Print trade details
        printTradeDetails(trade);
      }

      // Print the last year's summary
      if (yearStats) {
        printYearSummary(yearStats);
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
