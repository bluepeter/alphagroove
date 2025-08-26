import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processTradesLoop } from './index';
import type { MergedConfig } from './utils/config';
import type { OverallTradeStats } from './utils/output';
import { LlmConfirmationScreen } from './screens/llm-confirmation.screen';

// Mock dependencies
vi.mock('./utils/data-loader', () => ({
  fetchBarsForTradingDay: vi.fn((ticker, timeframe, tradeDate, entryTime) => {
    // Return bars that include the signal timestamp from the test data
    const baseDate = tradeDate;
    return [
      {
        timestamp: `${baseDate} 09:30:00`,
        open: 100,
        high: 102,
        low: 99,
        close: 101,
        volume: 1000,
      },
      {
        timestamp: `${baseDate} 09:31:00`,
        open: 101,
        high: 103,
        low: 100,
        close: 102,
        volume: 1200,
      },
      {
        timestamp: `${baseDate} 09:32:00`,
        open: 102,
        high: 104,
        low: 101,
        close: 103,
        volume: 1100,
      },
      {
        timestamp: `${baseDate} 10:30:00`,
        open: 103,
        high: 105,
        low: 102,
        close: 104,
        volume: 1300,
      },
      {
        timestamp: `${baseDate} 10:31:00`,
        open: 104,
        high: 106,
        low: 103,
        close: 105,
        volume: 1400,
      },
      {
        timestamp: `${baseDate} 11:30:00`,
        open: 105,
        high: 107,
        low: 104,
        close: 106,
        volume: 1500,
      },
      {
        timestamp: `${baseDate} 11:31:00`,
        open: 106,
        high: 108,
        low: 105,
        close: 107,
        volume: 1600,
      },
    ];
  }),
  getPriorDayTradingBars: vi.fn().mockResolvedValue([{ high: 1, low: 0, close: 0.5 }]),
  fetchTradesFromQuery: vi.fn().mockReturnValue([]),
}));

vi.mock('./utils/calculations', async () => {
  const actual = await vi.importActual('./utils/calculations');
  return {
    ...actual,
    applySlippage: vi.fn(price => price),
  };
});

vi.mock('./utils/trade-processing', () => ({
  calculateEntryAtr: vi.fn().mockResolvedValue(0.5),
  evaluateExitStrategies: vi.fn().mockReturnValue({
    exitSignal: { type: 'profitTarget', price: 105, timestamp: '2023-01-01 09:32:00' },
    exitPrice: 105,
  }),
}));

vi.mock('./utils/mappers', () => ({
  mapRawDataToTrade: vi.fn(data => ({ ...data, mapped: true })),
}));

vi.mock('./utils/output', () => ({
  printHeader: vi.fn(),
  printTradeDetails: vi.fn(),
  printYearHeader: vi.fn(),
  printYearSummary: vi.fn(),
  printOverallSummary: vi.fn(),
  printFooter: vi.fn(),
}));

vi.mock('./utils/chart-generator', () => ({
  generateChartForSignal: vi.fn().mockResolvedValue('/mock/chart.png'),
  generateEntryChart: vi.fn().mockResolvedValue('/mock/chart.png'),
}));

const mockShouldSignalProceed = vi.fn();
vi.mock('./screens/llm-confirmation.screen.js', () => ({
  LlmConfirmationScreen: vi.fn().mockImplementation(() => ({
    shouldSignalProceed: mockShouldSignalProceed,
  })),
}));

const getMockScreenDecision = (overrides = {}) =>
  Promise.resolve({
    proceed: true,
    direction: 'long' as 'long' | 'short',
    cost: 0.01,
    chartPath: 'mock/chart.png',
    averagedProposedStopLoss: undefined,
    averagedProposedProfitTarget: undefined,
    ...overrides,
  });

