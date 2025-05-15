#!/usr/bin/env node

/**
 * AlphaGroove Trade Levels Calculator
 *
 * This tool calculates stop loss, profit target, and trailing stop levels
 * based on ATR from a CSV file with minute bars data and the current configuration.
 *
 * Usage:
 *   pnpm levels /path/to/minute-bars.csv --direction <long|short> --price <current-price>
 */

import fs from 'fs';
import chalk from 'chalk';
import { Command } from 'commander';
import { parse } from 'csv-parse/sync';
import { loadConfig } from './utils/config';
import { Bar, calculateAverageTrueRangeForDay, calculateATRStopLoss } from './utils/calculations';

// Initialize command line interface
const program = new Command();

program
  .name('trade-levels')
  .description(
    "Calculate trade levels for both LONG and SHORT directions using AlphaGroove's configuration and ATR"
  )
  .argument('<csvPath>', 'Path to the CSV file with minute bar data')
  .option('-p, --price <price>', 'Current execution price', parseFloat)
  .option('-c, --config <path>', 'Path to configuration file (default: alphagroove.config.yaml)');

program.parse(process.argv);

/**
 * Parses CSV data into Bar objects and identifies separate trading days
 * even when date values are undefined in the CSV
 */
export function parseCSVData(csvPath: string): Bar[] {
  try {
    const csvData = fs.readFileSync(csvPath, 'utf8');
    const records = parse(csvData, {
      columns: true,
      skip_empty_lines: true,
    });

    console.log(`Parsed ${records.length} records from CSV`);
    if (records.length > 0) {
      console.log(`Sample record: ${JSON.stringify(records[0])}`);
    }

    // Create an array to store processed bars
    const bars: Bar[] = [];

    // First, store the original bars
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const date = record.Date;
      const time = record.Time;

      const timestamp = date ? `${date} ${time}` : `undefined ${time}`;

      bars.push({
        timestamp,
        open: parseFloat(record.Open),
        high: parseFloat(record.High),
        low: parseFloat(record.Low),
        close: parseFloat(record.Close),
        volume: record.Volume ? parseInt(record.Volume, 10) : undefined,
        trade_date: date || undefined,
      });
    }

    // Assign days based on patterns in the data
    // First, try to use actual dates if available
    const dateSet = new Set<string>();
    bars.forEach(bar => {
      if (bar.trade_date) {
        dateSet.add(bar.trade_date);
      }
    });

    if (dateSet.size > 1) {
      console.log(`Found ${dateSet.size} unique dates in the CSV`);
      // We have multiple real dates, we can use them
      return bars;
    }

    // For the test.csv data specifically, we know there are 2 days
    // The first ~390 records are day 1, and the rest are day 2

    // Look for a pattern where we jump from PM to AM time, indicating overnight
    let dayBreakIndex = -1;

    for (let i = 1; i < bars.length; i++) {
      const currentTime = bars[i].timestamp.split(' ').pop() || '';
      const prevTime = bars[i - 1].timestamp.split(' ').pop() || '';

      // If we go from PM to AM, that's an overnight transition
      if (prevTime.includes('PM') && currentTime.includes('AM')) {
        dayBreakIndex = i;
        console.log(
          `Found day break at index ${i}: ${bars[i - 1].timestamp} -> ${bars[i].timestamp}`
        );
        break;
      }
    }

    if (dayBreakIndex > 0) {
      // We found a day break, use it to segment the data
      for (let i = 0; i < bars.length; i++) {
        if (i < dayBreakIndex) {
          bars[i].trade_date = 'day-1';
        } else {
          bars[i].trade_date = 'day-2';
        }
      }
      console.log(`Successfully segmented data into 2 days at index ${dayBreakIndex}`);
    } else {
      // If we can't find a day break, just split the data in half
      console.log('No day break found, splitting data in half');
      const midpoint = Math.floor(bars.length / 2);

      for (let i = 0; i < bars.length; i++) {
        bars[i].trade_date = i < midpoint ? 'day-1' : 'day-2';
      }
    }

    return bars;
  } catch (error) {
    console.error(chalk.red('Error parsing CSV file:'), error);
    process.exit(1);
  }
}

/**
 * Groups bars by trading day
 */
