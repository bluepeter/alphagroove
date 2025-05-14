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
  getPriorDayTradingBars,
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
import { calculateATRStopLoss, calculateAverageTrueRangeForDay } from './utils/calculations.js';

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
    const rawEntryPriceFromSQL = rawTradeData.entry_price as number; // This is Close of signal bar
    const signalBarOpenPrice = rawTradeData.market_open as number; // This is Open of signal bar

    // Fetch all bars for the current trading day starting from the signal bar time
    // This is essential to get the signal bar itself and the subsequent execution bar.
    const allBarsForDayOfSignal = fetchBarsForTradingDay(
      mergedConfig.ticker,
      mergedConfig.timeframe,
      tradeDate,
      entryTimestamp.split(' ')[1] // HH:MM:SS of signal bar
    );

    // Identify the signal bar and the potential execution bar (next bar)
    // The first bar in allBarsForDayOfSignal should be the signal bar itself if entryTimestamp matches its start.
    // We need to ensure robustly finding the signal bar and then the next bar.
    const signalBarIndex = allBarsForDayOfSignal.findIndex(bar => bar.timestamp === entryTimestamp);

    if (signalBarIndex === -1) {
      console.warn(
        `[ProcessTradesLoop] Signal bar at ${entryTimestamp} not found in fetched day bars for ${tradeDate}. Skipping trade.`
      );
      continue;
    }

    if (signalBarIndex + 1 >= allBarsForDayOfSignal.length) {
      console.warn(
        `[ProcessTradesLoop] No subsequent bar found for execution after signal at ${entryTimestamp} on ${tradeDate}. Skipping trade.`
      );
      continue;
    }

    const signalBar = allBarsForDayOfSignal[signalBarIndex];
    const executionBar = allBarsForDayOfSignal[signalBarIndex + 1];

    const actualExecutionTimestamp = executionBar.timestamp;
    const executionBarOpenPrice = executionBar.open; // For new contextual "Entry" log
    const executionBarClosePrice = executionBar.close; // New base for P&L and slippage

    const signalDirectionForLlm: 'long' | 'short' =
      initialGlobalDirection === 'llm_decides' ? 'long' : initialGlobalDirection;

    const currentSignal: EnrichedSignal = {
      ticker: mergedConfig.ticker,
      trade_date: tradeDate,
      price: signalBar.close, // LLM still sees the signal bar's close as a key price point
      timestamp: signalBar.timestamp, // Signal time for LLM context
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

    // Calculate ATR from prior day for dynamic exit parameters
    let entryAtrValue: number | undefined;
    // ATR calculation should ideally use data *before* the actualExecutionTimestamp if it needs to be strictly point-in-time
    // For now, using tradeDate which is the date of the signal, assuming prior day bars are sufficient.
    const priorDayBars = await getPriorDayTradingBars(
      mergedConfig.ticker,
      mergedConfig.timeframe,
      tradeDate
    );
    if (priorDayBars.length > 0) {
      entryAtrValue = calculateAverageTrueRangeForDay(priorDayBars);
      if (entryAtrValue !== undefined) {
      } else {
        console.warn(
          `[ATR Calc] Could not calculate Average TR for prior day ${tradeDate}. ATR-based exits will use percentages if configured.`
        );
      }
    } else {
      console.warn(
        `[ATR Calc] No prior day bars found for ${tradeDate} to calculate ATR. ATR-based exits will use percentages if configured.`
      );
    }

    // Apply slippage to entry price based on direction
    const finalEntryPriceForPAndL = applySlippage(
      executionBarClosePrice, // Use CLOSE of EXECUTION bar
      actualTradeDirection === 'long',
      mergedConfig.exitStrategies?.slippage,
      true // This is an entry price
    );

    // Store the original entry price before any modifications to track discrepancies
    // This variable's original purpose might need rethinking or renaming if it was meant to be pre-slippage.
    // For now, it stores the post-slippage price, similar to the old `entryPrice` variable.
    const originalEntryPrice = finalEntryPriceForPAndL;

    // Determine initial stop-loss, profit-target, and trailing stop parameters FOR LOGGING/INFO
    let initialStopLossPrice: number | undefined;
    let initialProfitTargetPrice: number | undefined;
    let tsActivationLevel: number | undefined;
    let tsTrailAmount: number | undefined;
    let isStopLossAtrBased = false;
    let isProfitTargetAtrBased = false;
    let isTrailingStopAtrBased = false;

    const stopLossConfig = mergedConfig.exitStrategies?.stopLoss;
    if (stopLossConfig) {
      if (entryAtrValue && stopLossConfig.atrMultiplier) {
        initialStopLossPrice = calculateATRStopLoss(
          finalEntryPriceForPAndL, // Base on new P&L entry price
          entryAtrValue,
          stopLossConfig.atrMultiplier,
          actualTradeDirection === 'long'
        );
        isStopLossAtrBased = true;
      } else if (stopLossConfig.percentFromEntry) {
        const pct = stopLossConfig.percentFromEntry / 100;
        initialStopLossPrice =
          actualTradeDirection === 'long'
            ? finalEntryPriceForPAndL * (1 - pct)
            : finalEntryPriceForPAndL * (1 + pct);
      }
    }

    const profitTargetConfig = mergedConfig.exitStrategies?.profitTarget;
    if (profitTargetConfig) {
      if (entryAtrValue && profitTargetConfig.atrMultiplier) {
        const offset = entryAtrValue * profitTargetConfig.atrMultiplier;
        initialProfitTargetPrice =
          actualTradeDirection === 'long'
            ? finalEntryPriceForPAndL + offset
            : finalEntryPriceForPAndL - offset;
        isProfitTargetAtrBased = true;
      } else if (profitTargetConfig.percentFromEntry) {
        const pct = profitTargetConfig.percentFromEntry / 100;
        initialProfitTargetPrice =
          actualTradeDirection === 'long'
            ? finalEntryPriceForPAndL * (1 + pct)
            : finalEntryPriceForPAndL * (1 - pct);
      }
    }

    const trailingStopConfig = mergedConfig.exitStrategies?.trailingStop;
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
        isTrailingStopAtrBased = true; // Mark as ATR based if activation is
      } else if (trailingStopConfig.activationPercent) {
        const pct = trailingStopConfig.activationPercent / 100;
        tsActivationLevel =
          actualTradeDirection === 'long'
            ? finalEntryPriceForPAndL * (1 + pct)
            : finalEntryPriceForPAndL * (1 - pct);
      }
      if (entryAtrValue && trailingStopConfig.trailAtrMultiplier !== undefined) {
        tsTrailAmount = entryAtrValue * trailingStopConfig.trailAtrMultiplier;
        isTrailingStopAtrBased = true; // Mark as ATR based if trail is
      } else if (trailingStopConfig.trailPercent) {
        // Store percent to be used by strategy if ATR not used for trail amount
        tsTrailAmount = trailingStopConfig.trailPercent;
      }
    }

    // New code for bar-by-bar exit logic
    // Fetch bars for the trading day and for ATR calculation
    // Re-evaluate if fetchBarsForTradingDay needs adjustment or if tradingDayBars is already correct.
    // `allBarsForDayOfSignal` already contains bars from signal time onwards.
    // Exit strategies filter bars with timestamp > entryTime. If entryTime is actualExecutionTimestamp, they work on bars after execution.
    const barsForExitEvaluation = allBarsForDayOfSignal; // Pass all bars from signal onwards; exit strategies will filter.

    // If we have no bars for the trading day, skip this trade
    // This check might be redundant if already handled by executionBar check, but keep for safety.
    if (barsForExitEvaluation.length === 0) {
      console.warn(`No bars found for trading day ${tradeDate}. Skipping trade.`);
      continue;
    }

    // Evaluate each exit strategy in order
    let exitSignal: ExitSignal | null = null;
    for (const strategy of exitStrategies) {
      const signal = strategy.evaluate(
        finalEntryPriceForPAndL, // Use the new P&L entry price
        actualExecutionTimestamp, // Use the new actual execution time
        barsForExitEvaluation, // Bars available from signal time onwards
        actualTradeDirection === 'long',
        entryAtrValue
      );

      if (signal) {
        exitSignal = signal;
        break; // First exit signal triggered wins
      }
    }

    // If no exit strategy was triggered, use the last bar of the day
    if (!exitSignal && barsForExitEvaluation.length > 0) {
      const lastBar = barsForExitEvaluation[barsForExitEvaluation.length - 1];
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
      // isEntry defaults to false for exit prices
    );

    // Calculate return percentage
    const returnPct =
      actualTradeDirection === 'long'
        ? (exitPrice - finalEntryPriceForPAndL) / finalEntryPriceForPAndL
        : (finalEntryPriceForPAndL - exitPrice) / finalEntryPriceForPAndL;

    // DEBUG: Log detailed calculation information for verification
    // console.debug(
    //   `DEBUG CALC: ${tradeDate} - Direction: ${actualTradeDirection}, Entry: ${finalEntryPriceForPAndL.toFixed(2)}, Exit: ${exitPrice.toFixed(2)}, ` +
    //     `Calculated Return: ${(returnPct * 100).toFixed(4)}%, Exit Reason: ${exitSignal.reason}`
    // );

    // Validate return calculation with a separate helper function to catch inconsistencies
    const validateReturn = () => {
      // Double-check the calculation
      const recalculatedReturn =
        actualTradeDirection === 'long'
          ? (exitPrice - finalEntryPriceForPAndL) / finalEntryPriceForPAndL
          : (finalEntryPriceForPAndL - exitPrice) / finalEntryPriceForPAndL;

      if (Math.abs(returnPct - recalculatedReturn) > 0.000001) {
        console.error(
          `CRITICAL ERROR in return calculation for ${tradeDate}. ` +
            `First calculation: ${returnPct.toFixed(8)}, Second calculation: ${recalculatedReturn.toFixed(8)}`
        );
      }
    };

    // Immediately validate the calculation before proceeding
    validateReturn();

    // Create the trade object with exit information
    const trade = mapRawDataToTrade(
      {
        ...rawTradeData,
        entry_time: actualExecutionTimestamp, // Override with actual execution time
        market_open: executionBarClosePrice, // CHANGED: For new contextual "Entry" log field (was executionBarOpenPrice)
        entry_price: finalEntryPriceForPAndL, // Override with P&L entry price (becomes "Adj Entry")
        // rawTradeData.entry_price (Close of signal bar) is no longer directly used for these primary fields
        // rawTradeData.market_open (Open of signal bar) is also superseded here for these fields
        exit_price: exitPrice,
        exit_time: exitSignal.timestamp,
        return_pct: returnPct,
        exit_reason: exitSignal.reason,
        // Add dynamic exit params for logging
        initialStopLossPrice,
        initialProfitTargetPrice,
        tsActivationLevel,
        tsTrailAmount, // This could be an absolute amount or a percentage
        isStopLossAtrBased,
        isProfitTargetAtrBased,
        isTrailingStopAtrBased,
      },
      actualTradeDirection,
      llmChartPath
    );

    // Perform another validation after creating the trade object to ensure nothing changed
    const finalValidation = () => {
      const finalCalculatedReturn =
        actualTradeDirection === 'long'
          ? (trade.exit_price - trade.entry_price) / trade.entry_price
          : (trade.entry_price - trade.exit_price) / trade.entry_price;

      // Print values for debugging
      // console.debug(
      //   `TRADE INFO: Entry: ${trade.entry_price.toFixed(4)}, Exit: ${trade.exit_price.toFixed(4)}, ` +
      //     `OriginalEntry: ${originalEntryPrice.toFixed(4)}, CalculatedReturn: ${finalCalculatedReturn.toFixed(8)}, ` +
      //     `StoredReturn: ${trade.return_pct.toFixed(8)}`
      // );

      if (Math.abs(trade.return_pct - finalCalculatedReturn) > 0.000001) {
        console.error(
          `CRITICAL ERROR: Trade return_pct (${trade.return_pct.toFixed(8)}) does not match ` +
            `final calculation (${finalCalculatedReturn.toFixed(8)}) for ${tradeDate}`
        );
      }
    };

    // Final validation to catch any issues in the return calculation
    finalValidation();

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
