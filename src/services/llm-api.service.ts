import fs from 'node:fs/promises';

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

import { type LLMScreenConfig } from '../screens/types'; // Assuming path to LLMScreenConfig

// Note: dotenv.config() is called by the main application (scout.ts) before using this service

export interface LLMResponse {
  action: 'long' | 'short' | 'do_nothing';
  rationalization?: string;
  stopLoss?: number;
  profitTarget?: number;

  debugRawText?: string; // Added for debugging raw LLM output
  rawResponse?: any;
  error?: string;
  cost?: number;
}

export class LlmApiService {
  private anthropic: Anthropic | null = null;
  private openai: OpenAI | null = null;
  private config: LLMScreenConfig;
  private apiKey: string | undefined;

  // Pricing per million tokens - will be set based on provider
  private INPUT_COST_PER_MILLION_TOKENS = 3;
  private OUTPUT_COST_PER_MILLION_TOKENS = 15;

  constructor(config: LLMScreenConfig) {
    this.config = { ...config };

    // Hardcode flagship models and API keys based on provider
    if (this.config.llmProvider === 'anthropic') {
      this.config.modelName = 'claude-sonnet-4-20250514';
      this.config.apiKeyEnvVar = 'ANTHROPIC_API_KEY';
    } else if (this.config.llmProvider === 'openai') {
      this.config.modelName = 'gpt-5-mini';
      this.config.apiKeyEnvVar = 'OPENAI_API_KEY';
    }

    this.apiKey = process.env[this.config.apiKeyEnvVar];

    if (!this.apiKey) {
      console.warn(
        `LLM API Key not found in environment variable ${this.config.apiKeyEnvVar}. The LLM API service will not be able to make calls.`
      );
    } else if (this.config.llmProvider === 'anthropic') {
      // Claude pricing (per million tokens)
      this.INPUT_COST_PER_MILLION_TOKENS = 3;
      this.OUTPUT_COST_PER_MILLION_TOKENS = 15;
      this.anthropic = new Anthropic({
        apiKey: this.apiKey,
      });
    } else if (this.config.llmProvider === 'openai') {
      // GPT-5 pricing (estimated)
      this.INPUT_COST_PER_MILLION_TOKENS = 5;
      this.OUTPUT_COST_PER_MILLION_TOKENS = 20;
      this.openai = new OpenAI({
        apiKey: this.apiKey,
      });
    }
  }

  public isEnabled(): boolean {
    return !!this.apiKey;
  }

