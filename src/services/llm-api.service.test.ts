/// <reference types="vitest/globals" />
import fs from 'node:fs/promises';

import ActualSDKAnthropic from '@anthropic-ai/sdk';
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

import { type LLMScreenConfig } from '../screens/types';

import { LlmApiService as ActualLlmApiService /*, type LLMResponse */ } from './llm-api.service'; // Commented out unused LLMResponse import

// Mock dependencies
vi.mock('node:fs/promises');
vi.mock('@anthropic-ai/sdk');
vi.mock('dotenv', () => ({
  default: {
    config: vi.fn(),
  },
  config: vi.fn(),
}));

// No longer needed: const Anthropic = ActualSDKAnthropic as any;

const MOCK_API_KEY = 'test-api-key';

const getBaseConfig = (): LLMScreenConfig => ({
  llmProvider: 'anthropic',
  modelName: 'claude-test-model',
  apiKeyEnvVar: 'TEST_ANTHROPIC_API_KEY',
  numCalls: 3,
  agreementThreshold: 2,
  temperatures: [0.2, 0.5, 0.8],
  prompts: 'Test prompt: {action}?',
  commonPromptSuffixForJson: ' Respond JSON: {\"action\": \"<action>\"}',
  maxOutputTokens: 50,
  timeoutMs: 10000,
});

