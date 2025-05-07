import { quickRisePattern } from './entry/quick-rise.js';
import { fixedTimeExitPattern } from './exit/fixed-time.js';

export interface PatternDefinition {
  name: string;
  description: string;
  sql: string;
}

// Each pattern can define its own options
export type PatternOptions = {
  'quick-rise'?: {
    percentIncrease: number;
  };
};

type PatternMap = {
  [key: string]: PatternDefinition;
};

// Map of available patterns
const entryPatterns: PatternMap = {
  'quick-rise': quickRisePattern,
};

const exitPatterns: PatternMap = {
  'fixed-time': fixedTimeExitPattern,
};

export const getEntryPattern = (name: string, options?: PatternOptions): PatternDefinition => {
  const pattern = entryPatterns[name];
  if (!pattern) {
    throw new Error(
      `Entry pattern '${name}' not found. Available patterns: ${Object.keys(entryPatterns).join(', ')}`
    );
  }

  // If it's quick-rise pattern and we have options, update the configuration
  if (name === 'quick-rise' && options?.['quick-rise']?.percentIncrease) {
    const quickRise = pattern as typeof quickRisePattern;
    quickRise.updateConfig({ percentIncrease: options['quick-rise'].percentIncrease });
    return quickRise;
  }

  return pattern;
};

export const getExitPattern = (name: string): PatternDefinition => {
  const pattern = exitPatterns[name];
  if (!pattern) {
    throw new Error(
      `Exit pattern '${name}' not found. Available patterns: ${Object.keys(exitPatterns).join(', ')}`
    );
  }
  return pattern;
};
