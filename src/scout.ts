#!/usr/bin/env node

import dotenv from 'dotenv';
import chalk from 'chalk';
import { Command } from 'commander';
import { loadConfig } from './utils/config';
import { Bar, Signal } from './patterns/types';
import { LlmConfirmationScreen } from './screens/llm-confirmation.screen';
import type { EnrichedSignal } from './screens/types';
import { PolygonApiService } from './services/polygon-api.service';

import {
  convertPolygonData,
  filterTradingData,
  filterTradingHoursOnly,
  parseTimestampAsET,
} from './utils/polygon-data-converter';
import { calculateEntryAtr } from './utils/trade-processing';
import { calculateExitPrices } from './utils/exit-price-calculator';
import { generateScoutChart, type ScoutChartOptions } from './utils/scout-chart-generator';
import {
  convertPolygonToDailyBars,
  calculateTradingDaysAgo,
  type DailyBar,
} from './utils/sma-calculator';

// Initialize command line interface
const program = new Command();

program
  .name('scout')
  .description('AlphaGroove Entry Scout - Generate 2-day charts using Polygon API data')
  .option('--ticker <symbol>', 'Ticker symbol (overrides config)')
  .option('--date <YYYY-MM-DD>', 'Trade date (default: today)')
  .option('--time <HH:MM>', 'Entry time (default: current time)')
  .option('-v, --verbose', 'Show detailed information');

program.parse(process.argv);

/**
 * Calculate the start date for fetching trading data (account for holidays)
 * Goes back enough days to ensure we capture the previous trading day
 */
const calculatePreviousTradingDay = (date: Date): string => {
  // For live trading scout, go back 5 calendar days to ensure we capture
  // the previous trading day even with holidays like Labor Day
  const prevDate = new Date(date);
  prevDate.setDate(prevDate.getDate() - 5);
  return prevDate.toISOString().split('T')[0];
};

/**
 * Load and validate configuration
 */
const loadScoutConfig = async () => {
  const rawConfig = await loadConfig();

  if (!rawConfig.shared?.ticker) {
    throw new Error('Ticker not configured. Please set shared.ticker in alphagroove.config.yaml');
  }

  if (!rawConfig.scout?.polygon?.apiKeyEnvVar) {
    throw new Error(
      'Polygon API key environment variable not configured. Please set scout.polygon.apiKeyEnvVar in alphagroove.config.yaml'
    );
  }

  const apiKey = process.env[rawConfig.scout.polygon.apiKeyEnvVar];
  if (!apiKey) {
    throw new Error(`Environment variable ${rawConfig.scout.polygon.apiKeyEnvVar} not set`);
  }

  return { rawConfig, apiKey };
};

/**
 * Validate that the requested trade date has actual trading data
 */
const validateTradingDate = (bars: Bar[], requestedDate: string): boolean => {
  // Check if any bars exist for the exact requested date
  // Handle different timestamp formats from Polygon API
  const requestedDateBars = bars.filter(bar => {
    const barDate = new Date(parseTimestampAsET(bar.timestamp)).toISOString().split('T')[0];
    return barDate === requestedDate;
  });

  if (requestedDateBars.length === 0) {
    console.log(
      `No bars found for requested date ${requestedDate}. Available dates:`,
      [
        ...new Set(
          bars
            .slice(0, 10)
            .map(bar => new Date(parseTimestampAsET(bar.timestamp)).toISOString().split('T')[0])
        ),
      ].join(', ')
    );
  }

  return requestedDateBars.length > 0;
};

/**
 * Fetch daily bars for SMA calculation
 */
const fetchDailyBarsForSMA = async (
  polygonService: PolygonApiService,
  ticker: string,
  tradeDate: string
): Promise<DailyBar[]> => {
  try {
    // Calculate date 20 trading days ago (with buffer for weekends/holidays)
    const fromDate = calculateTradingDaysAgo(20, new Date(tradeDate));

    console.log(chalk.dim(`Fetching daily bars for SMA from ${fromDate} to ${tradeDate}`));

    // Fetch daily bars from Polygon
    const polygonDailyBars = await polygonService.fetchPolygonData(
      ticker,
      fromDate,
      tradeDate,
      1,
      'day'
    );

    // Convert to our DailyBar format
    const dailyBars = convertPolygonToDailyBars(polygonDailyBars);

    console.log(chalk.dim(`Retrieved ${dailyBars.length} daily bars for SMA calculation`));

    return dailyBars;
  } catch (error) {
    console.log(chalk.yellow(`⚠️  Could not fetch daily bars for SMA: ${error}`));
    console.log(chalk.dim('SMA will not be displayed on chart'));
    return [];
  }
};

