import { type Signal } from '../patterns/types';
import { type Config as AppConfig } from '../utils/config'; // Corrected and aliased

export interface LLMScreenConfig {
  enabled: boolean;
  llmProvider: 'anthropic' | 'openai' | string; // Allow other strings for future flexibility
  modelName: string;
  apiKeyEnvVar: string;
  numCalls: number;
  agreementThreshold: number;
  temperatures: number[];
  prompts: string | string[];
  commonPromptSuffixForJson?: string;
  systemPrompt?: string;
  maxOutputTokens: number;
  timeoutMs?: number;
  // Cost tracking related, might be populated by the service
  costPerCall?: number;
  totalCost?: number;
}

// Define an enriched signal type that includes context like ticker and trade_date
export interface EnrichedSignal extends Signal {
  ticker: string;
  trade_date: string; // YYYY-MM-DD format as in Bar
  // Add other properties that might have been part of the original EntrySignal context if necessary
  // For example, if the original signal.entryPrice was distinct from signal.price:
  // entryPrice?: number;
}

export interface EntryScreenContext {
  // Placeholder for any additional context the screen might need
  // e.g., historical data, other indicators, etc.
}

export interface EntryScreen {
  id: string;
  name: string;
  shouldSignalProceed: (
    signal: EnrichedSignal, // Use the new EnrichedSignal type
    chartPath: string, // Path to the generated chart image for the signal
    screenConfig: LLMScreenConfig,
    appConfig: AppConfig, // Full application config if needed
    context?: EntryScreenContext
  ) => Promise<boolean>;
}
