import { vi, describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { type Config as AppConfig } from './utils/config.js';
import { LlmConfirmationScreen as _ActualLlmConfirmationScreen } from './screens/llm-confirmation.screen.js';

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
import { LlmConfirmationScreen } from './screens/llm-confirmation.screen.js';
// Calculation functions (calculateMeanReturn, etc.) are not directly tested here anymore,
// their effects are tested via output.test.ts or through isWinningTrade mock if needed.
// The mock for './utils/calculations.js' still provides isWinningTrade (actual) for index.ts usage.
/*
import {
  calculateMeanReturn,
  calculateMedianReturn,
  calculateStdDevReturn,
  isWinningTrade,
} from './utils/calculations.js';
*/
import {
  generateEntryChart as _generateEntryChart,
  generateEntryCharts,
} from './utils/chart-generator.js';
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

describe('runAnalysis refactored components', () => {
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

  describe('handleLlmTradeScreeningInternal', () => {
    const mockSignal = {
      ticker: 'TEST',
      trade_date: '2023-01-01',
      price: 100,
      timestamp: '09:30',
      type: 'entry',
      direction: 'long' as 'long' | 'short',
    };
    const mockChartName = 'test-chart';
    const _mockLocalRawConfig = {};
    const getMockAppConfig = (): AppConfig => ({
      default: { direction: 'long', ticker: 'SPY', timeframe: '1min' },
      patterns: { entry: {}, exit: {} },
    });

    it('should return { proceed: true, cost: 0 } if LLM screen is not enabled or instance is null', async () => {
      const resultNullInstance = await mainModule.handleLlmTradeScreeningInternal(
        mockSignal,
        mockChartName,
        null,
        { enabled: true },
        mockMergedConfigValue,
        getMockAppConfig()
      );
      expect(resultNullInstance).toEqual({ proceed: true, cost: 0 });

      const resultDisabled = await mainModule.handleLlmTradeScreeningInternal(
        mockSignal,
        mockChartName,
        new (LlmConfirmationScreen as any)(),
        { enabled: false },
        mockMergedConfigValue,
        getMockAppConfig()
      );
      expect(resultDisabled).toEqual({ proceed: true, cost: 0 });
    });

    it('should call LLM screen if enabled and return its decision with cost', async () => {
      const localMockLlmInstance = new (LlmConfirmationScreen as any)();
      const expectedChartPath = 'path/to/chart.png';
      const mockScreenCost = 0.005;

      vi.mocked(localMockLlmInstance.shouldSignalProceed).mockResolvedValueOnce({
        proceed: false,
        cost: mockScreenCost,
      });

      const resultFalse = await mainModule.handleLlmTradeScreeningInternal(
        mockSignal,
        mockChartName,
        localMockLlmInstance,
        { enabled: true },
        mockMergedConfigValue,
        getMockAppConfig()
      );
      expect(localMockLlmInstance.shouldSignalProceed).toHaveBeenCalledWith(
        mockSignal,
        expectedChartPath,
        { enabled: true },
        getMockAppConfig()
      );
      expect(resultFalse).toEqual({ proceed: false, cost: mockScreenCost });

      const secondMockCost = mockScreenCost + 0.001;
      vi.mocked(localMockLlmInstance.shouldSignalProceed).mockResolvedValueOnce({
        proceed: true,
        cost: secondMockCost,
      });

      const resultTrue = await mainModule.handleLlmTradeScreeningInternal(
        mockSignal,
        mockChartName,
        localMockLlmInstance,
        { enabled: true },
        mockMergedConfigValue,
        getMockAppConfig()
      );
      expect(resultTrue).toEqual({
        proceed: true,
        chartPath: expectedChartPath,
        cost: secondMockCost,
      });
      expect(localMockLlmInstance.shouldSignalProceed).toHaveBeenCalledTimes(2);
    });
  });

  describe('processTradesLoop', () => {
    it('should process trades, and correctly call mappers and output functions', async () => {
      const mockTradesFromQueryData = [
        {
          entry_time: '09:30',
          trade_date: '2023-01-01',
          entry_price: 100,
          return_pct: 0.5,
          year: '2023',
          match_count: 1,
          direction: 'long',
        },
        {
          entry_time: '10:00',
          trade_date: '2023-01-01',
          entry_price: 101,
          return_pct: -0.2,
          year: '2023',
          match_count: 1,
          direction: 'long',
        },
      ];
      vi.mocked(fetchTradesFromQuery).mockReturnValue(mockTradesFromQueryData as any);

      vi.mocked(mapRawDataToTrade)
        .mockImplementationOnce(
          (rd: any, tradeDirection: string) =>
            ({ ...rd, mapped_call: 1, direction: tradeDirection }) as any
        )
        .mockImplementationOnce(
          (rd: any, tradeDirection: string) =>
            ({ ...rd, mapped_call: 2, direction: tradeDirection }) as any
        );

      const initialDirectionalStatsTemplate = { winning_trades: 0, total_return_sum: 0 };
      const totalStats: any = {
        long_stats: { ...initialDirectionalStatsTemplate, trades: [], all_returns: [] },
        short_stats: { ...initialDirectionalStatsTemplate, trades: [], all_returns: [] },
        total_trading_days: 0,
        total_raw_matches: 0,
        total_llm_confirmed_trades: 0,
        grandTotalLlmCost: 0,
      };

      const currentMergedConfig = {
        ...mockMergedConfigValue,
        direction: 'long',
        llmConfirmationScreen: { enabled: true, agreementThreshold: 1 },
      };

      const mockLlmScreenInstance = new (LlmConfirmationScreen as any)();
      vi.mocked(mockLlmScreenInstance.shouldSignalProceed)
        .mockResolvedValueOnce({ proceed: true, cost: 0.01, direction: 'long' })
        .mockResolvedValueOnce({ proceed: true, cost: 0.01, direction: 'long' });

      const result = await mainModule.processTradesLoop(
        mockTradesFromQueryData,
        currentMergedConfig,
        mockEntryPatternValue,
        mockLlmScreenInstance,
        currentMergedConfig.llmConfirmationScreen,
        mockRawConfig,
        totalStats
      );

      expect(result.confirmedTradesCount).toBe(mockTradesFromQueryData.length);

      expect(mapRawDataToTrade).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ return_pct: 0.5 }),
        'long',
        expect.any(String)
      );
      expect(mapRawDataToTrade).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ return_pct: -0.2 }),
        'long',
        expect.any(String)
      );

      expect(printTradeDetails).toHaveBeenCalledTimes(mockTradesFromQueryData.length);
      expect(totalStats.long_stats.trades.length).toBe(mockTradesFromQueryData.length);
      expect(totalStats.long_stats.winning_trades).toBe(1);
      expect(totalStats.long_stats.all_returns).toEqual([0.5, -0.2]);
      expect(totalStats.short_stats.trades.length).toBe(0);
      expect(totalStats.grandTotalLlmCost).toBeGreaterThan(0);

      expect(printYearSummary).toHaveBeenCalled();
    });
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
      vi.mocked(loadConfig).mockClear();
      vi.mocked(mergeConfigWithCliOptions).mockClear();
      vi.mocked(getEntryPattern).mockClear();
      vi.mocked(getExitPattern).mockClear();
      vi.mocked(buildAnalysisQuery).mockClear();
      vi.mocked(fetchTradesFromQuery).mockClear();
      vi.mocked(printHeader).mockClear();
      vi.mocked(mapRawDataToTrade).mockClear();
      vi.mocked(printTradeDetails).mockClear();
      vi.mocked(printYearSummary).mockClear();
      vi.mocked(printOverallSummary).mockClear();
      vi.mocked(printFooter).mockClear();
      consoleLogSpy = vi.spyOn(console, 'log');
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    it('should handle dry run correctly', async () => {
      mockCliOptions.dryRun = true;
      const dryRunQuery = 'DRY RUN SQL QUERY';
      vi.mocked(loadConfig).mockReturnValue(mockRawConfig);
      vi.mocked(mergeConfigWithCliOptions).mockReturnValue({
        ...mockMergedConfigValue,
        debug: true,
      });
      vi.mocked(getEntryPattern).mockReturnValue(mockEntryPatternValue);
      vi.mocked(getExitPattern).mockReturnValue(mockExitPatternValue);
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
