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

const getBaseAppConfig = (): AppConfig => ({
  default: {
    ticker: 'SPY',
    timeframe: '1min',
    direction: 'long',
    patterns: { entry: 'quick-rise', exit: 'fixed-time' },
    charts: { generate: false, outputDir: './charts' },
    date: { from: '2023-01-01', to: '2023-12-31' },
  },
  patterns: {
    entry: { 'quick-rise': { 'rise-pct': 0.3, 'within-minutes': 5 } },
    exit: { 'fixed-time': { 'hold-minutes': 10 } },
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

  it('should return true if screenConfig is not enabled', async () => {
    const screenConfig = { ...getBaseScreenConfig(), enabled: false };
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await screen.shouldSignalProceed(
      getBaseSignal(),
      mockChartPath,
      screenConfig,
      getBaseAppConfig()
    );
    expect(result).toBe(true);
    expect(LlmApiService).not.toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Screen not enabled'));
    consoleLogSpy.mockRestore();
  });

  it('should return true if LlmApiService instance reports not enabled', async () => {
    mockLlmApiServiceInstance.isEnabled.mockReturnValue(false);

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await screen.shouldSignalProceed(
      getBaseSignal(),
      mockChartPath,
      getBaseScreenConfig(),
      getBaseAppConfig()
    );
    expect(result).toBe(true);
    expect(LlmApiService).toHaveBeenCalledTimes(1);
    expect(mockLlmApiServiceInstance.isEnabled).toHaveBeenCalledTimes(1);
    expect(mockLlmApiServiceInstance.getTradeDecisions).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('LLM service is not properly enabled')
    );
    consoleWarnSpy.mockRestore();
  });

  it('should return true if longVotes meet agreementThreshold', async () => {
    const screenConfig = getBaseScreenConfig();
    const llmResponses: LLMResponse[] = [
      { action: 'long' },
      { action: 'long' },
      { action: 'do_nothing' },
    ];
    mockLlmApiServiceInstance.getTradeDecisions.mockResolvedValue(llmResponses);

    const result = await screen.shouldSignalProceed(
      getBaseSignal(),
      mockChartPath,
      screenConfig,
      getBaseAppConfig()
    );
    expect(result).toBe(true);
    expect(mockLlmApiServiceInstance.getTradeDecisions).toHaveBeenCalledWith(mockChartPath);
  });

  it('should return true if shortVotes meet agreementThreshold', async () => {
    const screenConfig = getBaseScreenConfig();
    const llmResponses: LLMResponse[] = [
      { action: 'short' },
      { action: 'do_nothing' },
      { action: 'short' },
    ];
    mockLlmApiServiceInstance.getTradeDecisions.mockResolvedValue(llmResponses);

    const result = await screen.shouldSignalProceed(
      getBaseSignal(),
      mockChartPath,
      screenConfig,
      getBaseAppConfig()
    );
    expect(result).toBe(true);
  });

  it('should return false if no action meets agreementThreshold', async () => {
    const screenConfig = getBaseScreenConfig();
    const llmResponses: LLMResponse[] = [
      { action: 'long' },
      { action: 'short' },
      { action: 'do_nothing' },
    ];
    mockLlmApiServiceInstance.getTradeDecisions.mockResolvedValue(llmResponses);

    const result = await screen.shouldSignalProceed(
      getBaseSignal(),
      mockChartPath,
      screenConfig,
      getBaseAppConfig()
    );
    expect(result).toBe(false);
  });

  it('should return false if agreementThreshold is higher and not met', async () => {
    const screenConfig = { ...getBaseScreenConfig(), agreementThreshold: 3 };
    const llmResponses: LLMResponse[] = [
      { action: 'long' },
      { action: 'long' },
      { action: 'do_nothing' },
    ];
    mockLlmApiServiceInstance.getTradeDecisions.mockResolvedValue(llmResponses);

    const result = await screen.shouldSignalProceed(
      getBaseSignal(),
      mockChartPath,
      screenConfig,
      getBaseAppConfig()
    );
    expect(result).toBe(false);
  });

  it('should count errored responses as do_nothing for voting', async () => {
    const screenConfig = getBaseScreenConfig();
    const llmResponses: LLMResponse[] = [
      { action: 'long' },
      { action: 'do_nothing', error: 'API failed' },
      { action: 'long' },
    ];
    mockLlmApiServiceInstance.getTradeDecisions.mockResolvedValue(llmResponses);

    const result = await screen.shouldSignalProceed(
      getBaseSignal(),
      mockChartPath,
      screenConfig,
      getBaseAppConfig()
    );
    expect(result).toBe(true);
  });

  it('should log details of each LLM response', async () => {
    const screenConfig = getBaseScreenConfig();
    const llmResponses: LLMResponse[] = [
      { action: 'long' },
      { action: 'short', error: 'Minor issue' },
      { action: 'do_nothing' },
    ];
    mockLlmApiServiceInstance.getTradeDecisions.mockResolvedValue(llmResponses);
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const signalToTest = getBaseSignal();
    await screen.shouldSignalProceed(signalToTest, mockChartPath, screenConfig, getBaseAppConfig());

    expect(consoleLogSpy).toHaveBeenCalledWith(
      `[llm-confirmation] Requesting LLM decisions for signal: ${signalToTest.ticker} on ${signalToTest.trade_date} at ${signalToTest.price}, chart: ${mockChartPath}`
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[llm-confirmation] LLM Response 1/3: Action: long, Error: None'
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[llm-confirmation] LLM Response 2/3: Action: short, Error: Minor issue'
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[llm-confirmation] LLM Response 3/3: Action: do_nothing, Error: None'
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      `[llm-confirmation] LLM Votes for ${signalToTest.ticker} on ${signalToTest.trade_date}: Long=1, Short=1, DoNothing=1 (Threshold: ${screenConfig.agreementThreshold})`
    );
    consoleLogSpy.mockRestore();
  });
});
