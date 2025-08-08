import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Config, MergedConfig, LLMScreenConfig } from './utils/config';

// Mock the modules
vi.mock('./utils/config.js', () => ({
  loadConfig: vi.fn(),
  mergeConfigWithCliOptions: vi.fn(),
}));

vi.mock('./patterns/pattern-factory.js', () => ({
  getEntryPattern: vi.fn(),
}));

vi.mock('./patterns/exit/exit-strategy.js', () => ({
  createExitStrategies: vi.fn(),
}));

vi.mock('./utils/query-builder.js', () => ({
  buildAnalysisQuery: vi.fn(),
}));

vi.mock('./screens/llm-confirmation.screen.js', () => ({
  LlmConfirmationScreen: vi.fn(),
}));

// Import after mocks
import { initializeAnalysis } from './index.js';
import { loadConfig, mergeConfigWithCliOptions } from './utils/config.js';
import { getEntryPattern } from './patterns/pattern-factory.js';
import { createExitStrategies } from './patterns/exit/exit-strategy.js';
import { buildAnalysisQuery } from './utils/query-builder.js';
import { LlmConfirmationScreen } from './screens/llm-confirmation.screen.js';

describe('initializeAnalysis', () => {
  const mockLlmScreenConfig: LLMScreenConfig = {
    enabled: false,
    llmProvider: 'anthropic',
    modelName: 'claude-sonnet-4-20250514',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    numCalls: 3,
    agreementThreshold: 2,
    temperatures: [0.2, 0.5, 0.8],
    prompts: 'Test prompt',
    commonPromptSuffixForJson: '{}',
    maxOutputTokens: 150,
  };

  const mockRawConfigValue: Config = {
    default: {
      ticker: 'SPY',
      timeframe: '1min',
      direction: 'long',
      patterns: {
        entry: 'test-pattern',
      },
    },
    patterns: {
      entry: {},
    },
  };

  const mockMergedConfigValue: MergedConfig = {
    ticker: 'TEST',
    timeframe: '1min',
    direction: 'long',
    from: '2023-01-01',
    to: '2023-01-05',
    entryPattern: 'test-pattern',
    generateCharts: false,
    chartsDir: './charts',
    llmConfirmationScreen: mockLlmScreenConfig,
  };

  const mockEntryPatternValue = {
    name: 'test-pattern',
    sql: 'test-sql',
    description: 'Test pattern',
    defaultConfig: {},
  };

  const mockExitStrategiesValue = [{ name: 'maxHoldTime', evaluate: vi.fn() }];
  const mockQueryValue = 'SELECT * FROM test';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadConfig).mockReturnValue(mockRawConfigValue);
    vi.mocked(mergeConfigWithCliOptions).mockReturnValue(mockMergedConfigValue);
    vi.mocked(getEntryPattern).mockReturnValue(mockEntryPatternValue);
    vi.mocked(createExitStrategies).mockReturnValue(mockExitStrategiesValue);
    vi.mocked(buildAnalysisQuery).mockReturnValue(mockQueryValue);
    vi.mocked(LlmConfirmationScreen).mockImplementation(() => ({}) as any);
  });

  it('should load config, get patterns, and build query', () => {
    const cliOptions = { config: 'test.yaml' };
    const result = initializeAnalysis(cliOptions);

    expect(loadConfig).toHaveBeenCalledWith(cliOptions.config);
    expect(mergeConfigWithCliOptions).toHaveBeenCalledWith(mockRawConfigValue, cliOptions);

    expect(getEntryPattern).toHaveBeenCalledWith(
      mockMergedConfigValue.entryPattern,
      mockMergedConfigValue
    );
    expect(createExitStrategies).toHaveBeenCalledWith(mockMergedConfigValue);

    expect(buildAnalysisQuery).toHaveBeenCalledWith(mockMergedConfigValue, mockEntryPatternValue);

    expect(result).toEqual({
      rawConfig: mockRawConfigValue,
      mergedConfig: mockMergedConfigValue,
      llmScreenInstance: null,
      screenSpecificLLMConfig: mockMergedConfigValue.llmConfirmationScreen,
      entryPattern: mockEntryPatternValue,
      exitStrategies: mockExitStrategiesValue,
      query: mockQueryValue,
    });
  });

  it('should enable LLM screen if configured', () => {
    const enabledLlmConfig = {
      ...mockLlmScreenConfig,
      enabled: true,
    };

    const mergedConfigWithLLM: MergedConfig = {
      ...mockMergedConfigValue,
      llmConfirmationScreen: enabledLlmConfig,
    };
    vi.mocked(mergeConfigWithCliOptions).mockReturnValue(mergedConfigWithLLM);

    const result = initializeAnalysis({});

    expect(LlmConfirmationScreen).toHaveBeenCalled();
    expect(result.llmScreenInstance).not.toBeNull();
  });
});