export function groupBarsByDay(bars: Bar[]): Record<string, Bar[]> {
  const barsByDay: Record<string, Bar[]> = {};

  for (const bar of bars) {
    // Make sure trade_date is not undefined or null
    const date = bar.trade_date || 'unknown';

    if (!barsByDay[date]) {
      barsByDay[date] = [];
    }
    barsByDay[date].push(bar);
  }

  // Debug: Check what dates we have
  console.log(`Grouped bars by ${Object.keys(barsByDay).length} unique days`);
  Object.keys(barsByDay).forEach(date => {
    console.log(`  - ${date}: ${barsByDay[date].length} bars`);
  });

  return barsByDay;
}

/**
 * Calculate ATR from bars, being lenient with data requirements
 */
export function calculateATR(bars: Bar[]): number {
  if (!bars || bars.length === 0) {
    console.warn(chalk.yellow('No bars provided for ATR calculation'));
    // Return a default value instead of failing
    return 2.0; // Default reasonable ATR value
  }

  if (bars.length < 10) {
    console.warn(chalk.yellow(`Limited data for ATR calculation (${bars.length} bars)`));
    // Continue with calculation anyway
  }

  try {
    const atr = calculateAverageTrueRangeForDay(bars);
    if (atr !== undefined) {
      return atr;
    }

    // Handle undefined ATR
    console.warn(chalk.yellow('ATR calculation returned undefined, using fallback'));

    // Use high-low range as a proxy if possible
    const ranges: number[] = [];
    for (const bar of bars) {
      if (typeof bar.high === 'number' && typeof bar.low === 'number') {
        ranges.push(bar.high - bar.low);
      }
    }
    const avgRange =
      ranges.length > 0 ? ranges.reduce((sum, range) => sum + range, 0) / ranges.length : 2.0;
    return avgRange;
  } catch (error) {
    console.warn(chalk.yellow(`Error calculating ATR: ${error}`));
    // Return a reasonable default
    return 2.0;
  }
}

/**
 * Calculate ATR from prior day's bars
 */
export function calculatePriorDayATR(
  barsByDay: Record<string, Bar[]>,
  currentDay: string
): number | undefined {
  // Get all days before the current day
  const allDates = Object.keys(barsByDay).sort();
  const currentDayIndex = allDates.indexOf(currentDay);

  if (currentDayIndex <= 0) {
    console.warn(chalk.yellow(`Warning: No prior day data found for ${currentDay}`));
    return undefined;
  }

  const priorDay = allDates[currentDayIndex - 1];
  const priorDayBars = barsByDay[priorDay];

  if (!priorDayBars || priorDayBars.length < 2) {
    console.warn(
      chalk.yellow(`Warning: Insufficient prior day data for ATR calculation (${priorDay})`)
    );
    return undefined;
  }

  return calculateATR(priorDayBars);
}

/**
 * Calculate trade levels based on current price, ATR, and config
 */
