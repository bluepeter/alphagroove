#!/usr/bin/env node

/**
 * AlphaGroove Trade Levels Calculator
 *
 * This tool calculates stop loss, profit target, and trailing stop levels
 * based on ATR from a CSV file with minute bars data and the current configuration.
 * The ATR is calculated using all data present in the provided CSV file.
 *
 * Usage:
 *   pnpm levels /path/to/minute-bars.csv --price <current-price>
 * Ensure the CSV file contains the desired historical data for ATR calculation (e.g., previous day's data).
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
    "Calculate trade levels for both LONG and SHORT directions using AlphaGroove's configuration and ATR from the entire provided CSV dataset."
  )
  .argument(
    '<csvPath>',
    'Path to the CSV file with minute bar data (e.g., previous day data for ATR)'
  )
  .option('-p, --price <price>', 'Current execution price', parseFloat)
  .option('-c, --config <path>', 'Path to configuration file (default: alphagroove.config.yaml)');

program.parse(process.argv);

/**
 * Parses CSV data into Bar objects.
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

    const bars: Bar[] = [];
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
        trade_date: date || undefined, // Keep for potential future use or debugging
      });
    }
    return bars;
  } catch (error) {
    console.error(chalk.red('Error parsing CSV file:'), error);
    process.exit(1);
  }
}

/**
 * Calculate ATR from bars, being lenient with data requirements
 */
export function calculateATR(bars: Bar[]): number {
  if (!bars || bars.length === 0) {
    console.warn(chalk.yellow('No bars provided for ATR calculation'));
    return 2.0; // Default reasonable ATR value
  }

  if (bars.length < 10) {
    console.warn(chalk.yellow(`Limited data for ATR calculation (${bars.length} bars)`));
  }

  try {
    const atr = calculateAverageTrueRangeForDay(bars);
    if (atr !== undefined) {
      return atr;
    }

    console.warn(chalk.yellow('ATR calculation returned undefined, using fallback'));
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
    return 2.0;
  }
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

    if (!fs.existsSync(csvPath)) {
      console.error(chalk.red(`Error: CSV file not found at ${csvPath}`));
      process.exit(1);
    }

    if (!options.price) {
      console.error(chalk.red('Error: Current price is required (--price <number>)'));
      process.exit(1);
    }

    const currentPrice = options.price;

    console.log(chalk.dim('Loading configuration...'));
    const config = loadConfig(options.config);

    console.log(chalk.dim('Parsing CSV data...'));
    const bars = parseCSVData(csvPath);

    if (bars.length === 0) {
      console.error(chalk.red('Error: No data found in CSV file'));
      process.exit(1);
    }

    if (bars.length < 2) {
      // Still need at least 2 bars for ATR
      console.error(chalk.red('Error: CSV must contain at least two bars for ATR calculation.'));
      process.exit(1);
    }

    console.log(chalk.dim('Calculating ATR from the provided CSV data...'));
    const atr = calculateATR(bars);

    if (!atr) {
      // calculateATR should always return a number now, but good to keep a check
      console.error(chalk.red('Error: Could not calculate ATR from the CSV data.'));
      process.exit(1);
    }

    console.log('\n' + chalk.cyan('ATR (from entire CSV):') + ' ' + atr.toFixed(4));

    const longLevels = calculateTradeLevels(currentPrice, atr, config, true);
    console.log('\n' + chalk.bold.underline(`Trade Levels for LONG at ${currentPrice}`) + '\n');
    printLevelsForDirection(currentPrice, atr, longLevels, true, config);

    const shortLevels = calculateTradeLevels(currentPrice, atr, config, false);
    console.log('\n' + chalk.bold.underline(`Trade Levels for SHORT at ${currentPrice}`) + '\n');
    printLevelsForDirection(currentPrice, atr, shortLevels, false, config);

    console.log(
      '\n' +
        chalk.dim('Note: ATR is calculated from all data in the provided CSV.') +
        chalk.dim(' Ensure CSV contains only the desired historical period for ATR.')
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
  levels: any,
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

  let trailPct: number;
  if (
    config.exitStrategies?.trailingStop?.trailPercent &&
    levels.tsTrailAmount === config.exitStrategies.trailingStop.trailPercent
  ) {
    trailPct = levels.tsTrailAmount;
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
