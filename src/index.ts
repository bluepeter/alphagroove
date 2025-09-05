#!/usr/bin/env node

import dotenv from 'dotenv';
import { join } from 'path';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config(); // fallback to .env

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
import { fetchTradesFromQuery, fetchBarsForTradingDay } from './utils/data-loader.js';
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
  applySlippage,
} from './patterns/exit/exit-strategy.js';
import { calculateATRStopLoss } from './utils/calculations.js';
import { calculateEntryAtr, evaluateExitStrategies } from './utils/trade-processing';

// Group trades by year and then by individual trading days for parallel processing
const groupTradesByYearAndDay = (tradesFromQuery: any[]): Map<string, Map<string, any[]>> => {
  const yearGroups = new Map<string, Map<string, any[]>>();

  for (const trade of tradesFromQuery) {
    const year = trade.year as string;
    const tradeDate = trade.trade_date as string;

    if (!yearGroups.has(year)) {
      yearGroups.set(year, new Map<string, any[]>());
    }

    const dayGroups = yearGroups.get(year)!;
    if (!dayGroups.has(tradeDate)) {
      dayGroups.set(tradeDate, []);
    }

    dayGroups.get(tradeDate)!.push(trade);
  }

  return yearGroups;
};

const generateChartForLLMDecision = async (
  signalData: EnrichedSignal,
  appOrMergedConfig: MergedConfig,
  entryPatternName: string
): Promise<string> => {
  const entrySignalForChart: Signal = {
    timestamp: signalData.timestamp,
    price: signalData.price,
    type: 'entry',
  };

  try {
    const chartPath = await generateEntryChart({
      ticker: signalData.ticker,
      timeframe: appOrMergedConfig.timeframe,
      entryPatternName: entryPatternName,
      tradeDate: signalData.trade_date,
      entryTimestamp: signalData.timestamp,
      entrySignal: entrySignalForChart,
      suppressSma: appOrMergedConfig.suppressSma,
      suppressVwap: appOrMergedConfig.suppressVwap,
    });

    if (!chartPath) {
      console.warn(
        `[LLM Prep] Chart generation for ${signalData.trade_date} returned an empty path (likely no data).`
      );
      const chartDir = join('./charts', entryPatternName);
      const chartFileName = `${signalData.ticker}_${entryPatternName}_${signalData.trade_date.replace(/-/g, '')}_llm_failed.png`;
      return join(chartDir, chartFileName);
    }

    return chartPath;
  } catch (error) {
    console.error(`[LLM Prep] Error generating chart for ${signalData.trade_date}:`, error);
    const chartDir = join('./charts', entryPatternName);
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
  rawConfig: any, // Consider typing this better if possible
  debug?: boolean
): Promise<{
  proceed: boolean;
  direction?: 'long' | 'short';
  chartPath?: string;
  cost: number;
  averagedProposedStopLoss?: number;
  averagedProposedProfitTarget?: number;
}> => {
  if (!llmScreenInstance || !screenSpecificLLMConfig) {
    return { proceed: true, cost: 0 }; // No LLM screen active
  }
  const chartPathForLLM = await generateChartForLLMDecision(
    currentSignal,
    mergedConfig,
    chartEntryPatternName
  );

  // Generate market metrics for backtest LLM prompts (if not suppressed)
  // Fetch the same multi-day data that the chart generator uses
  const { fetchMultiDayData } = await import('./utils/chart-generator');
  const { generateMarketMetricsForPrompt } = await import('./utils/market-metrics');

  let marketMetrics: string | undefined = undefined;

  // Check if metrics should be suppressed in prompts
  const suppressMetricsInPrompts = rawConfig.shared?.suppressMetricsInPrompts ?? false;

  if (!suppressMetricsInPrompts) {
    try {
      // Fetch multi-day data for market metrics calculation (same as chart generation)
      const allBars = await fetchMultiDayData(
        currentSignal.ticker,
        mergedConfig.timeframe,
        currentSignal.trade_date,
        25
      );

      // Create entry signal for market metrics
      const entrySignal = {
        timestamp: currentSignal.timestamp,
        price: currentSignal.price,
        type: 'entry' as const,
      };

      // Generate market metrics (no daily bars for backtest - will aggregate from intraday)
      marketMetrics = generateMarketMetricsForPrompt(
        allBars,
        entrySignal,
        undefined,
        mergedConfig.suppressSma,
        mergedConfig.suppressVwap
      );
    } catch (error) {
      console.warn('[LLM Prep] Failed to generate market metrics for backtest:', error);
    }
  }

  const screenDecision = await llmScreenInstance.shouldSignalProceed(
    currentSignal,
    chartPathForLLM,
    screenSpecificLLMConfig,
    rawConfig, // Pass the rawConfig which LlmConfirmationScreen expects as AppConfig
    undefined, // context
    debug, // Pass debug flag
    marketMetrics // market metrics
  );

  // screenDecision already includes proceed, cost, and LLM analysis
  if (!screenDecision.proceed) {
    return { ...screenDecision, chartPath: undefined, cost: screenDecision.cost ?? 0 }; // Ensure chartPath is not set and cost is number
  } else {
    // Include averaged prices if proceeding
    return {
      proceed: screenDecision.proceed,
      direction: screenDecision.direction,
      chartPath: chartPathForLLM,
      cost: screenDecision.cost ?? 0,
      averagedProposedStopLoss: screenDecision.averagedProposedStopLoss,
      averagedProposedProfitTarget: screenDecision.averagedProposedProfitTarget,
    };
  }
};

// Export for testing
export const initializeAnalysis = (cliOptions: Record<string, any>) => {
  const rawConfig = loadConfig(cliOptions.config);
  const mergedConfig = mergeConfigWithCliOptions(rawConfig, cliOptions);

  const llmScreenYAMLConfig = mergedConfig.llmConfirmationScreen;
  let llmScreenInstance: LlmConfirmationScreen | null = null;
  const screenSpecificLLMConfig = llmScreenYAMLConfig as ScreenLLMConfig | undefined;

  if (screenSpecificLLMConfig) {
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
  totalStats: OverallTradeStats,
  debug?: boolean
) => {
  // Group trades by year and day for parallel processing
  const yearGroups = groupTradesByYearAndDay(tradesFromQuery);

  if (debug) {
    console.log(
      `Processing ${yearGroups.size} years with max ${mergedConfig.maxConcurrentDays} concurrent days per year`
    );
  }

  // Process each year sequentially but parallelize days within each year
  for (const [year, dayGroups] of yearGroups) {
    printYearHeader(year);

    const yearLongTrades: Trade[] = [];
    const yearShortTrades: Trade[] = [];
    let yearLlmCost = 0;

    // Process days in parallel batches
    const dayEntries = Array.from(dayGroups.entries());
    const maxConcurrentDays = mergedConfig.maxConcurrentDays;

    for (let i = 0; i < dayEntries.length; i += maxConcurrentDays) {
      const batch = dayEntries.slice(i, i + maxConcurrentDays);

      const batchPromises = batch.map(async ([tradeDate, dayTrades]) => {
        if (debug) {
          console.log(`Processing ${tradeDate} with ${dayTrades.length} trades...`);
        }

        // Process all trades for this day using the existing logic
        const dayResults = await processDayTrades(
          dayTrades,
          mergedConfig,
          entryPattern,
          exitStrategies,
          llmScreenInstance,
          screenSpecificLLMConfig,
          rawConfig,
          totalStats,
          debug
        );

        return dayResults;
      });

      const batchResults = await Promise.all(batchPromises);

      // Aggregate results from this batch
      for (const dayResult of batchResults) {
        yearLongTrades.push(...dayResult.longTrades);
        yearShortTrades.push(...dayResult.shortTrades);
        yearLlmCost += dayResult.llmCost;
      }

      if (debug && batch.length > 1) {
        console.log(`Completed batch of ${batch.length} days`);
      }
    }

    // Update total stats for the year
    totalStats.long_stats.trades.push(...yearLongTrades);
    totalStats.short_stats.trades.push(...yearShortTrades);

    for (const trade of yearLongTrades) {
      totalStats.long_stats.all_returns.push(trade.return_pct);
      totalStats.long_stats.total_return_sum += trade.return_pct;
      if (isWinningTrade(trade.return_pct, false)) {
        totalStats.long_stats.winning_trades++;
      }
    }

    for (const trade of yearShortTrades) {
      totalStats.short_stats.all_returns.push(trade.return_pct);
      totalStats.short_stats.total_return_sum += trade.return_pct;
      if (isWinningTrade(trade.return_pct, true)) {
        totalStats.short_stats.winning_trades++;
      }
    }

    totalStats.grandTotalLlmCost += yearLlmCost;

    // Print year summary
    if (yearLongTrades.length > 0 || yearShortTrades.length > 0) {
      printYearSummary(Number(year), yearLongTrades, yearShortTrades, yearLlmCost);
    }
  }

  const confirmedTrades = [...totalStats.long_stats.trades, ...totalStats.short_stats.trades];
  return { confirmedTradesCount: confirmedTrades.length };
};

// Process all trades for a single day - extracted from the original logic
const processDayTrades = async (
  dayTrades: any[],
  mergedConfig: MergedConfig,
  entryPattern: any,
  exitStrategies: ExitStrategy[],
  llmScreenInstance: LlmConfirmationScreen | null,
  screenSpecificLLMConfig: ScreenLLMConfig | undefined,
  rawConfig: any,
  totalStats: OverallTradeStats,
  debug?: boolean
): Promise<{
  longTrades: Trade[];
  shortTrades: Trade[];
  llmCost: number;
}> => {
  const longTrades: Trade[] = [];
  const shortTrades: Trade[] = [];
  let llmCost = 0;

  for (const rawTradeData of dayTrades) {
    const entrySignalTimestamp = rawTradeData.entry_time as string;
    const tradeDate = rawTradeData.trade_date as string;
    const _rawEntryPriceFromSQL = rawTradeData.entry_price as number;
    const _signalBarOpenPrice = rawTradeData.market_open as number;

    const allBarsForDayOfSignal = fetchBarsForTradingDay(
      mergedConfig.ticker,
      mergedConfig.timeframe,
      tradeDate,
      entrySignalTimestamp.split(' ')[1]
    );

    const signalBarIndex = allBarsForDayOfSignal.findIndex(
      bar => bar.timestamp === entrySignalTimestamp
    );
    if (signalBarIndex === -1) {
      console.warn(
        `[ProcessTradesLoop] Signal bar at ${entrySignalTimestamp} not found in fetched day bars for ${tradeDate}. Skipping trade.`
      );
      continue;
    }
    if (signalBarIndex + 1 >= allBarsForDayOfSignal.length) {
      console.warn(
        `[ProcessTradesLoop] No subsequent bar found for execution after signal at ${entrySignalTimestamp} on ${tradeDate}. Skipping trade.`
      );
      continue;
    }

    const signalBar = allBarsForDayOfSignal[signalBarIndex];
    const executionBar = allBarsForDayOfSignal[signalBarIndex + 1];

    const actualExecutionTimestamp = executionBar.timestamp;
    const executionBarClosePrice = executionBar.close;

    const currentSignal: EnrichedSignal = {
      ticker: mergedConfig.ticker,
      trade_date: tradeDate,
      price: signalBar.close,
      timestamp: signalBar.timestamp,
      type: 'entry',
    };

    const {
      proceed: proceedFromLlm,
      chartPath: llmChartPath,
      cost: screeningCost,
      direction: llmDirection,
      averagedProposedStopLoss: llmAveragedStopLoss,
      averagedProposedProfitTarget: llmAveragedProfitTarget,
    } = await handleLlmTradeScreeningInternal(
      currentSignal,
      entryPattern.name,
      llmScreenInstance,
      screenSpecificLLMConfig,
      mergedConfig,
      rawConfig,
      debug
    );

    llmCost += screeningCost;

    if (!proceedFromLlm || !llmDirection) {
      // LLM returned do_nothing - silently skip this trade
      continue;
    }

    const actualTradeDirection = llmDirection;

    const entryAtrValue = await calculateEntryAtr(
      mergedConfig.ticker,
      mergedConfig.timeframe,
      tradeDate
    );

    const finalEntryPriceForPAndL = applySlippage(
      executionBarClosePrice,
      actualTradeDirection === 'long',
      mergedConfig.execution?.slippage,
      true
    );

    const _originalEntryPrice = finalEntryPriceForPAndL;

    let initialStopLossPrice: number | undefined;
    let initialProfitTargetPrice: number | undefined;
    let tsActivationLevel: number | undefined;
    let tsTrailAmount: number | undefined;
    let isStopLossAtrBased = false;
    let isProfitTargetAtrBased = false;
    let isTrailingStopAtrBased = false;
    let isStopLossLlmBased = false;
    let isProfitTargetLlmBased = false;
    let stopLossAtrMultiplierUsed: number | undefined;
    let profitTargetAtrMultiplierUsed: number | undefined;
    let tsActivationAtrMultiplierUsed: number | undefined;
    let tsTrailAtrMultiplierUsed: number | undefined;

    const stopLossConfig = mergedConfig.exitStrategies?.strategyOptions?.stopLoss;
    if (stopLossConfig) {
      if (
        stopLossConfig.useLlmProposedPrice &&
        typeof llmAveragedStopLoss === 'number' &&
        !isNaN(llmAveragedStopLoss)
      ) {
        initialStopLossPrice = llmAveragedStopLoss;
        isStopLossLlmBased = true;
      } else if (entryAtrValue && stopLossConfig.atrMultiplier) {
        initialStopLossPrice = calculateATRStopLoss(
          finalEntryPriceForPAndL,
          entryAtrValue,
          stopLossConfig.atrMultiplier,
          actualTradeDirection === 'long'
        );
        isStopLossAtrBased = true;
        stopLossAtrMultiplierUsed = stopLossConfig.atrMultiplier;
      } else if (stopLossConfig.percentFromEntry) {
        const pct = stopLossConfig.percentFromEntry / 100;
        initialStopLossPrice =
          actualTradeDirection === 'long'
            ? finalEntryPriceForPAndL * (1 - pct)
            : finalEntryPriceForPAndL * (1 + pct);
      }
    }

    const profitTargetConfig = mergedConfig.exitStrategies?.strategyOptions?.profitTarget;
    if (profitTargetConfig) {
      if (
        profitTargetConfig.useLlmProposedPrice &&
        typeof llmAveragedProfitTarget === 'number' &&
        !isNaN(llmAveragedProfitTarget)
      ) {
        initialProfitTargetPrice = llmAveragedProfitTarget;
        isProfitTargetLlmBased = true;
      } else if (entryAtrValue && profitTargetConfig.atrMultiplier) {
        const offset = entryAtrValue * profitTargetConfig.atrMultiplier;
        initialProfitTargetPrice =
          actualTradeDirection === 'long'
            ? finalEntryPriceForPAndL + offset
            : finalEntryPriceForPAndL - offset;
        isProfitTargetAtrBased = true;
        profitTargetAtrMultiplierUsed = profitTargetConfig.atrMultiplier;
      } else if (profitTargetConfig.percentFromEntry) {
        const pct = profitTargetConfig.percentFromEntry / 100;
        initialProfitTargetPrice =
          actualTradeDirection === 'long'
            ? finalEntryPriceForPAndL * (1 + pct)
            : finalEntryPriceForPAndL * (1 - pct);
      }
    }

    const trailingStopConfig = mergedConfig.exitStrategies?.strategyOptions?.trailingStop;
    if (trailingStopConfig) {
      if (entryAtrValue && trailingStopConfig.activationAtrMultiplier !== undefined) {
        if (trailingStopConfig.activationAtrMultiplier === 0) {
          tsActivationLevel = finalEntryPriceForPAndL;
        } else {
          const offset = entryAtrValue * trailingStopConfig.activationAtrMultiplier;
          tsActivationLevel =
            actualTradeDirection === 'long'
              ? finalEntryPriceForPAndL + offset
              : finalEntryPriceForPAndL - offset;
        }
        isTrailingStopAtrBased = true;
        tsActivationAtrMultiplierUsed = trailingStopConfig.activationAtrMultiplier;
      } else if (trailingStopConfig.activationPercent) {
        const pct = trailingStopConfig.activationPercent / 100;
        tsActivationLevel =
          actualTradeDirection === 'long'
            ? finalEntryPriceForPAndL * (1 + pct)
            : finalEntryPriceForPAndL * (1 - pct);
      }
      if (entryAtrValue && trailingStopConfig.trailAtrMultiplier !== undefined) {
        tsTrailAmount = entryAtrValue * trailingStopConfig.trailAtrMultiplier;
        isTrailingStopAtrBased = true;
        tsTrailAtrMultiplierUsed = trailingStopConfig.trailAtrMultiplier;
      } else if (trailingStopConfig.trailPercent) {
        tsTrailAmount = trailingStopConfig.trailPercent;
      }
    }

    const barsForExitEvaluation = allBarsForDayOfSignal;
    if (barsForExitEvaluation.length === 0) {
      console.warn(
        `No bars found for trading day ${tradeDate} for exit evaluation. Skipping trade.`
      );
      continue;
    }

    const exitSignal = evaluateExitStrategies(
      finalEntryPriceForPAndL,
      actualExecutionTimestamp,
      barsForExitEvaluation,
      actualTradeDirection,
      entryAtrValue,
      exitStrategies,
      initialStopLossPrice,
      initialProfitTargetPrice
    );

    if (!exitSignal) {
      console.warn(
        `No exit signal generated for trade on ${tradeDate} (Entry: ${actualExecutionTimestamp}). Skipping trade.`
      );
      continue;
    }

    const exitPrice = applySlippage(
      exitSignal.price,
      actualTradeDirection === 'long',
      mergedConfig.execution?.slippage
    );

    const returnPct =
      actualTradeDirection === 'long'
        ? (exitPrice - finalEntryPriceForPAndL) / finalEntryPriceForPAndL
        : (finalEntryPriceForPAndL - exitPrice) / finalEntryPriceForPAndL;

    const trade = mapRawDataToTrade(
      {
        ...rawTradeData,
        entry_time: actualExecutionTimestamp,
        executionPriceBase: executionBar.close,
        entry_price: finalEntryPriceForPAndL,
        exit_price: exitPrice,
        exit_time: exitSignal.timestamp,
        return_pct: returnPct,
        exit_reason: exitSignal.reason,
        initialStopLossPrice,
        initialProfitTargetPrice,
        tsActivationLevel,
        tsTrailAmount,
        isStopLossAtrBased,
        isProfitTargetAtrBased,
        isTrailingStopAtrBased,
        isStopLossLlmBased,
        isProfitTargetLlmBased,
        stopLossAtrMultiplierUsed,
        profitTargetAtrMultiplierUsed,
        entryAtrValue,
        tsActivationAtrMultiplierUsed,
        tsTrailAtrMultiplierUsed,
      },
      actualTradeDirection,
      llmChartPath
    );

    const finalValidation = () => {
      const finalCalculatedReturn =
        actualTradeDirection === 'long'
          ? (trade.exit_price - trade.entry_price) / trade.entry_price
          : (trade.entry_price - trade.exit_price) / trade.entry_price;
      if (Math.abs(trade.return_pct - finalCalculatedReturn) > 0.000001) {
        console.error(
          `CRITICAL ERROR: Trade return_pct (${trade.return_pct.toFixed(8)}) does not match ` +
            `final calculation (${finalCalculatedReturn.toFixed(8)}) for ${trade.trade_date}`
        );
      }
    };
    finalValidation();

    // Print trade details immediately as each trade completes
    printTradeDetails(trade);

    if (actualTradeDirection === 'long') {
      longTrades.push(trade);
    } else {
      shortTrades.push(trade);
    }
  }

  return { longTrades, shortTrades, llmCost };
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

  if (totalStats.total_llm_confirmed_trades > 0) {
    const llmScreenEnabled = !!mergedConfig.llmConfirmationScreen;

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
        mergedConfig.suppressSma,
        mergedConfig.suppressVwap
      );
      console.log(`\nGenerated ${chartPaths.length} charts in ./charts/${entryPattern.name}/`);
    }
  } else if (confirmedTrades.length === 0) {
    console.log('\nNo trades to chart.');
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

    printHeader(
      mergedConfig.ticker,
      mergedConfig.from,
      mergedConfig.to,
      entryPattern.name,
      mergedConfig.exitStrategies,
      'llm_decides',
      mergedConfig.llmConfirmationScreen
        ? {
            numCalls: mergedConfig.llmConfirmationScreen.numCalls,
            temperatures: mergedConfig.llmConfirmationScreen.temperatures,
            agreementThreshold: mergedConfig.llmConfirmationScreen.agreementThreshold,
            llmProvider: mergedConfig.llmConfirmationScreen.llmProvider,
            modelName: mergedConfig.llmConfirmationScreen.modelName,
          }
        : undefined
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
      totalStats,
      cliOptions.debug || cliOptions.verbose
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

    .option(
      '--maxConcurrentDays <number>',
      'Maximum number of days to process concurrently (1-20)',
      parseInt
    )
    .option('--debug', 'Show debug information')
    .option('--verbose', 'Show detailed LLM responses and debug information')
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

// Only run main if this script is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
