import fs from 'node:fs/promises';
import path from 'node:path';

import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

import { type LLMScreenConfig } from '../screens/types'; // Assuming path to LLMScreenConfig

// Initialize dotenv to load .env files (e.g., .env.local)
// This will load variables into process.env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config(); // Load .env as a fallback if .env.local is not found or for general vars

export interface LLMResponse {
  action: 'long' | 'short' | 'do_nothing';
  rationalization?: string;
  debugRawText?: string; // Added for debugging raw LLM output
  rawResponse?: any;
  error?: string;
  cost?: number;
}

export class LlmApiService {
  private anthropic: Anthropic | null = null;
  private config: LLMScreenConfig;
  private apiKey: string | undefined;

  constructor(config: LLMScreenConfig) {
    this.config = config;
    this.apiKey = process.env[this.config.apiKeyEnvVar];

    if (!this.apiKey) {
      console.warn(
        `LLM API Key not found in environment variable ${this.config.apiKeyEnvVar}. The LLM API service will not be able to make calls.`
      );
    } else if (this.config.llmProvider === 'anthropic') {
      this.anthropic = new Anthropic({
        apiKey: this.apiKey,
      });
    }
  }

  public isEnabled(): boolean {
    return this.config.enabled && !!this.apiKey;
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

  public async getTradeDecisions(chartPath: string): Promise<LLMResponse[]> {
    if (!this.isEnabled() || !this.anthropic) {
      console.warn('LLM API service is not enabled or not configured correctly.');
      return Array.from({ length: this.config.numCalls }, () => ({
        action: 'do_nothing',
        error: 'Service not enabled or not configured.',
      }));
    }

    const imageBase64 = await this.getChartImageBase64(chartPath);
    const mediaType = chartPath.endsWith('.png')
      ? 'image/png'
      : chartPath.endsWith('.jpeg') || chartPath.endsWith('.jpg')
        ? 'image/jpeg'
        : 'application/octet-stream';

    const promptsToUse: string[] = [];
    if (Array.isArray(this.config.prompts)) {
      if (this.config.prompts.length !== this.config.numCalls) {
        console.warn(
          'Number of prompts does not match numCalls. Using the first prompt for all calls.'
        );
        const firstPrompt = this.config.prompts[0] || 'Analyze this chart for a trade.';
        for (let i = 0; i < this.config.numCalls; i++) promptsToUse.push(firstPrompt);
      } else {
        promptsToUse.push(...this.config.prompts);
      }
    } else {
      for (let i = 0; i < this.config.numCalls; i++) promptsToUse.push(this.config.prompts);
    }

    const apiCalls: Promise<LLMResponse>[] = [];

    for (let i = 0; i < this.config.numCalls; i++) {
      const currentPrompt = promptsToUse[i];
      const fullPrompt = `${currentPrompt}${this.config.commonPromptSuffixForJson || ''}`;
      const temperature = this.config.temperatures[i] || this.config.temperatures[0] || 0.5;

      const call = async (): Promise<LLMResponse> => {
        try {
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

          const systemPromptContent = this.config.systemPrompt;

          const response = await this.anthropic!.messages.create({
            model: this.config.modelName,
            max_tokens: this.config.maxOutputTokens,
            temperature: temperature,
            ...(systemPromptContent && { system: systemPromptContent }),
            messages: [
              {
                role: 'user',
                content: messagesContent,
              },
            ],
          });

          const messageTextContent =
            response.content &&
            Array.isArray(response.content) &&
            response.content[0] &&
            'text' in response.content[0]
              ? response.content[0].text
              : '';

          // Attempt to parse, but be more forgiving for debugging
          let parsedAction: 'long' | 'short' | 'do_nothing' = 'do_nothing';
          let parsedRationalization: string | undefined = undefined;
          try {
            const parsedJson = JSON.parse(messageTextContent);
            if (
              typeof parsedJson.action === 'string' &&
              ['long', 'short', 'do_nothing'].includes(parsedJson.action)
            ) {
              parsedAction = parsedJson.action as 'long' | 'short' | 'do_nothing';
            }
            if (typeof parsedJson.rationalization === 'string') {
              parsedRationalization = parsedJson.rationalization;
            }
          } catch (parseError: any) {
            console.warn(
              `[DEBUG LlmApiService] JSON.parse failed for raw text. Error: ${parseError.message}`
            );
            // Keep action as 'do_nothing', rationalization undefined
          }

          return {
            action: parsedAction,
            rationalization: parsedRationalization,
            debugRawText: messageTextContent,
            rawResponse: response,
          };
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
            debugRawText: `API Call Failed: ${error.message}`,
            rawResponse: error.response?.data || error,
          };
        }
      };
      apiCalls.push(call());
    }
    return Promise.all(apiCalls);
  }

  // TODO: Implement cost estimation logic based on Anthropic's pricing
  // This might involve token counting for prompts and analyzing response metadata if available.
  public estimateCost(
    _promptTokens: number,
    _completionTokens: number,
    _numImages: number
  ): number {
    // Placeholder - actual calculation depends on specific model and Anthropic pricing structure
    // e.g. (promptTokens / 1_000_000 * inputPricePerMillion) + (completionTokens / 1_000_000 * outputPricePerMillion) + (numImages * pricePerImage)
    console.warn('Cost estimation not fully implemented.');
    return 0.0;
  }
}
