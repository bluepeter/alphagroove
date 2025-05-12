#!/usr/bin/env node

import { join } from 'path';

import {
  getAvailableEntryPatterns,
  getAvailableExitPatterns,
  getEntryPattern,
} from './patterns/pattern-factory.js';
import { type Signal } from './patterns/types';
import { LlmConfirmationScreen } from './screens/llm-confirmation.screen';
import { type EnrichedSignal, type LLMScreenConfig as ScreenLLMConfig } from './screens/types';
import { isWinningTrade } from './utils/calculations.js';
import {
  generateEntryChart,
  generateEntryCharts as generateBulkEntryCharts,
} from './utils/chart-generator.js';
import {
  createDefaultConfigFile,
  loadConfig,
  mergeConfigWithCliOptions,
  type MergedConfig,
} from './utils/config.js';
import {
  fetchTradesFromQuery,
  fetchBarsForTradingDay,
  fetchBarsForATR,
} from './utils/data-loader.js';
import { mapRawDataToTrade } from './utils/mappers.js';
import {
  printHeader,
  printTradeDetails,
  printYearSummary,
  printOverallSummary,
  printFooter,
  type Trade,
  printYearHeader,
  type OverallTradeStats,
  type DirectionalTradeStats,
} from './utils/output.js';
import { buildAnalysisQuery } from './utils/query-builder.js';
import {
  createExitStrategies,
  ExitStrategy,
  ExitSignal,
  applySlippage,
} from './patterns/exit/exit-strategy.js';
import { calculateATR } from './utils/calculations.js';

const generateChartForLLMDecision = async (
  signalData: EnrichedSignal,
  appOrMergedConfig: MergedConfig,
  entryPatternName: string
): Promise<string> => {
  const entrySignalForChart: Signal = {
    timestamp: signalData.timestamp,
    price: signalData.price,
    type: 'entry',
    direction: signalData.direction,
  };

  try {
    const chartPath = await generateEntryChart({
      ticker: signalData.ticker,
      timeframe: appOrMergedConfig.timeframe,
      entryPatternName: entryPatternName,
      tradeDate: signalData.trade_date,
      entryTimestamp: signalData.timestamp,
      entrySignal: entrySignalForChart,
      outputDir: appOrMergedConfig.chartsDir || './charts',
    });

    if (!chartPath) {
      console.warn(
        `[LLM Prep] Chart generation for ${signalData.trade_date} returned an empty path (likely no data).`
      );
      const chartDir = join(appOrMergedConfig.chartsDir || './charts', entryPatternName);
      const chartFileName = `${signalData.ticker}_${entryPatternName}_${signalData.trade_date.replace(/-/g, '')}_llm_failed.png`;
      return join(chartDir, chartFileName);
    }

    return chartPath;
  } catch (error) {
    console.error(`[LLM Prep] Error generating chart for ${signalData.trade_date}:`, error);
    const chartDir = join(appOrMergedConfig.chartsDir || './charts', entryPatternName);
    const chartFileName = `${signalData.ticker}_${entryPatternName}_${signalData.trade_date.replace(/-/g, '')}_llm_error.png`;
    return join(chartDir, chartFileName);
  }
};

// Export for testing
export const handleLlmTradeScreeningInternal = async (
  currentSignal: EnrichedSignal,
  chartEntryPatternName: string,
  llmScreenInstance: LlmConfirmationScreen | null,
  screenSpecificLLMConfig: ScreenLLMConfig | undefined,
  mergedConfig: MergedConfig,
  rawConfig: any // Consider typing this better if possible
): Promise<{
  proceed: boolean;
  direction?: 'long' | 'short';
  chartPath?: string;
  cost: number;
}> => {
  if (!llmScreenInstance || !screenSpecificLLMConfig?.enabled) {
    return { proceed: true, cost: 0 }; // No direction needed if LLM screen not active
  }
  const chartPathForLLM = await generateChartForLLMDecision(
    currentSignal,
    mergedConfig,
    chartEntryPatternName
  );
  const screenDecision = await llmScreenInstance.shouldSignalProceed(
    currentSignal,
    chartPathForLLM,
    screenSpecificLLMConfig,
    rawConfig // Pass the rawConfig which LlmConfirmationScreen expects as AppConfig
  );

  // screenDecision already includes proceed, cost, and optional direction
  if (!screenDecision.proceed) {
    return { ...screenDecision, chartPath: undefined, cost: screenDecision.cost ?? 0 }; // Ensure chartPath is not set and cost is number
  } else {
    return { ...screenDecision, chartPath: chartPathForLLM, cost: screenDecision.cost ?? 0 }; // Ensure cost is number
  }
};

