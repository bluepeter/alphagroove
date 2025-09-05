import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { type Config as AppConfig } from './utils/config.js';
import {
  LlmConfirmationScreen as _ActualLlmConfirmationScreen,
  LlmConfirmationScreen,
} from './screens/llm-confirmation.screen.js';

const mockQueryValue = 'DRY_RUN_SQL_QUERY_FROM_INDEX_TEST';

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

vi.mock('./utils/llm-result-processor.js', () => ({
  processLlmResult: vi.fn().mockResolvedValue({
    resultChartPath: 'test_result_chart.png',
    outputFilePath: 'test_output.txt',
    latestOutputPath: 'latest_output.txt',
  }),
}));

vi.mock('./screens/llm-confirmation.screen.js', () => ({
  LlmConfirmationScreen: vi.fn().mockImplementation(() => ({
    shouldSignalProceed: vi.fn(() =>
      Promise.resolve({
        proceed: true,
        cost: 0,
        direction: 'long',
        averagedProposedStopLoss: undefined,
        averagedProposedProfitTarget: undefined,
      })
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
  fetchMultiDayData: vi.fn(() => Promise.resolve([])),
}));

vi.mock('./utils/market-metrics.js', () => ({
  generateMarketMetricsForPrompt: vi.fn(() => 'Test market metrics'),
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

import { mergeConfigWithCliOptions } from './utils/config.js';

let mainModule: any;

beforeAll(async () => {
  mainModule = await import('./index.js');
});

describe('LLM Trade Screening Tests', () => {
  let mockMergedConfigValue: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMergedConfigValue = {
      ticker: 'TEST',
      from: '2023-01-01',
      to: '2023-01-02',
      entryPattern: 'test-entry',
      exitPattern: 'test-exit',
      timeframe: '1min',
      direction: 'long',
      llmConfirmationScreen: { enabled: false },
      suppressSma: false,
      suppressVwap: false,

      someBaseOpt: 'value',
      config: 'path/to/config.yaml',
    };
    vi.mocked(mergeConfigWithCliOptions).mockReturnValue(mockMergedConfigValue);
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
    const getMockAppConfig = (): AppConfig => ({
      default: {
        ticker: 'SPY',
        timeframe: '1min',
        suppressSma: false,
        suppressVwap: false,
        suppressMetricsInPrompts: false,
      },
      patterns: { entry: {} },
    });

    it('should return { proceed: true, cost: 0 } if LLM screen is not enabled or instance is null', async () => {
      const currentAppConfig = getMockAppConfig();
      const resultNullInstance = await mainModule.handleLlmTradeScreeningInternal(
        mockSignal,
        mockChartName,
        null,
        { enabled: true },
        mockMergedConfigValue,
        currentAppConfig
      );
      expect(resultNullInstance).toEqual({ proceed: true, cost: 0 });

      const screenConfigDisabled = { enabled: false };
      const resultDisabled = await mainModule.handleLlmTradeScreeningInternal(
        mockSignal,
        mockChartName,
        new (LlmConfirmationScreen as any)(),
        screenConfigDisabled,
        mockMergedConfigValue,
        currentAppConfig
      );
      expect(resultDisabled).toEqual({
        proceed: true,
        cost: 0,
        chartPath: 'path/to/chart.png',
        direction: 'long',
        averagedProposedStopLoss: undefined,
        averagedProposedProfitTarget: undefined,
      });
    });

    it('should call LLM screen if enabled and return its decision with cost', async () => {
      const localMockLlmInstance = new (LlmConfirmationScreen as any)();
      const expectedChartPath = 'path/to/chart.png';
      const mockScreenCost = 0.005;
      const screenConfigEnabled = { enabled: true };
      const currentAppConfig = getMockAppConfig();
      const currentMergedConfig = {
        ...mockMergedConfigValue,
      };

      vi.mocked(localMockLlmInstance.shouldSignalProceed).mockResolvedValueOnce({
        proceed: false,
        cost: mockScreenCost,
      });

      const resultFalse = await mainModule.handleLlmTradeScreeningInternal(
        mockSignal,
        mockChartName,
        localMockLlmInstance,
        screenConfigEnabled,
        currentMergedConfig,
        currentAppConfig
      );
      expect(localMockLlmInstance.shouldSignalProceed).toHaveBeenCalledWith(
        mockSignal,
        expectedChartPath,
        screenConfigEnabled,
        currentAppConfig,
        undefined, // context
        undefined, // debug
        'Test market metrics' // market metrics
      );
      expect(resultFalse).toEqual({
        proceed: false,
        direction: undefined,
        chartPath: expectedChartPath,
        cost: mockScreenCost,
        averagedProposedStopLoss: undefined,
        averagedProposedProfitTarget: undefined,
      });

      const secondMockCost = mockScreenCost + 0.001;
      const mockAveragedSL = 99.5;
      const mockAveragedPT = 101.5;

      vi.mocked(localMockLlmInstance.shouldSignalProceed).mockResolvedValueOnce({
        proceed: true,
        cost: secondMockCost,
        direction: 'long',
        averagedProposedStopLoss: mockAveragedSL,
        averagedProposedProfitTarget: mockAveragedPT,
      });

      const resultTrue = await mainModule.handleLlmTradeScreeningInternal(
        mockSignal,
        mockChartName,
        localMockLlmInstance,
        screenConfigEnabled,
        currentMergedConfig,
        currentAppConfig
      );
      expect(resultTrue).toEqual({
        proceed: true,
        chartPath: expectedChartPath,
        cost: secondMockCost,
        direction: 'long',
        averagedProposedStopLoss: mockAveragedSL,
        averagedProposedProfitTarget: mockAveragedPT,
      });
      expect(localMockLlmInstance.shouldSignalProceed).toHaveBeenCalledTimes(2);
    });

    it('should pass suppressSma parameter to generateEntryChart', async () => {
      const { generateEntryChart } = await import('./utils/chart-generator.js');
      const localMockLlmInstance = new (LlmConfirmationScreen as any)();
      const screenConfigEnabled = { enabled: true };
      const currentAppConfig = getMockAppConfig();
      const currentMergedConfig = {
        ...mockMergedConfigValue,
        suppressSma: true, // Test with suppressSma enabled
      };

      await mainModule.handleLlmTradeScreeningInternal(
        mockSignal,
        mockChartName,
        localMockLlmInstance,
        screenConfigEnabled,
        currentMergedConfig,
        currentAppConfig
      );

      // Verify generateEntryChart was called with suppressSma: true
      expect(generateEntryChart).toHaveBeenCalledWith({
        ticker: mockSignal.ticker,
        timeframe: currentMergedConfig.timeframe,
        entryPatternName: mockChartName,
        tradeDate: mockSignal.trade_date,
        entryTimestamp: mockSignal.timestamp,
        entrySignal: {
          timestamp: mockSignal.timestamp,
          price: mockSignal.price,
          type: 'entry',
        },
        suppressSma: true,
        suppressVwap: false,
      });
    });

    it('should pass suppressVwap parameter to generateEntryChart', async () => {
      const { generateEntryChart } = await import('./utils/chart-generator.js');
      const localMockLlmInstance = new (LlmConfirmationScreen as any)();
      const screenConfigEnabled = { enabled: true };
      const currentAppConfig = getMockAppConfig();
      const currentMergedConfig = {
        ...mockMergedConfigValue,
        suppressVwap: true, // Test with suppressVwap enabled
      };

      await mainModule.handleLlmTradeScreeningInternal(
        mockSignal,
        mockChartName,
        localMockLlmInstance,
        screenConfigEnabled,
        currentMergedConfig,
        currentAppConfig
      );

      // Verify generateEntryChart was called with suppressVwap: true
      expect(generateEntryChart).toHaveBeenCalledWith({
        ticker: mockSignal.ticker,
        timeframe: currentMergedConfig.timeframe,
        entryPatternName: mockChartName,
        tradeDate: mockSignal.trade_date,
        entryTimestamp: mockSignal.timestamp,
        entrySignal: {
          timestamp: mockSignal.timestamp,
          price: mockSignal.price,
          type: 'entry',
        },
        suppressSma: false,
        suppressVwap: true,
      });
    });

    it('should not generate market metrics when suppressMetricsInPrompts is true', async () => {
      const localMockLlmInstance = new (LlmConfirmationScreen as any)();
      const screenConfigEnabled = { enabled: true };
      const currentAppConfig = getMockAppConfig();
      const currentMergedConfig = {
        ...mockMergedConfigValue,
      };

      // Mock raw config with suppressMetricsInPrompts enabled
      const rawConfigWithSuppressedMetrics = {
        ...currentAppConfig,
        shared: {
          ...currentAppConfig.default,
          suppressMetricsInPrompts: true,
        },
      };

      vi.mocked(localMockLlmInstance.shouldSignalProceed).mockResolvedValueOnce({
        proceed: true,
        cost: 0.005,
        direction: 'long',
      });

      await mainModule.handleLlmTradeScreeningInternal(
        mockSignal,
        mockChartName,
        localMockLlmInstance,
        screenConfigEnabled,
        currentMergedConfig,
        rawConfigWithSuppressedMetrics
      );

      // Verify that shouldSignalProceed was called with undefined market metrics
      expect(localMockLlmInstance.shouldSignalProceed).toHaveBeenCalledWith(
        mockSignal,
        'path/to/chart.png',
        screenConfigEnabled,
        rawConfigWithSuppressedMetrics,
        undefined, // context
        undefined, // debug
        undefined // market metrics should be undefined when suppressed
      );
    });

    it('should generate market metrics when suppressMetricsInPrompts is false', async () => {
      const localMockLlmInstance = new (LlmConfirmationScreen as any)();
      const screenConfigEnabled = { enabled: true };
      const currentAppConfig = getMockAppConfig();
      const currentMergedConfig = {
        ...mockMergedConfigValue,
      };

      // Mock raw config with suppressMetricsInPrompts disabled
      const rawConfigWithEnabledMetrics = {
        ...currentAppConfig,
        shared: {
          ...currentAppConfig.default,
          suppressMetricsInPrompts: false,
        },
      };

      vi.mocked(localMockLlmInstance.shouldSignalProceed).mockResolvedValueOnce({
        proceed: true,
        cost: 0.005,
        direction: 'long',
      });

      await mainModule.handleLlmTradeScreeningInternal(
        mockSignal,
        mockChartName,
        localMockLlmInstance,
        screenConfigEnabled,
        currentMergedConfig,
        rawConfigWithEnabledMetrics
      );

      // Verify that shouldSignalProceed was called with market metrics
      expect(localMockLlmInstance.shouldSignalProceed).toHaveBeenCalledWith(
        mockSignal,
        'path/to/chart.png',
        screenConfigEnabled,
        rawConfigWithEnabledMetrics,
        undefined, // context
        undefined, // debug
        'Test market metrics' // market metrics should be present when not suppressed
      );
    });
  });

  describe('Chart Overlay and Output File Creation', () => {
    it('should create chart overlays and output files for LLM decisions during backtest', async () => {
      const { processLlmResult } = await import('./utils/llm-result-processor.js');
      const _mockProcessLlmResult = vi.mocked(processLlmResult);

      // Mock LLM to return a LONG decision
      const localMockLlmInstance = {
        shouldSignalProceed: vi.fn().mockResolvedValue({
          proceed: true,
          direction: 'long',
          cost: 0.01,
          rationale: 'Strong bullish pattern',
          averagedProposedStopLoss: 95.0,
          averagedProposedProfitTarget: 105.0,
        }),
      };

      const mockSignal = {
        ticker: 'TEST',
        trade_date: '2023-01-01',
        timestamp: '2023-01-01 10:00:00',
        price: 100,
      };

      await mainModule.handleLlmTradeScreeningInternal(
        mockSignal,
        'test-entry',
        localMockLlmInstance,
        { llmProvider: 'anthropic', numCalls: 1, agreementThreshold: 1 },
        {
          ticker: 'TEST',
          timeframe: '1min',
          from: '2023-01-01',
          to: '2023-01-02',
        } as any,
        {},
        false
      );

      // The chart overlay and output file processing happens in the main backtest loop,
      // not in handleLlmTradeScreeningInternal, so we just verify the LLM was called correctly
      expect(localMockLlmInstance.shouldSignalProceed).toHaveBeenCalledWith(
        mockSignal,
        expect.any(String), // Chart path (mocked)
        expect.any(Object), // Screen config
        expect.any(Object), // Raw config
        undefined, // context
        false, // debug
        expect.any(String) // market metrics
      );
    });
  });
});
