import { describe, it, expect } from 'vitest';

import { mergeConfigWithCliOptions, Config, LLMScreenConfig } from './config';

const defaultLlmScreenConfig: LLMScreenConfig = {
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
          entry: 'quickRise',
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
          quickRise: {
            risePct: 0.3,
            withinMinutes: 5,
          },
          quickFall: {
            fallPct: 0.3,
            withinMinutes: 5,
          },
          fixedTimeEntry: {
            entryTime: '13:00',
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
        entryPattern: 'quickRise',
        quickRise: {
          risePct: 0.3,
          withinMinutes: 5,
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
        'quickRise.risePct': 0.7,
      };

      const merged = mergeConfigWithCliOptions(config, cliOptions);

      expect(merged).toMatchObject({
        quickRise: {
          risePct: 0.7,
          withinMinutes: 5,
        },
      });
    });

    it('should handle legacy risePct option for backward compatibility', () => {
      const config = createTestConfig({
        default: {
          ticker: 'SPY',
          timeframe: '1min',
          direction: 'long',
          patterns: { entry: 'quickRise' },
        },
      });
      const cliOptions = {
        entryPattern: 'quickRise',
        risePct: '0.8',
      };

      const merged = mergeConfigWithCliOptions(config, cliOptions);

      expect(merged).toMatchObject({
        entryPattern: 'quickRise',
        quickRise: {
          risePct: 0.8,
          withinMinutes: 5,
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
          patterns: { entry: 'fixedTimeEntry' },
        },
        patterns: {
          entry: {
            fixedTimeEntry: { entryTime: '10:00' },
          },
        },
      });
      const cliOptions = {
        'fixedTimeEntry.entryTime': '14:30',
      };
      const merged = mergeConfigWithCliOptions(config, cliOptions);
      expect(merged.entryPattern).toBe('fixedTimeEntry');
      expect(merged.fixedTimeEntry?.entryTime).toBe('14:30');
    });

    it('should map new strategyOptions.fixedTimeEntry.entryTime format correctly', () => {
      const config = createTestConfig({
        default: {
          ticker: 'SPY',
          timeframe: '1min',
          direction: 'long',
          patterns: { entry: 'fixedTimeEntry' },
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
      expect(merged.entryPattern).toBe('fixedTimeEntry');
      expect(merged.fixedTimeEntry?.entryTime).toBe('13:00');
    });

    it('should prioritize strategyOptions over legacy patterns config', () => {
      const config = createTestConfig({
        default: {
          ticker: 'SPY',
          timeframe: '1min',
          direction: 'long',
          patterns: { entry: 'fixedTimeEntry' },
        },
        patterns: {
          entry: {
            fixedTimeEntry: { entryTime: '10:00' },
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
      expect(merged.entryPattern).toBe('fixedTimeEntry');
      expect(merged.fixedTimeEntry?.entryTime).toBe('13:00'); // Should use strategyOptions value
    });

    it('should map new strategyOptions.randomTimeEntry format correctly', () => {
      const config = createTestConfig({
        default: {
          ticker: 'SPY',
          timeframe: '1min',
          direction: 'long',
          patterns: { entry: 'randomTimeEntry' },
        },
        entry: {
          strategyOptions: {
            randomTimeEntry: {
              startTime: '10:00',
              endTime: '14:00',
            },
          },
        },
      });
      const cliOptions = {};
      const merged = mergeConfigWithCliOptions(config, cliOptions);
      expect(merged.entryPattern).toBe('randomTimeEntry');
      expect(merged.randomTimeEntry?.startTime).toBe('10:00');
      expect(merged.randomTimeEntry?.endTime).toBe('14:00');
    });

    it('should populate exitStrategies.maxHoldTime with defaults when configured', () => {
      const configWithMaxHoldTime: Config = {
        default: {
          ticker: 'SPY',
          timeframe: '1min',
          direction: 'long',
          patterns: { entry: 'quickRise' },

          exitStrategies: {
            enabled: [],
            maxHoldTime: { minutes: 60 }, // Configured with default minutes
          },
        },
        patterns: {
          entry: {
            quickRise: { risePct: 0.3, withinMinutes: 5 },
          },
        },
        exitStrategies: {
          enabled: [],
          maxHoldTime: { minutes: 60 }, // Configured with default minutes
        },
        llmConfirmationScreen: { ...defaultLlmScreenConfig },
      };

      const merged = mergeConfigWithCliOptions(configWithMaxHoldTime, {});
      expect(merged.exitStrategies).toBeDefined();
      expect(merged.exitStrategies?.enabled).toEqual([]);
      expect(merged.exitStrategies?.maxHoldTime).toBeDefined();
      expect(merged.exitStrategies?.maxHoldTime?.minutes).toBe(60);
    });

    it('should prefer root exit over exitStrategies when both provided (alias handling)', () => {
      const config = createTestConfig({
        exitStrategies: {
          enabled: [],
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
      expect(merged.exitStrategies?.strategyOptions?.profitTarget?.atrMultiplier).toBe(7.0);
      expect(merged.exitStrategies?.maxHoldTime).toBeUndefined();
    });

    it('should read maxHoldTime from root exit when configured (default minutes=60)', () => {
      const config = createTestConfig({
        exit: {
          enabled: [],
          maxHoldTime: { minutes: 60 }, // Configured with default minutes
        } as any,
      });

      const merged = mergeConfigWithCliOptions(config, {});
      expect(merged.exitStrategies?.enabled).toEqual([]);
      expect(merged.exitStrategies?.maxHoldTime?.minutes).toBe(60);
    });

    it('should read maxHoldTime from exit base level only', () => {
      const config = createTestConfig({
        exit: {
          enabled: ['maxHoldTime'],
          maxHoldTime: { minutes: 500 }, // Base level only
          strategyOptions: {
            // maxHoldTime no longer supported here
          },
        } as any,
      });

      const merged = mergeConfigWithCliOptions(config, {});
      expect(merged.exitStrategies?.maxHoldTime?.minutes).toBe(500);
    });

    it('should merge slippage from root exit (outside strategyOptions) for backward compatibility', () => {
      const config = createTestConfig({
        exit: {
          enabled: [],
          slippage: { model: 'fixed', value: 0.01 },
        } as any,
      });

      const merged = mergeConfigWithCliOptions(config, {});
      expect(merged.execution?.slippage).toEqual({ model: 'fixed', value: 0.01 });
    });

    it('should merge slippage from execution.slippage (new location)', () => {
      const config = createTestConfig({
        execution: {
          slippage: { model: 'percent', value: 0.02 },
        },
      });

      const merged = mergeConfigWithCliOptions(config, {});
      expect(merged.execution?.slippage).toEqual({ model: 'percent', value: 0.02 });
    });

    it('should set entryPattern from entry.enabled[0] with camelCase names', () => {
      const config = createTestConfig({
        entry: {
          enabled: ['fixedTimeEntry'],
        } as any,
      });

      const merged = mergeConfigWithCliOptions(config, {});
      expect(merged.entryPattern).toBe('fixedTimeEntry');
    });

    it('should fall back to entry.pattern if entry.enabled is not set', () => {
      const config = createTestConfig({
        entry: {
          pattern: 'quickRise',
        } as any,
      });

      const merged = mergeConfigWithCliOptions(config, {});
      expect(merged.entryPattern).toBe('quickRise');
    });
  });

  describe('New Config Structure Support', () => {
    it('should read LLM config from shared.llmConfirmationScreen', () => {
      const newStructureConfig = {
        shared: {
          ticker: 'SPY',
          timeframe: '1min',
          direction: 'llm_decides' as const,
          llmConfirmationScreen: {
            llmProvider: 'anthropic' as const,
            modelName: 'claude-sonnet-4-20250514',
            apiKeyEnvVar: 'ANTHROPIC_API_KEY',
            numCalls: 3,
            agreementThreshold: 2,
            temperatures: [0.1, 0.5, 1.0],
            prompts: ['test prompt'],
            commonPromptSuffixForJson: 'test suffix',
            maxOutputTokens: 150,
          },
          entry: {
            enabled: ['quickRise' as const],
            strategyOptions: {
              quickRise: { risePct: 0.3, withinMinutes: 5 },
            },
          },
        },
        backtest: {
          date: { from: '2023-01-01', to: '2023-12-31' },
          parallelization: { maxConcurrentDays: 2 },
          exit: {
            enabled: ['profitTarget'],
            strategyOptions: {
              profitTarget: {
                percentFromEntry: 1.0,
                useLlmProposedPrice: false,
                atrMultiplier: 3.0,
              },
            },
          },
          execution: {
            slippage: { model: 'fixed' as const, value: 0.01 },
          },
        },
        scout: {
          polygon: { apiKeyEnvVar: 'POLYGON_API_KEY' },
        },
      };

      const merged = mergeConfigWithCliOptions(newStructureConfig, {});

      // Test that shared config is mapped correctly
      expect(merged.ticker).toBe('SPY');
      expect(merged.timeframe).toBe('1min');
      expect(merged.direction).toBe('llm_decides');
      expect(merged.from).toBe('2023-01-01');
      expect(merged.to).toBe('2023-12-31');
      expect(merged.maxConcurrentDays).toBe(2);

      // Test that LLM config is accessible
      expect(merged.llmConfirmationScreen).toBeDefined();
      expect(merged.llmConfirmationScreen).toBeDefined();
      expect(merged.llmConfirmationScreen!.llmProvider).toBe('anthropic');
      expect(merged.llmConfirmationScreen!.numCalls).toBe(3);

      // Test that entry config is mapped
      expect(merged.entryPattern).toBe('quickRise');
      expect(merged.quickRise).toEqual({ risePct: 0.3, withinMinutes: 5 });

      // Test that exit strategies are mapped
      expect(merged.exitStrategies!.enabled).toContain('profitTarget');
      expect(merged.exitStrategies!.strategyOptions!.profitTarget!.atrMultiplier).toBe(3.0);

      // Test that execution config is mapped
      expect(merged.execution!.slippage!.model).toBe('fixed');
      expect(merged.execution!.slippage!.value).toBe(0.01);
    });

    it('should maintain backward compatibility with legacy config structure', () => {
      const legacyConfig = {
        default: {
          ticker: 'QQQ',
          timeframe: '1min',
          direction: 'long' as const,
          date: { from: '2022-01-01', to: '2022-12-31' },
        },
        patterns: {
          entry: {
            quickRise: { risePct: 0.3, withinMinutes: 5 },
            quickFall: { fallPct: 0.5, withinMinutes: 3 },
          },
        },
        exitStrategies: {
          enabled: ['maxHoldTime'],
          maxHoldTime: { minutes: 60 },
        },
        llmConfirmationScreen: {
          llmProvider: 'openai' as const,
          modelName: 'gpt-4',
          apiKeyEnvVar: 'OPENAI_API_KEY',
          numCalls: 2,
          agreementThreshold: 2,
          temperatures: [0.2, 0.8],
          prompts: ['test prompt'],
          commonPromptSuffixForJson: 'test suffix',
          maxOutputTokens: 150,
        },
        entry: {
          enabled: ['quickFall' as const],
          strategyOptions: {
            quickFall: { fallPct: 0.5, withinMinutes: 3 },
          },
        },
        execution: {
          slippage: { model: 'percent' as const, value: 0.05 },
        },
      };

      const merged = mergeConfigWithCliOptions(legacyConfig, {});

      expect(merged.ticker).toBe('QQQ');
      expect(merged.direction).toBe('long');
      expect(merged.from).toBe('2022-01-01');
      expect(merged.to).toBe('2022-12-31');
      expect(merged.llmConfirmationScreen).toBeDefined();
      expect(merged.llmConfirmationScreen!.llmProvider).toBe('openai');
      expect(merged.entryPattern).toBe('quickFall');
      expect(merged.quickFall).toEqual({ fallPct: 0.5, withinMinutes: 3 });
    });

    it('should prioritize new structure over legacy when both exist', () => {
      const mixedConfig = {
        // Legacy structure
        default: {
          ticker: 'LEGACY_TICKER',
          timeframe: '1min',
          direction: 'short' as const,
        },
        llmConfirmationScreen: {
          llmProvider: 'openai' as const,
          modelName: 'gpt-4',
          apiKeyEnvVar: 'OPENAI_API_KEY',
          numCalls: 2,
          agreementThreshold: 2,
          temperatures: [0.2, 0.8],
          prompts: ['test prompt'],
          commonPromptSuffixForJson: 'test suffix',
          maxOutputTokens: 150,
        },
        // New structure (should take priority)
        shared: {
          ticker: 'NEW_TICKER',
          timeframe: '1min',
          direction: 'llm_decides' as const,
          llmConfirmationScreen: {
            llmProvider: 'anthropic' as const,
            modelName: 'claude-sonnet-4-20250514',
            apiKeyEnvVar: 'ANTHROPIC_API_KEY',
            numCalls: 3,
            agreementThreshold: 2,
            temperatures: [0.1, 1.0],
            prompts: ['test prompt'],
            commonPromptSuffixForJson: 'test suffix',
            maxOutputTokens: 150,
          },
        },
        backtest: {
          date: { from: '2024-01-01', to: '2024-12-31' },
        },
      };

      const merged = mergeConfigWithCliOptions(mixedConfig, {});

      // New structure should take priority
      expect(merged.ticker).toBe('NEW_TICKER');
      expect(merged.direction).toBe('llm_decides');
      expect(merged.from).toBe('2024-01-01');
      expect(merged.llmConfirmationScreen).toBeDefined();
      expect(merged.llmConfirmationScreen!.llmProvider).toBe('anthropic');
    });
  });
});