describe('LlmApiService', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.TEST_ANTHROPIC_API_KEY = MOCK_API_KEY;
    vi.clearAllMocks();
    // Clear the mock constructor itself if it's been called/configured
    (ActualSDKAnthropic as unknown as Mock).mockClear();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Constructor and isEnabled', () => {
    it('should initialize Anthropic client if API key is provided', () => {
      const config = getBaseConfig();
      new ActualLlmApiService(config);
      const service = new ActualLlmApiService(config);
      expect(ActualSDKAnthropic).toHaveBeenCalledWith({ apiKey: MOCK_API_KEY });
      expect(service.isEnabled()).toBe(true);
    });

    it('should not initialize Anthropic client and not be enabled if API key is missing', () => {
      delete process.env.TEST_ANTHROPIC_API_KEY;
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const config = getBaseConfig();
      const service = new ActualLlmApiService(config);
      expect(ActualSDKAnthropic).not.toHaveBeenCalled();
      expect(service.isEnabled()).toBe(false);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        `LLM API Key not found in environment variable TEST_ANTHROPIC_API_KEY. The LLM API service will not be able to make calls.`
      );
      consoleWarnSpy.mockRestore();
    });

    it('should be enabled when API key exists (enabled field removed)', () => {
      process.env.TEST_ANTHROPIC_API_KEY = MOCK_API_KEY;
      const config = { ...getBaseConfig() };
      const service = new ActualLlmApiService(config);
      expect(service.isEnabled()).toBe(true);
    });
  });

  describe('getChartImageBase64', () => {
    it('should read file and return base64 string', async () => {
      const mockBuffer = Buffer.from('test image data');
      (fs.readFile as any).mockResolvedValue(mockBuffer);
      const service = new ActualLlmApiService(getBaseConfig());
      // @ts-expect-error - testing private method
      const base64 = await service.getChartImageBase64('path/to/chart.png');
      expect(fs.readFile).toHaveBeenCalledWith('path/to/chart.png');
      expect(base64).toBe(mockBuffer.toString('base64'));
    });

    it('should throw error if file reading fails', async () => {
      (fs.readFile as any).mockRejectedValue(new Error('File read error'));
      const service = new ActualLlmApiService(getBaseConfig());
      await expect(
        // @ts-expect-error - testing private method
        service.getChartImageBase64('path/to/chart.png')
      ).rejects.toThrow('Failed to read chart image: path/to/chart.png');
    });
  });

  describe('getTradeDecisions', () => {
    const mockChartPath = 'path/to/chart.png';
    const mockImageBase64 = 'base64imagedata';
    let mockAnthropicInstance: { messages: { create: Mock } };
    let mockAnthropicMessagesCreate: Mock;

    beforeEach(() => {
      if (!ActualLlmApiService.prototype) {
        throw new Error('LlmApiService.prototype is undefined');
      }
      vi.spyOn(ActualLlmApiService.prototype as any, 'getChartImageBase64').mockResolvedValue(
        mockImageBase64
      );

      mockAnthropicMessagesCreate = vi.fn();
      mockAnthropicInstance = {
        messages: { create: mockAnthropicMessagesCreate },
      };
      // Mock the constructor to return our instance
      (ActualSDKAnthropic as unknown as Mock).mockImplementation(() => mockAnthropicInstance);
      vi.spyOn(console, 'warn').mockImplementation(() => {}); // Suppress console.warn
      vi.spyOn(console, 'error').mockImplementation(() => {}); // Suppress console.error
      vi.spyOn(console, 'log').mockImplementation(() => {}); // Suppress console.log for DEBUG messages
    });

    afterEach(() => {
      vi.restoreAllMocks(); // Restore all spied-on console methods
    });

    it('should return do_nothing responses if no API key is provided', async () => {
      delete process.env.TEST_ANTHROPIC_API_KEY;
      const config = { ...getBaseConfig() };
      const service = new ActualLlmApiService(config);
      const responses = await service.getTradeDecisions(mockChartPath);
      expect(responses).toEqual([
        { action: 'do_nothing', error: 'Service not enabled or not configured.', cost: 0 },
        { action: 'do_nothing', error: 'Service not enabled or not configured.', cost: 0 },
        { action: 'do_nothing', error: 'Service not enabled or not configured.', cost: 0 },
      ]);
    });

    it('should make parallel API calls and parse valid JSON responses', async () => {
      const config = getBaseConfig();
      const service = new ActualLlmApiService(config);
      const mockAnthropicCreate = vi.fn();
      service['anthropic'] = { messages: { create: mockAnthropicCreate } } as any;

      mockAnthropicCreate
        .mockResolvedValueOnce({
          content: [{ text: '{"action": "long"}' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        })
        .mockResolvedValueOnce({
          content: [{ text: '{"action": "short"}' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        })
        .mockResolvedValueOnce({
          content: [{ text: '{"action": "do_nothing"}' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        });

      const responses = await service.getTradeDecisions(mockChartPath);
      const expectedCost = (10 / 1_000_000) * 3 + (5 / 1_000_000) * 15;
      expect(responses).toEqual([
        {
          action: 'long',
          rationalization: undefined,
          cost: expectedCost,
          debugRawText: '{"action": "long"}',
          rawResponse: {
            content: [{ text: '{"action": "long"}' }],
            usage: { input_tokens: 10, output_tokens: 5 },
          },
        },
        {
          action: 'short',
          rationalization: undefined,
          cost: expectedCost,
          debugRawText: '{"action": "short"}',
          rawResponse: {
            content: [{ text: '{"action": "short"}' }],
            usage: { input_tokens: 10, output_tokens: 5 },
          },
        },
        {
          action: 'do_nothing',
          rationalization: undefined,

          cost: expectedCost,
          debugRawText: '{"action": "do_nothing"}',
          rawResponse: {
            content: [{ text: '{"action": "do_nothing"}' }],
            usage: { input_tokens: 10, output_tokens: 5 },
          },
        },
      ]);
      expect(mockAnthropicCreate).toHaveBeenCalledTimes(3);
    });

    it('should handle API call errors gracefully for individual calls', async () => {
      const config = getBaseConfig();
      const service = new ActualLlmApiService(config);
      const mockAnthropicCreate = vi.fn();
      service['anthropic'] = { messages: { create: mockAnthropicCreate } } as any;

      const expectedCostCall1 = (10 / 1_000_000) * 3 + (5 / 1_000_000) * 15;

      mockAnthropicCreate
        .mockResolvedValueOnce({
          content: [{ text: '{"action": "long"}' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        })
        .mockRejectedValueOnce(new Error('API Error for call 2'))
        .mockResolvedValueOnce({
          content: [{ text: '{"action": "short"}' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        });

      const responses = await service.getTradeDecisions(mockChartPath);
      expect(responses).toEqual([
        {
          action: 'long',
          rationalization: undefined,
          cost: expectedCostCall1,
          debugRawText: '{"action": "long"}',
          rawResponse: {
            content: [{ text: '{"action": "long"}' }],
            usage: { input_tokens: 10, output_tokens: 5 },
          },
        },
        {
          action: 'do_nothing',
          error: 'API Error for call 2',
          cost: 0,
          debugRawText: 'API Call Failed: API Error for call 2',
          rawResponse: expect.any(Error),
        },
        {
          action: 'short',
          rationalization: undefined,
          cost: expectedCostCall1, // Same cost as call 1 for this example
          debugRawText: '{"action": "short"}',
          rawResponse: {
            content: [{ text: '{"action": "short"}' }],
            usage: { input_tokens: 10, output_tokens: 5 },
          },
        },
      ]);
    });

    it('should handle invalid JSON responses gracefully', async () => {
      const config = getBaseConfig();
      const service = new ActualLlmApiService(config);
      const mockAnthropicCreate = vi.fn();
      service['anthropic'] = { messages: { create: mockAnthropicCreate } } as any;

      const invalidJsonResponse = {
        content: [{ text: 'invalid json' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      };
      mockAnthropicCreate.mockResolvedValue(invalidJsonResponse);

      const responses = await service.getTradeDecisions(mockChartPath);
      const expectedCost = (10 / 1_000_000) * 3 + (5 / 1_000_000) * 15;

      expect(responses[0].action).toBe('do_nothing');
      expect(responses[0].error).toBeUndefined();
      expect(responses[0].debugRawText).toBe('invalid json');
      expect(responses[0].rationalization).toBeUndefined();
      expect(responses[0].rawResponse).toEqual(invalidJsonResponse);
      expect(responses[0].cost).toBe(expectedCost);
    });

    it('should handle valid JSON but invalid action gracefully', async () => {
      const config = getBaseConfig();
      const service = new ActualLlmApiService(config);
      const mockAnthropicCreate = vi.fn();
      service['anthropic'] = { messages: { create: mockAnthropicCreate } } as any;

      const invalidActionJsonResponse = {
        content: [{ text: '{"action": "unknown_action"}' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      };
      mockAnthropicCreate.mockResolvedValue(invalidActionJsonResponse);
      const responses = await service.getTradeDecisions(mockChartPath);
      const expectedCost = (10 / 1_000_000) * 3 + (5 / 1_000_000) * 15;

      expect(responses[0].action).toBe('do_nothing');
      expect(responses[0].error).toBeUndefined();
      expect(responses[0].debugRawText).toBe('{"action": "unknown_action"}');
      expect(responses[0].rationalization).toBeUndefined();
      expect(responses[0].rawResponse).toEqual(invalidActionJsonResponse);
      expect(responses[0].cost).toBe(expectedCost);
    });

    it('should use array of prompts if provided and lengths match numCalls', async () => {
      const promptsArray = ['Prompt 1', 'Prompt 2', 'Prompt 3'];
      const config = { ...getBaseConfig(), prompts: promptsArray };
      mockAnthropicMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{"action": "long"}' }],
      });
      const service = new ActualLlmApiService(config);
      await service.getTradeDecisions(mockChartPath);
      promptsArray.forEach((prompt, i) => {
        expect(mockAnthropicMessagesCreate).toHaveBeenNthCalledWith(
          i + 1,
          expect.objectContaining({
            messages: expect.arrayContaining([
              expect.objectContaining({
                content: expect.arrayContaining([
                  expect.objectContaining({ text: `${prompt}${config.commonPromptSuffixForJson}` }),
                ]),
              }),
            ]),
          })
        );
      });
    });

    it('should use first prompt for all calls if prompts array length mismatches numCalls', async () => {
      const promptsArray = ['Prompt 1', 'Prompt 2'];
      const consoleWarnSpy = vi.spyOn(console, 'warn'); // Already mocked in beforeEach, just re-spy for this test's specific check
      const config = { ...getBaseConfig(), prompts: promptsArray, numCalls: 3 };
      mockAnthropicMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{"action": "long"}' }],
      });
      const service = new ActualLlmApiService(config);
      await service.getTradeDecisions(mockChartPath);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Number of prompts does not match numCalls. Using the first prompt for all calls.'
      );
      for (let i = 0; i < config.numCalls; i++) {
        expect(mockAnthropicMessagesCreate).toHaveBeenNthCalledWith(
          i + 1,
          expect.objectContaining({
            messages: expect.arrayContaining([
              expect.objectContaining({
                content: expect.arrayContaining([
                  expect.objectContaining({
                    text: `${promptsArray[0]}${config.commonPromptSuffixForJson}`,
                  }),
                ]),
              }),
            ]),
          })
        );
      }
    });
  });
});
