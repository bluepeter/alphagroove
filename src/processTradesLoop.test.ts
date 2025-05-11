import { vi, describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { type MergedConfig } from './utils/config.js'; // For typing mockMergedConfigValueSpecificTest
import { LlmConfirmationScreen } from './screens/llm-confirmation.screen.js';
import { fetchTradesFromQuery } from './utils/data-loader.js';
import { mapRawDataToTrade } from './utils/mappers.js';
import { printTradeDetails, printYearSummary, printYearHeader } from './utils/output.js';
import { type OverallTradeStats } from './utils/output.js';

// ---- Comprehensive Top-Level Mocks for index.js import ----
// These mocks are designed to allow the main index.js module to be imported
// without its main() function crashing due to missing dependencies or configs.
vi.mock('./utils/config.js', async () => {
  const actualConfig = await vi.importActual('./utils/config.js');
  const actualLLMScreenConfigSchema = (actualConfig as any).LLMScreenConfigSchema;
  const defaultLLMScreenOpts = actualLLMScreenConfigSchema?.parse({}) || {
    enabled: false,
    llmProvider: 'anthropic',
    modelName: 'claude-3-7-sonnet-latest',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    numCalls: 3,
    agreementThreshold: 2,
    temperatures: [0.2, 0.5, 0.8],
    prompts: 'Default prompt',
    commonPromptSuffixForJson: 'json suffix',
    maxOutputTokens: 150,
  };
  return {
    ...(actualConfig as any),
    loadConfig: vi.fn(() => ({
      default: {
        ticker: 'MOCK_T',
        timeframe: '1min',
        direction: 'long',
        patterns: { entry: 'quick-rise', exit: 'fixed-time' },
        charts: { generate: false, outputDir: './charts' },
      },
      patterns: {
        entry: { 'quick-rise': { 'rise-pct': 0.1, 'within-minutes': 1 } },
        exit: { 'fixed-time': { 'hold-minutes': 5 } },
      },
      llmConfirmationScreen: defaultLLMScreenOpts,
    })),
    mergeConfigWithCliOptions: vi.fn((baseConfig: any, cliOpts: any) => ({
      ticker: cliOpts.ticker || baseConfig.default?.ticker || 'M_MERGED_T',
      timeframe: cliOpts.timeframe || baseConfig.default?.timeframe || '1min',
      direction: cliOpts.direction || baseConfig.default?.direction || 'long',
      from: cliOpts.from || baseConfig.default?.date?.from || '2023-01-01',
      to: cliOpts.to || baseConfig.default?.date?.to || '2023-01-02',
      entryPattern: cliOpts.entryPattern || baseConfig.default?.patterns?.entry || 'quick-rise',
      exitPattern: cliOpts.exitPattern || baseConfig.default?.patterns?.exit || 'fixed-time',
      generateCharts:
        cliOpts.generateCharts !== undefined
          ? cliOpts.generateCharts
          : baseConfig.default?.charts?.generate || false,
      chartsDir: cliOpts.chartsDir || baseConfig.default?.charts?.outputDir || './charts',
      llmConfirmationScreen: {
        ...(baseConfig.llmConfirmationScreen || defaultLLMScreenOpts),
        ...(cliOpts.llmConfirmationScreen || {}),
        enabled:
          cliOpts.llmConfirmationScreen?.enabled !== undefined
            ? cliOpts.llmConfirmationScreen.enabled
            : baseConfig.llmConfirmationScreen?.enabled || false,
      },
      'quick-rise': baseConfig.patterns?.entry?.['quick-rise'] || {
        'rise-pct': 0.1,
        'within-minutes': 1,
      },
      'fixed-time': baseConfig.patterns?.exit?.['fixed-time'] || { 'hold-minutes': 5 },
      ...cliOpts,
    })),
  };
});

vi.mock('./patterns/pattern-factory.js', async () => {
  const actual = await vi.importActual('./patterns/pattern-factory.js');
  return {
    ...actual,
    getEntryPattern: vi.fn(patternName => ({
      name: patternName || 'quick-rise',
      direction: 'long',
      apply: vi.fn(),
    })),
    getExitPattern: vi.fn(patternName => ({ name: patternName || 'fixed-time', apply: vi.fn() })),
    getAvailableEntryPatterns: vi.fn(() => ['quick-rise', 'fixed-time-entry', 'quick-fall']),
    getAvailableExitPatterns: vi.fn(() => ['fixed-time']),
  };
});

vi.mock('./screens/llm-confirmation.screen.js', () => ({
  LlmConfirmationScreen: vi.fn().mockImplementation(() => ({
    shouldSignalProceed: vi.fn(() =>
      Promise.resolve({ proceed: true, cost: 0, direction: 'long' })
    ),
  })),
}));

vi.mock('./utils/query-builder.js', () => ({
  buildAnalysisQuery: vi.fn(() => 'MOCK_SQL_QUERY_TOP_LEVEL_PTL'),
}));

vi.mock('./utils/data-loader.js', () => ({
  fetchTradesFromQuery: vi.fn(() => []),
}));

vi.mock('./utils/chart-generator.js', () => ({
  generateEntryChart: vi.fn(() => Promise.resolve('path/to/mock_chart_ptl.png')),
  generateEntryCharts: vi.fn(() => Promise.resolve([])),
}));

vi.mock('./utils/mappers.js', () => ({
  mapRawDataToTrade: vi.fn(
    (data: any, _direction: string, _chartPath?: string) =>
      ({ ...data, mapped_by_processtest_mock: true }) as any
  ),
}));

vi.mock('./utils/output.js', async () => {
  const actualOutput = await vi.importActual('./utils/output.js');
  return {
    ...actualOutput,
    printHeader: vi.fn(),
    printTradeDetails: vi.fn(),
    printYearSummary: vi.fn(),
    printOverallSummary: vi.fn(),
    printFooter: vi.fn(),
    printYearHeader: vi.fn(),
  };
});

vi.mock('./utils/calculations.js', async () => {
  const actualCalculations = (await vi.importActual('./utils/calculations.js')) as any;
  return {
    ...actualCalculations, // Keep actual implementations for functions not explicitly mocked
    isWinningTrade: actualCalculations.isWinningTrade, // Ensure actual is used by processTradesLoop
    // other calculation functions can be mocked if needed by processTradesLoop specific tests, but unlikely
  };
});
// ---- End of Top-Level Mocks ----

let mainModule: any;

beforeAll(async () => {
  const originalProcess = { ...process };
  vi.stubGlobal('process', {
    ...originalProcess,
    exit: vi.fn((_code?: string | number | null | undefined) => undefined as never),
  });
  mainModule = await import('./index.js');
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('processTradesLoop', () => {
  let mockRawConfig: any;
  let mockMergedConfigValueSpecificTest: MergedConfig;
  let mockEntryPatternValue: any;
  let mockLlmScreenInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRawConfig = { someBaseOptFromPTL: 'value' };
    mockEntryPatternValue = { name: 'test-entry-ptl', direction: 'long', apply: vi.fn() };

    // Use a specific MergedConfig for these tests
    mockMergedConfigValueSpecificTest = {
      ticker: 'TEST_PTL',
      from: '2023-03-01',
      to: '2023-03-02',
      entryPattern: mockEntryPatternValue.name,
      exitPattern: 'test-exit-ptl',
      timeframe: '15min',
      direction: 'long', // Default direction for trades unless LLM overrides
      llmConfirmationScreen: {
        enabled: true,
        apiKeyEnvVar: 'DUMMY_KEY_PTL',
        modelName: 'test-model-ptl',
        commonPromptSuffixForJson: 'suffix-ptl',
        llmProvider: 'anthropic',
        numCalls: 1,
        agreementThreshold: 1,
        temperatures: [0.5],
        prompts: 'test prompt ptl',
        maxOutputTokens: 100,
      },
      generateCharts: true,
      chartsDir: './charts_ptl',
      // Add any other required fields from MergedConfig type
      'test-entry-ptl': { 'rise-pct': 0.3, 'within-minutes': 3 },
    };

    mockLlmScreenInstance = new (LlmConfirmationScreen as any)();

    // Reset mocks that will have their calls asserted or specific implementations set per test
    vi.mocked(fetchTradesFromQuery).mockReturnValue([]); // Default to no trades
    vi.mocked(mapRawDataToTrade).mockImplementation(
      (data: any, _direction: string, _chartPath?: string) => ({
        ...data,
        mapped_by_processtest_specific_mock: true,
      })
    );
    vi.mocked(mockLlmScreenInstance.shouldSignalProceed).mockResolvedValue({
      proceed: true,
      cost: 0.001,
      direction: 'long',
    });
  });

  it('should process trades, call mappers, handle LLM, and update stats correctly', async () => {
    const mockTradesFromQueryData = [
      {
        entry_time: '09:30',
        trade_date: '2023-01-01',
        entry_price: 100,
        return_pct: 0.5,
        year: '2023',
        match_count: 1,
        direction: 'long',
      }, // Winning long
      {
        entry_time: '10:00',
        trade_date: '2023-01-01',
        entry_price: 101,
        return_pct: -0.2,
        year: '2023',
        match_count: 1,
        direction: 'long',
      }, // Losing long
      {
        entry_time: '11:00',
        trade_date: '2023-01-01',
        entry_price: 102,
        return_pct: 0.3,
        year: '2023',
        match_count: 1,
        direction: 'short',
      }, // Winning short (return_pct is positive)
    ];
    vi.mocked(fetchTradesFromQuery).mockReturnValue(mockTradesFromQueryData as any); // Not used by processTradesLoop directly, but good for context if it were.
    // processTradesLoop takes tradesFromQuery as an argument.

    const initialDirectionalStatsTemplate = { winning_trades: 0, total_return_sum: 0 };
    const totalStats: OverallTradeStats = {
      long_stats: { ...initialDirectionalStatsTemplate, trades: [], all_returns: [] },
      short_stats: { ...initialDirectionalStatsTemplate, trades: [], all_returns: [] },
      total_trading_days: 10, // Example value
      total_raw_matches: mockTradesFromQueryData.length,
      total_llm_confirmed_trades: 0, // This gets updated by finalizeAnalysis
      grandTotalLlmCost: 0,
    };

    // LLM says proceed for all, costing 0.01 each, and confirms original direction
    vi.mocked(mockLlmScreenInstance.shouldSignalProceed)
      .mockResolvedValueOnce({ proceed: true, cost: 0.01, direction: 'long' })
      .mockResolvedValueOnce({ proceed: true, cost: 0.01, direction: 'long' })
      .mockResolvedValueOnce({ proceed: true, cost: 0.01, direction: 'short' });

    const result = await mainModule.processTradesLoop(
      mockTradesFromQueryData, // Pass the data directly
      mockMergedConfigValueSpecificTest,
      mockEntryPatternValue,
      mockLlmScreenInstance,
      mockMergedConfigValueSpecificTest.llmConfirmationScreen,
      mockRawConfig,
      totalStats
    );

    expect(result.confirmedTradesCount).toBe(mockTradesFromQueryData.length);
    expect(mapRawDataToTrade).toHaveBeenCalledTimes(mockTradesFromQueryData.length);

    // Check first call (long trade, positive return)
    expect(mapRawDataToTrade).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ return_pct: 0.5 }),
      'long',
      expect.any(String)
    );
    // Check second call (long trade, negative return)
    expect(mapRawDataToTrade).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ return_pct: -0.2 }),
      'long',
      expect.any(String)
    );
    // Check third call (SQL short trade, return_pct is positive, actualTradeDirection short, so adjustedReturnPct remains 0.3)
    expect(mapRawDataToTrade).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ return_pct: 0.3 }),
      'short',
      expect.any(String)
    );

    expect(printTradeDetails).toHaveBeenCalledTimes(mockTradesFromQueryData.length);
    expect(printYearSummary).toHaveBeenCalledTimes(1); // All trades are in the same year '2023'
    expect(printYearHeader).toHaveBeenCalledWith('2023');

    // Stats checks
    expect(totalStats.long_stats.trades.length).toBe(2);
    expect(totalStats.long_stats.winning_trades).toBe(1); // 0.5 is a win
    expect(totalStats.long_stats.all_returns).toEqual([0.5, -0.2]);
    expect(totalStats.long_stats.total_return_sum).toBeCloseTo(0.3);

    expect(totalStats.short_stats.trades.length).toBe(1);
    expect(totalStats.short_stats.winning_trades).toBe(1); // 0.3 is a win for a short trade
    expect(totalStats.short_stats.all_returns).toEqual([0.3]);
    expect(totalStats.short_stats.total_return_sum).toBeCloseTo(0.3);

    expect(totalStats.grandTotalLlmCost).toBeCloseTo(0.03);
  });

  it('should skip trades if LLM says not to proceed', async () => {
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
    const initialStats = {
      long_stats: { trades: [], all_returns: [], winning_trades: 0, total_return_sum: 0 },
      short_stats: { trades: [], all_returns: [], winning_trades: 0, total_return_sum: 0 },
      grandTotalLlmCost: 0,
      total_raw_matches: 2,
      total_trading_days: 1,
    };

    vi.mocked(mockLlmScreenInstance.shouldSignalProceed)
      .mockResolvedValueOnce({ proceed: false, cost: 0.01, direction: 'long' }) // Skip first
      .mockResolvedValueOnce({ proceed: true, cost: 0.01, direction: 'long' }); // Process second

    const result = await mainModule.processTradesLoop(
      mockTradesFromQueryData,
      mockMergedConfigValueSpecificTest,
      mockEntryPatternValue,
      mockLlmScreenInstance,
      mockMergedConfigValueSpecificTest.llmConfirmationScreen,
      mockRawConfig,
      initialStats
    );
    expect(result.confirmedTradesCount).toBe(1);
    expect(mapRawDataToTrade).toHaveBeenCalledTimes(1);
    expect(printTradeDetails).toHaveBeenCalledTimes(1);
    expect(initialStats.grandTotalLlmCost).toBeCloseTo(0.02); // Cost for both calls
    expect(initialStats.long_stats.trades.length).toBe(1);
  });
});
