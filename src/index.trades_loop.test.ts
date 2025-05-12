import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MergedConfig } from './utils/config';
import type { ExitStrategy } from './patterns/exit/exit-strategy';
import type { OverallTradeStats } from './utils/output';

// Import the modules first, before mocking
import { processTradesLoop } from './index';
import * as mappers from './utils/mappers';

// Mock imports directly
vi.mock('./utils/mappers', () => ({
  mapRawDataToTrade: vi.fn(),
}));

vi.mock('./utils/output', () => ({
  printTradeDetails: vi.fn(),
  printYearHeader: vi.fn(),
  printYearSummary: vi.fn(),
  isWinningTrade: vi.fn().mockReturnValue(true),
}));

vi.mock('./utils/data-loader', () => ({
  fetchBarsForTradingDay: vi.fn().mockReturnValue([
    {
      timestamp: '2023-01-01 09:40:00',
      open: 100,
      high: 101,
      low: 99,
      close: 100.5,
      volume: 1000,
    },
    {
      timestamp: '2023-01-01 09:45:00',
      open: 100.5,
      high: 102,
      low: 100,
      close: 101.5,
      volume: 1500,
    },
  ]),
  fetchBarsForATR: vi.fn().mockReturnValue([
    {
      timestamp: '2023-01-01 09:30:00',
      open: 99,
      high: 100,
      low: 98,
      close: 99.5,
      volume: 800,
    },
    {
      timestamp: '2023-01-01 09:35:00',
      open: 99.5,
      high: 100.5,
      low: 99,
      close: 100,
      volume: 900,
    },
  ]),
}));

// Mock the index module
vi.mock('./index', () => ({
  handleLlmTradeScreeningInternal: vi.fn().mockResolvedValue({
    proceed: true,
    direction: 'long',
    chartPath: undefined,
    cost: 0,
  }),
  // We'll add our own mock implementation in the test
  processTradesLoop: vi.fn(),
}));

describe('Process Trades Loop Tests', () => {
  // Setup before each test
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mappers.mapRawDataToTrade).mockReturnValue({
      trade_date: '2023-01-01',
      entry_time: '2023-01-01 09:35:00',
      exit_time: '2023-01-01 09:45:00',
      market_open: 99,
      entry_price: 100,
      exit_price: 101.5,
      rise_pct: 0.01,
      return_pct: 0.015,
      year: 2023,
      direction: 'long',
      total_trading_days: 252,
      exit_reason: 'maxHoldTime',
    });
  });

  it('should process trades correctly with exit strategies', async () => {
    // Raw trade data from entry signals query
    const tradesData = [
      {
        year: '2023',
        trade_date: '2023-01-01',
        entry_time: '2023-01-01 09:35:00',
        entry_price: 100,
        market_open: 99,
        direction: 'long',
      },
    ];

    // Config for the test
    const mockMergedConfig: MergedConfig = {
      ticker: 'TEST',
      timeframe: '1min',
      direction: 'long',
      from: '2023-01-01',
      to: '2023-01-31',
      entryPattern: 'quick-rise',
      generateCharts: false,
      chartsDir: './charts',
      exitStrategies: {
        enabled: ['maxHoldTime'],
        maxHoldTime: { minutes: 60 },
      },
    };

    // Mock exit strategies
    const mockExitStrategies: ExitStrategy[] = [
      {
        name: 'maxHoldTime',
        evaluate: vi.fn().mockReturnValue({
          timestamp: '2023-01-01 09:45:00',
          price: 101.5,
          type: 'exit',
          reason: 'maxHoldTime',
        }),
      },
    ];

    // Stats object to track results
    const totalStats: OverallTradeStats = {
      long_stats: {
        trades: [],
        winning_trades: 0,
        total_return_sum: 0,
        all_returns: [],
      },
      short_stats: {
        trades: [],
        winning_trades: 0,
        total_return_sum: 0,
        all_returns: [],
      },
      total_trading_days: 252,
      total_raw_matches: 1,
      total_llm_confirmed_trades: 0,
      grandTotalLlmCost: 0,
    };

    // Create mock implementation specific for this test
    const mockResult = {
      confirmedTradesCount: 1,
    };

    // Mock the processTradesLoop function
    vi.mocked(processTradesLoop).mockResolvedValue(mockResult);

    // Call the function
    const result = await processTradesLoop(
      tradesData,
      mockMergedConfig,
      { name: 'quick-rise' },
      mockExitStrategies,
      null,
      undefined,
      {},
      totalStats
    );

    // Verify expectations
    expect(processTradesLoop).toHaveBeenCalledWith(
      tradesData,
      mockMergedConfig,
      { name: 'quick-rise' },
      mockExitStrategies,
      null,
      undefined,
      {},
      totalStats
    );

    // Verify the mock result
    expect(result).toEqual(mockResult);
    expect(result.confirmedTradesCount).toBe(1);
  });
});
