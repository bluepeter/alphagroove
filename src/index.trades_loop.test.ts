import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { LlmConfirmationScreen } from './screens/llm-confirmation.screen.js';

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

import { getEntryPattern, getExitPattern } from './patterns/pattern-factory.js';
import { loadConfig, mergeConfigWithCliOptions } from './utils/config.js';
import { fetchTradesFromQuery } from './utils/data-loader.js';
import { mapRawDataToTrade } from './utils/mappers.js';
import { printTradeDetails, printYearSummary } from './utils/output.js';
import { buildAnalysisQuery } from './utils/query-builder.js';

let mainModule: any;

beforeAll(async () => {
  mainModule = await import('./index.js');
});

describe('Process Trades Loop Tests', () => {
  let mockRawConfig: any;
  let mockMergedConfigValue: any;
  let mockEntryPatternValue: any;
  let mockExitPatternValue: any;

  beforeEach(() => {
    vi.clearAllMocks();
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
      vi.mocked(mockLlmScreenInstance.shouldSignalProceed).mockResolvedValue({
        proceed: true,
        cost: 0.01,
        direction: 'long',
      });

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
      expect(totalStats.grandTotalLlmCost).toBe(mockTradesFromQueryData.length * 0.01);

      expect(printYearSummary).toHaveBeenCalled();
    });
  });
});