/**
 * Fetch and process market data from Polygon API
 */
const fetchMarketData = async (
  polygonService: PolygonApiService,
  ticker: string,
  tradeDate: string,
  previousDate: string
): Promise<Bar[]> => {
  console.log(chalk.dim(`Trade date: ${tradeDate}, Previous trading day: ${previousDate}`));

  const polygonBars = await polygonService.fetchPolygonData(ticker, previousDate, tradeDate);
  const convertedBars = convertPolygonData(polygonBars);

  console.log(chalk.dim(`Converted ${convertedBars.length} bars from Polygon data`));

  // Validate that the requested trade date has actual trading data
  if (!validateTradingDate(convertedBars, tradeDate)) {
    throw new Error(
      `No trading data available for requested date ${tradeDate}. This may be a weekend, holiday, or market closure.`
    );
  }

  return convertedBars;
};

/**
 * Create entry signal for current market conditions
 */
const createEntrySignal = (bars: Bar[], tradeDate: string, currentTime: Date): Signal => {
  // Find the last bar before or at current time for entry price
  const tradingHoursBars = bars.filter(bar => {
    const barTimestamp = parseTimestampAsET(bar.timestamp);
    return barTimestamp <= currentTime.getTime();
  });

  if (tradingHoursBars.length === 0) {
    throw new Error('No trading data available for current time');
  }

  const lastBar = tradingHoursBars[tradingHoursBars.length - 1];

  return {
    timestamp: lastBar.timestamp,
    price: lastBar.close,
    type: 'entry',
  };
};

/**
 * Generate chart for LLM analysis
 */
const generateAnalysisChart = async (
  ticker: string,
  tradeDate: string,
  entrySignal: Signal,
  filteredBars: Bar[],
  allBars: Bar[],
  dailyBars?: DailyBar[]
): Promise<string> => {
  const chartOptions: ScoutChartOptions = {
    ticker,
    entryPatternName: 'scout',
    tradeDate,
    entrySignal,
    data: filteredBars,
    allData: allBars,
    dailyBars,
  };

  return await generateScoutChart(chartOptions);
};

/**
 * Perform LLM analysis and display results
 */
const performLLMAnalysis = async (
  chartPath: string,
  ticker: string,
  tradeDate: string,
  entrySignal: Signal,
  rawConfig: any,
  options: any
): Promise<void> => {
  console.log(chalk.green(`\n✅ Chart generated successfully!`));
  console.log(chalk.bold(`Masked chart (for LLM): ${chartPath}`));
  const completeChartPath = chartPath.replace('_masked.png', '_complete.png');
  console.log(chalk.dim(`Complete chart (for review): ${completeChartPath}`));

  // LLM Analysis - using same logic as backtest
  console.log(chalk.dim('\nAnalyzing chart with LLM...'));

  try {
    const enrichedSignal: EnrichedSignal = {
      ticker,
      trade_date: tradeDate,
      price: entrySignal.price,
      timestamp: entrySignal.timestamp,
      type: 'entry',
    };

    const llmScreenConfig = rawConfig.shared?.llmConfirmationScreen;

    if (!llmScreenConfig) {
      console.log(chalk.yellow('⚠️  No LLM configuration found. Skipping LLM analysis.'));
      return;
    }

    const llmScreen = new LlmConfirmationScreen();
    const llmDecision = await llmScreen.shouldSignalProceed(
      enrichedSignal,
      chartPath,
      llmScreenConfig,
      rawConfig,
      undefined, // context
      options.verbose // debug
    );

    // Display LLM Decision
    console.log(chalk.bold('\n🤖 LLM Analysis Results:'));
    console.log(
      `${chalk.bold('Decision:')} ${llmDecision.proceed ? chalk.green('✅ ENTER TRADE') : chalk.red('❌ DO NOT ENTER')}`
    );

    if (llmDecision.direction) {
      const directionColor = llmDecision.direction === 'long' ? chalk.green : chalk.red;
      const directionEmoji = llmDecision.direction === 'long' ? '🔼' : '🔽';
      console.log(
        `${chalk.bold('Direction:')} ${directionColor(llmDecision.direction.toUpperCase())} ${directionEmoji}`
      );
    }

    if (llmDecision.proceed && llmDecision.direction) {
      await displayTradingInstructions(
        entrySignal,
        llmDecision,
        rawConfig,
        ticker,
        rawConfig.shared?.timeframe || '1min',
        tradeDate
      );
    }

    if (llmDecision.rationale) {
      console.log(`\n${chalk.bold('🧠 LLM Rationale:')} ${llmDecision.rationale}`);
    }

    if (llmDecision._debug?.responses) {
      displayIndividualLLMResponses(llmDecision._debug.responses);
    }

    if (llmDecision.cost) {
      console.log(chalk.dim(`Total LLM Cost: $${llmDecision.cost.toFixed(6)}`));
    }
  } catch (llmError) {
    console.error(chalk.red('Error in LLM analysis:'), llmError);
    console.log(chalk.yellow('Chart generated successfully, but LLM analysis failed.'));
  }
};

