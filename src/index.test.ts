import { vi, describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { type Config as AppConfig } from './utils/config.js';
// LlmConfirmationScreen import removed if no longer used by remaining tests
// import { LlmConfirmationScreen } from './screens/llm-confirmation.screen.js';

const mockQueryValue = 'DRY_RUN_SQL_QUERY_FROM_INDEX_TEST'; // Define it once globally for the test file

// Mock external dependencies
vi.mock('./utils/config.js', async () => {
  const actual = await vi.importActual('./utils/config.js');
  return {
    ...actual,
    loadConfig: vi.fn(() => ({})),
    mergeConfigWithCliOptions: vi.fn((_baseConfig: any, _cliOpts: any) => ({
      ..._baseConfig,
      ..._cliOpts,
      ticker: 'TEST',
      from: '2023-01-01',
      to: '2023-01-02',
      entryPattern: 'test-entry',
      exitPattern: 'test-exit',
      timeframe: '1min',
      llmConfirmationScreen: { enabled: false },
      generateCharts: false,
    })),
  };
});

vi.mock('./utils/data-loader.js', () => ({
  fetchTradesFromQuery: vi.fn(() => []),
}));

vi.mock('./utils/query-builder.js', () => ({
  buildAnalysisQuery: vi.fn(() => mockQueryValue),
}));

vi.mock('./patterns/pattern-factory.js', async () => {
  const actual = await vi.importActual('./patterns/pattern-factory.js');
  return {
    ...actual,
    getEntryPattern: vi.fn(() => ({
      name: 'test-entry',
      direction: 'long',
      apply: vi.fn(),
    })),
    getExitPattern: vi.fn(() => ({ name: 'test-exit', apply: vi.fn() })),
  };
});

// LlmConfirmationScreen mock might still be needed if runAnalysis full flow implies its use, even if not directly constructed in tests
vi.mock('./screens/llm-confirmation.screen.js', () => ({
  LlmConfirmationScreen: vi.fn().mockImplementation(() => ({
    shouldSignalProceed: vi.fn(() =>
      Promise.resolve({ proceed: true, cost: 0, direction: 'long' })
    ),
  })),
}));

vi.mock('./utils/output.js', async () => {
  const actual = await vi.importActual('./utils/output.js');
  return {
    ...actual,
    printHeader: vi.fn(),
    printTradeDetails: vi.fn(),
    printYearSummary: vi.fn(),
    printOverallSummary: vi.fn(),
    printFooter: vi.fn(),
  };
});

vi.mock('./utils/mappers.js', () => ({
  mapRawDataToTrade: vi.fn(data => ({ ...data, mapped: true }) as any),
}));

vi.mock('./utils/chart-generator.js', () => ({
  generateEntryChart: vi.fn(() => Promise.resolve('path/to/chart.png')),
  generateEntryCharts: vi.fn(() => Promise.resolve([])),
}));

vi.mock('./utils/calculations.js', async () => {
  const actualCalculations = (await vi.importActual('./utils/calculations.js')) as any;
  return {
    calculateMeanReturn: vi.fn(() => 0.1),
    calculateMedianReturn: vi.fn(() => 0.05),
    calculateStdDevReturn: vi.fn(() => 0.02),
    isWinningTrade: actualCalculations.isWinningTrade,
    calculateWinningTrades: actualCalculations.calculateWinningTrades,
    calculateWinRate: actualCalculations.calculateWinRate,
    formatPercent: actualCalculations.formatPercent,
  };
});

// Import the modules that are being mocked to access their mocked functions
import { getEntryPattern, getExitPattern } from './patterns/pattern-factory.js';
// Removed LlmConfirmationScreen from direct imports
import { generateEntryCharts } from './utils/chart-generator.js';
import { loadConfig, mergeConfigWithCliOptions } from './utils/config.js';
import { fetchTradesFromQuery } from './utils/data-loader.js';
import { mapRawDataToTrade } from './utils/mappers.js';
import {
  printHeader,
  printTradeDetails,
  printYearSummary,
  printOverallSummary,
  printFooter,
} from './utils/output.js';
import { buildAnalysisQuery } from './utils/query-builder.js';

let mainModule: any;

beforeAll(async () => {
  mainModule = await import('./index.js');
});

describe('runAnalysis orchestrator tests', () => {
  let mockCliOptions: any;
  let mockRawConfig: any;
  let mockMergedConfigValue: any;
  let mockEntryPatternValue: any;
  let mockExitPatternValue: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCliOptions = { config: 'path/to/config.yaml' };
    mockRawConfig = { someBaseOpt: 'value' };
    mockMergedConfigValue = {
      ticker: 'TEST',
      from: '2023-01-01',
      to: '2023-01-02',
      entryPattern: 'test-entry',
      exitPattern: 'test-exit',
      timeframe: '1min',
      direction: 'long',
      llmConfirmationScreen: { enabled: false },
      generateCharts: false,
      someBaseOpt: 'value',
      config: 'path/to/config.yaml',
    };
    mockEntryPatternValue = { name: 'test-entry', direction: 'long', apply: vi.fn() };
    mockExitPatternValue = { name: 'test-exit', apply: vi.fn() };

    vi.mocked(loadConfig).mockReturnValue(mockRawConfig);
    vi.mocked(mergeConfigWithCliOptions).mockReturnValue(mockMergedConfigValue);
    vi.mocked(getEntryPattern).mockReturnValue(mockEntryPatternValue);
    vi.mocked(getExitPattern).mockReturnValue(mockExitPatternValue);
    vi.mocked(fetchTradesFromQuery).mockReturnValue([]);
    vi.mocked(buildAnalysisQuery).mockReturnValue(mockQueryValue);
  });

  describe('finalizeAnalysis', () => {
    it('should calculate final stats and print summary', async () => {
      const initialLongStats = {
        trades: [
          { return_pct: 0.5, direction: 'long' },
          { return_pct: -0.2, direction: 'long' },
        ] as any[],
        winning_trades: 1,
        total_return_sum: 0.3,
        all_returns: [0.5, -0.2],
      };
      const initialShortStats = {
        trades: [],
        winning_trades: 0,
        total_return_sum: 0,
        all_returns: [],
      };
      const totalStats: any = {
        long_stats: { ...initialLongStats },
        short_stats: { ...initialShortStats },
        total_trading_days: 10,
        total_raw_matches: 2,
        grandTotalLlmCost: 0.05,
      };

      const currentMergedConfig = {
        ...mockMergedConfigValue,
        direction: 'long',
        generateCharts: true,
      };

      await mainModule.finalizeAnalysis(totalStats, mockEntryPatternValue, currentMergedConfig);

      expect(printOverallSummary).toHaveBeenCalledWith(totalStats);
      expect(generateEntryCharts).toHaveBeenCalled();
      expect(printFooter).toHaveBeenCalled();
      expect(totalStats.total_llm_confirmed_trades).toBe(2);
    });
  });

  describe('runAnalysis full flow', () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      // Note: loadConfig, mergeConfigWithCliOptions etc are already cleared by the parent beforeEach vi.clearAllMocks()
      // Specific mocks for this describe block are set within each test or rely on parent defaults.
      consoleLogSpy = vi.spyOn(console, 'log');
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    it('should execute the full analysis flow without LLM and without charts', async () => {
      mockCliOptions.dryRun = false;
      const localMockRawConfig: AppConfig = {
        default: {
          ticker: 'TEST_RAW',
          timeframe: '5min',
          direction: 'long',
          patterns: { entry: 'quick-rise', exit: 'fixed-time' },
        },
        patterns: {
          entry: {
            'quick-rise': { 'rise-pct': 0.1, 'within-minutes': 3 },
          },
          exit: {
            'fixed-time': { 'hold-minutes': 5 },
          },
        },
        llmConfirmationScreen: {
          // This needs to be a full LLMScreenConfig compatible structure
          enabled: false,
          llmProvider: 'anthropic', // Default value
          modelName: 'claude-3-haiku-20240307', // Default value
          apiKeyEnvVar: 'ANTHROPIC_API_KEY', // Default value
          numCalls: 3, // Default value
          agreementThreshold: 2, // Default value
          temperatures: [0.2, 0.5, 0.8], // Default value
          prompts: 'Default prompt for LLM', // Default value
          commonPromptSuffixForJson: '{"action": "", "rationalization": ""}', // Default value
          maxOutputTokens: 150, // Default value
        },
      };

      const localTestMergedConfig = {
        ...mockMergedConfigValue,
        ticker: 'MERGED_TEST',
        direction: 'long',
        llmConfirmationScreen: { enabled: false, commonPromptSuffixForJson: '' }, // Ensure this is sufficient
      };
      vi.mocked(loadConfig).mockReturnValue(localMockRawConfig);
      vi.mocked(mergeConfigWithCliOptions).mockReturnValue(localTestMergedConfig);
      // getEntryPattern and getExitPattern will use the general mocks or what's set in parent beforeEach
      // For this test, they use mockEntryPatternValue and mockExitPatternValue due to parent beforeEach.
      // If specific patterns from localMockRawConfig were intended, mocks for getEntryPattern/getExitPattern
      // would need to be adjusted here to return patterns based on localTestMergedConfig.entryPattern ('quick-rise').
      // For now, assuming the generic 'test-entry' pattern from parent mock is acceptable if not overridden.

      const mockTradesData = [
        {
          all_trading_days: 20,
          entry_time: '09:35',
          trade_date: '2023-01-01',
          entry_price: 100,
          return_pct: 1.0,
          year: '2023',
          match_count: 1,
          direction: 'long',
        },
        {
          all_trading_days: 20,
          entry_time: '10:30',
          trade_date: '2023-01-01',
          entry_price: 102,
          return_pct: -0.5,
          year: '2023',
          match_count: 1,
          direction: 'long',
        },
      ];
      vi.mocked(fetchTradesFromQuery).mockReturnValue(mockTradesData as any);
      vi.mocked(mapRawDataToTrade)
        .mockImplementationOnce(
          (rd: any, tradeDirection: string) =>
            ({ ...rd, mapped: true, direction: tradeDirection }) as any
        )
        .mockImplementationOnce(
          (rd: any, tradeDirection: string) =>
            ({ ...rd, mapped: true, direction: tradeDirection }) as any
        );

      await mainModule.runAnalysis(mockCliOptions);

      expect(loadConfig).toHaveBeenCalledWith(mockCliOptions.config);
      expect(mergeConfigWithCliOptions).toHaveBeenCalledWith(localMockRawConfig, mockCliOptions);
      expect(buildAnalysisQuery).toHaveBeenCalledWith(
        localTestMergedConfig,
        mockEntryPatternValue, // This comes from the parent beforeEach
        mockExitPatternValue // This comes from the parent beforeEach
      );
      expect(printHeader).toHaveBeenCalledWith(
        localTestMergedConfig.ticker,
        localTestMergedConfig.from,
        localTestMergedConfig.to,
        mockEntryPatternValue.name, // Name from parent mock
        mockExitPatternValue.name, // Name from parent mock
        localTestMergedConfig.direction
      );
      expect(mapRawDataToTrade).toHaveBeenCalledTimes(mockTradesData.length);
      expect(printTradeDetails).toHaveBeenCalledTimes(mockTradesData.length);
      expect(printYearSummary).toHaveBeenCalled();
      expect(printOverallSummary).toHaveBeenCalled();
      expect(printFooter).toHaveBeenCalled();
    });

    it('should handle dry run correctly', async () => {
      mockCliOptions.dryRun = true;
      const dryRunQuery = 'DRY RUN SQL QUERY';
      // loadConfig will use parent mock, returning mockRawConfig
      // mergeConfigWithCliOptions will use parent mock, returning mockMergedConfigValue initially
      // We then override its return for this specific test.
      vi.mocked(mergeConfigWithCliOptions).mockReturnValue({
        ...mockMergedConfigValue,
        debug: true,
      });
      // getEntryPattern, getExitPattern use parent mocks
      vi.mocked(buildAnalysisQuery).mockReturnValue(dryRunQuery);

      await mainModule.runAnalysis(mockCliOptions);

      expect(buildAnalysisQuery).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(`\nDEBUG - SQL Query:\n${dryRunQuery}`);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '\nDry run requested. Exiting without executing query.'
      );
      expect(fetchTradesFromQuery).not.toHaveBeenCalled();
      expect(printFooter).toHaveBeenCalledTimes(1);
      expect(printHeader).not.toHaveBeenCalled();
      expect(mapRawDataToTrade).not.toHaveBeenCalled();
      expect(printOverallSummary).not.toHaveBeenCalled();
    });
  });
});