// Export for testing
export const initializeAnalysis = (cliOptions: Record<string, any>) => {
  const rawConfig = loadConfig(cliOptions.config);
  const mergedConfig = mergeConfigWithCliOptions(rawConfig, cliOptions);

  const llmScreenYAMLConfig = mergedConfig.llmConfirmationScreen;
  let llmScreenInstance: LlmConfirmationScreen | null = null;
  const screenSpecificLLMConfig = llmScreenYAMLConfig as ScreenLLMConfig | undefined;

  if (screenSpecificLLMConfig?.enabled) {
    llmScreenInstance = new LlmConfirmationScreen();
  }

  const entryPattern = getEntryPattern(mergedConfig.entryPattern, mergedConfig);

  // Create exit strategies from config
  const exitStrategies = createExitStrategies(mergedConfig);

  // Generate entry signals query
  const query = buildAnalysisQuery(mergedConfig, entryPattern);

  if (cliOptions.debug || cliOptions.dryRun) {
    console.log('\nDEBUG - SQL Query:\n' + query);
  }

  return {
    rawConfig,
    mergedConfig,
    llmScreenInstance,
    screenSpecificLLMConfig,
    entryPattern,
    exitStrategies,
    query,
  };
};

// Export for testing
export const processTradesLoop = async (
  tradesFromQuery: any[],
  mergedConfig: MergedConfig,
  entryPattern: any,
  exitStrategies: ExitStrategy[],
  llmScreenInstance: LlmConfirmationScreen | null,
  screenSpecificLLMConfig: ScreenLLMConfig | undefined,
  rawConfig: any,
  totalStats: OverallTradeStats
) => {
  let currentYear = '';
  let yearLongTrades: Trade[] = [];
  let yearShortTrades: Trade[] = [];
  const seenYears = new Set<string>();
  let currentYearLlmCost = 0;

  const initialGlobalDirection = mergedConfig.direction;

  for (const rawTradeData of tradesFromQuery) {
    const tradeYear = rawTradeData.year as string;

    if (tradeYear !== currentYear) {
      if (currentYear !== '') {
        if (yearLongTrades.length > 0 || yearShortTrades.length > 0) {
          printYearSummary(
            Number(currentYear),
            yearLongTrades,
            yearShortTrades,
            currentYearLlmCost
          );
        }
      }
      currentYear = tradeYear;
      printYearHeader(currentYear);
      yearLongTrades = [];
      yearShortTrades = [];
      currentYearLlmCost = 0;

      if (!seenYears.has(tradeYear)) {
        seenYears.add(tradeYear);
      }
    }

    const entryTimestamp = rawTradeData.entry_time as string;
    const tradeDate = rawTradeData.trade_date as string;
    const entryPrice = rawTradeData.entry_price as number;

    const signalDirectionForLlm: 'long' | 'short' =
      initialGlobalDirection === 'llm_decides' ? 'long' : initialGlobalDirection;

    const currentSignal: EnrichedSignal = {
      ticker: mergedConfig.ticker,
      trade_date: tradeDate,
      price: entryPrice,
      timestamp: entryTimestamp,
      type: 'entry',
      direction: signalDirectionForLlm,
    };

    const {
      proceed: proceedFromLlm,
      chartPath: llmChartPath,
      cost: screeningCost,
      direction: llmConfirmationDirection,
    } = await handleLlmTradeScreeningInternal(
      currentSignal,
      entryPattern.name,
      llmScreenInstance,
      screenSpecificLLMConfig,
      mergedConfig,
      rawConfig
    );

    currentYearLlmCost += screeningCost;
    totalStats.grandTotalLlmCost += screeningCost;

    if (!proceedFromLlm) {
      continue;
    }

    let actualTradeDirection: 'long' | 'short';

    if (llmConfirmationDirection) {
      // LLM screen was active and decided/confirmed a direction
      actualTradeDirection = llmConfirmationDirection;
    } else if (!llmScreenInstance || !screenSpecificLLMConfig?.enabled) {
      // LLM screen not active / specified no direction
      if (initialGlobalDirection === 'llm_decides') {
        console.warn(
          "[processTradesLoop] LLM screen did not provide direction for 'llm_decides' strategy, or was disabled. Defaulting to 'long'. Trade on " +
            rawTradeData.trade_date
        );
        actualTradeDirection = 'long';
      } else {
        actualTradeDirection = initialGlobalDirection; // Use the fixed global direction
      }
    } else {
      // LLM screen was active, said proceed, but provided no direction. This is an error state for an active LLM screen.
      console.warn(
        `[processTradesLoop] LLM proceeded but no direction confirmed by active LLM screen. Skipping trade for ${rawTradeData.trade_date}.`
      );
      continue;
    }

    // New code for bar-by-bar exit logic
    // Fetch bars for the trading day and for ATR calculation
    const tradingDayBars = fetchBarsForTradingDay(
      mergedConfig.ticker,
      mergedConfig.timeframe,
      tradeDate,
      entryTimestamp.split(' ')[1] // Extract HH:MM:SS part
    );

    // If we have no bars for the trading day, skip this trade
    if (tradingDayBars.length === 0) {
      console.warn(`No bars found for trading day ${tradeDate}. Skipping trade.`);
      continue;
    }

    // Fetch bars for ATR calculation if needed
    let atr: number | undefined;
    if (
      exitStrategies.some(
        es =>
          (es.name === 'stopLoss' || es.name === 'profitTarget') &&
          mergedConfig.exitStrategies?.[es.name]?.atrMultiplier
      )
    ) {
      const atrBars = fetchBarsForATR(
        mergedConfig.ticker,
        mergedConfig.timeframe,
        tradeDate,
        entryTimestamp.split(' ')[1],
        14 // Use 14 periods for ATR calculation
      );

      atr = calculateATR(atrBars);
    }

    // Evaluate each exit strategy in order
    let exitSignal: ExitSignal | null = null;
    for (const strategy of exitStrategies) {
      const signal = strategy.evaluate(
        entryPrice,
        entryTimestamp,
        tradingDayBars,
        actualTradeDirection === 'long',
        atr
      );

      if (signal) {
        exitSignal = signal;
        break; // First exit signal triggered wins
      }
    }

    // If no exit strategy was triggered, use the last bar of the day
    if (!exitSignal && tradingDayBars.length > 0) {
      const lastBar = tradingDayBars[tradingDayBars.length - 1];
      exitSignal = {
        timestamp: lastBar.timestamp,
        price: lastBar.close,
        type: 'exit',
        reason: 'endOfDay',
      };
    }

    // If we still don't have an exit signal (shouldn't happen), skip this trade
    if (!exitSignal) {
      console.warn(`No exit signal found for trade on ${tradeDate}. Skipping trade.`);
      continue;
    }

    // Apply slippage to exit price
    const exitPrice = applySlippage(
      exitSignal.price,
      actualTradeDirection === 'long',
      mergedConfig.exitStrategies?.slippage
    );

    // Calculate return percentage
    const returnPct =
      actualTradeDirection === 'long'
        ? (exitPrice - entryPrice) / entryPrice
        : (entryPrice - exitPrice) / entryPrice;

    // Create the trade object with exit information
    const trade = mapRawDataToTrade(
      {
        ...rawTradeData,
        exit_price: exitPrice,
        exit_time: exitSignal.timestamp,
        return_pct: returnPct,
        exit_reason: exitSignal.reason,
      },
      actualTradeDirection,
      llmChartPath
    );

    const statsBucket =
      actualTradeDirection === 'long' ? totalStats.long_stats : totalStats.short_stats;
    statsBucket.trades.push(trade);
    statsBucket.all_returns.push(returnPct);
    statsBucket.total_return_sum += returnPct;
    if (isWinningTrade(returnPct, actualTradeDirection === 'short')) {
      statsBucket.winning_trades++;
    }

    if (actualTradeDirection === 'long') {
      yearLongTrades.push(trade);
    } else {
      yearShortTrades.push(trade);
    }

    printTradeDetails(trade);
  }

  if (currentYear !== '' && (yearLongTrades.length > 0 || yearShortTrades.length > 0)) {
    printYearSummary(Number(currentYear), yearLongTrades, yearShortTrades, currentYearLlmCost);
  }
  const confirmedTrades = [...totalStats.long_stats.trades, ...totalStats.short_stats.trades];
  return { confirmedTradesCount: confirmedTrades.length };
};

