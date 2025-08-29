import fs from 'node:fs/promises';

import Anthropic from '@anthropic-ai/sdk';

import { type LLMScreenConfig } from '../screens/types'; // Assuming path to LLMScreenConfig

// Note: dotenv.config() is called by the main application (scout.ts) before using this service

export interface LLMResponse {
  action: 'long' | 'short' | 'do_nothing';
  rationalization?: string;
  stopLoss?: number;
  profitTarget?: number;
  confidence?: number;
  debugRawText?: string; // Added for debugging raw LLM output
  rawResponse?: any;
  error?: string;
  cost?: number;
}

export class LlmApiService {
  private anthropic: Anthropic | null = null;
  private config: LLMScreenConfig;
  private apiKey: string | undefined;

  // Pricing for Claude 3.7 Sonnet (ensure this matches the actual model if it changes)
  private readonly INPUT_COST_PER_MILLION_TOKENS = 3;
  private readonly OUTPUT_COST_PER_MILLION_TOKENS = 15;

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

  public async getTradeDecisions(chartPath: string): Promise<LLMResponse[]> {
    if (!this.isEnabled() || !this.anthropic) {
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
      const fullPrompt = `${currentPrompt}${this.config.commonPromptSuffixForJson || ''}`;
      const temperature = this.config.temperatures?.[i] || this.config.temperatures?.[0] || 0.5;

      const call = async (): Promise<LLMResponse> => {
        let callCost = 0;
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

          // Cast to any to access usage, as it might not be on the default type
          const response: Anthropic.Messages.Message = await this.anthropic!.messages.create({
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

          // Calculate cost if usage data is available
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

          let parsedAction: 'long' | 'short' | 'do_nothing' = 'do_nothing';
          let parsedRationalization: string | undefined = undefined;
          let parsedStopLoss: number | undefined = undefined;
          let parsedProfitTarget: number | undefined = undefined;
          let parsedConfidence: number | undefined = undefined;

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
            if (typeof parsedJson.confidence === 'number') {
              parsedConfidence = parsedJson.confidence;
            } else if (typeof parsedJson.confidence === 'string') {
              const conf = parseFloat(parsedJson.confidence);
              if (!isNaN(conf)) parsedConfidence = conf;
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
            confidence: parsedConfidence,
            cost: callCost,
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

  // Cost estimation logic is now part of getTradeDecisions for actual costs
  // The estimateCost function can be removed or kept if a pre-estimation is ever needed.
  // For now, removing it to avoid confusion as actual costs are calculated.
  /*
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
  */
}
