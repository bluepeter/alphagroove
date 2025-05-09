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
import { generateEntryCharts } from './utils/chart-generator.js';
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
    let allTrades: Trade[] = [];

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

      // Create trade object
      const tradeObj: Trade = {
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
      };

      // Add trade to current year's trades and all trades
      yearTrades.push(tradeObj);
      allTrades.push(tradeObj);

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

    // Generate charts if option is enabled
    if (mergedConfig.generateCharts) {
      console.log('\nGenerating multiday charts for entry points...');
      const chartPaths = await generateEntryCharts(
        mergedConfig.ticker,
        mergedConfig.timeframe,
        entryPattern.name,
        allTrades,
        mergedConfig.chartsDir || './charts'
      );
      console.log(
        `\nGenerated ${chartPaths.length} charts in ${mergedConfig.chartsDir || './charts'}/${entryPattern.name}/`
      );
    }

    printFooter();
  } catch (error) {
    console.error('Error running analysis:', error);
    process.exit(1);
  }
};

// Parse command line arguments
const parseCLI = async () => {
  // Import commander using dynamic import for ESM compatibility
  const { program } = await import('commander');

  program
    .name('alphagroove')
    .description('Intraday trading pattern analysis tool')
    .version('1.0.0')
    .option('--from <date>', 'Start date (YYYY-MM-DD)')
    .option('--to <date>', 'End date (YYYY-MM-DD)')
    .option('--ticker <symbol>', 'Ticker symbol to analyze')
    .option('--timeframe <period>', 'Data timeframe (e.g., 1min, 5min)')
    .option('--entry-pattern <name>', 'Entry pattern name')
    .option('--exit-pattern <name>', 'Exit pattern name')
    .option('--config <path>', 'Path to configuration file')
    .option('--direction <direction>', 'Trading direction (long/short)')
    .option('--generate-charts', 'Generate multiday charts for each entry')
    .option('--charts-dir <path>', 'Directory for chart output')
    .option('--debug', 'Show debug information')
    .option('--dry-run', 'Show query without executing');

  program
    .command('init')
    .description('Create default configuration file')
    .action(() => {
      createDefaultConfigFile();
      console.log('Created default configuration file: alphagroove.config.yaml');
      process.exit(0);
    });

  program
    .command('list-patterns')
    .description('List available patterns')
    .action(() => {
      console.log('\nAvailable Entry Patterns:');
      getAvailableEntryPatterns().forEach(pattern => console.log(`- ${pattern}`));

      console.log('\nAvailable Exit Patterns:');
      getAvailableExitPatterns().forEach(pattern => console.log(`- ${pattern}`));

      process.exit(0);
    });

  // Allow any options to be passed - they'll be used for pattern-specific config
  program.allowUnknownOption(true);

  // Add a default action to process the main command
  program.action(async () => {
    // This is intentionally left empty as we'll handle the options after parsing
  });

  // Parse arguments
  await program.parseAsync(process.argv);

  // Get all options including unknown ones for pattern-specific config
  const options = program.opts();
  const allOptions = { ...options };

  // Handle pattern-specific options (anything with a dot in the name)
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--') && arg.includes('.') && args[i + 1] && !args[i + 1].startsWith('--')) {
      const key = arg.slice(2); // Remove leading --
      const value = args[i + 1];

      // Handle nested properties (e.g., quick-rise.rise-pct)
      const [patternName, propName] = key.split('.');

      if (!allOptions[patternName]) {
        allOptions[patternName] = {};
      }

      // Convert number strings to numbers
      const numValue = Number(value);
      allOptions[patternName][propName] = isNaN(numValue) ? value : numValue;

      i++; // Skip the value in the next iteration
    }
  }

  return allOptions;
};

// Main function to run the program
async function main() {
  try {
    const cliOptions = await parseCLI();
    await runAnalysis(cliOptions);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
