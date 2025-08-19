import { describe, it, expect } from 'vitest';

import { mergeConfigWithCliOptions, Config, LLMScreenConfig } from './config';

const defaultLlmScreenConfig: LLMScreenConfig = {
  enabled: false,
  llmProvider: 'anthropic',
  modelName: 'claude-sonnet-4-20250514',
  apiKeyEnvVar: 'ANTHROPIC_API_KEY',
  numCalls: 3,
  agreementThreshold: 2,
  temperatures: [0.2, 0.5, 0.8],
  prompts: 'Default prompt',
  commonPromptSuffixForJson: 'Default suffix',
  maxOutputTokens: 150,
};

describe('Configuration System', () => {
  describe('mergeConfigWithCliOptions', () => {
    const baseConfigStructure: Omit<
      Config,
      'default' | 'patterns' | 'exitStrategies' | 'llmConfirmationScreen'
    > = {};

    const createTestConfig = (overrides: Partial<Config> = {}): Config => {
      const defaultConfigPart = {
        ticker: 'SPY',
        timeframe: '1min',
        direction: 'long' as const,
        date: {
          from: '2023-01-01',
          to: '2023-12-31',
        },
        patterns: {
          entry: 'quick-rise',
        },
        charts: {
          generate: false,
          outputDir: './charts',
        },
        exitStrategies: {
          enabled: ['maxHoldTime'],
          maxHoldTime: { minutes: 60 },
        },
        ...(overrides.default || {}),
      };

      const patternsPart = {
        entry: {
          'quick-rise': {
            'rise-pct': 0.3,
            'within-minutes': 5,
          },
          'quick-fall': {
            'fall-pct': 0.3,
            'within-minutes': 5,
          },
          'fixed-time-entry': {
            'entry-time': '13:00',
          },
        },
        ...(overrides.patterns || {}),
      };

      const rootExitStrategiesPart = {
        enabled: ['maxHoldTime'],
        maxHoldTime: { minutes: 60 },
        ...(overrides.exitStrategies || {}),
      };

      return {
        ...baseConfigStructure,
        default: defaultConfigPart,
        patterns: patternsPart,
        exitStrategies: rootExitStrategiesPart,
        llmConfirmationScreen: {
          ...defaultLlmScreenConfig,
          ...(overrides.llmConfirmationScreen || {}),
        },
        ...overrides,
      };
    };

    it('should merge default config with CLI options', () => {
      const config = createTestConfig();
      const cliOptions = {
        ticker: 'QQQ',
        from: '2024-01-01',
      };

      const merged = mergeConfigWithCliOptions(config, cliOptions);

      expect(merged).toMatchObject({
        ticker: 'QQQ',
        timeframe: '1min',
        direction: 'long',
        from: '2024-01-01',
        to: '2023-12-31',
        entryPattern: 'quick-rise',
        'quick-rise': {
          'rise-pct': 0.3,
          'within-minutes': 5,
        },
        exitStrategies: {
          enabled: ['maxHoldTime'],
          maxHoldTime: { minutes: 60 },
        },
      });
    });

    it('should handle entry pattern-specific options with dot notation', () => {
      const config = createTestConfig();
      const cliOptions = {
        'quick-rise.rise-pct': 0.7,
      };

      const merged = mergeConfigWithCliOptions(config, cliOptions);

      expect(merged).toMatchObject({
        'quick-rise': {
          'rise-pct': 0.7,
          'within-minutes': 5,
        },
      });
    });

    it('should handle legacy risePct option for backward compatibility', () => {
      const config = createTestConfig({
        default: {
          ticker: 'SPY',
          timeframe: '1min',
          direction: 'long',
          patterns: { entry: 'quick-rise' },
        },
      });
      const cliOptions = {
        entryPattern: 'quick-rise',
        risePct: '0.8',
      };

      const merged = mergeConfigWithCliOptions(config, cliOptions);

      expect(merged).toMatchObject({
        entryPattern: 'quick-rise',
        'quick-rise': {
          'rise-pct': 0.8,
          'within-minutes': 5,
        },
      });
    });

    it('should use entry pattern specified in config when not provided in CLI', () => {
      const config = createTestConfig({
        default: {
          ticker: 'SPY',
          timeframe: '1min',
          direction: 'long',
          patterns: { entry: 'quick-fall' },
        },
      });
      const cliOptions = {};

      const merged = mergeConfigWithCliOptions(config, cliOptions);

      expect(merged.entryPattern).toBe('quick-fall');
    });

    it('should correctly load default exitStrategies configuration', () => {
      const config = createTestConfig();
      const cliOptions = {};
      const merged = mergeConfigWithCliOptions(config, cliOptions);

      expect(merged.exitStrategies).toBeDefined();
      expect(merged.exitStrategies?.enabled).toEqual(['maxHoldTime']);
      expect(merged.exitStrategies?.maxHoldTime?.minutes).toBe(60);
    });

    it('should allow overriding exitStrategies.maxHoldTime.minutes in config root section, taking precedence over default section', () => {
      const config = createTestConfig({
        default: {
          ticker: 'SPY',
          timeframe: '1min',
          direction: 'long',
          exitStrategies: {
            enabled: ['maxHoldTime'],
            maxHoldTime: { minutes: 30 },
          },
        },
        exitStrategies: {
          enabled: ['maxHoldTime'],
          maxHoldTime: { minutes: 90 },
        },
      });
      const cliOptions = {};
      const merged = mergeConfigWithCliOptions(config, cliOptions);
      expect(merged.exitStrategies?.maxHoldTime?.minutes).toBe(90);
    });

    it('should correctly merge fixed-time-entry pattern options', () => {
      const config = createTestConfig({
        default: {
          ticker: 'SPY',
          timeframe: '1min',
          direction: 'long',
          patterns: { entry: 'fixed-time-entry' },
        },
        patterns: {
          entry: {
            'fixed-time-entry': { 'entry-time': '10:00' },
          },
        },
      });
      const cliOptions = {
        'fixed-time-entry.entry-time': '14:30',
      };
      const merged = mergeConfigWithCliOptions(config, cliOptions);
      expect(merged.entryPattern).toBe('fixed-time-entry');
      expect(merged['fixed-time-entry']?.['entry-time']).toBe('14:30');
    });

    it('should map new strategyOptions.fixedTimeEntry.entryTime format correctly', () => {
      const config = createTestConfig({
        default: {
          ticker: 'SPY',
          timeframe: '1min',
          direction: 'long',
          patterns: { entry: 'fixed-time-entry' },
        },
        entry: {
          strategyOptions: {
            fixedTimeEntry: {
              entryTime: '13:00',
            },
          },
        },
      });
      const cliOptions = {};
      const merged = mergeConfigWithCliOptions(config, cliOptions);
      expect(merged.entryPattern).toBe('fixed-time-entry');
      expect(merged['fixed-time-entry']?.['entry-time']).toBe('13:00');
    });

    it('should prioritize strategyOptions over legacy patterns config', () => {
      const config = createTestConfig({
        default: {
          ticker: 'SPY',
          timeframe: '1min',
          direction: 'long',
          patterns: { entry: 'fixed-time-entry' },
        },
        patterns: {
          entry: {
            'fixed-time-entry': { 'entry-time': '10:00' },
          },
        },
        entry: {
          strategyOptions: {
            fixedTimeEntry: {
              entryTime: '13:00',
            },
          },
        },
      });
      const cliOptions = {};
      const merged = mergeConfigWithCliOptions(config, cliOptions);
      expect(merged.entryPattern).toBe('fixed-time-entry');
      expect(merged['fixed-time-entry']?.['entry-time']).toBe('13:00'); // Should use strategyOptions value
    });

    it('should ensure exitStrategies.maxHoldTime is populated with defaults if enabled but not specified', () => {
      const configWithOnlyEnabled: Config = {
        default: {
          ticker: 'SPY',
          timeframe: '1min',
          direction: 'long',
          patterns: { entry: 'quick-rise' },
          charts: { generate: false, outputDir: './charts' },
          exitStrategies: {
            enabled: ['maxHoldTime'],
          },
        },
        patterns: {
          entry: {
            'quick-rise': { 'rise-pct': 0.3, 'within-minutes': 5 },
          },
        },
        exitStrategies: {
          enabled: ['maxHoldTime'],
        },
        llmConfirmationScreen: { ...defaultLlmScreenConfig },
      };

      const merged = mergeConfigWithCliOptions(configWithOnlyEnabled, {});
      expect(merged.exitStrategies).toBeDefined();
      expect(merged.exitStrategies?.enabled).toEqual(['maxHoldTime']);
      expect(merged.exitStrategies?.maxHoldTime).toBeDefined();
      expect(merged.exitStrategies?.maxHoldTime?.minutes).toBe(60);
    });

    it('should prefer root exit over exitStrategies when both provided (alias handling)', () => {
      const config = createTestConfig({
        exitStrategies: {
          enabled: ['maxHoldTime'],
          maxHoldTime: { minutes: 60 },
        },
        exit: {
          enabled: ['profitTarget'],
          strategyOptions: {
            profitTarget: { atrMultiplier: 7.0 },
          },
        } as any,
      });

      const merged = mergeConfigWithCliOptions(config, {});

      expect(merged.exitStrategies?.enabled).toEqual(['profitTarget']);
      expect(merged.exitStrategies?.profitTarget?.atrMultiplier).toBe(7.0);
      expect(merged.exitStrategies?.maxHoldTime).toBeUndefined();
    });

    it('should read maxHoldTime from root exit when enabled and not specified (default minutes=60)', () => {
      const config = createTestConfig({
        exit: {
          enabled: ['maxHoldTime'],
        } as any,
      });

      const merged = mergeConfigWithCliOptions(config, {});
      expect(merged.exitStrategies?.enabled).toEqual(['maxHoldTime']);
      expect(merged.exitStrategies?.maxHoldTime?.minutes).toBe(60);
    });

    it('should read maxHoldTime from exit.strategyOptions as a fallback', () => {
      const config = createTestConfig({
        exit: {
          enabled: ['maxHoldTime'],
          strategyOptions: {
            maxHoldTime: { minutes: 500 },
          },
        } as any,
      });

      const merged = mergeConfigWithCliOptions(config, {});
      expect(merged.exitStrategies?.maxHoldTime?.minutes).toBe(500);
    });

    it('should merge slippage from root exit (outside strategyOptions)', () => {
      const config = createTestConfig({
        exit: {
          enabled: [],
          slippage: { model: 'fixed', value: 0.01 },
        } as any,
      });

      const merged = mergeConfigWithCliOptions(config, {});
      expect(merged.exitStrategies?.slippage).toEqual({ model: 'fixed', value: 0.01 });
    });

    it('should set entryPattern from entry.enabled[0] with camelCase names', () => {
      const config = createTestConfig({
        entry: {
          enabled: ['fixedTimeEntry'],
        } as any,
      });

      const merged = mergeConfigWithCliOptions(config, {});
      expect(merged.entryPattern).toBe('fixed-time-entry');
    });

    it('should fall back to entry.pattern if entry.enabled is not set', () => {
      const config = createTestConfig({
        entry: {
          pattern: 'quickRise',
        } as any,
      });

      const merged = mergeConfigWithCliOptions(config, {});
      expect(merged.entryPattern).toBe('quick-rise');
    });
  });
});