/**
 * Display manual trading instructions
 */
const displayTradingInstructions = async (
  entrySignal: Signal,
  llmDecision: any,
  rawConfig: any,
  ticker: string,
  timeframe: string,
  tradeDate: string
): Promise<void> => {
  console.log(chalk.bold('\n📋 Manual Trading Instructions:'));
  console.log(`${chalk.bold('Entry Price:')} $${entrySignal.price.toFixed(2)}`);

  // Calculate ATR for exit price calculations
  const atrValue = await calculateEntryAtr(ticker, timeframe, tradeDate);
  const isLong = llmDecision.direction === 'long';

  // Use centralized exit price calculation
  const stopLossConfig = rawConfig?.backtest?.exit?.strategyOptions?.stopLoss;
  const profitTargetConfig = rawConfig?.backtest?.exit?.strategyOptions?.profitTarget;

  const exitPrices = calculateExitPrices(
    entrySignal.price,
    atrValue,
    isLong,
    stopLossConfig,
    profitTargetConfig,
    llmDecision.averagedProposedStopLoss,
    llmDecision.averagedProposedProfitTarget
  );
  // Display stop loss
  if (exitPrices.stopLoss.price) {
    const stopLossPrice = exitPrices.stopLoss.price;
    const stopLossDistance = Math.abs(entrySignal.price - stopLossPrice);
    const stopLossPercent = ((stopLossDistance / entrySignal.price) * 100).toFixed(2);
    const stopLossDollarChangeRaw = stopLossPrice - entrySignal.price;
    const stopLossDollarChange = stopLossDollarChangeRaw.toFixed(2);
    const changeSign = stopLossDollarChangeRaw >= 0 ? '+' : '';
    console.log(
      `${chalk.bold('Stop Loss:')} $${stopLossPrice.toFixed(2)} (${changeSign}$${stopLossDollarChange}, ${stopLossPercent}% risk)`
    );
  }

  // Display profit target
  if (exitPrices.profitTarget.price) {
    const profitTargetPrice = exitPrices.profitTarget.price;
    const profitDistance = Math.abs(profitTargetPrice - entrySignal.price);
    const profitPercent = ((profitDistance / entrySignal.price) * 100).toFixed(2);
    const profitDollarChangeRaw = profitTargetPrice - entrySignal.price;
    const profitDollarChange = profitDollarChangeRaw.toFixed(2);
    const changeSign = profitDollarChangeRaw >= 0 ? '+' : '';
    console.log(
      `${chalk.bold('Profit Target:')} $${profitTargetPrice.toFixed(2)} (${changeSign}$${profitDollarChange}, ${profitPercent}% gain)`
    );
  }

  // Calculate and display risk/reward ratio
  if (exitPrices.stopLoss.price && exitPrices.profitTarget.price) {
    const riskAmount = Math.abs(entrySignal.price - exitPrices.stopLoss.price);
    const rewardAmount = Math.abs(exitPrices.profitTarget.price - entrySignal.price);
    const riskRewardRatio = rewardAmount / riskAmount;
    console.log(`${chalk.bold('Risk/Reward Ratio:')} 1:${riskRewardRatio.toFixed(2)}`);
  }

  // Display LLM proposed prices as additional information
  if (llmDecision.averagedProposedStopLoss || llmDecision.averagedProposedProfitTarget) {
    console.log(chalk.bold('\n🤖 LLM Proposed Prices (FYI):'));

    if (llmDecision.averagedProposedStopLoss) {
      const llmStopDiff = llmDecision.averagedProposedStopLoss - entrySignal.price;
      const llmStopPercent = ((Math.abs(llmStopDiff) / entrySignal.price) * 100).toFixed(2);
      const llmStopSign = llmStopDiff >= 0 ? '+' : '';
      console.log(
        `  ${chalk.dim('LLM Stop Loss:')} $${llmDecision.averagedProposedStopLoss.toFixed(2)} (${llmStopSign}$${llmStopDiff.toFixed(2)}, ${llmStopPercent}%)`
      );
    }

    if (llmDecision.averagedProposedProfitTarget) {
      const llmTargetDiff = llmDecision.averagedProposedProfitTarget - entrySignal.price;
      const llmTargetPercent = ((Math.abs(llmTargetDiff) / entrySignal.price) * 100).toFixed(2);
      const llmTargetSign = llmTargetDiff >= 0 ? '+' : '';
      console.log(
        `  ${chalk.dim('LLM Profit Target:')} $${llmDecision.averagedProposedProfitTarget.toFixed(2)} (${llmTargetSign}$${llmTargetDiff.toFixed(2)}, ${llmTargetPercent}%)`
      );
    }
  }

  // Display trailing stop information if configured
  // Check both backtest and shared config locations for trailing stop
  const backtestExitConfig = rawConfig?.backtest?.exit;
  const trailingStopConfig = backtestExitConfig?.strategyOptions?.trailingStop;
  const isTrailingStopEnabled = backtestExitConfig?.enabled?.includes('trailingStop');

  if (trailingStopConfig && isTrailingStopEnabled) {
    console.log(chalk.bold('Trailing Stop:'));

    if (atrValue) {
      console.log(`  ${chalk.bold('ATR:')} $${atrValue.toFixed(2)}`);
    }

    // Activation level
    if (trailingStopConfig.activationAtrMultiplier !== undefined) {
      if (trailingStopConfig.activationAtrMultiplier === 0) {
        console.log(`  ${chalk.bold('Activation:')} Immediate (0x ATR)`);
      } else {
        const activationAmount = atrValue
          ? atrValue * trailingStopConfig.activationAtrMultiplier
          : 0;
        const activationPrice = isLong
          ? entrySignal.price + activationAmount
          : entrySignal.price - activationAmount;
        const activationChange = activationPrice - entrySignal.price;
        const activationPercent = ((Math.abs(activationChange) / entrySignal.price) * 100).toFixed(
          2
        );
        const changeSign = activationChange >= 0 ? '+' : '';

        console.log(
          `  ${chalk.bold('Activation:')} ${trailingStopConfig.activationAtrMultiplier}x ATR (${changeSign}$${activationChange.toFixed(2)}, ${activationPercent}%) at $${activationPrice.toFixed(2)}`
        );
      }
    } else if (trailingStopConfig.activationPercent !== undefined) {
      if (trailingStopConfig.activationPercent === 0) {
        console.log(`  ${chalk.bold('Activation:')} Immediate (0% from entry)`);
      } else {
        const activationAmount = entrySignal.price * (trailingStopConfig.activationPercent / 100);
        const activationPrice = isLong
          ? entrySignal.price + activationAmount
          : entrySignal.price - activationAmount;
        const activationChange = activationPrice - entrySignal.price;
        const changeSign = activationChange >= 0 ? '+' : '';

        console.log(
          `  ${chalk.bold('Activation:')} ${trailingStopConfig.activationPercent}% (${changeSign}$${activationChange.toFixed(2)}) at $${activationPrice.toFixed(2)}`
        );
      }
    }

    // Trail amount
    if (trailingStopConfig.trailAtrMultiplier !== undefined) {
      const trailAmount = atrValue ? atrValue * trailingStopConfig.trailAtrMultiplier : 0;
      const trailPercent = atrValue ? ((trailAmount / entrySignal.price) * 100).toFixed(2) : '0.00';
      console.log(
        `  ${chalk.bold('Trail Amount:')} ${trailingStopConfig.trailAtrMultiplier}x ATR ($${trailAmount.toFixed(2)}, ${trailPercent}%)`
      );
    } else if (trailingStopConfig.trailPercent !== undefined) {
      const trailAmount = entrySignal.price * (trailingStopConfig.trailPercent / 100);
      console.log(
        `  ${chalk.bold('Trail Amount:')} ${trailingStopConfig.trailPercent}% ($${trailAmount.toFixed(2)})`
      );
    }
  }
};

