import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LlmApiService } from './llm-api.service';

// Mock Anthropic
const mockAnthropicCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: mockAnthropicCreate,
    },
  })),
}));

// Mock fs for image reading
vi.mock('fs', () => ({
  readFileSync: vi.fn(() => Buffer.from('fake-image-data')),
}));

describe('LlmApiService Market Metrics Integration', () => {
  let llmService: LlmApiService;
  let mockConfig: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = {
      llmProvider: 'anthropic',
      modelName: 'claude-sonnet-4-20250514',
      apiKeyEnvVar: 'ANTHROPIC_API_KEY',
      numCalls: 2,
      temperatures: [0.1, 1.0],
      prompts: ['You are a conservative trader.', 'You are an aggressive trader.'],
      commonPromptSuffixForJson: 'Respond in JSON format.',
      maxOutputTokens: 250,
    };

    // Mock successful LLM response
    mockAnthropicCreate.mockResolvedValue({
      content: [{ text: '{"action": "long", "rationalization": "Test reason"}' }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    // Mock environment variable
    process.env.ANTHROPIC_API_KEY = 'test-api-key';

    llmService = new LlmApiService(mockConfig);
  });

  describe('Market Metrics in Prompts', () => {
    it('should include market metrics in LLM prompts when provided', async () => {
      const chartPath = '/path/to/chart.png';
      const marketMetrics = `Prev Close: $100.50 | Today Open: $101.00 | GAP UP: +$0.50 (+0.50%)
Today H/L: $102.00/$100.75 | Current: $101.50 @ 10:30 AM
Current price of $101.50 is $0.25 ABOVE VWAP of $101.25.
Current price of $101.50 is $0.75 ABOVE SMA of $100.75.
VWAP of $101.25 is $0.50 ABOVE SMA of $100.75.`;

      await llmService.getTradeDecisions(chartPath, marketMetrics);

      // Verify that both prompts include the market metrics
      expect(mockAnthropicCreate).toHaveBeenCalledTimes(2);

      // Check first call (text-only since no image)
      const firstCall = mockAnthropicCreate.mock.calls[0][0];
      const firstPromptText = firstCall.messages[0].content[0].text;
      expect(firstPromptText).toContain('Market Context:');
      expect(firstPromptText).toContain('Prev Close: $100.50');
      expect(firstPromptText).toContain('GAP UP: +$0.50');
      expect(firstPromptText).toContain('Current price of $101.50 is $0.25 ABOVE VWAP');
      expect(firstPromptText).toContain('Current price of $101.50 is $0.75 ABOVE SMA');
      expect(firstPromptText).toContain('VWAP of $101.25 is $0.50 ABOVE SMA');
      expect(firstPromptText).toContain('You are a conservative trader.');
      expect(firstPromptText).toContain('Respond in JSON format.');

      // Check second call
      const secondCall = mockAnthropicCreate.mock.calls[1][0];
      const secondPromptText = secondCall.messages[0].content[0].text;
      expect(secondPromptText).toContain('Market Context:');
      expect(secondPromptText).toContain('You are an aggressive trader.');
      expect(secondPromptText).toContain('Respond in JSON format.');
    });

    it('should not include market context section when no market metrics provided', async () => {
      const chartPath = '/path/to/chart.png';

      await llmService.getTradeDecisions(chartPath);

      expect(mockAnthropicCreate).toHaveBeenCalledTimes(2);

      // Check that no market context is included
      const firstCall = mockAnthropicCreate.mock.calls[0][0];
      const promptText = firstCall.messages[0].content[0].text;
      expect(promptText).not.toContain('Market Context:');
      expect(promptText).toContain('You are a conservative trader.');
      expect(promptText).toContain('Respond in JSON format.');
    });

    it('should not include market context section when empty market metrics provided', async () => {
      const chartPath = '/path/to/chart.png';
      const marketMetrics = '';

      await llmService.getTradeDecisions(chartPath, marketMetrics);

      expect(mockAnthropicCreate).toHaveBeenCalledTimes(2);

      // Check that no market context is included for empty string
      const firstCall = mockAnthropicCreate.mock.calls[0][0];
      const promptText = firstCall.messages[0].content[0].text;
      expect(promptText).not.toContain('Market Context:');
    });

    it('should properly format market context section in prompt', async () => {
      const chartPath = '/path/to/chart.png';
      const marketMetrics = 'Line 1\nLine 2\nLine 3';

      await llmService.getTradeDecisions(chartPath, marketMetrics);

      const firstCall = mockAnthropicCreate.mock.calls[0][0];
      const promptText = firstCall.messages[0].content[0].text;

      // Should have proper formatting with newlines and header
      expect(promptText).toContain('\n\nMarket Context:\nLine 1\nLine 2\nLine 3\n');

      // Should be positioned between the main prompt and suffix
      const lines = promptText.split('\n');
      const marketContextIndex = lines.findIndex((line: string) => line === 'Market Context:');
      const jsonSuffixIndex = lines.findIndex((line: string) =>
        line.includes('Respond in JSON format')
      );

      expect(marketContextIndex).toBeGreaterThan(0);
      expect(jsonSuffixIndex).toBeGreaterThan(marketContextIndex);
    });
  });

  describe('Debug Output', () => {
    let consoleSpy: any;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should output debug prompts when debug is enabled', async () => {
      const chartPath = '/path/to/chart.png';
      const marketMetrics = 'Test market metrics';
      const debug = true;

      await llmService.getTradeDecisions(chartPath, marketMetrics, debug);

      // Should have debug output for both prompts
      expect(consoleSpy).toHaveBeenCalledWith('\n[DEBUG] LLM Prompt 1:');
      expect(consoleSpy).toHaveBeenCalledWith('='.repeat(80));
      expect(consoleSpy).toHaveBeenCalledWith('\n[DEBUG] LLM Prompt 2:');

      // Should show the full prompt including market metrics
      const debugCalls = consoleSpy.mock.calls;
      const promptOutputs = debugCalls.filter(
        (call: any) => call[0] && typeof call[0] === 'string' && call[0].includes('Market Context:')
      );
      expect(promptOutputs.length).toBe(2); // One for each prompt
    });

    it('should not output debug prompts when debug is disabled', async () => {
      const chartPath = '/path/to/chart.png';
      const marketMetrics = 'Test market metrics';
      const debug = false;

      await llmService.getTradeDecisions(chartPath, marketMetrics, debug);

      expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('[DEBUG] LLM Prompt'));
    });

    it('should not output debug prompts when debug is undefined', async () => {
      const chartPath = '/path/to/chart.png';
      const marketMetrics = 'Test market metrics';

      await llmService.getTradeDecisions(chartPath, marketMetrics);

      expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('[DEBUG] LLM Prompt'));
    });
  });

  describe('Error Handling', () => {
    it('should handle LLM API errors gracefully while preserving market metrics', async () => {
      mockAnthropicCreate.mockRejectedValueOnce(new Error('API Error'));

      const chartPath = '/path/to/chart.png';
      const marketMetrics = 'Test market metrics';

      const results = await llmService.getTradeDecisions(chartPath, marketMetrics);

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        action: 'do_nothing',
        error: expect.stringContaining('API Error'),
        cost: 0,
      });

      // Second call should still succeed
      expect(results[1]).toMatchObject({
        action: 'long',
        cost: expect.any(Number),
      });
    });

    it('should work when service is not enabled', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      const disabledService = new LlmApiService(mockConfig);

      const chartPath = '/path/to/chart.png';
      const marketMetrics = 'Test market metrics';

      const results = await disabledService.getTradeDecisions(chartPath, marketMetrics);

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        action: 'do_nothing',
        error: 'Service not enabled or not configured.',
        cost: 0,
      });
    });
  });

  describe('Prompt Structure', () => {
    it('should maintain correct prompt structure with market metrics', async () => {
      const chartPath = '/path/to/chart.png';
      const marketMetrics = 'Market data here';

      await llmService.getTradeDecisions(chartPath, marketMetrics);

      const firstCall = mockAnthropicCreate.mock.calls[0][0];
      const promptText = firstCall.messages[0].content[0].text;

      // Should have: main prompt + market context + suffix
      expect(promptText).toMatch(
        /You are a conservative trader\.\s*\n\nMarket Context:\nMarket data here\n\s*Respond in JSON format\./
      );
    });

    it('should handle multi-line market metrics correctly', async () => {
      const chartPath = '/path/to/chart.png';
      const marketMetrics = `Line 1: Previous close data
Line 2: Current price data
Line 3: VWAP analysis
Line 4: SMA analysis`;

      await llmService.getTradeDecisions(chartPath, marketMetrics);

      const firstCall = mockAnthropicCreate.mock.calls[0][0];
      const promptText = firstCall.messages[0].content[0].text;

      expect(promptText).toContain('Line 1: Previous close data');
      expect(promptText).toContain('Line 2: Current price data');
      expect(promptText).toContain('Line 3: VWAP analysis');
      expect(promptText).toContain('Line 4: SMA analysis');
    });
  });
});
