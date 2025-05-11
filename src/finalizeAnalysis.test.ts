import { vi, describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { type MergedConfig } from './utils/config.js';
import { generateEntryCharts } from './utils/chart-generator.js';
import { printOverallSummary, printFooter } from './utils/output.js';
import { type OverallTradeStats } from './utils/output.js';

// ---- Simplified Top-Level Mocks for index.js import ----
// Goal: Prevent crashes during `await import('./index.js')` due to main() execution,
// while keeping mocks for `finalizeAnalysis` specific dependencies more focused if needed.

vi.mock('./utils/config.js', async () => {
  const actualConfig = await vi.importActual('./utils/config.js');
  const defaultLLMScreenOpts = { enabled: false, commonPromptSuffixForJson: 'suffix' }; // Minimal for schema
  return {
    ...(actualConfig as any),
    loadConfig: vi.fn(() => ({
      // Minimal valid raw config for initializeAnalysis
      default: { patterns: {}, llmConfirmationScreen: defaultLLMScreenOpts },
      patterns: { entry: {}, exit: {} },
      llmConfirmationScreen: defaultLLMScreenOpts,
    })),
    mergeConfigWithCliOptions: vi.fn((_base: any, cliOpts: any) => ({
      // Minimal merged for initializeAnalysis
      ticker: 'DEFAULT_TICKER',
      from: '2024-01-01',
      to: '2024-01-02',
      entryPattern: 'default-entry',
      exitPattern: 'default-exit',
      timeframe: '1min',
      direction: 'long',
      llmConfirmationScreen: { ...defaultLLMScreenOpts, ...(cliOpts.llmConfirmationScreen || {}) },
      generateCharts: false,
      chartsDir: './charts',
      // Provide default empty objects for pattern configs if accessed by key
      'default-entry': {},
      'default-exit': {},
      ...cliOpts,
    })),
  };
});

vi.mock('./patterns/pattern-factory.js', () => ({
  getEntryPattern: vi.fn(() => ({ name: 'mock-entry-for-import', direction: 'long' })),
  getExitPattern: vi.fn(() => ({ name: 'mock-exit-for-import' })),
  // getAvailableEntryPatterns/getAvailableExitPatterns not strictly needed by initializeAnalysis
}));

vi.mock('./utils/query-builder.js', () => ({
  buildAnalysisQuery: vi.fn(() => 'MOCK_SQL_QUERY_FOR_IMPORT'),
}));

vi.mock('./screens/llm-confirmation.screen.js', () => ({
  LlmConfirmationScreen: vi.fn().mockImplementation(() => ({})), // Minimal constructor
}));

vi.mock('./utils/data-loader.js', () => ({
  fetchTradesFromQuery: vi.fn(() => []),
}));

// Mocks for modules directly used by finalizeAnalysis tests
vi.mock('./utils/chart-generator.js', () => ({
  generateEntryChart: vi.fn(), // Not used by finalizeAnalysis tests but good to have a basic mock
  generateEntryCharts: vi.fn(() => Promise.resolve([])), // Used by finalizeAnalysis
}));

vi.mock('./utils/output.js', () => ({
  printOverallSummary: vi.fn(), // Used by finalizeAnalysis
  printFooter: vi.fn(), // Used by finalizeAnalysis
  // Other output functions mocked minimally if main() calls them via other paths
  printHeader: vi.fn(),
  printTradeDetails: vi.fn(),
  printYearSummary: vi.fn(),
  printYearHeader: vi.fn(),
}));

let mainModule: any;

beforeAll(async () => {
  const originalProcess = { ...process };
  vi.stubGlobal('process', { ...originalProcess, exit: vi.fn(_c => undefined as never) });
  mainModule = await import('./index.js');
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('finalizeAnalysis', () => {
  let mockEntryPatternValueForTest: any;
  let mockMergedConfigValueForTest: MergedConfig;

  beforeEach(() => {
    vi.clearAllMocks(); // This clears all mocks, including top-level ones.

    // Specific, more detailed mocks for the actual finalizeAnalysis tests:
    mockEntryPatternValueForTest = { name: 'test-entry-fa', direction: 'long' }; // Removed apply: vi.fn() as it's not used by finalizeAnalysis
    mockMergedConfigValueForTest = {
      ticker: 'TEST_FA',
      from: '2023-04-01',
      to: '2023-04-02',
      entryPattern: mockEntryPatternValueForTest.name,
      exitPattern: 'test-exit-fa',
      timeframe: '30min',
      direction: 'long',
      llmConfirmationScreen: {
        enabled: true, // Test case below relies on this being true for one path
        apiKeyEnvVar: 'KEY_FA',
        modelName: 'MODEL_FA',
        commonPromptSuffixForJson: 'suffix_fa',
        llmProvider: 'anthropic',
        numCalls: 1,
        agreementThreshold: 1,
        temperatures: [0.1],
        prompts: 'p_fa',
        maxOutputTokens: 50,
      },
      generateCharts: true,
      chartsDir: './charts_finalize',
      [mockEntryPatternValueForTest.name]: { param: 'value' },
    };

    // If generateEntryCharts needs to be specifically controlled per test:
    vi.mocked(generateEntryCharts).mockClear().mockResolvedValue(['chart1.png']);
    vi.mocked(printOverallSummary).mockClear();
    vi.mocked(printFooter).mockClear();
  });

  it('should calculate final stats, call output, and generate charts if enabled and trades exist', async () => {
    const trades = [
      { trade_date: 'd', entry_time: 't', entry_price: 1, direction: 'long', chartPath: 'p1' },
    ];
    const totalStats: OverallTradeStats = {
      long_stats: {
        trades: trades as any,
        winning_trades: 1,
        total_return_sum: 0.3,
        all_returns: [0.5, -0.2],
      },
      short_stats: { trades: [], winning_trades: 0, total_return_sum: 0, all_returns: [] },
      total_trading_days: 10,
      total_raw_matches: 1,
      grandTotalLlmCost: 0.05,
      total_llm_confirmed_trades: 0,
    };
    const config = {
      ...mockMergedConfigValueForTest,
      generateCharts: true,
      llmConfirmationScreen: {
        ...mockMergedConfigValueForTest.llmConfirmationScreen!,
        enabled: false,
      },
    }; // LLM disabled for this path of chart gen

    await mainModule.finalizeAnalysis(totalStats, mockEntryPatternValueForTest, config);

    expect(totalStats.total_llm_confirmed_trades).toBe(trades.length);
    expect(printOverallSummary).toHaveBeenCalledWith(totalStats);
    expect(generateEntryCharts).toHaveBeenCalledWith(
      config.ticker,
      config.timeframe,
      mockEntryPatternValueForTest.name,
      expect.arrayContaining([expect.objectContaining({ trade_date: 'd' })]),
      config.chartsDir
    );
    expect(printFooter).toHaveBeenCalled();
  });

  it('should generate charts from trade.chartPath if LLM screen was enabled', async () => {
    const trades = [
      {
        trade_date: 'd1',
        entry_time: 't1',
        entry_price: 1,
        direction: 'long',
        chartPath: 'path/to/chart1.png',
      },
      {
        trade_date: 'd2',
        entry_time: 't2',
        entry_price: 2,
        direction: 'short',
        chartPath: 'path/to/chart2.png',
      },
    ];
    const totalStats: OverallTradeStats = {
      long_stats: {
        trades: [trades[0]] as any,
        winning_trades: 1,
        total_return_sum: 0.1,
        all_returns: [0.1],
      },
      short_stats: {
        trades: [trades[1]] as any,
        winning_trades: 1,
        total_return_sum: 0.2,
        all_returns: [0.2],
      },
      total_trading_days: 2,
      total_raw_matches: 2,
      grandTotalLlmCost: 0.1,
      total_llm_confirmed_trades: 0,
    };
    // Keep LLM enabled in mergedConfig for this test path
    const config = {
      ...mockMergedConfigValueForTest,
      generateCharts: true,
      llmConfirmationScreen: {
        ...mockMergedConfigValueForTest.llmConfirmationScreen!,
        enabled: true,
      },
    };

    await mainModule.finalizeAnalysis(totalStats, mockEntryPatternValueForTest, config);

    expect(totalStats.total_llm_confirmed_trades).toBe(2);
    expect(printOverallSummary).toHaveBeenCalledWith(totalStats);
    // generateEntryCharts should NOT be called if LLM was enabled and charts came from trade.chartPath
    expect(generateEntryCharts).not.toHaveBeenCalled();
    expect(printFooter).toHaveBeenCalled();
  });

  it('should not call generateEntryCharts if generateCharts config is false', async () => {
    const totalStats: OverallTradeStats = {
      long_stats: {
        trades: [{ some: 'trade' } as any],
        winning_trades: 0,
        total_return_sum: 0,
        all_returns: [],
      },
      short_stats: { trades: [], winning_trades: 0, total_return_sum: 0, all_returns: [] },
      total_trading_days: 1,
      total_raw_matches: 1,
      grandTotalLlmCost: 0,
      total_llm_confirmed_trades: 0,
    };
    // Pass config with generateCharts: false
    await mainModule.finalizeAnalysis(totalStats, mockEntryPatternValueForTest, {
      ...mockMergedConfigValueForTest,
      generateCharts: false,
    });

    expect(generateEntryCharts).not.toHaveBeenCalled();
    expect(printOverallSummary).toHaveBeenCalledWith(totalStats);
    expect(printFooter).toHaveBeenCalled();
  });

  it('should not call generateEntryCharts if no confirmed trades, even if generateCharts is true', async () => {
    const totalStatsNoTrades: OverallTradeStats = {
      long_stats: { trades: [], winning_trades: 0, total_return_sum: 0, all_returns: [] },
      short_stats: { trades: [], winning_trades: 0, total_return_sum: 0, all_returns: [] },
      total_trading_days: 5,
      total_raw_matches: 0,
      grandTotalLlmCost: 0,
      total_llm_confirmed_trades: 0,
    };
    // Pass config with generateCharts: true
    await mainModule.finalizeAnalysis(totalStatsNoTrades, mockEntryPatternValueForTest, {
      ...mockMergedConfigValueForTest,
      generateCharts: true,
    });

    expect(totalStatsNoTrades.total_llm_confirmed_trades).toBe(0);
    expect(generateEntryCharts).not.toHaveBeenCalled();
    expect(printOverallSummary).toHaveBeenCalledWith(totalStatsNoTrades);
    expect(printFooter).toHaveBeenCalled();
  });
});
