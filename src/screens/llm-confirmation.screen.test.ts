/// <reference types="vitest/globals" />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// import type { Mock } from 'vitest'; // Removed to avoid generic type issues with linter
import fsPromises from 'node:fs/promises';
import crypto from 'node:crypto';

import { type LLMResponse } from '../services/llm-api.service';
import { type Config as AppConfig, loadConfig } from '../utils/config';
import { LlmConfirmationScreen, calculateAverageProposedPrices } from './llm-confirmation.screen';
import { type LLMScreenConfig, type EnrichedSignal } from './types';

// Mock fs and crypto utilities
const mockFsCopyFile = vi.fn(() => Promise.resolve());
const mockFsUnlink = vi.fn(() => Promise.resolve());
const mockRandomString = 'mockedrandomfilename';
const mockCryptoRandomBytesToString = vi.fn(() => mockRandomString);
const mockCryptoRandomBytes = vi.fn(() => ({ toString: mockCryptoRandomBytesToString }));

// Declare module-level variables that will hold FRESH spies for each test
// Types will be inferred from vi.fn() assignments in beforeEach
let mockIsEnabledFn: any; // Simplified type
let mockGetTradeDecisionsFn: any; // Simplified type
let mockConstructorFn: any; // Simplified type

vi.mock('../services/llm-api.service', () => ({
  LlmApiService: vi.fn().mockImplementation((config?: LLMScreenConfig) => {
    if (mockConstructorFn) mockConstructorFn(config);
    return {
      isEnabled: mockIsEnabledFn,
      getTradeDecisions: mockGetTradeDecisionsFn,
    };
  }),
}));

const getBaseScreenConfig = (): LLMScreenConfig => ({
  llmProvider: 'anthropic',
  modelName: 'claude-test-model',
  apiKeyEnvVar: 'TEST_ANTHROPIC_API_KEY',
  numCalls: 3,
  agreementThreshold: 2,
  temperatures: [0.2, 0.5, 0.8],
  prompts: 'Test prompt',
  commonPromptSuffixForJson: 'Respond JSON',
  maxOutputTokens: 50,
});

const _getBaseSignal = (): EnrichedSignal => ({
  ticker: 'SPY',
  trade_date: '2024-01-01',
  price: 100,
  timestamp: new Date().toISOString(),
  type: 'entry',
  direction: 'long',
});

const _mockLLMResponse = (
  action: 'long' | 'short' | 'do_nothing',
  rationalization?: string,
  error?: string,
  inputTokens = 100,
  outputTokens = 50,
  stopLoss?: number,
  profitTarget?: number
): LLMResponse => {
  const INPUT_COST_PER_MILLION_TOKENS = 3;
  const OUTPUT_COST_PER_MILLION_TOKENS = 15;
  const cost =
    (inputTokens / 1_000_000) * INPUT_COST_PER_MILLION_TOKENS +
    (outputTokens / 1_000_000) * OUTPUT_COST_PER_MILLION_TOKENS;
  return {
    action,
    rationalization,
    error,
    cost,
    stopLoss,
    profitTarget,

    rawResponse: { usage: { input_tokens: inputTokens, output_tokens: outputTokens } },
  };
};

describe('LlmConfirmationScreen', () => {
  let screen: LlmConfirmationScreen;
  const mockChartPath = 'path/to/chart.png';
  let baseAppConfig: AppConfig;

  beforeEach(async () => {
    mockConstructorFn = vi.fn();
    mockIsEnabledFn = vi.fn().mockReturnValue(true);
    mockGetTradeDecisionsFn = vi.fn().mockResolvedValue([]);

    mockFsCopyFile.mockClear();
    mockFsUnlink.mockClear();
    mockCryptoRandomBytes.mockClear();
    mockCryptoRandomBytesToString.mockClear();

    vi.spyOn(fsPromises, 'copyFile').mockImplementation(mockFsCopyFile);
    vi.spyOn(fsPromises, 'unlink').mockImplementation(mockFsUnlink);
    vi.spyOn(crypto, 'randomBytes').mockImplementation(mockCryptoRandomBytes);

    baseAppConfig = await loadConfig();
    if (!baseAppConfig.llmConfirmationScreen) {
      baseAppConfig.llmConfirmationScreen = getBaseScreenConfig();
    }
    screen = new LlmConfirmationScreen();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sanity check: should call LlmApiService constructor and isEnabled when active', async () => {
    const screenConfig = getBaseScreenConfig();
    const appConfig = {
      ...baseAppConfig,
      llmConfirmationScreen: screenConfig,
    };
    await screen.shouldSignalProceed(_getBaseSignal(), mockChartPath, screenConfig, appConfig);
    expect(mockConstructorFn).toHaveBeenCalled();
    expect(mockIsEnabledFn).toHaveBeenCalled();
  });
});

describe('calculateAverageProposedPrices', () => {
  it('should correctly average valid stopLoss and profitTarget for consensus action', () => {
    const responses: LLMResponse[] = [
      _mockLLMResponse('long', 'r1', undefined, 10, 5, 100, 110),
      _mockLLMResponse('long', 'r2', undefined, 10, 5, 98, 112),
      _mockLLMResponse('short', 'r3', undefined, 10, 5, 90, 120),
      _mockLLMResponse('long', 'r4', undefined, 10, 5, undefined, 114),
      _mockLLMResponse('long', 'r5', undefined, 10, 5, 102, undefined),
      _mockLLMResponse('long', 'r6', undefined, 10, 5, 101, 111),
    ];
    const result = calculateAverageProposedPrices(responses, 'long');
    expect(result.averagedProposedStopLoss).toBeCloseTo((100 + 98 + 102 + 101) / 4);
    expect(result.averagedProposedProfitTarget).toBeCloseTo((110 + 112 + 114 + 111) / 4);
  });

  it('should return undefined for averages if no valid data for consensus action', () => {
    const responses: LLMResponse[] = [
      _mockLLMResponse('short', 'r1', undefined, 10, 5, 90, 120),
      _mockLLMResponse('long', 'r2', undefined, 10, 5, undefined, undefined),
    ];
    const result = calculateAverageProposedPrices(responses, 'long');
    expect(result.averagedProposedStopLoss).toBeUndefined();
    expect(result.averagedProposedProfitTarget).toBeUndefined();
  });
});
