import { vi, describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { type Config as AppConfig, type MergedConfig } from './utils/config.js';
import { LlmConfirmationScreen } from './screens/llm-confirmation.screen.js';
import { generateEntryChart } from './utils/chart-generator.js';
import { type LLMScreenConfig as ScreenLLMConfig } from './screens/types.js'; // Import for type safety

// ---- Comprehensive Top-Level Mocks for index.js import ----
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
        ticker: 'MOCK_TICKER',
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
      ticker: cliOpts.ticker || baseConfig.default?.ticker || 'MOCK_MERGED_TICKER',
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
  buildAnalysisQuery: vi.fn(() => 'MOCK_SQL_QUERY_TOP_LEVEL'),
}));

vi.mock('./utils/data-loader.js', () => ({
  fetchTradesFromQuery: vi.fn(() => []),
}));

vi.mock('./utils/chart-generator.js', () => ({
  generateEntryChart: vi.fn(() => Promise.resolve('path/to/mock_chart.png')),
  generateEntryCharts: vi.fn(() => Promise.resolve([])),
}));

// Mock output functions to prevent console noise from rogue main() run
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

// ---- End of Comprehensive Top-Level Mocks ----

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

describe('handleLlmTradeScreeningInternal', () => {
  let mockMergedConfigValueSpecificTest: MergedConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generateEntryChart).mockClear().mockResolvedValue('path/to/chart_for_hdl_test.png');

    // This mockMergedConfigValue is for the specific needs of handleLlmTradeScreeningInternal tests.
    // It needs to align with the MergedConfig type from config.ts.
    mockMergedConfigValueSpecificTest = {
      ticker: 'TEST_HDL',
      from: '2023-02-01',
      to: '2023-02-02',
      entryPattern: 'test-entry-hdl',
      exitPattern: 'test-exit-hdl',
      timeframe: '5min',
      direction: 'short',
      llmConfirmationScreen: {
        // This structure should match LLMScreenConfig
        enabled: true,
        apiKeyEnvVar: 'DUMMY_KEY_HDL',
        modelName: 'test-model-hdl',
        commonPromptSuffixForJson: 'suffix-hdl',
        llmProvider: 'anthropic',
        numCalls: 1,
        agreementThreshold: 1,
        temperatures: [0.5],
        prompts: 'test prompt',
        maxOutputTokens: 100,
      },
      generateCharts: true,
      chartsDir: './charts_hdl',
      // Add any other required fields from MergedConfig if index.ts or its callees access them
      // For example, if pattern-specific configs are directly accessed on MergedConfig:
      // 'test-entry-hdl': { /* specific params */ },
    };
  });

  const mockSignal = {
    ticker: 'TEST_HDL',
    trade_date: '2023-02-01',
    price: 150,
    timestamp: '10:30',
    type: 'entry' as 'entry' | 'exit',
    direction: 'short' as 'long' | 'short',
  };
  const mockChartName = 'test-chart-hdl'; // This is entryPattern.name for chart generation

  // This AppConfig is passed as rawConfig to handleLlmTradeScreeningInternal
  const getMockAppConfig = (): AppConfig => ({
    default: {
      direction: 'short',
      ticker: 'TEST_APPCONF',
      timeframe: '5min',
      patterns: { entry: 'quick-rise', exit: 'fixed-time' },
      charts: { generate: false, outputDir: './charts_appconf' },
    },
    patterns: {
      entry: { 'quick-rise': { 'rise-pct': 0.2, 'within-minutes': 1 } },
      exit: { 'fixed-time': { 'hold-minutes': 10 } },
    },
    llmConfirmationScreen: {
      // This should match LLMScreenConfig
      enabled: true,
      llmProvider: 'openai',
      modelName: 'gpt-4',
      apiKeyEnvVar: 'OPENAI_KEY',
      numCalls: 1,
      agreementThreshold: 1,
      temperatures: [0.7],
      prompts: 'p-app',
      commonPromptSuffixForJson: 'Ensure JSON format from AppConfig.',
      maxOutputTokens: 200,
    },
  });

  // Helper to create a fully typed ScreenLLMConfig for tests
  const createScreenLlmConfig = (overrides: Partial<ScreenLLMConfig> = {}): ScreenLLMConfig => ({
    enabled: true,
    apiKeyEnvVar: 'DEFAULT_KEY',
    modelName: 'default-model',
    commonPromptSuffixForJson: 'default-suffix',
    llmProvider: 'anthropic',
    numCalls: 1,
    agreementThreshold: 1,
    temperatures: [0.5],
    prompts: 'default-prompt',
    maxOutputTokens: 100,
    ...overrides,
  });

  it('should return { proceed: true, cost: 0 } if LLM screen is not enabled or instance is null', async () => {
    const resultNullInstance = await mainModule.handleLlmTradeScreeningInternal(
      mockSignal,
      mockChartName,
      null,
      createScreenLlmConfig({ enabled: true }), // Pass a valid ScreenLLMConfig
      mockMergedConfigValueSpecificTest,
      getMockAppConfig()
    );
    expect(resultNullInstance).toEqual({ proceed: true, cost: 0 });
    expect(generateEntryChart).not.toHaveBeenCalled();

    const mockLlmInstanceWithProceed = new (LlmConfirmationScreen as any)();
    const resultDisabled = await mainModule.handleLlmTradeScreeningInternal(
      mockSignal,
      mockChartName,
      mockLlmInstanceWithProceed,
      createScreenLlmConfig({ enabled: false }), // LLM is disabled
      mockMergedConfigValueSpecificTest,
      getMockAppConfig()
    );
    expect(resultDisabled).toEqual({ proceed: true, cost: 0 });
    expect(generateEntryChart).not.toHaveBeenCalled();
  });

  it('should call LLM screen if enabled and return its decision with cost', async () => {
    const localMockLlmInstance = new (LlmConfirmationScreen as any)();
    const expectedChartPath = 'path/to/chart_for_hdl_test.png';

    const mockScreenCost = 0.005;
    vi.mocked(localMockLlmInstance.shouldSignalProceed).mockResolvedValueOnce({
      proceed: false,
      cost: mockScreenCost,
    });

    const llmConfScreenFromMerged = mockMergedConfigValueSpecificTest.llmConfirmationScreen!;

    const screenConfigForTest = createScreenLlmConfig({
      apiKeyEnvVar: llmConfScreenFromMerged.apiKeyEnvVar,
      modelName: llmConfScreenFromMerged.modelName,
      commonPromptSuffixForJson: llmConfScreenFromMerged.commonPromptSuffixForJson,
    });

    const resultFalse = await mainModule.handleLlmTradeScreeningInternal(
      mockSignal,
      mockChartName,
      localMockLlmInstance,
      screenConfigForTest,
      mockMergedConfigValueSpecificTest,
      getMockAppConfig()
    );

    expect(generateEntryChart).toHaveBeenCalledWith({
      ticker: mockSignal.ticker,
      timeframe: mockMergedConfigValueSpecificTest.timeframe,
      entryPatternName: mockChartName,
      tradeDate: mockSignal.trade_date,
      entryTimestamp: mockSignal.timestamp,
      entrySignal: {
        timestamp: mockSignal.timestamp,
        price: mockSignal.price,
        type: 'entry',
        direction: mockSignal.direction,
      },
      outputDir: mockMergedConfigValueSpecificTest.chartsDir,
    });

    expect(localMockLlmInstance.shouldSignalProceed).toHaveBeenCalledWith(
      mockSignal,
      expectedChartPath,
      screenConfigForTest,
      getMockAppConfig()
    );
    expect(resultFalse).toEqual({ proceed: false, cost: mockScreenCost });

    const secondMockCost = mockScreenCost + 0.001;
    vi.mocked(localMockLlmInstance.shouldSignalProceed).mockResolvedValueOnce({
      proceed: true,
      cost: secondMockCost,
    });

    await mainModule.handleLlmTradeScreeningInternal(
      mockSignal,
      mockChartName,
      localMockLlmInstance,
      screenConfigForTest,
      mockMergedConfigValueSpecificTest,
      getMockAppConfig()
    );
    expect(localMockLlmInstance.shouldSignalProceed).toHaveBeenCalledTimes(2);
    expect(generateEntryChart).toHaveBeenCalledTimes(2);
  });

  // Test removed as per user instruction to reduce complexity
  // it('should attempt chart generation for LLM and pass path to screen, even if mergedConfig.generateCharts is false', async () => { ... });
});