  private async getChartImageBase64(chartPath: string): Promise<string> {
    try {
      const imageBuffer = await fs.readFile(chartPath);
      return imageBuffer.toString('base64');
    } catch (error) {
      console.error(`Error reading chart image at ${chartPath}:`, error);
      // Check if the error is an object and has a 'code' property
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        console.warn(
          `Chart image not found at ${chartPath}. Proceeding without image for LLM call.`
        );
        return ''; // Return empty string if file not found, LlmApiService will handle it
      }
      throw new Error(`Failed to read chart image: ${chartPath}`);
    }
  }

  public async getTradeDecisions(
    chartPath: string,
    marketMetrics?: string,
    debug?: boolean
  ): Promise<LLMResponse[]> {
    if (!this.isEnabled() || (!this.anthropic && !this.openai)) {
      console.warn('LLM API service is not enabled or not configured correctly.');
      return Array.from({ length: this.config.numCalls || 1 }, () => ({
        action: 'do_nothing',
        error: 'Service not enabled or not configured.',
        cost: 0, // Ensure cost is present even for error cases
      }));
    }

    const imageBase64 = await this.getChartImageBase64(chartPath);
    const mediaType = chartPath.endsWith('.png')
      ? 'image/png'
      : chartPath.endsWith('.jpeg') || chartPath.endsWith('.jpg')
        ? 'image/jpeg'
        : 'application/octet-stream';

    const numCalls = this.config.numCalls || 1;
    const promptsToUse: string[] = [];
    if (Array.isArray(this.config.prompts)) {
      if (this.config.prompts.length !== numCalls) {
        console.warn(
          'Number of prompts does not match numCalls. Using the first prompt for all calls.'
        );
        const firstPrompt = this.config.prompts[0] || 'Analyze this chart for a trade.';
        for (let i = 0; i < numCalls; i++) promptsToUse.push(firstPrompt);
      } else {
        promptsToUse.push(...this.config.prompts);
      }
    } else {
      for (let i = 0; i < numCalls; i++) promptsToUse.push(this.config.prompts);
    }
    const apiCalls: Promise<LLMResponse>[] = [];

    for (let i = 0; i < numCalls; i++) {
      const currentPrompt = promptsToUse[i];
      const metricsAddendum = marketMetrics ? `\n\nMarket Context:\n${marketMetrics}\n` : '';
      const fullPrompt = `${currentPrompt}${metricsAddendum}${this.config.commonPromptSuffixForJson || ''}`;
      const temperature = this.config.temperatures?.[i] || this.config.temperatures?.[0] || 0.5;

      // Debug: Output the full prompt if debug is enabled
      if (debug) {
        console.log(`\n[DEBUG] LLM Prompt ${i + 1}:`);
        console.log('='.repeat(80));
        console.log(fullPrompt);
        console.log('='.repeat(80));
      }

      const call = async (): Promise<LLMResponse> => {
        try {
          if (this.config.llmProvider === 'anthropic') {
            return await this.callAnthropic(fullPrompt, temperature, imageBase64, mediaType);
          } else if (this.config.llmProvider === 'openai') {
            return await this.callOpenAI(fullPrompt, temperature, imageBase64, mediaType);
          } else {
            throw new Error(`Unsupported LLM provider: ${this.config.llmProvider}`);
          }
        } catch (error: any) {
          console.error(
            `Error in LLM API call ${i + 1} to ${this.config.modelName}:`,
            error.message
          );
          if (error.response && error.response.data) {
            console.error(
              '[LlmApiService] Error response data:',
              JSON.stringify(error.response.data, null, 2)
            );
          }
          return {
            action: 'do_nothing',
            error: error.message || 'Unknown API error',
            cost: 0, // Cost is 0 for failed calls
            debugRawText: `API Call Failed: ${error.message}`,
            rawResponse: error.response?.data || error,
          };
        }
      };
      apiCalls.push(call());
    }

    return Promise.all(apiCalls);
  }

  private async callAnthropic(
    fullPrompt: string,
    temperature: number,
    imageBase64?: string,
    mediaType?: string
  ): Promise<LLMResponse> {
    const messagesContent: Anthropic.MessageParam['content'] = [];

    if (imageBase64 && mediaType !== 'application/octet-stream') {
      messagesContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          data: imageBase64,
        },
      });
    } else if (!imageBase64) {
      console.warn('No image data provided for LLM call. Prompting with text only.');
    }

    messagesContent.push({
      type: 'text',
      text: fullPrompt,
    });

    const response: Anthropic.Messages.Message = await this.anthropic!.messages.create({
      model: this.config.modelName,
      max_tokens: this.config.maxOutputTokens,
      temperature: temperature,
      ...(this.config.systemPrompt && { system: this.config.systemPrompt }),
      messages: [
        {
          role: 'user',
          content: messagesContent,
        },
      ],
    });

    let callCost = 0;
    if (response.usage) {
      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;
      callCost =
        (inputTokens / 1_000_000) * this.INPUT_COST_PER_MILLION_TOKENS +
        (outputTokens / 1_000_000) * this.OUTPUT_COST_PER_MILLION_TOKENS;
    }

    const messageTextContent =
      response.content &&
      Array.isArray(response.content) &&
      response.content[0] &&
      'text' in response.content[0]
        ? response.content[0].text
        : '';

    return this.parseResponse(messageTextContent, response, callCost);
  }

  private async callOpenAI(
    fullPrompt: string,
    temperature: number,
    imageBase64?: string,
    mediaType?: string
  ): Promise<LLMResponse> {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

    if (this.config.systemPrompt) {
      messages.push({
        role: 'system',
        content: this.config.systemPrompt,
      });
    }

    if (imageBase64 && mediaType !== 'application/octet-stream') {
      messages.push({
        role: 'user',
        content: [
          {
            type: 'text',
            text: fullPrompt,
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mediaType};base64,${imageBase64}`,
            },
          },
        ],
      });
    } else {
      if (!imageBase64) {
        console.warn('No image data provided for LLM call. Prompting with text only.');
      }
      messages.push({
        role: 'user',
        content: fullPrompt,
      });
    }

    // Configure API parameters based on model capabilities
    const apiParams: any = {
      model: this.config.modelName,
      messages: messages,
    };

    // GPT-5 specific configurations
    if (this.config.modelName === 'gpt-5-mini') {
      // GPT-5-mini only supports temperature = 1 (despite general API docs saying 0-2)
      apiParams.max_completion_tokens = this.config.maxOutputTokens;
      // Don't set temperature - GPT-5-mini only supports default (1)
      apiParams.reasoning_effort = 'medium';
      apiParams.verbosity = 'low';
      apiParams.response_format = { type: 'json_object' };
    } else {
      // Other OpenAI models use max_tokens and support custom temperature
      apiParams.max_tokens = this.config.maxOutputTokens;
      apiParams.temperature = temperature;
      apiParams.response_format = { type: 'json_object' };
    }

    let response;
    try {
      response = await this.openai!.chat.completions.create(apiParams);
    } catch (apiError: any) {
      console.error(`[DEBUG GPT-5] API Error:`, apiError.message);
      if (apiError.response?.data) {
        console.error(
          `[DEBUG GPT-5] API Error Details:`,
          JSON.stringify(apiError.response.data, null, 2)
        );
      }
      throw apiError;
    }

    let callCost = 0;
    if (response.usage) {
      const inputTokens = response.usage.prompt_tokens;
      const outputTokens = response.usage.completion_tokens;
      callCost =
        (inputTokens / 1_000_000) * this.INPUT_COST_PER_MILLION_TOKENS +
        (outputTokens / 1_000_000) * this.OUTPUT_COST_PER_MILLION_TOKENS;
    }

    const messageTextContent = response.choices[0]?.message?.content || '';

    return this.parseResponse(messageTextContent, response, callCost);
  }

  private parseResponse(
    messageTextContent: string,
    rawResponse: any,
    callCost: number
  ): LLMResponse {
    let parsedAction: 'long' | 'short' | 'do_nothing' = 'do_nothing';
    let parsedRationalization: string | undefined = undefined;
    let parsedStopLoss: number | undefined = undefined;
    let parsedProfitTarget: number | undefined = undefined;

    try {
      // Try to extract JSON from markdown formatting if present
      let jsonText = messageTextContent;

      // Remove markdown code blocks if present
      const codeBlockMatch = messageTextContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1].trim();
      }

      // Remove leading/trailing backticks if present
      jsonText = jsonText.replace(/^`+|`+$/g, '');

      const parsedJson = JSON.parse(jsonText);
      if (
        typeof parsedJson.action === 'string' &&
        ['long', 'short', 'do_nothing'].includes(parsedJson.action)
      ) {
        parsedAction = parsedJson.action as 'long' | 'short' | 'do_nothing';
      }
      if (typeof parsedJson.rationalization === 'string') {
        parsedRationalization = parsedJson.rationalization;
      }
      if (
        typeof parsedJson.proposedStopLoss === 'string' ||
        typeof parsedJson.proposedStopLoss === 'number'
      ) {
        const sl = parseFloat(parsedJson.proposedStopLoss);
        if (!isNaN(sl)) {
          parsedStopLoss = sl;
        }
      }
      if (
        typeof parsedJson.proposedProfitTarget === 'string' ||
        typeof parsedJson.proposedProfitTarget === 'number'
      ) {
        const pt = parseFloat(parsedJson.proposedProfitTarget);
        if (!isNaN(pt)) {
          parsedProfitTarget = pt;
        }
      }
    } catch (parseError: any) {
      console.warn(
        `[DEBUG LlmApiService] JSON.parse failed for raw text. Error: ${parseError.message}`
      );
    }

    return {
      action: parsedAction,
      rationalization: parsedRationalization,
      stopLoss: parsedStopLoss,
      profitTarget: parsedProfitTarget,
      cost: callCost,
      debugRawText: messageTextContent,
      rawResponse: rawResponse,
    };
  }
}