// Export for testing
export const finalizeAnalysis = async (
  totalStats: OverallTradeStats,
  entryPattern: any,
  mergedConfig: MergedConfig
) => {
  const confirmedTrades = [...totalStats.long_stats.trades, ...totalStats.short_stats.trades];
  totalStats.total_llm_confirmed_trades = confirmedTrades.length;

  printOverallSummary(totalStats);

  if (mergedConfig.generateCharts && totalStats.total_llm_confirmed_trades > 0) {
    const llmScreenEnabled = mergedConfig.llmConfirmationScreen?.enabled;

    if (llmScreenEnabled) {
      const chartPaths: string[] = [];
      confirmedTrades.forEach(trade => {
        if (trade.chartPath) {
          chartPaths.push(trade.chartPath);
        }
      });
      if (chartPaths.length > 0) {
        // Optionally, you might want a more subtle confirmation or no confirmation at all.
        // For now, removing the specific lines as requested.
      } else {
        console.log(
          '\nLLM screening was enabled, but no chart paths were found for confirmed trades.'
        );
      }
    } else {
      console.log('\nGenerating multiday charts for confirmed entry points...');
      const tradesForBulkCharts = confirmedTrades.map(ct => ({
        trade_date: ct.trade_date,
        entry_time: ct.entry_time,
        entry_price: ct.entry_price,
        direction: ct.direction,
      }));
      const chartPaths = await generateBulkEntryCharts(
        mergedConfig.ticker,
        mergedConfig.timeframe,
        entryPattern.name,
        tradesForBulkCharts,
        mergedConfig.chartsDir || './charts'
      );
      console.log(
        `\nGenerated ${chartPaths.length} charts in ${mergedConfig.chartsDir || './charts'}/${entryPattern.name}/`
      );
    }
  } else if (mergedConfig.generateCharts && confirmedTrades.length === 0) {
    console.log('\nChart generation enabled, but no trades to chart.');
  }

  printFooter();
};

