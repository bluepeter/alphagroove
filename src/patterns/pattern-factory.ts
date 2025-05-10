import { quickFallPattern } from './entry/quick-fall.js';
import { quickRisePattern } from './entry/quick-rise.js';
import { fixedTimeEntryPattern } from './entry/fixed-time-entry.js';
import { fixedTimeExitPattern } from './exit/fixed-time.js';
import { Bar, Signal } from './types.js';

export interface PatternDefinition {
  name: string;
  description: string;
  sql: string;
  direction?: 'long' | 'short';
  updateConfig?: (config: any) => PatternDefinition;
  detect?: (bars: Bar[], config: any, direction: 'long' | 'short') => Signal | null;
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
  'fixed-time-entry': fixedTimeEntryPattern,
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

  // If it's quick-rise pattern, always update the configuration from merged config
  if (name === 'quick-rise') {
    const quickRiseOptions = mergedConfig['quick-rise'] ?? {};
    const quickRise = pattern as typeof quickRisePattern;

    return quickRise.updateConfig({
      percentIncrease: quickRiseOptions['rise-pct'] ?? 0.3,
      maxBars: quickRiseOptions['within-minutes'] ?? 5,
      direction: mergedConfig.direction ?? 'long',
    });
  }

  // If it's quick-fall pattern, always update the configuration from merged config
  if (name === 'quick-fall') {
    const quickFallOptions = mergedConfig['quick-fall'] ?? {};
    const quickFall = pattern as typeof quickFallPattern;

    return quickFall.updateConfig({
      percentDecrease: quickFallOptions['fall-pct'] ?? 0.3,
      maxBars: quickFallOptions['within-minutes'] ?? 5,
      direction: mergedConfig.direction ?? 'short',
    });
  }

  // Handle fixed-time-entry pattern configuration
  if (name === 'fixed-time-entry') {
    const fixedTimeOptions = mergedConfig['fixed-time-entry'] ?? {};
    const fixedTime = pattern as typeof fixedTimeEntryPattern;

    return fixedTime.updateConfig({
      time: fixedTimeOptions['entry-time'] ?? '12:00',
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

  // For fixed-time pattern, always update configuration from merged config
  if (name === 'fixed-time' && pattern.updateConfig) {
    const fixedTimeOptions = mergedConfig['fixed-time'] ?? {};
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
