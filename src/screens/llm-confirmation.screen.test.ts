/// <reference types="vitest/globals" />
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  LlmApiService as ActualLlmApiService,
  type LLMResponse,
} from '../services/llm-api.service';
import { type Config as AppConfig } from '../utils/config';

import { LlmConfirmationScreen } from './llm-confirmation.screen';
import { type LLMScreenConfig, type EnrichedSignal } from './types';

vi.mock('../services/llm-api.service');
const LlmApiService = ActualLlmApiService as any;

const getBaseScreenConfig = (): LLMScreenConfig => ({
  enabled: true,
  llmProvider: 'anthropic',
  modelName: 'claude-test-model',
  apiKeyEnvVar: 'TEST_ANTHROPIC_API_KEY',
  numCalls: 3,
  agreementThreshold: 2,
  temperatures: [0.2, 0.5, 0.8],
  prompts: 'Test prompt',
  commonPromptSuffixForJson: ' Respond JSON',
  maxOutputTokens: 50,
});

const getBaseSignal = (): EnrichedSignal => ({
  ticker: 'SPY',
  trade_date: '2024-01-01',
  price: 100,
  timestamp: new Date().toISOString(),
  type: 'entry',
  direction: 'long',
});

// Helper to create mock LLMResponse with cost
const mockLLMResponse = (
  action: 'long' | 'short' | 'do_nothing',
  rationalization?: string,
  error?: string,
  inputTokens = 100,
  outputTokens = 50
): LLMResponse => {
  const cost = (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15; // $3/M input, $15/M output
  return {
    action,
    rationalization,
    error,
    cost,
    rawResponse: { usage: { input_tokens: inputTokens, output_tokens: outputTokens } }, // For LlmApiService to calculate
  };
};

const getBaseAppConfig = (direction: 'long' | 'short' = 'long'): AppConfig => ({
  default: {
    ticker: 'SPY',
    timeframe: '1min',
    direction,
    patterns: { entry: 'quick-rise' },
    charts: { generate: false, outputDir: './charts' },
    date: { from: '2023-01-01', to: '2023-12-31' },
  },
  patterns: {
    entry: { 'quick-rise': { 'rise-pct': 0.3, 'within-minutes': 5 } },
  },
});

describe('LlmConfirmationScreen', () => {
  let screen: LlmConfirmationScreen;
  const mockChartPath = 'path/to/chart.png';
  let mockLlmApiServiceInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();
    screen = new LlmConfirmationScreen();

    mockLlmApiServiceInstance = {
      isEnabled: vi.fn(() => true),
      getTradeDecisions: vi.fn(),
    };
    LlmApiService.mockImplementation(() => mockLlmApiServiceInstance);
  });

  it('should return { proceed: true, cost: 0 } if screenConfig is not enabled', async () => {
    const screenConfig = { ...getBaseScreenConfig(), enabled: false };
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await screen.shouldSignalProceed(
      getBaseSignal(),
      mockChartPath,
      screenConfig,
      getBaseAppConfig()
    );
    expect(result).toEqual({ proceed: true, cost: 0 });
    expect(LlmApiService).not.toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Screen not enabled'));
    consoleLogSpy.mockRestore();
  });

  it('should return { proceed: true, cost: 0 } if LlmApiService instance reports not enabled', async () => {
    mockLlmApiServiceInstance.isEnabled.mockReturnValue(false);

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await screen.shouldSignalProceed(
      getBaseSignal(),
      mockChartPath,
      getBaseScreenConfig(),
      getBaseAppConfig()
    );
    expect(result).toEqual({ proceed: true, cost: 0 });
    expect(LlmApiService).toHaveBeenCalledTimes(1);
    expect(mockLlmApiServiceInstance.isEnabled).toHaveBeenCalledTimes(1);
    expect(mockLlmApiServiceInstance.getTradeDecisions).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('LLM service is not properly enabled')
    );
    consoleWarnSpy.mockRestore();
  });

  it('should return true if longVotes meet threshold and config is long', async () => {
    const screenConfig = getBaseScreenConfig();
    const appConfig = getBaseAppConfig('long');
    const llmResponses: LLMResponse[] = [
      mockLLMResponse('long', undefined, undefined, 100, 50), // cost = 0.00105
      mockLLMResponse('long', undefined, undefined, 110, 60), // cost = 0.00123
      mockLLMResponse('do_nothing', undefined, undefined, 90, 40), // cost = 0.00087
    ];
    const expectedTotalCost = 0.00105 + 0.00123 + 0.00087;
    mockLlmApiServiceInstance.getTradeDecisions.mockResolvedValue(llmResponses);
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await screen.shouldSignalProceed(
      getBaseSignal(),
      mockChartPath,
      screenConfig,
      appConfig
    );
    expect(result.proceed).toBe(true);
    expect(result.cost).toBeCloseTo(expectedTotalCost);
    expect(mockLlmApiServiceInstance.getTradeDecisions).toHaveBeenCalledWith(mockChartPath);
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('(Cost: $0.001050)'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('(Cost: $0.001230)'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('(Cost: $0.000870)'));
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining(`(Total Cost: $${expectedTotalCost.toFixed(6)})`)
    );
    consoleLogSpy.mockRestore();
  });

  it('should return false if longVotes meet threshold but config is short', async () => {
    const screenConfig = getBaseScreenConfig();
    const appConfig = getBaseAppConfig('short'); // Configured for short
    const llmResponses: LLMResponse[] = [
      mockLLMResponse('long', undefined, undefined, 100, 50),
      mockLLMResponse('long', undefined, undefined, 100, 50),
      mockLLMResponse('do_nothing', undefined, undefined, 100, 50),
    ];
    const expectedTotalCost = 0.00105 * 3;
    mockLlmApiServiceInstance.getTradeDecisions.mockResolvedValue(llmResponses);
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await screen.shouldSignalProceed(
      getBaseSignal(),
      mockChartPath,
      screenConfig,
      appConfig
    );
    expect(result.proceed).toBe(false);
    expect(result.cost).toBeCloseTo(expectedTotalCost);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining(`(Total Cost: $${expectedTotalCost.toFixed(6)})`)
    );
    consoleLogSpy.mockRestore();
  });

  it('should return { proceed: true, cost: expected } if shortVotes meet threshold and config is short', async () => {
    const screenConfig = getBaseScreenConfig();
    const appConfig = getBaseAppConfig('short'); // Configured for short
    const llmResponses: LLMResponse[] = [
      mockLLMResponse('short', undefined, undefined, 100, 50), //0.00105
      mockLLMResponse('do_nothing', undefined, undefined, 100, 50), //0.00105
      mockLLMResponse('short', undefined, undefined, 100, 50), //0.00105
    ];
    mockLlmApiServiceInstance.getTradeDecisions.mockResolvedValue(llmResponses);
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await screen.shouldSignalProceed(
      getBaseSignal(),
      mockChartPath,
      screenConfig,
      appConfig
    );
    expect(result.proceed).toBe(true);
    expect(result.cost).toBeCloseTo(0.00315);
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('(Total Cost: $0.003150)'));
    consoleLogSpy.mockRestore();
  });

  it('should return { proceed: false, cost: expected } if shortVotes meet threshold but config is long', async () => {
    const screenConfig = getBaseScreenConfig();
    const appConfig = getBaseAppConfig('long'); // Configured for long
    const llmResponses: LLMResponse[] = [
      mockLLMResponse('short'),
      mockLLMResponse('do_nothing'),
      mockLLMResponse('short'),
    ];
    mockLlmApiServiceInstance.getTradeDecisions.mockResolvedValue(llmResponses);
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await screen.shouldSignalProceed(
      getBaseSignal(),
      mockChartPath,
      screenConfig,
      appConfig
    );
    expect(result.proceed).toBe(false);
    expect(result.cost).toBeCloseTo(0.00315);
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('(Total Cost: $0.003150)'));
    consoleLogSpy.mockRestore();
  });

  it('should return { proceed: false, cost: expected } if no action meets threshold (config long)', async () => {
    const screenConfig = getBaseScreenConfig();
    const appConfig = getBaseAppConfig('long');
    const llmResponses: LLMResponse[] = [
      mockLLMResponse('long'), // Not enough for threshold 2
      mockLLMResponse('short'),
      mockLLMResponse('do_nothing'),
    ];
    mockLlmApiServiceInstance.getTradeDecisions.mockResolvedValue(llmResponses);
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await screen.shouldSignalProceed(
      getBaseSignal(),
      mockChartPath,
      screenConfig,
      appConfig
    );
    expect(result.proceed).toBe(false);
    expect(result.cost).toBeCloseTo(0.00315);
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('(Total Cost: $0.003150)'));
    consoleLogSpy.mockRestore();
  });

  it('should return { proceed: false, cost: expected } if no action meets threshold (config short)', async () => {
    const screenConfig = getBaseScreenConfig();
    const appConfig = getBaseAppConfig('short');
    const llmResponses: LLMResponse[] = [
      mockLLMResponse('long'),
      mockLLMResponse('short'), // Not enough for threshold 2
      mockLLMResponse('do_nothing'),
    ];
    mockLlmApiServiceInstance.getTradeDecisions.mockResolvedValue(llmResponses);
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await screen.shouldSignalProceed(
      getBaseSignal(),
      mockChartPath,
      screenConfig,
      appConfig
    );
    expect(result.proceed).toBe(false);
    expect(result.cost).toBeCloseTo(0.00315);
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('(Total Cost: $0.003150)'));
    consoleLogSpy.mockRestore();
  });

  it('should return { proceed: false, cost: expected } if agreementThreshold is higher and not met (config long)', async () => {
    const screenConfig = { ...getBaseScreenConfig(), agreementThreshold: 3 };
    const appConfig = getBaseAppConfig('long');
    const llmResponses: LLMResponse[] = [
      mockLLMResponse('long'),
      mockLLMResponse('long'), // Only 2, needs 3
      mockLLMResponse('do_nothing'),
    ];
    mockLlmApiServiceInstance.getTradeDecisions.mockResolvedValue(llmResponses);
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await screen.shouldSignalProceed(
      getBaseSignal(),
      mockChartPath,
      screenConfig,
      appConfig
    );
    expect(result.proceed).toBe(false);
    expect(result.cost).toBeCloseTo(0.00315);
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('(Total Cost: $0.003150)'));
    consoleLogSpy.mockRestore();
  });

  it('should return { proceed: true, cost: expected } if longVotes meet threshold and config is long, ignoring errored responses for cost summation but still logging cost for successful calls', async () => {
    const screenConfig = getBaseScreenConfig();
    const appConfig = getBaseAppConfig('long');
    const llmResponses: LLMResponse[] = [
      mockLLMResponse('long', undefined, undefined, 100, 50), // cost = 0.00105
      mockLLMResponse('do_nothing', 'Error', 'API failed', 0, 0), // cost = 0
      mockLLMResponse('long', undefined, undefined, 120, 70), // cost = 0.00141
    ];
    llmResponses[1].cost = 0; // Explicitly ensure the errored one has 0 cost for the test
    llmResponses[1].rawResponse = undefined;

    mockLlmApiServiceInstance.getTradeDecisions.mockResolvedValue(llmResponses);
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await screen.shouldSignalProceed(
      getBaseSignal(),
      mockChartPath,
      screenConfig,
      appConfig
    );
    expect(result.proceed).toBe(true);
    expect(result.cost).toBeCloseTo(0.00246); // 0.00105 + 0 + 0.00141
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('(Cost: $0.001050)'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Error:API failed'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('(Cost: $0.000000)'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('(Cost: $0.001410)'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('(Total Cost: $0.002460)'));
    consoleLogSpy.mockRestore();
  });

  it('should log details of each LLM response and correct consensus message (config long, proceed)', async () => {
    const screenConfig = getBaseScreenConfig();
    const appConfig = getBaseAppConfig('long');
    const llmResponses: LLMResponse[] = [
      mockLLMResponse('long', 'Looks good.', undefined, 100, 50), // 0.00105
      mockLLMResponse('long', 'Strong signal.', undefined, 110, 60), // 0.00123
      mockLLMResponse('do_nothing', 'Not sure.', undefined, 90, 40), // 0.00087
    ];
    mockLlmApiServiceInstance.getTradeDecisions.mockResolvedValue(llmResponses);
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const signalToTest = getBaseSignal();
    await screen.shouldSignalProceed(signalToTest, mockChartPath, screenConfig, appConfig);

    expect(consoleLogSpy).toHaveBeenCalledWith('   LLM 1: 🔼 — "Looks good." (Cost: $0.001050)');
    expect(consoleLogSpy).toHaveBeenCalledWith('   LLM 2: 🔼 — "Strong signal." (Cost: $0.001230)');
    expect(consoleLogSpy).toHaveBeenCalledWith('   LLM 3: ⏸️ — "Not sure." (Cost: $0.000870)');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      `  LLM consensus to GO LONG, matching configured direction. Signal proceeds. (Total Cost: $0.003150)`
    );
    consoleLogSpy.mockRestore();
  });

  it('should log details of each LLM response and correct consensus message (config short, no proceed)', async () => {
    const screenConfig = getBaseScreenConfig();
    const appConfig = getBaseAppConfig('short'); // Configured for short
    const signalToTest = getBaseSignal(); // Signal itself is long, but irrelevant here
    const llmResponses: LLMResponse[] = [
      mockLLMResponse('long', 'Looks good.', undefined, 100, 50), // 0.00105
      mockLLMResponse('long', 'Still long.', undefined, 110, 60), // 0.00123
      mockLLMResponse('do_nothing', 'Not sure.', undefined, 90, 40), // 0.00087
    ];
    mockLlmApiServiceInstance.getTradeDecisions.mockResolvedValue(llmResponses);
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await screen.shouldSignalProceed(signalToTest, mockChartPath, screenConfig, appConfig);

    expect(consoleLogSpy).toHaveBeenCalledWith('   LLM 1: 🔼 — "Looks good." (Cost: $0.001050)');
    expect(consoleLogSpy).toHaveBeenCalledWith('   LLM 2: 🔼 — "Still long." (Cost: $0.001230)');
    expect(consoleLogSpy).toHaveBeenCalledWith('   LLM 3: ⏸️ — "Not sure." (Cost: $0.000870)');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      `  LLM consensus (2 long, 0 short) does not meet threshold for configured direction 'short' for ${signalToTest.ticker} on ${signalToTest.trade_date}. Signal is filtered out. (Total Cost: $0.003150)`
    );
    consoleLogSpy.mockRestore();
  });
});
