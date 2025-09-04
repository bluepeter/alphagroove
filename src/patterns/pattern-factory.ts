import { fixedTimeEntryPattern } from './entry/fixed-time-entry.js';
import { quickFallPattern } from './entry/quick-fall.js';
import { quickRisePattern } from './entry/quick-rise.js';
import { randomTimeEntryPattern } from './entry/random-time-entry.js';
import { fixedTimeExitPattern } from './exit/fixed-time.js';
import { PatternDefinition } from './types.js';

const entryPatterns: Record<string, PatternDefinition> = {
  quickRise: quickRisePattern,
  quickFall: quickFallPattern,
  fixedTimeEntry: fixedTimeEntryPattern,
  randomTimeEntry: randomTimeEntryPattern,
};

const exitPatterns: Record<string, PatternDefinition> = {
  'fixed-time': fixedTimeExitPattern,
};

const DefaultExitStrategyPattern: PatternDefinition = {
  name: 'MaxHoldTimeStrategy',
  description: 'Exit based on configured exitStrategies (e.g., maxHoldTime).',
  sql: '-- No specific SQL for this wrapper, logic is in query-builder based on config --',
  defaultConfig: {},
  info: () => 'Exit managed by exitStrategies in configuration.',
  // No generateSignals or specific direction for this wrapper pattern
};

export const getEntryPattern = (
  patternName: string,
  config: any // This is the MergedConfig
): PatternDefinition => {
  let pattern = entryPatterns[patternName];
  if (!pattern) {
    throw new Error(`Entry pattern '${patternName}' not found`);
  }
  // Check if the pattern object has an updateConfig method and call it
  // The individual pattern files (e.g. quickRisePattern) have an updateConfig method
  if (typeof (pattern as any).updateConfig === 'function') {
    // Create a new instance with the updated config
    const updatedPattern = (pattern as any).updateConfig(config[patternName] || {});

    // Properly set direction if specified in config
    if (config.direction && ['long', 'short'].includes(config.direction)) {
      updatedPattern.direction = config.direction;
    }

    return updatedPattern;
  }
  return pattern;
};

export const getExitPattern = (
  patternName: string | undefined,
  config: any // This is the MergedConfig
): PatternDefinition => {
  if (!patternName || !exitPatterns[patternName]) {
    if (patternName && !exitPatterns[patternName]) {
      console.warn(
        `Warning: Exit pattern "${patternName}" not found in exitPatterns. Using DefaultExitStrategyPattern.`
      );
    }
    return DefaultExitStrategyPattern;
  }
  let pattern = exitPatterns[patternName];
  // Check for updateConfig on exit patterns too
  if (typeof (pattern as any).updateConfig === 'function') {
    pattern = (pattern as any).updateConfig(config[patternName] || {});
  }
  return pattern;
};

export const getAvailableEntryPatterns = (): string[] => {
  return Object.keys(entryPatterns);
};

export const getAvailableExitPatterns = (): string[] => {
  return Object.keys(exitPatterns);
};
