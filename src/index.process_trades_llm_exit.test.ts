import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processTradesLoop } from './index'; // The function we want to test
import type { MergedConfig } from './utils/config';
// import type { ExitStrategy } from './patterns/exit/exit-strategy'; // Unused
import type { OverallTradeStats } from './utils/output'; // Trade was unused
// import type { EnrichedSignal } from './screens/types'; // Unused
import { LlmConfirmationScreen } from './screens/llm-confirmation.screen';
import { type LLMScreenConfig as ActualLLMScreenConfig } from './utils/config'; // Import the actual type

// Mock dependencies
vi.mock('./utils/data-loader', () => ({
  fetchBarsForTradingDay: vi.fn().mockReturnValue([
    { timestamp: '2023-01-01 09:30:00', open: 100, high: 102, low: 99, close: 101, volume: 1000 },
    { timestamp: '2023-01-01 09:31:00', open: 101, high: 103, low: 100, close: 102, volume: 1200 }, // Execution bar
    { timestamp: '2023-01-01 09:32:00', open: 102, high: 104, low: 101, close: 103, volume: 1100 },
  ]),
  // fetchBarsForATR: vi.fn().mockReturnValue([]), // Not directly used by processTradesLoop if calculateEntryAtr is mocked
  getPriorDayTradingBars: vi.fn().mockResolvedValue([{ high: 1, low: 0, close: 0.5 }]), // Provide some bars for ATR if not mocking calculateEntryAtr directly
  fetchTradesFromQuery: vi.fn().mockReturnValue([]),
}));

vi.mock('./utils/calculations', async () => {
  const actual = await vi.importActual('./utils/calculations');
  return {
    ...actual,
    // calculateEntryAtr: vi.fn().mockResolvedValue(0.5), // Moved to trade-processing mock
    applySlippage: vi.fn((price, _isLong, _slippageConfig, _isEntry) => price), // No slippage for simplicity
  };
});

vi.mock('./utils/trade-processing', async () => {
  const actual = await vi.importActual('./utils/trade-processing');
  return {
    ...actual,
    calculateEntryAtr: vi.fn().mockResolvedValue(0.5), // Correctly mocked here
    evaluateExitStrategies: vi.fn().mockReturnValue({
      timestamp: '2023-01-01 09:32:00',
      price: 103, // Mock exit price
      type: 'exit',
      reason: 'mockExit',
    }),
  };
});

// Declare the mock function that will be initialized in beforeEach
let mockMapRawDataToTradeFn: ReturnType<typeof vi.fn>;

vi.mock('./utils/mappers', () => ({
  // Ensure this factory returns an object where mapRawDataToTrade is a function
  // that will be replaced by our mock in beforeEach
  mapRawDataToTrade: (...args: any[]) => mockMapRawDataToTradeFn(...args),
}));

vi.mock('./utils/output', async () => {
  const actual = await vi.importActual('./utils/output');
  return {
    ...actual,
    printTradeDetails: vi.fn(),
    printYearHeader: vi.fn(),
    printYearSummary: vi.fn(),
  };
});

const getMockScreenDecision = (
  overrides: Partial<Awaited<ReturnType<LlmConfirmationScreen['shouldSignalProceed']>>> = {}
) =>
  Promise.resolve({
    proceed: true,
    direction: 'long' as 'long' | 'short',
    cost: 0,
    chartPath: 'mock/chart.png',
    averagedProposedStopLoss: undefined,
    averagedProposedProfitTarget: undefined,
    ...overrides,
  });

const mockShouldSignalProceed = vi.fn();
vi.mock('./screens/llm-confirmation.screen.js', () => ({
  LlmConfirmationScreen: vi.fn().mockImplementation(() => ({
    shouldSignalProceed: mockShouldSignalProceed,
  })),
}));

// Helper to get a default LLMScreenConfig for tests
const getDefaultTestLLMScreenConfig = (): ActualLLMScreenConfig => ({
  llmProvider: 'anthropic',
  modelName: 'test-model',
  apiKeyEnvVar: 'TEST_KEY',
  numCalls: 1,
  agreementThreshold: 1,
  temperatures: [0.5],
  prompts: 'test prompt',
  commonPromptSuffixForJson: 'json please',
  maxOutputTokens: 50,
});

