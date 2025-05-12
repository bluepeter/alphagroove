import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest';

const mockQueryValue = 'DRY_RUN_SQL_QUERY_FROM_INDEX_TEST';

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
    printOverallSummary: vi.fn(), // Used by finalizeAnalysis
    printFooter: vi.fn(), // Used by finalizeAnalysis
  };
});

vi.mock('./utils/mappers.js', () => ({
  mapRawDataToTrade: vi.fn(data => ({ ...data, mapped: true }) as any),
}));

vi.mock('./utils/chart-generator.js', () => ({
  generateEntryChart: vi.fn(() => Promise.resolve('path/to/chart.png')),
  generateEntryCharts: vi.fn(() => Promise.resolve([])), // Used by finalizeAnalysis
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

import { getEntryPattern, getExitPattern } from './patterns/pattern-factory.js';
import { generateEntryCharts } from './utils/chart-generator.js';
import { loadConfig, mergeConfigWithCliOptions } from './utils/config.js';
import { fetchTradesFromQuery } from './utils/data-loader.js';
import { printOverallSummary, printFooter } from './utils/output.js';
import { buildAnalysisQuery } from './utils/query-builder.js';

let mainModule: any;

beforeAll(async () => {
  mainModule = await import('./index.js');
});

describe('Finalize Analysis Tests', () => {
  let mockRawConfig: any;
  let mockMergedConfigValue: any;
  let mockEntryPatternValue: any;
  let mockExitPatternValue: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRawConfig = { someBaseOpt: 'value' }; // Needed for merge mock
    mockMergedConfigValue = {
      ticker: 'TEST',
      from: '2023-01-01',
      to: '2023-01-02',
      entryPattern: 'test-entry',
      exitPattern: 'test-exit',
      timeframe: '1min',
      direction: 'long',
      llmConfirmationScreen: { enabled: false },
      generateCharts: false, // Will be overridden in test
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
        generateCharts: true, // Enable chart generation for this test
      };

      await mainModule.finalizeAnalysis(totalStats, mockEntryPatternValue, currentMergedConfig);

      expect(printOverallSummary).toHaveBeenCalledWith(totalStats);
      expect(generateEntryCharts).toHaveBeenCalled();
      expect(printFooter).toHaveBeenCalled();
      expect(totalStats.total_llm_confirmed_trades).toBe(2); // Check that stats are updated
    });
  });
});
