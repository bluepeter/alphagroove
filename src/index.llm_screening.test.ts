import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { type Config as AppConfig } from './utils/config.js';
import { LlmConfirmationScreen as _ActualLlmConfirmationScreen } from './screens/llm-confirmation.screen.js';

const mockQueryValue = 'DRY_RUN_SQL_QUERY_FROM_INDEX_TEST'; // Referenced by buildAnalysisQuery mock

// Mock external dependencies (copied from original index.test.ts for consistent mainModule loading)
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
  generateEntryChart: vi.fn(() => Promise.resolve('path/to/chart.png')), // Used by the tests
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
// import { generateEntryChart } from './utils/chart-generator.js'; // Mock is used, direct import not strictly needed for these tests

let mainModule: any;

beforeAll(async () => {
  mainModule = await import('./index.js');
});

describe('LLM Trade Screening Tests', () => {
  let mockCliOptions: any; // For mergeConfigWithCliOptions
  let mockRawConfig: any; // For mergeConfigWithCliOptions
  let mockMergedConfigValue: any; // Used directly in tests
  // mockEntryPatternValue and mockExitPatternValue are not directly used by handleLlmTradeScreeningInternal tests

  beforeEach(() => {
    vi.clearAllMocks();
    mockCliOptions = { config: 'path/to/config.yaml' }; // Simplified, as only used by merge mock
    mockRawConfig = { someBaseOpt: 'value' }; // Simplified

    // This is the key config object used by the function under test
    mockMergedConfigValue = {
      ticker: 'TEST',
      from: '2023-01-01',
      to: '2023-01-02',
      entryPattern: 'test-entry',
      exitPattern: 'test-exit',
      timeframe: '1min',
      direction: 'long',
      llmConfirmationScreen: { enabled: false }, // This will be overridden in tests
      generateCharts: false, // This will be overridden in tests
      someBaseOpt: 'value',
      config: 'path/to/config.yaml',
    };

    // Mock the parts of the broader setup that initializeAnalysis would do,
    // focusing on what mergeConfigWithCliOptions provides.
    vi.mocked(mergeConfigWithCliOptions).mockReturnValue(mockMergedConfigValue);
    // Other mocks like loadConfig, getEntryPattern etc. are present for full mainModule import,
    // but their return values are not critical for this specific test suite's beforeEach,
    // unless mergeConfigWithCliOptions itself depends on them in a way not shown by its direct mock.
    // For simplicity, we ensure mergeConfigWithCliOptions returns the needed mockMergedConfigValue.
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
    // _mockLocalRawConfig is not used from original, can be omitted or kept if there was a subtle use.
    // For clarity, it was an empty object {} so we can define AppConfig directly.
    const getMockAppConfig = (): AppConfig => ({
      default: { direction: 'long', ticker: 'SPY', timeframe: '1min' },
      patterns: { entry: {}, exit: {} },
      // Add other AppConfig properties if they become necessary for the tests
    });

    it('should return { proceed: true, cost: 0 } if LLM screen is not enabled or instance is null', async () => {
      const currentAppConfig = getMockAppConfig();
      const resultNullInstance = await mainModule.handleLlmTradeScreeningInternal(
        mockSignal,
        mockChartName,
        null, // llmScreenInstance is null
        { enabled: true }, // screenSpecificLLMConfig (but instance is null)
        mockMergedConfigValue,
        currentAppConfig
      );
      expect(resultNullInstance).toEqual({ proceed: true, cost: 0 });

      const screenConfigDisabled = { enabled: false }; // LLM screen explicitly disabled
      const resultDisabled = await mainModule.handleLlmTradeScreeningInternal(
        mockSignal,
        mockChartName,
        new (LlmConfirmationScreen as any)(), // Instance exists
        screenConfigDisabled, // But config says disabled
        mockMergedConfigValue,
        currentAppConfig
      );
      expect(resultDisabled).toEqual({ proceed: true, cost: 0 });
    });

    it('should call LLM screen if enabled and return its decision with cost', async () => {
      const localMockLlmInstance = new (LlmConfirmationScreen as any)();
      const expectedChartPath = 'path/to/chart.png'; // From chartGenerator mock
      const mockScreenCost = 0.005;
      const screenConfigEnabled = { enabled: true };
      const currentAppConfig = getMockAppConfig();
      const currentMergedConfig = {
        ...mockMergedConfigValue,
        generateCharts: true, // Ensure chart generation is on for path to be used
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
        currentMergedConfig, // Use config that has generateCharts: true
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
        // Direction might also be returned by shouldSignalProceed in some cases
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
        chartPath: expectedChartPath, // Chart path should be included when proceed is true
        cost: secondMockCost,
      });
      expect(localMockLlmInstance.shouldSignalProceed).toHaveBeenCalledTimes(2);
    });
  });
});