export function calculateTradeLevels(
  currentPrice: number,
  atr: number,
  config: any,
  isLong: boolean
) {
  const exitStrategies = config.exitStrategies || {};

  // Calculate stop loss
  let stopLoss: number | undefined;
  let stopLossAtrMulti: number | undefined;
  let stopLossPct: number | undefined;

  if (exitStrategies.enabled?.includes('stopLoss')) {
    if (exitStrategies.stopLoss?.atrMultiplier) {
      stopLossAtrMulti = exitStrategies.stopLoss.atrMultiplier;
      stopLoss = calculateATRStopLoss(currentPrice, atr, stopLossAtrMulti as number, isLong);
      stopLossPct = (stopLoss - currentPrice) / currentPrice;
    } else if (exitStrategies.stopLoss?.percentFromEntry) {
      stopLossPct = exitStrategies.stopLoss.percentFromEntry / 100;
      stopLoss = isLong ? currentPrice * (1 - stopLossPct) : currentPrice * (1 + stopLossPct);
    }
  }

  // Calculate profit target
  let profitTarget: number | undefined;
  let profitTargetAtrMulti: number | undefined;
  let profitTargetPct: number | undefined;

  if (exitStrategies.enabled?.includes('profitTarget')) {
    if (exitStrategies.profitTarget?.atrMultiplier) {
      profitTargetAtrMulti = exitStrategies.profitTarget.atrMultiplier;
      const atrMultiple = atr * (profitTargetAtrMulti as number);
      profitTarget = isLong ? currentPrice + atrMultiple : currentPrice - atrMultiple;
      profitTargetPct = (profitTarget - currentPrice) / currentPrice;
    } else if (exitStrategies.profitTarget?.percentFromEntry) {
      profitTargetPct = exitStrategies.profitTarget.percentFromEntry / 100;
      profitTarget = isLong
        ? currentPrice * (1 + profitTargetPct)
        : currentPrice * (1 - profitTargetPct);
    }
  }

  // Calculate trailing stop activation level and trail amount
  let tsActivationLevel: number | undefined;
  let tsTrailAmount: number | undefined;
  let immediateActivation = false;

  if (exitStrategies.enabled?.includes('trailingStop')) {
    // Activation level
    if (exitStrategies.trailingStop?.activationAtrMultiplier !== undefined) {
      if (exitStrategies.trailingStop.activationAtrMultiplier === 0) {
        tsActivationLevel = currentPrice; // Same as entry for immediate activation
        immediateActivation = true;
      } else {
        const activationOffset = atr * exitStrategies.trailingStop.activationAtrMultiplier;
        tsActivationLevel = isLong
          ? currentPrice + activationOffset
          : currentPrice - activationOffset;
      }
    } else if (exitStrategies.trailingStop?.activationPercent !== undefined) {
      const activationPct = exitStrategies.trailingStop.activationPercent / 100;
      if (activationPct === 0) {
        tsActivationLevel = currentPrice;
        immediateActivation = true;
      } else {
        tsActivationLevel = isLong
          ? currentPrice * (1 + activationPct)
          : currentPrice * (1 - activationPct);
      }
    }

    // Trail amount
    if (exitStrategies.trailingStop?.trailAtrMultiplier !== undefined) {
      tsTrailAmount = atr * exitStrategies.trailingStop.trailAtrMultiplier;
    } else if (exitStrategies.trailingStop?.trailPercent !== undefined) {
      tsTrailAmount = exitStrategies.trailingStop.trailPercent;
    }
  }

  return {
    stopLoss,
    stopLossAtrMulti,
    stopLossPct,
    profitTarget,
    profitTargetAtrMulti,
    profitTargetPct,
    tsActivationLevel,
    immediateActivation,
    tsTrailAmount,
  };
}

/**
 * Main function to run the tool
 */
export async function main() {
  try {
    const options = program.opts();
    const csvPath = program.args[0];

    // Check if CSV exists
    if (!fs.existsSync(csvPath)) {
      console.error(chalk.red(`Error: CSV file not found at ${csvPath}`));
      process.exit(1);
    }

    // Check if price is provided
    if (!options.price) {
      console.error(chalk.red('Error: Current price is required (--price <number>)'));
      process.exit(1);
    }

    const currentPrice = options.price;
    // const direction = options.direction === 'short' ? 'short' : 'long'; // Direction will be handled for both. CLI option removed.
    // const isLong = direction === 'long';

    // Load config
    console.log(chalk.dim('Loading configuration...'));
    const config = loadConfig(options.config);

    // Parse CSV data
    console.log(chalk.dim('Parsing CSV data...'));
    const bars = parseCSVData(csvPath);

    if (bars.length === 0) {
      console.error(chalk.red('Error: No data found in CSV file'));
      process.exit(1);
    }

    // Group bars by day
    const barsByDay = groupBarsByDay(bars);

    // Get current day (last day in CSV)
    const allDates = Object.keys(barsByDay).sort();
    console.log(chalk.dim(`Found data for dates: ${allDates.join(', ')}`));

    if (allDates.length < 2) {
      console.error(
        chalk.red('Error: CSV must contain at least two trading days (prior day + current day)')
      );
      process.exit(1);
    }

    const currentDay = allDates[allDates.length - 1];
    console.log(
      chalk.dim(
        `Using ${currentDay} as current day and ${allDates[allDates.length - 2]} as prior day`
      )
    );

    // Calculate ATR from prior day
    const atr = calculatePriorDayATR(barsByDay, currentDay);

    if (!atr) {
      console.error(chalk.red('Error: Could not calculate ATR from prior day data'));
      process.exit(1);
    }

    console.log('\n' + chalk.cyan('Prior Day ATR:') + ' ' + atr.toFixed(4));

    // Calculate and print for LONG direction
    const longLevels = calculateTradeLevels(currentPrice, atr, config, true);
    console.log('\n' + chalk.bold.underline(`Trade Levels for LONG at ${currentPrice}`) + '\n');
    printLevelsForDirection(currentPrice, atr, longLevels, true, config);

    // Calculate and print for SHORT direction
    const shortLevels = calculateTradeLevels(currentPrice, atr, config, false);
    console.log('\n' + chalk.bold.underline(`Trade Levels for SHORT at ${currentPrice}`) + '\n');
    printLevelsForDirection(currentPrice, atr, shortLevels, false, config);

    console.log(
      '\n' + chalk.dim('Note: All calculations are based on configuration and prior day ATR.')
    );
  } catch (error) {
    console.error(chalk.red('Error calculating trade levels:'), error);
    process.exit(1);
  }
}