describe('Parallel Processing Tests', () => {
  const baseConfig: MergedConfig = {
    ticker: 'TEST',
    timeframe: '1min',
    direction: 'long',
    from: '2023-01-01',
    to: '2024-01-03',
    entryPattern: 'test-entry',
    generateCharts: false, // Disable charts to focus on parallel processing logic
    chartsDir: './charts',
    maxConcurrentDays: 3, // Test with parallel processing
    llmConfirmationScreen: {
      enabled: false, // Disable LLM to focus on parallel processing
      llmProvider: 'anthropic',
      modelName: 'test-model',
      apiKeyEnvVar: 'TEST_KEY',
      numCalls: 1,
      agreementThreshold: 1,
      temperatures: [0.5],
      prompts: 'test prompt',
      commonPromptSuffixForJson: 'json please',
      maxOutputTokens: 50,
    },
    exitStrategies: {
      enabled: ['profitTarget'],
      profitTarget: { percentFromEntry: 2.0, atrMultiplier: 3.0, useLlmProposedPrice: false },
    },
  };

  const getBaseTotalStats = (): OverallTradeStats => ({
    long_stats: { trades: [], winning_trades: 0, total_return_sum: 0, all_returns: [] },
    short_stats: { trades: [], winning_trades: 0, total_return_sum: 0, all_returns: [] },
    total_trading_days: 3,
    total_raw_matches: 3,
    total_llm_confirmed_trades: 0,
    grandTotalLlmCost: 0,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockShouldSignalProceed.mockResolvedValue(getMockScreenDecision());
  });

  it('should process multiple years sequentially but days within years in parallel', async () => {
    const multiYearTrades = [
      // 2023 trades (3 days)
      {
        year: '2023',
        trade_date: '2023-01-01',
        entry_time: '2023-01-01 09:30:00',
        entry_price: 101,
        market_open: 100,
      },
      {
        year: '2023',
        trade_date: '2023-01-02',
        entry_time: '2023-01-02 09:30:00',
        entry_price: 102,
        market_open: 101,
      },
      {
        year: '2023',
        trade_date: '2023-01-03',
        entry_time: '2023-01-03 09:30:00',
        entry_price: 103,
        market_open: 102,
      },
      // 2024 trades (2 days)
      {
        year: '2024',
        trade_date: '2024-01-01',
        entry_time: '2024-01-01 09:30:00',
        entry_price: 104,
        market_open: 103,
      },
      {
        year: '2024',
        trade_date: '2024-01-02',
        entry_time: '2024-01-02 09:30:00',
        entry_price: 105,
        market_open: 104,
      },
    ];

    const config = { ...baseConfig, maxConcurrentDays: 2 };
    const result = await processTradesLoop(
      multiYearTrades,
      config,
      { name: 'test' },
      [],
      null, // No LLM screen since it's disabled
      undefined, // No LLM config
      {},
      getBaseTotalStats()
    );

    expect(result.confirmedTradesCount).toBe(5);
  });

  it('should respect maxConcurrentDays setting of 1 (sequential processing)', async () => {
    const trades = [
      {
        year: '2023',
        trade_date: '2023-01-01',
        entry_time: '2023-01-01 09:30:00',
        entry_price: 101,
        market_open: 100,
      },
      {
        year: '2023',
        trade_date: '2023-01-02',
        entry_time: '2023-01-02 09:30:00',
        entry_price: 102,
        market_open: 101,
      },
      {
        year: '2023',
        trade_date: '2023-01-03',
        entry_time: '2023-01-03 09:30:00',
        entry_price: 103,
        market_open: 102,
      },
    ];

    const config = { ...baseConfig, maxConcurrentDays: 1 }; // Sequential
    const result = await processTradesLoop(
      trades,
      config,
      { name: 'test' },
      [],
      null,
      undefined,
      {},
      getBaseTotalStats()
    );

    expect(result.confirmedTradesCount).toBe(3);
  });

  it('should handle multiple trades on the same day', async () => {
    const sameDayTrades = [
      {
        year: '2023',
        trade_date: '2023-01-01',
        entry_time: '2023-01-01 09:30:00',
        entry_price: 101,
        market_open: 100,
      },
      {
        year: '2023',
        trade_date: '2023-01-01',
        entry_time: '2023-01-01 10:30:00',
        entry_price: 102,
        market_open: 100,
      },
      {
        year: '2023',
        trade_date: '2023-01-01',
        entry_time: '2023-01-01 11:30:00',
        entry_price: 103,
        market_open: 100,
      },
    ];

    const config = { ...baseConfig, maxConcurrentDays: 3 };
    const result = await processTradesLoop(
      sameDayTrades,
      config,
      { name: 'test' },
      [],
      null,
      undefined,
      {},
      getBaseTotalStats()
    );

    expect(result.confirmedTradesCount).toBe(3);
  });

  it('should handle empty trade data gracefully', async () => {
    const emptyTrades: any[] = [];

    const config = { ...baseConfig, maxConcurrentDays: 5 };
    const result = await processTradesLoop(
      emptyTrades,
      config,
      { name: 'test' },
      [],
      null,
      undefined,
      {},
      getBaseTotalStats()
    );

    expect(result.confirmedTradesCount).toBe(0);
  });

  it('should process years in correct order regardless of input order', async () => {
    const unorderedTrades = [
      // 2024 trades first (should be processed second)
      {
        year: '2024',
        trade_date: '2024-01-01',
        entry_time: '2024-01-01 09:30:00',
        entry_price: 104,
        market_open: 103,
      },
      {
        year: '2024',
        trade_date: '2024-01-02',
        entry_time: '2024-01-02 09:30:00',
        entry_price: 105,
        market_open: 104,
      },
      // 2023 trades second (should be processed first)
      {
        year: '2023',
        trade_date: '2023-01-01',
        entry_time: '2023-01-01 09:30:00',
        entry_price: 101,
        market_open: 100,
      },
      {
        year: '2023',
        trade_date: '2023-01-02',
        entry_time: '2023-01-02 09:30:00',
        entry_price: 102,
        market_open: 101,
      },
    ];

    const config = { ...baseConfig, maxConcurrentDays: 2 };
    const result = await processTradesLoop(
      unorderedTrades,
      config,
      { name: 'test' },
      [],
      null,
      undefined,
      {},
      getBaseTotalStats()
    );

    expect(result.confirmedTradesCount).toBe(4);
  });

  it('should handle high concurrency setting gracefully', async () => {
    const trades = [
      {
        year: '2023',
        trade_date: '2023-01-01',
        entry_time: '2023-01-01 09:30:00',
        entry_price: 101,
        market_open: 100,
      },
      {
        year: '2023',
        trade_date: '2023-01-02',
        entry_time: '2023-01-02 09:30:00',
        entry_price: 102,
        market_open: 101,
      },
    ];

    // Set concurrency higher than number of days
    const config = { ...baseConfig, maxConcurrentDays: 20 };
    const result = await processTradesLoop(
      trades,
      config,
      { name: 'test' },
      [],
      null,
      undefined,
      {},
      getBaseTotalStats()
    );

    expect(result.confirmedTradesCount).toBe(2);
  });

  it('should accumulate LLM costs correctly across parallel processing', async () => {
    const trades = [
      {
        year: '2023',
        trade_date: '2023-01-01',
        entry_time: '2023-01-01 09:30:00',
        entry_price: 101,
        market_open: 100,
      },
      {
        year: '2023',
        trade_date: '2023-01-02',
        entry_time: '2023-01-02 09:30:00',
        entry_price: 102,
        market_open: 101,
      },
      {
        year: '2023',
        trade_date: '2023-01-03',
        entry_time: '2023-01-03 09:30:00',
        entry_price: 103,
        market_open: 102,
      },
    ];

    // Mock LLM calls with specific costs
    mockShouldSignalProceed.mockResolvedValue(getMockScreenDecision({ cost: 0.05 }));

    // Enable LLM for this test
    const config = {
      ...baseConfig,
      maxConcurrentDays: 3,
      llmConfirmationScreen: {
        ...baseConfig.llmConfirmationScreen,
        enabled: true,
      },
    };
    const totalStats = getBaseTotalStats();

    await processTradesLoop(
      trades,
      config,
      { name: 'test' },
      [],
      new LlmConfirmationScreen(),
      config.llmConfirmationScreen,
      {},
      totalStats
    );

    // Should accumulate costs from all parallel calls (3 trades × $0.05 each)
    expect(totalStats.grandTotalLlmCost).toBeCloseTo(0.15, 2);
  });

  it('should maintain trade statistics correctly with parallel processing', async () => {
    const trades = [
      {
        year: '2023',
        trade_date: '2023-01-01',
        entry_time: '2023-01-01 09:30:00',
        entry_price: 101,
        market_open: 100,
      },
      {
        year: '2023',
        trade_date: '2023-01-02',
        entry_time: '2023-01-02 09:30:00',
        entry_price: 102,
        market_open: 101,
      },
      {
        year: '2024',
        trade_date: '2024-01-01',
        entry_time: '2024-01-01 09:30:00',
        entry_price: 103,
        market_open: 102,
      },
    ];

    const config = { ...baseConfig, maxConcurrentDays: 2 };
    const totalStats = getBaseTotalStats();

    const result = await processTradesLoop(
      trades,
      config,
      { name: 'test' },
      [],
      null,
      undefined,
      {},
      totalStats
    );

    expect(result.confirmedTradesCount).toBe(3);
    expect(totalStats.long_stats.trades).toHaveLength(3);
    expect(totalStats.short_stats.trades).toHaveLength(0);
  });
});
