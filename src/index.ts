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
import { buildAnalysisQuery } from './utils/query-builder.js';

interface AnalysisOptions {
  from: string;
  to: string;
  entryPattern?: string;
  exitPattern?: string;
  ticker: string;
  timeframe: string;
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
  .option('--ticker <symbol>', 'Ticker to analyze (default: SPY)', 'SPY')
  .option('--timeframe <period>', 'Data resolution (default: 1min)', '1min')
  .action(async (options: AnalysisOptions) => {
    try {
      // Get the appropriate patterns based on command line options
      const entryPattern = getEntryPattern(options.entryPattern || 'quick-rise');
      const exitPattern = getExitPattern(options.exitPattern || 'fixed-time');

      // Build and execute the query
      const query = buildAnalysisQuery(options);
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
        median_return: 0,
        std_dev_return: 0,
        win_rate: 0,
        winning_trades: 0,
      };

      let currentYear = '';
      let yearStats = null;
      let seenYears = new Set();
      let allReturns = [];

      for (const trade of trades) {
        // Update total return sum and win count
        totalStats.total_return_sum += trade.return_pct;
        if (trade.return_pct >= 0) {
          totalStats.winning_trades++;
        }
        allReturns.push(trade.return_pct);

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
            median_return: trade.median_return || 0,
            std_dev_return: trade.std_dev_return || 0,
            win_rate: trade.win_rate || 0,
          };
          printYearHeader(trade.year);

          // Only add trading days and match count once per year
          if (!seenYears.has(trade.year)) {
            seenYears.add(trade.year);
            totalStats.trading_days += trade.total_trading_days;
            totalStats.total_matches += trade.match_count;
          }
        }

        // Print trade details
        printTradeDetails(trade);
      }

      // Print the last year's summary
      if (yearStats) {
        printYearSummary(yearStats);
      }

      // Calculate final stats
      totalStats.win_rate =
        totalStats.total_matches > 0 ? totalStats.winning_trades / totalStats.total_matches : 0;
      totalStats.median_return =
        allReturns.length > 0
          ? allReturns.sort((a, b) => a - b)[Math.floor(allReturns.length / 2)]
          : 0;
      totalStats.std_dev_return =
        allReturns.length > 0
          ? Math.sqrt(
              allReturns.reduce(
                (acc, val) =>
                  acc + Math.pow(val - totalStats.total_return_sum / totalStats.total_matches, 2),
                0
              ) / allReturns.length
            )
          : 0;

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
