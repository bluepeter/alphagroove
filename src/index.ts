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
import {
  calculateMeanReturn,
  calculateMedianReturn,
  calculateStdDevReturn,
} from './utils/calculations.js';
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
): Promise<{ proceed: boolean; chartPath?: string }> => {
  if (!llmScreenInstance || !screenSpecificLLMConfig?.enabled) {
    return { proceed: true };
  }
  const chartPathForLLM = await generateChartForLLMDecision(
    currentSignal,
    mergedConfig,
    chartEntryPatternName
  );
  const proceed = await llmScreenInstance.shouldSignalProceed(
    currentSignal,
    chartPathForLLM,
    screenSpecificLLMConfig,
    rawConfig
  );
  if (!proceed) {
    return { proceed: false };
  } else {
    return { proceed: true, chartPath: chartPathForLLM };
  }
};

// Export for testing
export const handleYearlyUpdatesInternal = (
  tradeData: Record<string, any>,
  statsContext: {
    currentYear: string;
    yearTrades: Trade[];
    seenYears: Set<string>;
    totalStats: TotalStats;
  }
): void => {
  if (tradeData.year !== statsContext.currentYear) {
    if (statsContext.yearTrades.length > 0) {
      printYearSummary(Number(statsContext.currentYear), [...statsContext.yearTrades]);
    }
    statsContext.currentYear = tradeData.year as string;
    statsContext.yearTrades.length = 0;
    if (!statsContext.seenYears.has(tradeData.year)) {
      statsContext.seenYears.add(tradeData.year);
      statsContext.totalStats.total_matches += tradeData.match_count as number;
    }
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
  const exitPattern = getExitPattern(mergedConfig.exitPattern, mergedConfig);
  const query = buildAnalysisQuery(mergedConfig);

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
  entryPattern: any, // Consider using a more specific type
  llmScreenInstance: LlmConfirmationScreen | null,
  screenSpecificLLMConfig: ScreenLLMConfig | undefined,
  rawConfig: any,
  totalStats: TotalStats,
  allReturns: number[]
) => {
  let currentYear = '';
  let yearTrades: Trade[] = [];
  const seenYears = new Set<string>();
  const confirmedTrades: Trade[] = [];

  for (const rawTradeData of tradesFromQuery) {
    const entryTimestamp = rawTradeData.entry_time as string;
    const currentSignal: EnrichedSignal = {
      ticker: mergedConfig.ticker,
      trade_date: rawTradeData.trade_date as string,
      price: rawTradeData.entry_price as number,
      timestamp: entryTimestamp,
      type: 'entry',
      direction: entryPattern.direction as 'long' | 'short',
      // chartPath will be added below if LLM proceeds
    };

    const { proceed: proceedFromLlm, chartPath: llmChartPath } =
      await handleLlmTradeScreeningInternal(
        currentSignal,
        entryPattern.name,
        llmScreenInstance,
        screenSpecificLLMConfig,
        mergedConfig,
        rawConfig
      );

    if (!proceedFromLlm) {
      continue;
    }

    // If LLM approved, store the chart path
    if (llmChartPath) {
      currentSignal.chartPath = llmChartPath;
    }

    totalStats.total_return_sum += rawTradeData.return_pct as number;
    if ((rawTradeData.return_pct as number) >= 0) {
      totalStats.winning_trades++;
    }
    allReturns.push(rawTradeData.return_pct as number);

    const statsContext = { currentYear, yearTrades, seenYears, totalStats };
    handleYearlyUpdatesInternal(rawTradeData, statsContext);
    currentYear = statsContext.currentYear;

    // Pass the chartPath (if it exists) to mapRawDataToTrade
    const tradeObj = mapRawDataToTrade(
      rawTradeData,
      entryPattern.direction!,
      currentSignal.chartPath
    );

    statsContext.yearTrades.push(tradeObj); // This should be yearTrades.push(tradeObj)
    confirmedTrades.push(tradeObj);

    printTradeDetails(tradeObj, entryPattern.direction!);
  }
  if (yearTrades.length > 0) {
    printYearSummary(Number(currentYear), yearTrades);
  }
  return { confirmedTrades, currentYear, yearTrades }; // Added currentYear and yearTrades for finalizeAnalysis
};

// Export for testing
export const finalizeAnalysis = async (
  totalStats: TotalStats,
  allReturns: number[],
  entryPattern: any, // Consider using a more specific type
  mergedConfig: MergedConfig,
  confirmedTrades: Trade[]
) => {
  totalStats.win_rate =
    totalStats.total_matches > 0 ? totalStats.winning_trades / totalStats.total_matches : 0;
  const meanReturn = calculateMeanReturn(allReturns);
  totalStats.median_return = calculateMedianReturn(allReturns);
  totalStats.std_dev_return = calculateStdDevReturn(allReturns, meanReturn);

  printOverallSummary({
    ...totalStats,
    total_return_sum: meanReturn, // This was total_return_sum before, now it's meanReturn
    direction: entryPattern.direction!,
  });

  if (mergedConfig.generateCharts && confirmedTrades.length > 0) {
    const llmScreenEnabled = mergedConfig.llmConfirmationScreen?.enabled;

    if (llmScreenEnabled) {
      console.log('\nLLM-confirmed charts were generated during screening:');
      const chartPaths: string[] = [];
      confirmedTrades.forEach(trade => {
        if (trade.chartPath) {
          chartPaths.push(trade.chartPath);
          // Optionally log each path, or just the summary count
          // console.log(`- ${trade.chartPath}`);
        }
      });
      if (chartPaths.length > 0) {
        console.log(
          `\nFound ${chartPaths.length} charts in ${mergedConfig.chartsDir || './charts'}/${entryPattern.name}/ (from LLM screening).`
        );
      } else {
        console.log(
          '\nLLM screening was enabled, but no chart paths were found for confirmed trades.'
        );
      }
    } else {
      // LLM screen is not enabled, generate charts now if generateCharts is true
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
      exitPattern,
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
      exitPattern.name,
      entryPattern.direction!
    );

    const totalStats: TotalStats = {
      total_trading_days: 0,
      total_matches: 0,
      total_return_sum: 0,
      median_return: 0,
      std_dev_return: 0,
      win_rate: 0,
      winning_trades: 0,
    };
    const allReturns: number[] = [];

    if (tradesFromQuery.length > 0 && tradesFromQuery[0].all_trading_days) {
      totalStats.total_trading_days = tradesFromQuery[0].all_trading_days as number;
    }

    const { confirmedTrades } = await processTradesLoop(
      tradesFromQuery,
      mergedConfig,
      entryPattern,
      llmScreenInstance,
      screenSpecificLLMConfig,
      rawConfig,
      totalStats,
      allReturns
    );

    await finalizeAnalysis(totalStats, allReturns, entryPattern, mergedConfig, confirmedTrades);
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

  program.action(async () => {});

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
