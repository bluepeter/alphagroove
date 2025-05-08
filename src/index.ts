#!/usr/bin/env node

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';

import {
  getAvailableEntryPatterns,
  getAvailableExitPatterns,
  getEntryPattern,
  getExitPattern,
} from './patterns/pattern-factory.js';
import {
  calculateMeanReturn,
  calculateMedianReturn,
  calculateStdDevReturn,
} from './utils/calculations.js';
import { createDefaultConfigFile, loadConfig, mergeConfigWithCliOptions } from './utils/config.js';
import {
  printHeader,
  printTradeDetails,
  printYearSummary,
  printOverallSummary,
  printFooter,
  Trade,
} from './utils/output.js';
import { buildAnalysisQuery } from './utils/query-builder.js';

interface TotalStats {
  total_trading_days: number;
  total_matches: number;
  total_return_sum: number;
  median_return: number;
  std_dev_return: number;
  win_rate: number;
  winning_trades: number;
}

// Main function to run the analysis
const runAnalysis = async (cliOptions: Record<string, any>): Promise<void> => {
  try {
    // Load config and merge with CLI options
    const config = loadConfig(cliOptions.config);
    const mergedConfig = mergeConfigWithCliOptions(config, cliOptions);

    // Get the appropriate patterns based on merged configuration
    const entryPattern = getEntryPattern(mergedConfig.entryPattern, mergedConfig);
    const exitPattern = getExitPattern(mergedConfig.exitPattern, mergedConfig);

    // Build and execute the query
    const query = buildAnalysisQuery(mergedConfig);

    // Debug: Print the query
    if (cliOptions.debug || cliOptions.dryRun) {
      console.log('\nDEBUG - SQL Query:\n' + query);
    }

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
      mergedConfig.ticker,
      mergedConfig.from,
      mergedConfig.to,
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
    const meanReturn = calculateMeanReturn(allReturns);

    // Calculate median return
    totalStats.median_return = calculateMedianReturn(allReturns);

    // Calculate standard deviation
    totalStats.std_dev_return = calculateStdDevReturn(allReturns, meanReturn);

    // Print overall summary
    printOverallSummary({
      ...totalStats,
      total_return_sum: meanReturn,
      direction: entryPattern.direction,
    });

    // Print footer
    printFooter();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

// Parse CLI arguments using a raw approach
const parseCLI = () => {
  const args = process.argv.slice(2);
  const options: Record<string, any> = {};

  // Process arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Handle commands
    if (arg === 'init') {
      createDefaultConfigFile();
      process.exit(0);
    } else if (arg === 'list-patterns') {
      console.log('Available Entry Patterns:');
      getAvailableEntryPatterns().forEach(pattern => {
        console.log(`- ${pattern}`);
      });

      console.log('\nAvailable Exit Patterns:');
      getAvailableExitPatterns().forEach(pattern => {
        console.log(`- ${pattern}`);
      });
      process.exit(0);
    }

    // Skip arguments that aren't options
    if (!arg.startsWith('--')) continue;

    const optName = arg.slice(2); // Remove --

    // Handle options with equals sign
    if (optName.includes('=')) {
      const [name, value] = optName.split('=');
      options[name] = value;
      continue;
    }

    // Handle options with space
    if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
      options[optName] = args[i + 1];
      i++; // Skip the value in the next iteration
    } else {
      // Flag option (boolean)
      options[optName] = true;
    }
  }

  return options;
};

// Main entry point
async function main() {
  const options = parseCLI();
  await runAnalysis(options);
}

// Start the application
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