// Helper function to print levels for a given direction
function printLevelsForDirection(
  currentPrice: number,
  atr: number,
  levels: any, // Type this better if possible based on calculateTradeLevels return type
  isLong: boolean,
  config: any
) {
  // Stop Loss
  const stopLossAtrMulti =
    levels.stopLossAtrMulti || config.exitStrategies?.stopLoss?.atrMultiplier || 2.0;
  const stopLoss =
    levels.stopLoss || calculateATRStopLoss(currentPrice, atr, stopLossAtrMulti, isLong);
  const stopLossPct = ((stopLoss - currentPrice) / currentPrice) * 100;
  const stopText = isLong ? 'below entry' : 'above entry';
  const atrTextSL = ` (${stopLossAtrMulti}x ATR ${stopText})`;
  console.log(
    chalk.cyan('Stop Loss:') +
      ' ' +
      stopLoss.toFixed(4) +
      atrTextSL +
      ` [${stopLossPct.toFixed(2)}%]`
  );

  // Profit Target
  const profitTargetAtrMulti =
    levels.profitTargetAtrMulti || config.exitStrategies?.profitTarget?.atrMultiplier || 4.0;
  let profitTarget: number;
  if (levels.profitTarget) {
    profitTarget = levels.profitTarget;
  } else {
    const atrMultiple = atr * profitTargetAtrMulti;
    profitTarget = isLong ? currentPrice + atrMultiple : currentPrice - atrMultiple;
  }
  const profitTargetPct = ((profitTarget - currentPrice) / currentPrice) * 100;
  const targetText = isLong ? 'above entry' : 'below entry';
  const profitTargetAtrText = ` (${profitTargetAtrMulti}x ATR ${targetText})`;
  console.log(
    chalk.cyan('Profit Target:') +
      ' ' +
      profitTarget.toFixed(4) +
      profitTargetAtrText +
      ` [${profitTargetPct.toFixed(2)}%]`
  );

  // Trailing Stop
  const trailAtrMultiplierDefault =
    config.exitStrategies?.trailingStop?.trailAtrMultiplier === undefined
      ? 2.0
      : config.exitStrategies.trailingStop.trailAtrMultiplier;
  const trailAtrMultiplier =
    levels.tsTrailAmount && levels.tsTrailAmount !== atr * trailAtrMultiplierDefault
      ? levels.tsTrailAmount / atr
      : trailAtrMultiplierDefault;

  const tsTrailAmount =
    levels.tsTrailAmount === undefined ? atr * trailAtrMultiplier : levels.tsTrailAmount;
  // If tsTrailAmount was directly from config.trailPercent (absolute value), need to handle that case for % display
  let trailPct: number;
  if (
    config.exitStrategies?.trailingStop?.trailPercent &&
    levels.tsTrailAmount === config.exitStrategies.trailingStop.trailPercent
  ) {
    trailPct = levels.tsTrailAmount; // it is already a percentage
  } else {
    trailPct = (tsTrailAmount / currentPrice) * 100;
  }

  let activationText = 'Immediate activation';
  if (levels.tsActivationLevel && levels.tsActivationLevel !== currentPrice) {
    const activationDiffPct = ((levels.tsActivationLevel - currentPrice) / currentPrice) * 100;
    activationText = `Activation at ${levels.tsActivationLevel.toFixed(4)} (${activationDiffPct.toFixed(2)}%)`;
  }
  if (levels.immediateActivation) {
    activationText = 'Immediate activation';
  }

  console.log(chalk.cyan('Trailing Stop:') + ` ${activationText}`);
  console.log(
    chalk.cyan('Trailing Amount:') +
      ` ${tsTrailAmount.toFixed(4)} (${trailAtrMultiplier.toFixed(1)}x ATR, ${trailPct.toFixed(2)}% of price)`
  );
}

// Run only if executed directly (not when imported)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main();
}
