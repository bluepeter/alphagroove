import { vi, describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { type MergedConfig } from './utils/config.js';
import { generateEntryCharts } from './utils/chart-generator.js';
import { printOverallSummary, printFooter } from './utils/output.js';
import { type OverallTradeStats } from './utils/output.js'; // For typing totalStats

// ---- Top-Level Mocks ----
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
        ticker: 'MOCK_T_FA',
        timeframe: '1m',
        direction: 'long',
        patterns: { entry: 'q-r', exit: 'f-t' },
        charts: { generate: false, outputDir: './charts' },
      },
      patterns: { entry: { 'q-r': {} }, exit: { 'f-t': {} } },
      llmConfirmationScreen: defaultLLMScreenOpts,
    })),
    mergeConfigWithCliOptions: vi.fn((baseConfig: any, cliOpts: any) => ({
      ticker: cliOpts.ticker || baseConfig.default?.ticker || 'M_MERGED_T_FA',
      timeframe: cliOpts.timeframe || baseConfig.default?.timeframe || '1m',
      direction: cliOpts.direction || baseConfig.default?.direction || 'long',
      from: cliOpts.from || baseConfig.default?.date?.from || '2023-01-01',
      to: cliOpts.to || baseConfig.default?.date?.to || '2023-01-02',
      entryPattern: cliOpts.entryPattern || baseConfig.default?.patterns?.entry || 'q-r',
      exitPattern: cliOpts.exitPattern || baseConfig.default?.patterns?.exit || 'f-t',
      generateCharts:
        cliOpts.generateCharts !== undefined
          ? cliOpts.generateCharts
          : baseConfig.default?.charts?.generate || false,
      chartsDir: cliOpts.chartsDir || baseConfig.default?.charts?.outputDir || './charts_fa',
      llmConfirmationScreen: {
        ...(baseConfig.llmConfirmationScreen || defaultLLMScreenOpts),
        ...(cliOpts.llmConfirmationScreen || {}),
        enabled:
          cliOpts.llmConfirmationScreen?.enabled !== undefined
            ? cliOpts.llmConfirmationScreen.enabled
            : baseConfig.llmConfirmationScreen?.enabled || false,
      },
      'q-r': baseConfig.patterns?.entry?.['q-r'] || {},
      'f-t': baseConfig.patterns?.exit?.['f-t'] || {},
      ...cliOpts,
    })),
  };
});

vi.mock('./patterns/pattern-factory.js', async () => {
  const actual = await vi.importActual('./patterns/pattern-factory.js');
  return {
    ...actual,
    getEntryPattern: vi.fn(pn => ({ name: pn || 'q-r', direction: 'long', apply: vi.fn() })),
    getExitPattern: vi.fn(pn => ({ name: pn || 'f-t', apply: vi.fn() })),
  };
});

vi.mock('./utils/chart-generator.js', () => ({
  generateEntryChart: vi.fn(() => Promise.resolve('path/to/mock_chart_fa.png')),
  generateEntryCharts: vi.fn(() => Promise.resolve([])),
}));

vi.mock('./utils/output.js', async () => {
  const actualOutput = await vi.importActual('./utils/output.js');
  return {
    ...actualOutput,
    printOverallSummary: vi.fn(),
    printFooter: vi.fn(),
    // Other output functions are not directly called by finalizeAnalysis
  };
});

// Added mock for query-builder.js
vi.mock('./utils/query-builder.js', () => ({
  buildAnalysisQuery: vi.fn(() => 'MOCK_SQL_QUERY_FINALIZE_TOP_LEVEL'),
}));

// Mock for LlmConfirmationScreen also needed because initializeAnalysis (called by main) news it up
vi.mock('./screens/llm-confirmation.screen.js', () => ({
  LlmConfirmationScreen: vi.fn().mockImplementation(() => ({
    shouldSignalProceed: vi.fn(() =>
      Promise.resolve({ proceed: true, cost: 0, direction: 'long' })
    ),
  })),
}));

// Mock for data-loader also needed because runAnalysis (called by main) uses it
vi.mock('./utils/data-loader.js', () => ({
  fetchTradesFromQuery: vi.fn(() => []),
}));

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