/**
 * Display individual LLM responses
 */
const displayIndividualLLMResponses = (responses: any[]): void => {
  console.log(chalk.bold('\n📝 Individual LLM Responses:'));
  responses.forEach((response: any, index: number) => {
    const actionEmoji =
      response.action === 'long' ? '🔼' : response.action === 'short' ? '🔽' : '⏸️';
    const actionColor =
      response.action === 'long'
        ? chalk.green
        : response.action === 'short'
          ? chalk.red
          : chalk.yellow;

    console.log(
      `${chalk.dim(`LLM ${index + 1}:`)} ${actionEmoji} ${actionColor(response.action?.toUpperCase() || 'NO ACTION')}`
    );

    if (response.rationalization) {
      console.log(`   ${chalk.dim('Reasoning:')} ${response.rationalization}`);
    }

    if (response.confidence) {
      console.log(`   ${chalk.dim('Confidence:')} ${response.confidence}/10`);
    }

    if (response.proposedStopLoss) {
      console.log(`   ${chalk.dim('Proposed Stop:')} $${response.proposedStopLoss}`);
    }

    if (response.proposedProfitTarget) {
      console.log(`   ${chalk.dim('Proposed Target:')} $${response.proposedProfitTarget}`);
    }

    if (response.cost) {
      console.log(`   ${chalk.dim('Cost:')} $${response.cost.toFixed(6)}`);
    }

    console.log(''); // Empty line between responses
  });
};

