import { vi, describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { LlmConfirmationScreen } from './screens/llm-confirmation.screen.js'; // Mocked
import { loadConfig, mergeConfigWithCliOptions } from './utils/config.js'; // Mocked
import { getEntryPattern, getExitPattern } from './patterns/pattern-factory.js'; // Mocked
import { buildAnalysisQuery } from './utils/query-builder.js'; // Mocked

const mockQueryValue = 'DRY_RUN_SQL_QUERY_FROM_INDEX_TEST_INIT';

// Top-level mocks similar to handleLlmTradeScreeningInternal.test.ts to ensure robustness
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
    prompts: 'Default prompt for LLM',
    commonPromptSuffixForJson: '{"action": "", "rationalization": ""}',
    maxOutputTokens: 150,
  };
  return {
    ...(actualConfig as any),
    loadConfig: vi.fn(() => ({
      default: {
        ticker: 'MOCK_TICKER_INIT',
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
      ticker: cliOpts.ticker || baseConfig.default?.ticker || 'MOCK_MERGED_TICKER_INIT',
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
  buildAnalysisQuery: vi.fn(() => mockQueryValue),
}));

// This mock is part of the shared beforeEach in index.test.ts, including for simplicity
vi.mock('./utils/data-loader.js', () => ({
  fetchTradesFromQuery: vi.fn(() => []),
}));

// Mock output functions as well to prevent console noise
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

let mainModule: any;

beforeAll(async () => {
  const originalProcess = { ...process };
  vi.stubGlobal('process', {
    ...originalProcess,
    exit: vi.fn((_code?: string | number | null | undefined) => {
      return undefined as never;
    }),
  });
  mainModule = await import('./index.js');
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('initializeAnalysis', () => {
  let mockCliOptions: any;
  let mockRawConfig: any;
  let mockMergedConfigValue: any;
  let mockEntryPatternValue: any;
  let mockExitPatternValue: any;

  beforeEach(() => {
    vi.clearAllMocks(); // Clear all mocks, including those implicitly created by vi.mock

    mockCliOptions = { config: 'path/to/config.yaml' };
    mockRawConfig = { someBaseOpt: 'value_init_test' }; // Specific to these tests
    mockMergedConfigValue = {
      ticker: 'TEST_INIT',
      from: '2023-03-01',
      to: '2023-03-02',
      entryPattern: 'test-entry-init',
      exitPattern: 'test-exit-init',
      timeframe: '10min',
      direction: 'long',
      llmConfirmationScreen: { enabled: false, commonPromptSuffixForJson: 'suffix-init' },
      generateCharts: false,
      chartsDir: './charts_init',
      someBaseOpt: 'value_init_test',
      config: 'path/to/config.yaml',
      // Ensure MergedConfig required fields are present
      'test-entry-init': { 'rise-pct': 0.5, 'within-minutes': 3 },
      'test-exit-init': { 'hold-minutes': 15 },
    };
    mockEntryPatternValue = { name: 'test-entry-init', direction: 'long', apply: vi.fn() };
    mockExitPatternValue = { name: 'test-exit-init', apply: vi.fn() };

    // Use the top-level mocks for loadConfig, mergeConfigWithCliOptions, etc.
    // but re-assert their specific calls for these tests if needed, or override return values.
    vi.mocked(loadConfig).mockReturnValue(mockRawConfig);
    vi.mocked(mergeConfigWithCliOptions).mockReturnValue(mockMergedConfigValue);
    vi.mocked(getEntryPattern).mockReturnValue(mockEntryPatternValue);
    vi.mocked(getExitPattern).mockReturnValue(mockExitPatternValue);
    vi.mocked(buildAnalysisQuery).mockReturnValue(mockQueryValue);
  });

  it('should load config, get patterns, and build query', () => {
    const result = mainModule.initializeAnalysis(mockCliOptions);
    expect(loadConfig).toHaveBeenCalledWith(mockCliOptions.config);
    expect(mergeConfigWithCliOptions).toHaveBeenCalledWith(mockRawConfig, mockCliOptions);
    expect(getEntryPattern).toHaveBeenCalledWith(
      mockMergedConfigValue.entryPattern,
      mockMergedConfigValue
    );
    expect(getExitPattern).toHaveBeenCalledWith(
      mockMergedConfigValue.exitPattern,
      mockMergedConfigValue
    );
    expect(buildAnalysisQuery).toHaveBeenCalledWith(
      mockMergedConfigValue,
      mockEntryPatternValue,
      mockExitPatternValue
    );
    expect(result.query).toBe(mockQueryValue);
    expect(result.entryPattern.name).toBe('test-entry-init');
    expect(result.exitPattern.name).toBe('test-exit-init');
    expect(result.rawConfig).toEqual(mockRawConfig);
    expect(result.mergedConfig).toEqual(mockMergedConfigValue);
  });

  it('should enable LLM screen if configured', () => {
    const llmEnabledConfig = {
      ...mockMergedConfigValue,
      llmConfirmationScreen: {
        ...mockMergedConfigValue.llmConfirmationScreen!,
        enabled: true,
      },
    };
    vi.mocked(mergeConfigWithCliOptions).mockReturnValue(llmEnabledConfig);
    const { llmScreenInstance, screenSpecificLLMConfig } =
      mainModule.initializeAnalysis(mockCliOptions);
    expect(llmScreenInstance).not.toBeNull();
    expect(LlmConfirmationScreen).toHaveBeenCalled();
    expect(screenSpecificLLMConfig!.enabled).toBe(true);
  });
});