describe('finalizeAnalysis', () => {
  let mockEntryPatternValue: any;
  let mockMergedConfigValue: MergedConfig; // Typed for clarity

  beforeEach(() => {
    vi.clearAllMocks();

    mockEntryPatternValue = { name: 'test-entry-fa', direction: 'long', apply: vi.fn() };
    mockMergedConfigValue = {
      ticker: 'TEST_FA',
      from: '2023-04-01',
      to: '2023-04-02',
      entryPattern: mockEntryPatternValue.name,
      exitPattern: 'test-exit-fa',
      timeframe: '30min',
      direction: 'long',
      llmConfirmationScreen: {
        enabled: false,
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
      generateCharts: true, // Important for one path in finalizeAnalysis
      chartsDir: './charts_finalize',
      // pattern specific configs if MergedConfig requires them and they are accessed
      [mockEntryPatternValue.name]: { param: 'value' },
    };
  });

  it('should calculate final stats, call output functions, and handle chart generation', async () => {
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
      trades: [] as any[],
      winning_trades: 0,
      total_return_sum: 0,
      all_returns: [],
    };
    const totalStats: OverallTradeStats = {
      long_stats: { ...initialLongStats },
      short_stats: { ...initialShortStats },
      total_trading_days: 10,
      total_raw_matches: 2, // Sum of trades.length
      grandTotalLlmCost: 0.05,
      total_llm_confirmed_trades: 0, // This will be set by finalizeAnalysis
    };

    await mainModule.finalizeAnalysis(totalStats, mockEntryPatternValue, mockMergedConfigValue);

    expect(totalStats.total_llm_confirmed_trades).toBe(
      initialLongStats.trades.length + initialShortStats.trades.length
    );
    expect(printOverallSummary).toHaveBeenCalledWith(totalStats);
    expect(generateEntryCharts).toHaveBeenCalledWith(
      mockMergedConfigValue.ticker,
      mockMergedConfigValue.timeframe,
      mockEntryPatternValue.name,
      expect.any(Array), // The trades array for bulk charts
      mockMergedConfigValue.chartsDir
    );
    expect(printFooter).toHaveBeenCalled();
  });

  it('should not call generateEntryCharts if generateCharts config is false', async () => {
    const configNoCharts: MergedConfig = { ...mockMergedConfigValue, generateCharts: false };
    const totalStats: OverallTradeStats = {
      long_stats: { trades: [], winning_trades: 0, total_return_sum: 0, all_returns: [] },
      short_stats: { trades: [], winning_trades: 0, total_return_sum: 0, all_returns: [] },
      total_trading_days: 0,
      total_raw_matches: 0,
      grandTotalLlmCost: 0,
      total_llm_confirmed_trades: 0,
    };

    await mainModule.finalizeAnalysis(totalStats, mockEntryPatternValue, configNoCharts);

    expect(generateEntryCharts).not.toHaveBeenCalled();
    expect(printOverallSummary).toHaveBeenCalledWith(totalStats);
    expect(printFooter).toHaveBeenCalled();
  });

  it('should not call generateEntryCharts if there are no confirmed trades, even if config is true', async () => {
    const configWithCharts: MergedConfig = { ...mockMergedConfigValue, generateCharts: true };
    const totalStatsNoTrades: OverallTradeStats = {
      long_stats: { trades: [], winning_trades: 0, total_return_sum: 0, all_returns: [] },
      short_stats: { trades: [], winning_trades: 0, total_return_sum: 0, all_returns: [] },
      total_trading_days: 5,
      total_raw_matches: 0,
      grandTotalLlmCost: 0,
      total_llm_confirmed_trades: 0, // This will be 0 after finalizeAnalysis updates it
    };

    // finalizeAnalysis will set total_llm_confirmed_trades based on the empty trades arrays
    await mainModule.finalizeAnalysis(totalStatsNoTrades, mockEntryPatternValue, configWithCharts);

    expect(totalStatsNoTrades.total_llm_confirmed_trades).toBe(0);
    expect(generateEntryCharts).not.toHaveBeenCalled();
    expect(printOverallSummary).toHaveBeenCalledWith(totalStatsNoTrades);
    expect(printFooter).toHaveBeenCalled();
  });
});
