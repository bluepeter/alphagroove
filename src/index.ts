#!/usr/bin/env node

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';

import { Command } from 'commander';

import { getEntryPattern, getExitPattern } from './patterns/pattern-factory.js';
import {
  printHeader,
  printTradeDetails,
  printYearSummary,
  printOverallSummary,
  printFooter,
  Trade,
} from './utils/output.js';
import { buildAnalysisQuery } from './utils/query-builder.js';

interface AnalysisOptions {
  from: string;
  to: string;
  entryPattern?: string;
  exitPattern?: string;
  ticker: string;
  timeframe: string;
  risePct?: string;
  direction?: 'long' | 'short';
}

interface TotalStats {
  total_trading_days: number;
  total_matches: number;
  total_return_sum: number;
  median_return: number;
  std_dev_return: number;
  win_rate: number;
  winning_trades: number;
}

const program = new Command();

program
  .name('alphagroove')
  .description(
    'A command-line research and strategy toolkit for exploring intraday trading patterns'
  )
  .version('0.1.0')
  .option('--from <date>', 'Start date (YYYY-MM-DD)', '2010-01-01')
  .option('--to <date>', 'End date (YYYY-MM-DD)', '2025-12-31')
  .option('--entry-pattern <pattern>', 'Entry pattern to use (default: quick-rise)', 'quick-rise')
  .option('--exit-pattern <pattern>', 'Exit pattern to use (default: fixed-time)', 'fixed-time')
  .option('--ticker <symbol>', 'Ticker to analyze (default: SPY)', 'SPY')
  .option('--timeframe <period>', 'Data resolution (default: 1min)', '1min')
  .option(
    '--rise-pct <number>',
    'Minimum rise percentage for quick-rise pattern (default: 0.3). Example: --rise-pct 0.5 for 0.5% rise',
    '0.3'
  )
  .option(
    '--direction <direction>',
    'Trading direction - long for price rises, short for price falls (default: long)',
    'long'
  )
  .action(async (options: AnalysisOptions) => {
    try {
      // Get the appropriate patterns based on command line options
      const entryPattern = getEntryPattern(options.entryPattern || 'quick-rise', {
        'quick-rise': {
          percentIncrease: parseFloat(options.risePct || '0.3'),
          direction: options.direction as 'long' | 'short',
        },
      });
      const exitPattern = getExitPattern(options.exitPattern || 'fixed-time');

      // Build and execute the query
      const query = buildAnalysisQuery(options);

      // Write query to a temporary file
      const tempFile = join(process.cwd(), 'temp_query.sql');
      writeFileSync(tempFile, query, 'utf-8');

      // Execute the query and get CSV output
      const result = execSync(`duckdb -csv -header < ${tempFile}`, {
        encoding: 'utf-8',
        maxBuffer: 100 * 1024 * 1024,
      });

      // Clean up temporary file
      if (existsSync(tempFile)) {
        unlinkSync(tempFile);
      }

      // Parse CSV output
      const [header, ...lines] = result.trim().split('\n');
      const columns = header.split(',');
      const trades = lines.map(line => {
        const values = line.split(',');
        return columns.reduce(
          (obj, col, i) => {
            const value = values[i];
            obj[col] = isNaN(Number(value)) ? value : Number(value);
            return obj;
          },
          {} as Record<string, string | number>
        );
      });

      // Print header
      printHeader(
        options.ticker,
        options.from,
        options.to,
        entryPattern.name,
        exitPattern.name,
        entryPattern.direction
      );

      // Process and display trades by year
      let totalStats: TotalStats = {
        total_trading_days: 0,
        total_matches: 0,
        total_return_sum: 0,
        median_return: 0,
        std_dev_return: 0,
        win_rate: 0,
        winning_trades: 0,
      };

      let currentYear = '';
      let yearTrades: Trade[] = [];
      let seenYears = new Set();
      let allReturns: number[] = [];

      // Get total trading days from first trade (all trades will have the same value)
      if (trades.length > 0) {
        totalStats.total_trading_days = trades[0].all_trading_days as number;
      }

      for (const trade of trades) {
        // Update total return sum and win count
        totalStats.total_return_sum += trade.return_pct as number;
        if ((trade.return_pct as number) >= 0) {
          totalStats.winning_trades++;
        }
        allReturns.push(trade.return_pct as number);

        // If we're starting a new year, print the previous year's summary
        if (trade.year !== currentYear) {
          if (yearTrades.length > 0) {
            printYearSummary(Number(currentYear), yearTrades);
          }
          currentYear = trade.year as string;
          yearTrades = [];

          // Only add match count once per year
          if (!seenYears.has(trade.year)) {
            seenYears.add(trade.year);
            totalStats.total_matches += trade.match_count as number;
          }
        }

        // Add trade to current year's trades
        yearTrades.push({
          trade_date: trade.trade_date as string,
          entry_time: trade.entry_time as string,
          exit_time: trade.exit_time as string,
          market_open: trade.market_open as number,
          entry_price: trade.entry_price as number,
          exit_price: trade.exit_price as number,
          rise_pct: trade.rise_pct as number,
          return_pct: trade.return_pct as number,
          year: parseInt(trade.year as string),
          total_trading_days: trade.total_trading_days as number,
          median_return: trade.median_return as number,
          std_dev_return: trade.std_dev_return as number,
          win_rate: trade.win_rate as number,
          direction: entryPattern.direction,
        });

        // Print trade details
        printTradeDetails(
          {
            trade_date: trade.trade_date as string,
            entry_time: trade.entry_time as string,
            exit_time: trade.exit_time as string,
            market_open: trade.market_open as number,
            entry_price: trade.entry_price as number,
            exit_price: trade.exit_price as number,
            rise_pct: trade.rise_pct as number,
            return_pct: trade.return_pct as number,
            direction: entryPattern.direction,
          },
          entryPattern.direction
        );
      }

      // Print the last year's summary
      if (yearTrades.length > 0) {
        printYearSummary(Number(currentYear), yearTrades);
      }

      // Calculate final stats
      totalStats.win_rate =
        totalStats.total_matches > 0 ? totalStats.winning_trades / totalStats.total_matches : 0;

      // Calculate mean return
      const meanReturn =
        allReturns.length > 0 ? allReturns.reduce((a, b) => a + b, 0) / allReturns.length : 0;

      // Calculate median return
      const sortedReturns = [...allReturns].sort((a, b) => a - b);
      totalStats.median_return =
        sortedReturns.length > 0 ? sortedReturns[Math.floor(sortedReturns.length / 2)] : 0;

      // Calculate standard deviation
      totalStats.std_dev_return =
        allReturns.length > 0
          ? Math.sqrt(
              allReturns.reduce((sum, ret) => sum + Math.pow(ret - meanReturn, 2), 0) /
                (allReturns.length - 1) // Use n-1 for sample standard deviation
            )
          : 0;

      // Print overall summary
      printOverallSummary({
        ...totalStats,
        total_return_sum: meanReturn * totalStats.total_matches, // Update total return sum to match mean
        direction: entryPattern.direction,
      });

      // Print footer
      printFooter();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

program.parse(process.argv);
