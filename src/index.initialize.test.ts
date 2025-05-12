import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { LlmConfirmationScreen as _ActualLlmConfirmationScreen } from './screens/llm-confirmation.screen.js';

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

// Only mock parts of output that are used or to prevent console noise if not tested here
vi.mock('./utils/output.js', async () => {
  const actual = await vi.importActual('./utils/output.js');
  return {
    ...actual,
    printHeader: vi.fn(), // Potentially called by mainModule if not split perfectly
    printFooter: vi.fn(), // Potentially called by mainModule if not split perfectly
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
    // Mock specific functions as needed, or return actuals if they don't have side effects
    isWinningTrade: actualCalculations.isWinningTrade,
  };
});

import { getEntryPattern, getExitPattern } from './patterns/pattern-factory.js';
import { LlmConfirmationScreen } from './screens/llm-confirmation.screen.js';
import { loadConfig, mergeConfigWithCliOptions } from './utils/config.js';
import { buildAnalysisQuery } from './utils/query-builder.js';

let mainModule: any;

beforeAll(async () => {
  mainModule = await import('./index.js');
});

describe('initializeAnalysis', () => {
  let mockCliOptions: any;
  let mockRawConfig: any;
  let mockMergedConfigValue: any;
  let mockEntryPatternValue: any;
  let mockExitPatternValue: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCliOptions = { config: 'path/to/config.yaml' };
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
    // No need to mock fetchTradesFromQuery or buildAnalysisQuery here if not directly called by initializeAnalysis
    // However, buildAnalysisQuery *is* called, so its mock is needed.
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
    expect(result.entryPattern.name).toBe('test-entry');
    expect(result.exitPattern.name).toBe('test-exit');
    expect(result.rawConfig).toEqual(mockRawConfig);
    expect(result.mergedConfig).toEqual(mockMergedConfigValue);
  });

  it('should enable LLM screen if configured', () => {
    const llmEnabledConfig = {
      ...mockMergedConfigValue,
      llmConfirmationScreen: { enabled: true },
    };
    vi.mocked(mergeConfigWithCliOptions).mockReturnValue(llmEnabledConfig);
    const { llmScreenInstance, screenSpecificLLMConfig } =
      mainModule.initializeAnalysis(mockCliOptions);
    expect(llmScreenInstance).not.toBeNull();
    expect(LlmConfirmationScreen).toHaveBeenCalled();
    expect(screenSpecificLLMConfig.enabled).toBe(true);
  });
});