/**
 * Main scout execution function
 */
export const main = async (cmdOptions?: any): Promise<void> => {
  // Load environment variables from .env.local
  dotenv.config({ path: '.env.local' });

  try {
    const options = cmdOptions || program.opts();

    // Load configuration and validate
    const { rawConfig, apiKey } = await loadScoutConfig();
    const polygonService = new PolygonApiService(apiKey);

    // Determine parameters
    const ticker = options.ticker || rawConfig.shared?.ticker;
    const tradeDate = options.date || new Date().toISOString().split('T')[0];

    // Create currentTime in Eastern Time, not local time
    let currentTime: Date;
    if (options.time) {
      // Parse the time as Eastern Time, not local time
      const [hours, minutes] = options.time.split(':').map(Number);
      const [year, month, day] = tradeDate.split('-').map(Number);

      // Create UTC date then adjust for ET (EDT in May is UTC-4)
      const utcDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));
      const etOffsetHours = 4; // EDT offset
      currentTime = new Date(utcDate.getTime() + etOffsetHours * 60 * 60 * 1000);
    } else {
      currentTime = new Date();
    }

    // Calculate previous trading day (simple approach for live data)
    const previousDate = calculatePreviousTradingDay(new Date(tradeDate));

    console.log(chalk.bold(`\n🔍 AlphaGroove Entry Scout`));
    console.log(chalk.dim(`Ticker: ${ticker}`));
    console.log(
      chalk.dim(
        `Analysis Time: ${currentTime.toLocaleString('en-US', { timeZone: 'America/New_York' })}`
      )
    );

    // Display LLM configuration if available
    const llmConfig = rawConfig.shared?.llmConfirmationScreen;
    if (llmConfig) {
      const numCalls = llmConfig.numCalls || 1;
      const temperatures = llmConfig.temperatures
        ? `[${llmConfig.temperatures.join(', ')}]`
        : 'default';
      const threshold = llmConfig.agreementThreshold || 1;
      console.log(
        chalk.dim(
          `LLM Analysis: ${numCalls} calls, temps ${temperatures}, threshold ${threshold} 🧠`
        )
      );
    }

    // Fetch and process market data
    const allBars = await fetchMarketData(polygonService, ticker, tradeDate, previousDate);

    // Fetch daily bars for SMA calculation
    const dailyBars = await fetchDailyBarsForSMA(polygonService, ticker, tradeDate);

    // Create entry signal based on current market conditions
    const entrySignal = createEntrySignal(allBars, tradeDate, currentTime);

    // Filter data to show only trading hours and up to current time
    const filteredBars = filterTradingData(allBars, tradeDate, currentTime);

    // Filter all data to only trading hours (for complete chart)
    const tradingHoursBars = filterTradingHoursOnly(allBars);

    console.log(
      chalk.dim(`Filtered to ${filteredBars.length} bars (trading hours, up to current time)`)
    );
    console.log(
      chalk.dim(`Entry signal: ${entrySignal.timestamp} @ $${entrySignal.price.toFixed(2)}`)
    );

    // Generate chart for analysis
    const chartPath = await generateAnalysisChart(
      ticker,
      tradeDate,
      entrySignal,
      filteredBars,
      tradingHoursBars,
      dailyBars
    );

    if (chartPath) {
      // Perform LLM analysis and display results
      await performLLMAnalysis(chartPath, ticker, tradeDate, entrySignal, rawConfig, options);
    } else {
      console.error(chalk.red('Failed to generate chart'));
      process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red('Error in scout analysis:'), error);
    process.exit(1);
  }
};

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}
