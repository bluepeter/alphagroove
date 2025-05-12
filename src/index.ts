#!/usr/bin/env node

import { join } from 'path';

import {
  getAvailableEntryPatterns,
  getAvailableExitPatterns,
  getEntryPattern,
  getExitPattern,
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
import { fetchTradesFromQuery } from './utils/data-loader.js';
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
  const exitPattern = getExitPattern(undefined, mergedConfig);

  const query = buildAnalysisQuery(mergedConfig, entryPattern, exitPattern);

  if (cliOptions.debug || cliOptions.dryRun) {
    console.log('\nDEBUG - SQL Query:\n' + query);
  }

  return {
    rawConfig,
    mergedConfig,
    llmScreenInstance,
    screenSpecificLLMConfig,
    entryPattern,
    exitPattern,
    query,
  };
};

// Export for testing
export const processTradesLoop = async (
  tradesFromQuery: any[],
  mergedConfig: MergedConfig,
  entryPattern: any,
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
    const signalDirectionForLlm: 'long' | 'short' =
      initialGlobalDirection === 'llm_decides' ? 'long' : initialGlobalDirection;

    const currentSignal: EnrichedSignal = {
      ticker: mergedConfig.ticker,
      trade_date: rawTradeData.trade_date as string,
      price: rawTradeData.entry_price as number,
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
      // This implies LLM screen was bypassed or returned proceed:true without a direction (which it shouldn't for active screens)
      if (initialGlobalDirection === 'llm_decides') {
        // This case should ideally be prevented by config validation (llm_decides requires LLM enabled)
        // or LlmConfirmationScreen should always return a direction if it proceeds and strategy is llm_decides.
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

    const sqlQueryDirection = rawTradeData.direction as 'long' | 'short';

    let adjustedReturnPct = rawTradeData.return_pct as number;
    if (sqlQueryDirection && sqlQueryDirection !== actualTradeDirection) {
      adjustedReturnPct *= -1;
    }

    // Moved trade object creation earlier
    const trade = mapRawDataToTrade(
      { ...rawTradeData, return_pct: adjustedReturnPct },
      actualTradeDirection,
      llmChartPath
    );

    const statsBucket =
      actualTradeDirection === 'long' ? totalStats.long_stats : totalStats.short_stats;
    statsBucket.trades.push(trade);
    statsBucket.all_returns.push(adjustedReturnPct);
    statsBucket.total_return_sum += adjustedReturnPct;
    if (isWinningTrade(adjustedReturnPct, actualTradeDirection === 'short')) {
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
      query,
    } = initializeAnalysis(cliOptions);

    if (cliOptions.dryRun) {
      console.log('\nDry run requested. Exiting without executing query.');
      printFooter();
      return;
    }

    const tradesFromQuery = fetchTradesFromQuery(query);

    // Determine exit strategy name for header
    let exitStrategyName = 'default'; // Default if no specific strategy is identified
    if (mergedConfig.exitStrategies?.enabled?.includes('maxHoldTime')) {
      exitStrategyName = `maxHoldTime (${mergedConfig.exitStrategies.maxHoldTime?.minutes} min)`;
    } else if (
      mergedConfig.exitStrategies?.enabled &&
      mergedConfig.exitStrategies.enabled.length > 0
    ) {
      // If other strategies are enabled, list them or use a generic name
      exitStrategyName = mergedConfig.exitStrategies.enabled.join(', ');
    } else {
      // If no exitStrategies are explicitly enabled, try to get a name from a default exit pattern if one were to be resolved.
      // This relies on getExitPattern returning a DefaultExitStrategyPattern or similar if undefined is passed.
      exitStrategyName = getExitPattern(undefined, mergedConfig).name;
    }

    printHeader(
      mergedConfig.ticker,
      mergedConfig.from,
      mergedConfig.to,
      entryPattern.name,
      exitStrategyName, // Use the determined exit strategy name
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
      total_raw_matches: 0, // Will be set from tradesFromQuery.length or specific aggregate
      total_llm_confirmed_trades: 0, // Will be calculated in finalizeAnalysis
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
      llmScreenInstance,
      screenSpecificLLMConfig,
      rawConfig,
      totalStats
    );

    await finalizeAnalysis(totalStats, entryPattern, mergedConfig);
  } catch (error) {
    console.error('Error running analysis:', error);
    process.exit(1);
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
    process.exit(1);
  }
};

main();