describe('processTradesLoop - LLM Exit Price Usage', () => {
  const baseMergedConfig: MergedConfig = {
    ticker: 'TEST',
    timeframe: '1min',
    direction: 'long',
    from: '2023-01-01',
    to: '2023-01-01',
    entryPattern: 'test-entry',

    maxConcurrentDays: 1,
    llmConfirmationScreen: getDefaultTestLLMScreenConfig(), // Use helper for default
    exitStrategies: {
      enabled: ['stopLoss', 'profitTarget'],
      strategyOptions: {
        stopLoss: { percentFromEntry: 1.0, atrMultiplier: 1.5, useLlmProposedPrice: false },
        profitTarget: { percentFromEntry: 2.0, atrMultiplier: 3.0, useLlmProposedPrice: false },
      },
    },
  };

  const rawTradesFromQuery = [
    {
      year: '2023',
      trade_date: '2023-01-01',
      entry_time: '2023-01-01 09:30:00', // Signal bar
      entry_price: 101, // Price on signal bar
      market_open: 100,
    },
  ];

  const getBaseTotalStats = (): OverallTradeStats => ({
    long_stats: { trades: [], winning_trades: 0, total_return_sum: 0, all_returns: [] },
    short_stats: { trades: [], winning_trades: 0, total_return_sum: 0, all_returns: [] },
    total_trading_days: 1,
    total_raw_matches: 1,
    total_llm_confirmed_trades: 0,
    grandTotalLlmCost: 0,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Initialize/re-initialize the mock function here
    mockMapRawDataToTradeFn = vi.fn(data => ({ ...data, mapped: true }));
    mockShouldSignalProceed.mockResolvedValue(getMockScreenDecision());
  });

  it('should use LLM proposed stop loss if configured and available', async () => {
    const config = JSON.parse(JSON.stringify(baseMergedConfig)) as MergedConfig;
    if (config.exitStrategies?.strategyOptions?.stopLoss) {
      config.exitStrategies.strategyOptions.stopLoss.useLlmProposedPrice = true;
    }
    // llmScreenConfig will be derived from config.llmConfirmationScreen which is now valid
    const llmScreenConfig = config.llmConfirmationScreen
      ? { ...config.llmConfirmationScreen, enabled: true }
      : undefined;

    mockShouldSignalProceed.mockResolvedValue(
      getMockScreenDecision({ averagedProposedStopLoss: 98.5 })
    );

    await processTradesLoop(
      rawTradesFromQuery,
      config,
      { name: 'test' },
      [],
      new LlmConfirmationScreen(),
      llmScreenConfig,
      {},
      getBaseTotalStats()
    );

    expect(mockMapRawDataToTradeFn).toHaveBeenCalled();
    const mappedTradeArg = mockMapRawDataToTradeFn.mock.calls[0][0];
    expect(mappedTradeArg.initialStopLossPrice).toBe(98.5);
    expect(mappedTradeArg.isStopLossLlmBased).toBe(true);
    expect(mappedTradeArg.isStopLossAtrBased).toBe(false);
  });

  it('should use LLM proposed profit target if configured and available', async () => {
    const config = JSON.parse(JSON.stringify(baseMergedConfig)) as MergedConfig;
    if (config.exitStrategies?.strategyOptions?.profitTarget) {
      config.exitStrategies.strategyOptions.profitTarget.useLlmProposedPrice = true;
    }
    const llmScreenConfig = config.llmConfirmationScreen
      ? { ...config.llmConfirmationScreen, enabled: true }
      : undefined;
    mockShouldSignalProceed.mockResolvedValue(
      getMockScreenDecision({ averagedProposedProfitTarget: 105.5 })
    );

    await processTradesLoop(
      rawTradesFromQuery,
      config,
      { name: 'test' },
      [],
      new LlmConfirmationScreen(),
      llmScreenConfig,
      {},
      getBaseTotalStats()
    );

    expect(mockMapRawDataToTradeFn).toHaveBeenCalled();
    const mappedTradeArg = mockMapRawDataToTradeFn.mock.calls[0][0];
    expect(mappedTradeArg.initialProfitTargetPrice).toBe(105.5);
    expect(mappedTradeArg.isProfitTargetLlmBased).toBe(true);
    expect(mappedTradeArg.isProfitTargetAtrBased).toBe(false);
  });

  it('should use config-based ATR SL if useLlmProposedPrice is true but LLM SL is not available', async () => {
    const config = JSON.parse(JSON.stringify(baseMergedConfig)) as MergedConfig;
    if (config.exitStrategies?.strategyOptions?.stopLoss) {
      config.exitStrategies.strategyOptions.stopLoss.useLlmProposedPrice = true;
      config.exitStrategies.strategyOptions.stopLoss.atrMultiplier = 2.0;
    }
    const llmScreenConfig = config.llmConfirmationScreen
      ? { ...config.llmConfirmationScreen, enabled: true }
      : undefined;
    mockShouldSignalProceed.mockResolvedValue(
      getMockScreenDecision({ averagedProposedStopLoss: undefined })
    );

    await processTradesLoop(
      rawTradesFromQuery,
      config,
      { name: 'test' },
      [],
      new LlmConfirmationScreen(),
      llmScreenConfig,
      {},
      getBaseTotalStats()
    );

    expect(mockMapRawDataToTradeFn).toHaveBeenCalled();
    const mappedTradeArg = mockMapRawDataToTradeFn.mock.calls[0][0];
    expect(mappedTradeArg.initialStopLossPrice).toBe(101);
    expect(mappedTradeArg.isStopLossLlmBased).toBe(false);
    expect(mappedTradeArg.isStopLossAtrBased).toBe(true);
  });

  it('should use config-based Percent PT if useLlmProposedPrice is true but LLM PT is not available', async () => {
    const config = JSON.parse(JSON.stringify(baseMergedConfig)) as MergedConfig;
    if (config.exitStrategies?.strategyOptions?.profitTarget) {
      config.exitStrategies.strategyOptions.profitTarget.useLlmProposedPrice = true;
      config.exitStrategies.strategyOptions.profitTarget.percentFromEntry = 3.0;
      config.exitStrategies.strategyOptions.profitTarget.atrMultiplier = undefined; // Ensure ATR is not used
    }
    const llmScreenConfig = config.llmConfirmationScreen
      ? { ...config.llmConfirmationScreen, enabled: true }
      : undefined;
    mockShouldSignalProceed.mockResolvedValue(
      getMockScreenDecision({ averagedProposedProfitTarget: undefined })
    );

    await processTradesLoop(
      rawTradesFromQuery,
      config,
      { name: 'test' },
      [],
      new LlmConfirmationScreen(),
      llmScreenConfig,
      {},
      getBaseTotalStats()
    );

    expect(mockMapRawDataToTradeFn).toHaveBeenCalled();
    const mappedTradeArg = mockMapRawDataToTradeFn.mock.calls[0][0];
    expect(mappedTradeArg.initialProfitTargetPrice).toBeCloseTo(105.06);
    expect(mappedTradeArg.isProfitTargetLlmBased).toBe(false);
    expect(mappedTradeArg.isProfitTargetAtrBased).toBe(false);
  });

  it('should use config-based SL/PT if useLlmProposedPrice is false', async () => {
    const config = JSON.parse(JSON.stringify(baseMergedConfig)) as MergedConfig;
    const llmScreenConfig = config.llmConfirmationScreen
      ? { ...config.llmConfirmationScreen, enabled: true }
      : undefined;
    mockShouldSignalProceed.mockResolvedValue(
      getMockScreenDecision({
        averagedProposedStopLoss: 99.0,
        averagedProposedProfitTarget: 110.0,
      })
    );

    await processTradesLoop(
      rawTradesFromQuery,
      config,
      { name: 'test' },
      [],
      new LlmConfirmationScreen(),
      llmScreenConfig,
      {},
      getBaseTotalStats()
    );

    expect(mockMapRawDataToTradeFn).toHaveBeenCalled();
    const mappedTradeArg = mockMapRawDataToTradeFn.mock.calls[0][0];
    expect(mappedTradeArg.initialStopLossPrice).toBeCloseTo(101.25);
    expect(mappedTradeArg.isStopLossLlmBased).toBe(false);
    expect(mappedTradeArg.isStopLossAtrBased).toBe(true);

    expect(mappedTradeArg.initialProfitTargetPrice).toBeCloseTo(103.5);
    expect(mappedTradeArg.isProfitTargetLlmBased).toBe(false);
    expect(mappedTradeArg.isProfitTargetAtrBased).toBe(true);
  });
});