export const runAnalysis = async (cliOptions: Record<string, any>): Promise<void> => {
  try {
    const {
      rawConfig,
      mergedConfig,
      llmScreenInstance,
      screenSpecificLLMConfig,
      entryPattern,
      exitStrategies,
      query,
    } = initializeAnalysis(cliOptions);

    if (cliOptions.dryRun) {
      console.log('\nDry run requested. Exiting without executing query.');
      printFooter();
      return;
    }

    const tradesFromQuery = fetchTradesFromQuery(query);

    // Determine exit strategy name for header
    let exitStrategyName = 'default';
    if (mergedConfig.exitStrategies?.enabled && mergedConfig.exitStrategies.enabled.length > 0) {
      exitStrategyName = mergedConfig.exitStrategies.enabled.join(', ');
    }

    printHeader(
      mergedConfig.ticker,
      mergedConfig.from,
      mergedConfig.to,
      entryPattern.name,
      exitStrategyName,
      mergedConfig.direction as 'long' | 'short'
    );

    // Ensure distinct arrays for long_stats and short_stats
    const initialDirectionalStatsTemplate: Omit<DirectionalTradeStats, 'trades' | 'all_returns'> = {
      winning_trades: 0,
      total_return_sum: 0,
    };

    const totalStats: OverallTradeStats = {
      long_stats: { ...initialDirectionalStatsTemplate, trades: [], all_returns: [] },
      short_stats: { ...initialDirectionalStatsTemplate, trades: [], all_returns: [] },
      total_trading_days: 0,
      total_raw_matches: 0,
      total_llm_confirmed_trades: 0,
      grandTotalLlmCost: 0,
    };

    if (tradesFromQuery.length > 0 && tradesFromQuery[0].all_trading_days) {
      totalStats.total_trading_days = tradesFromQuery[0].all_trading_days as number;
    }
    totalStats.total_raw_matches = tradesFromQuery.length;

    await processTradesLoop(
      tradesFromQuery,
      mergedConfig,
      entryPattern,
      exitStrategies,
      llmScreenInstance,
      screenSpecificLLMConfig,
      rawConfig,
      totalStats
    );

    await finalizeAnalysis(totalStats, entryPattern, mergedConfig);
  } catch (error) {
    console.error('Error running analysis:', error);
    // Don't exit the process during tests
    if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
      process.exit(1);
    }
    // Re-throw the error so tests can catch it
    throw error;
  }
};

const parseCLI = async () => {
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
      if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
        process.exit(0);
      }
    });

  program
    .command('list-patterns')
    .description('List available patterns')
    .action(() => {
      console.log('\nAvailable Entry Patterns:');
      getAvailableEntryPatterns().forEach(pattern => console.log(`- ${pattern}`));

      console.log('\nAvailable Exit Patterns:');
      getAvailableExitPatterns().forEach(pattern => console.log(`- ${pattern}`));

      if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
        process.exit(0);
      }
    });

  program.allowUnknownOption(true);

  program.action(() => {});

  await program.parseAsync(process.argv);

  const options = program.opts();
  const allOptions = { ...options };

  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--') && arg.includes('.') && args[i + 1] && !args[i + 1].startsWith('--')) {
      const key = arg.slice(2);
      const value = args[i + 1];

      const [patternName, propName] = key.split('.');

      if (!allOptions[patternName]) {
        allOptions[patternName] = {};
      }

      const numValue = Number(value);
      allOptions[patternName][propName] = isNaN(numValue) ? value : numValue;

      i++;
    }
  }

  return allOptions;
};

const main = async () => {
  try {
    const cliOptions = await parseCLI();
    await runAnalysis(cliOptions);
  } catch (error) {
    console.error('Error:', error);
    if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
      process.exit(1);
    }
  }
};

main();
