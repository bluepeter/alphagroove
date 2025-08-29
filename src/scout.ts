#!/usr/bin/env node

import dotenv from 'dotenv';
import chalk from 'chalk';
import { Command } from 'commander';
import { loadConfig } from './utils/config';
import { Bar, Signal } from './patterns/types';
import { LlmConfirmationScreen } from './screens/llm-confirmation.screen';
import type { EnrichedSignal } from './screens/types';
import { PolygonApiService } from './services/polygon-api.service';
import { getPreviousTradingDay } from './utils/date-helpers';
import {
  convertPolygonData,
  filterTradingData,
  filterTradingHoursOnly,
  parseTimestampAsET,
} from './utils/polygon-data-converter';
import { generateScoutChart, type ScoutChartOptions } from './utils/scout-chart-generator';

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
  allBars: Bar[]
): Promise<string> => {
  const chartOptions: ScoutChartOptions = {
    ticker,
    entryPatternName: 'scout',
    tradeDate,
    entrySignal,
    data: filteredBars,
    allData: allBars,
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
  console.log(chalk.bold(`Chart saved to: ${chartPath}`));
  const completeChartPath = chartPath.replace('.png', '_complete.png');
  console.log(chalk.dim(`Complete chart: ${completeChartPath}`));

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
      displayTradingInstructions(entrySignal, llmDecision);
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
const displayTradingInstructions = (entrySignal: Signal, llmDecision: any): void => {
  console.log(chalk.bold('\n📋 Manual Trading Instructions:'));
  console.log(`${chalk.bold('Entry Price:')} $${entrySignal.price.toFixed(2)}`);

  if (llmDecision.averagedProposedStopLoss) {
    const stopLossDistance = Math.abs(entrySignal.price - llmDecision.averagedProposedStopLoss);
    const stopLossPercent = ((stopLossDistance / entrySignal.price) * 100).toFixed(2);
    console.log(
      `${chalk.bold('Stop Loss:')} $${llmDecision.averagedProposedStopLoss.toFixed(2)} (${stopLossPercent}% risk)`
    );
  }

  if (llmDecision.averagedProposedProfitTarget) {
    const profitDistance = Math.abs(llmDecision.averagedProposedProfitTarget - entrySignal.price);
    const profitPercent = ((profitDistance / entrySignal.price) * 100).toFixed(2);
    console.log(
      `${chalk.bold('Profit Target:')} $${llmDecision.averagedProposedProfitTarget.toFixed(2)} (${profitPercent}% gain)`
    );
  }

  if (llmDecision.averagedProposedStopLoss && llmDecision.averagedProposedProfitTarget) {
    const riskAmount = Math.abs(entrySignal.price - llmDecision.averagedProposedStopLoss);
    const rewardAmount = Math.abs(llmDecision.averagedProposedProfitTarget - entrySignal.price);
    const riskRewardRatio = (rewardAmount / riskAmount).toFixed(2);
    console.log(`${chalk.bold('Risk/Reward Ratio:')} 1:${riskRewardRatio}`);
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

    // Calculate date range
    const previousDate = getPreviousTradingDay(new Date(tradeDate));

    console.log(chalk.bold(`\n🔍 AlphaGroove Entry Scout`));
    console.log(chalk.dim(`Ticker: ${ticker}`));
    console.log(
      chalk.dim(
        `Analysis Time: ${currentTime.toLocaleString('en-US', { timeZone: 'America/New_York' })}`
      )
    );

    // Fetch and process market data
    const allBars = await fetchMarketData(polygonService, ticker, tradeDate, previousDate);

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
      tradingHoursBars
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
