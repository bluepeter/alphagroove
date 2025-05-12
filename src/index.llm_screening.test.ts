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
      generateCharts: false,
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
      default: { direction: 'long', ticker: 'SPY', timeframe: '1min' },
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
      expect(resultDisabled).toEqual({ proceed: true, cost: 0 });
    });

    it('should call LLM screen if enabled and return its decision with cost', async () => {
      const localMockLlmInstance = new (LlmConfirmationScreen as any)();
      const expectedChartPath = 'path/to/chart.png';
      const mockScreenCost = 0.005;
      const screenConfigEnabled = { enabled: true };
      const currentAppConfig = getMockAppConfig();
      const currentMergedConfig = {
        ...mockMergedConfigValue,
        generateCharts: true,
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
        currentAppConfig
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
        screenConfigEnabled,
        currentMergedConfig,
        currentAppConfig
      );
      expect(resultTrue).toEqual({
        proceed: true,
        chartPath: expectedChartPath,
        cost: secondMockCost,
      });
      expect(localMockLlmInstance.shouldSignalProceed).toHaveBeenCalledTimes(2);
    });
  });
});
