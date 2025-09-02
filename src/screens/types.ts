import { type Signal } from '../patterns/types';
import { type Config as AppConfig } from '../utils/config'; // Corrected and aliased

export interface LLMScreenConfig {
  llmProvider: 'anthropic' | 'openai'; // Made stricter to match Zod schema
  modelName: string;
  apiKeyEnvVar: string;
  numCalls?: number;
  agreementThreshold: number;
  temperatures?: number[];
  prompts: string | string[];
  commonPromptSuffixForJson: string;
  systemPrompt?: string;
  maxOutputTokens: number;
  timeoutMs?: number;
  // Cost tracking related, might be populated by the service
  costPerCall?: number;
  totalCost?: number;
}

export interface ScreenDecision {
  proceed: boolean;
  direction?: 'long' | 'short'; // Added for LLM to specify trade direction
  rationale?: string; // Added optional rationale field
  cost?: number; // Optional cost, as not all screens will have it
  averagedProposedStopLoss?: number; // LLM-derived average stop loss
  averagedProposedProfitTarget?: number; // LLM-derived average profit target

  _debug?: {
    responses?: Array<any>; // Just store the raw responses to avoid complicated type changes
    rawData?: any; // For any additional debug data
  }; // Simplified debug field
}

// Define an enriched signal type that includes context like ticker and trade_date
export interface EnrichedSignal extends Signal {
  ticker: string;
  trade_date: string; // YYYY-MM-DD format as in Bar
  chartPath?: string; // Path to the chart generated for LLM screening
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
    screenConfig: LLMScreenConfig, // This is specific to LLM. Should be more generic if other screens exist.
    // For now, assuming LLMScreenConfig is the structure for any screen needing screenConfig.
    // If other screens have different config structures, this might need to be a union type or a generic.
    appConfig: AppConfig, // Full application config if needed
    context?: EntryScreenContext
  ) => Promise<ScreenDecision>; // Updated return type
}
