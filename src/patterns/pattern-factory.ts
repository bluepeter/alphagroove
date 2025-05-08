import { quickFallPattern } from './entry/quick-fall.js';
import { quickRisePattern } from './entry/quick-rise.js';
import { fixedTimeExitPattern } from './exit/fixed-time.js';

export interface PatternDefinition {
  name: string;
  description: string;
  sql: string;
  direction?: 'long' | 'short';
  updateConfig?: (config: any) => PatternDefinition;
}

// Define pattern options based on merged configuration
export type PatternOptions = Record<string, any>;

type PatternMap = {
  [key: string]: PatternDefinition;
};

// Map of available patterns
const entryPatterns: PatternMap = {
  'quick-rise': quickRisePattern,
  'quick-fall': quickFallPattern,
};

const exitPatterns: PatternMap = {
  'fixed-time': fixedTimeExitPattern,
};

export const getEntryPattern = (name: string, mergedConfig: PatternOptions): PatternDefinition => {
  const pattern = entryPatterns[name];
  if (!pattern) {
    throw new Error(
      `Entry pattern '${name}' not found. Available patterns: ${Object.keys(entryPatterns).join(', ')}`
    );
  }

  // If it's quick-rise pattern and we have options, update the configuration
  if (name === 'quick-rise' && mergedConfig['quick-rise']) {
    const quickRiseOptions = mergedConfig['quick-rise'];
    const quickRise = pattern as typeof quickRisePattern;

    return quickRise.updateConfig({
      // Use new property names from config but map to internal format
      percentIncrease: quickRiseOptions['rise-pct'] ?? quickRise.config.percentIncrease,
      maxBars: quickRiseOptions['within-minutes'] ?? quickRise.config.maxBars,
      direction: mergedConfig.direction ?? 'long',
    });
  }

  // If it's quick-fall pattern and we have options, update the configuration
  if (name === 'quick-fall' && mergedConfig['quick-fall']) {
    const quickFallOptions = mergedConfig['quick-fall'];
    const quickFall = pattern as typeof quickFallPattern;

    return quickFall.updateConfig({
      // Use new property names from config but map to internal format
      percentDecrease: quickFallOptions['fall-pct'] ?? quickFall.config.percentDecrease,
      maxBars: quickFallOptions['within-minutes'] ?? quickFall.config.maxBars,
      direction: mergedConfig.direction ?? 'short',
    });
  }

  return pattern;
};

export const getExitPattern = (name: string, mergedConfig: PatternOptions): PatternDefinition => {
  const pattern = exitPatterns[name];
  if (!pattern) {
    throw new Error(
      `Exit pattern '${name}' not found. Available patterns: ${Object.keys(exitPatterns).join(', ')}`
    );
  }

  // For fixed-time pattern, update the configuration if we have options
  if (name === 'fixed-time' && mergedConfig['fixed-time'] && pattern.updateConfig) {
    const fixedTimeOptions = mergedConfig['fixed-time'];
    return pattern.updateConfig({
      barsAfterEntry: fixedTimeOptions['hold-minutes'] ?? 10,
    });
  }

  return pattern;
};

// Register a new entry pattern
export const registerEntryPattern = (id: string, pattern: PatternDefinition): void => {
  entryPatterns[id] = pattern;
};

// Register a new exit pattern
export const registerExitPattern = (id: string, pattern: PatternDefinition): void => {
  exitPatterns[id] = pattern;
};

// Get all available entry patterns
export const getAvailableEntryPatterns = (): string[] => {
  return Object.keys(entryPatterns);
};

// Get all available exit patterns
export const getAvailableExitPatterns = (): string[] => {
  return Object.keys(exitPatterns);
};
