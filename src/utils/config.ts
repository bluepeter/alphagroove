import fs from 'fs';
import path from 'path';

import yaml from 'js-yaml';
import { z } from 'zod';

// Define schema for the quick-rise pattern
const QuickRiseConfigSchema = z.object({
  risePct: z.number().default(0.3),
  withinMinutes: z.number().default(5),
});

// Define schema for the quick-fall pattern
const QuickFallConfigSchema = z.object({
  fallPct: z.number().default(0.3),
  withinMinutes: z.number().default(5),
});

// Define schema for the Fixed Time Entry pattern configuration
const FixedTimeEntryConfigSchema = z.object({
  entryTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:MM format'),
});

// Define schema for the Random Time Entry pattern configuration
const RandomTimeEntryConfigSchema = z.object({
  startTime: z
    .string()
    .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Start time must be in HH:MM format'),
  endTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'End time must be in HH:MM format'),
});

// Define schema for entry pattern configurations
const EntryPatternsConfigSchema = z.object({
  quickRise: QuickRiseConfigSchema.optional(),
  quickFall: QuickFallConfigSchema.optional(),
  fixedTimeEntry: FixedTimeEntryConfigSchema.optional(),
  randomTimeEntry: RandomTimeEntryConfigSchema.optional(),
});

// NEW: Define schemas for exit strategies
// Stop Loss configuration
const StopLossConfigSchema = z.object({
  percentFromEntry: z.number().default(1.0),
  atrMultiplier: z.number().optional(),
  useLlmProposedPrice: z.boolean().optional().default(false),
});

// Profit Target configuration
const ProfitTargetConfigSchema = z.object({
  percentFromEntry: z.number().default(2.0),
  atrMultiplier: z.number().optional(),
  useLlmProposedPrice: z.boolean().optional().default(false),
});

// Trailing Stop configuration
const TrailingStopConfigSchema = z.object({
  activationPercent: z.number().optional(),
  trailPercent: z.number().optional(),
  activationAtrMultiplier: z.number().optional(),
  trailAtrMultiplier: z.number().optional(),
});

// End of Day configuration
const EndOfDayConfigSchema = z.object({
  time: z
    .string()
    .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:MM format')
    .default('16:00'),
});

// Slippage model configuration
const SlippageConfigSchema = z.object({
  model: z.enum(['percent', 'fixed']).default('percent'),
  value: z.number().default(0.05),
});

// Define schema for MaxHoldTime configuration
const MaxHoldTimeConfigSchema = z.object({
  minutes: z.number().int().positive().default(60),
});

// Define schema for ExitStrategies configuration
const ExitStrategiesConfigSchema = z
  .object({
    enabled: z.array(z.string()).default([]),
    maxHoldTime: MaxHoldTimeConfigSchema.optional(), // Base level for exit system
    endOfDay: EndOfDayConfigSchema.optional(), // Base level for exit system
    slippage: SlippageConfigSchema.optional(),
    strategyOptions: z
      .object({
        stopLoss: StopLossConfigSchema.optional(),
        profitTarget: ProfitTargetConfigSchema.optional(),
        trailingStop: TrailingStopConfigSchema.optional(),
      })
      .optional(),
  })
  .default({ enabled: [] });

// Optional root-level Entry configuration (preferred going forward)
const EntryRootConfigSchema = z
  .object({
    // New unified format
    enabled: z
      .array(z.enum(['quickRise', 'quickFall', 'fixedTimeEntry', 'randomTimeEntry']))
      .optional(),
    pattern: z
      .enum(['quickRise', 'quickFall', 'fixedTimeEntry', 'randomTimeEntry'])
      .or(z.enum(['quickRise', 'quickFall', 'fixedTimeEntry', 'randomTimeEntry']))
      .optional(),
    strategyOptions: z
      .object({
        quickRise: z
          .object({
            risePct: z.number().optional(),
            withinMinutes: z.number().optional(),
          })
          .optional(),
        quickFall: z
          .object({
            fallPct: z.number().optional(),
            withinMinutes: z.number().optional(),
          })
          .optional(),
        fixedTimeEntry: z
          .object({
            entryTime: z
              .string()
              .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:MM format')
              .optional(),
          })
          .optional(),
        randomTimeEntry: z
          .object({
            startTime: z
              .string()
              .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Start time must be in HH:MM format')
              .optional(),
            endTime: z
              .string()
              .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'End time must be in HH:MM format')
              .optional(),
          })
          .optional(),
      })
      .optional(),

    // Legacy inline options (back-compat)
    quickRise: QuickRiseConfigSchema.optional(),
    quickFall: QuickFallConfigSchema.optional(),
    fixedTimeEntry: FixedTimeEntryConfigSchema.optional(),
  })
  .optional();

// Define schema for pattern configurations (legacy structure kept for compatibility)
const PatternsConfigSchema = z
  .object({
    entry: EntryPatternsConfigSchema,
  })
  .default({ entry: {} });

// Schema for date range
const DateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
});

// Schema for default pattern selection
const DefaultPatternsSchema = z.object({
  entry: z.string().default('quickRise'),
});

// Schema for chart options
const ChartOptionsSchema = z.object({
  generate: z.boolean().default(false),
  outputDir: z.string().default('./charts'),
});

// Schema for parallelization options
const ParallelizationOptionsSchema = z.object({
  maxConcurrentDays: z.number().int().min(1).max(20).default(1),
});

// Schema for LLM Confirmation Screen
// Use ExternalLLMScreenConfig to guide the Zod schema definition if needed,
// but Zod schema is the source of truth for validation and type inference here.
const LLMScreenConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    llmProvider: z.enum(['anthropic', 'openai']).default('anthropic'),
    modelName: z.string().default('claude-sonnet-4-20250514'),
    apiKeyEnvVar: z.string().default('ANTHROPIC_API_KEY'),
    numCalls: z.number().int().min(1).default(3),
    agreementThreshold: z.number().int().min(1).default(2),
    temperatures: z.array(z.number()).default([0.2, 0.5, 0.8]),
    prompts: z
      .union([z.string(), z.array(z.string())])
      .default(
        'You are an experienced day trader. Based on this chart, what action would you take: go long, short, or do nothing? Provide a brief one-sentence rationalization for your decision.'
      ),
    commonPromptSuffixForJson: z
      .string()
      .optional()
      .default(
        'Your response MUST be a valid JSON object and nothing else. For example: `{"action": "long", "rationalization": "Price broke resistance with volume.", "proposedStopLoss": 123.45, "proposedProfitTarget": 125.67}`'
      ),
    systemPrompt: z.string().optional(),
    maxOutputTokens: z.number().int().min(1).default(150),
    timeoutMs: z.number().int().optional(),
  })
  .default({
    enabled: false,
    llmProvider: 'anthropic',
    modelName: 'claude-sonnet-4-20250514',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    numCalls: 3,
    agreementThreshold: 2,
    temperatures: [0.2, 0.5, 0.8],
    prompts:
      'You are an experienced day trader. Based on this chart, what action would you take: go long, short, or do nothing? Provide a brief one-sentence rationalization for your decision.',
    commonPromptSuffixForJson:
      'Your response MUST be a valid JSON object and nothing else. For example: `{"action": "long", "rationalization": "Price broke resistance with volume.", "proposedStopLoss": 123.45, "proposedProfitTarget": 125.67}`',
    maxOutputTokens: 150,
  });

// Infer the type from Zod schema, this will be our internal LLMScreenConfig type
// This ensures consistency between Zod validation and TypeScript types.
export type LLMScreenConfig = z.infer<typeof LLMScreenConfigSchema>;

// Define the root config schema
const ConfigSchema = z
  .object({
    default: z.object({
      date: DateRangeSchema.optional(),
      ticker: z.string().default('SPY'),
      timeframe: z.string().default('1min'),
      direction: z.enum(['long', 'short', 'llm_decides']).default('long'),
      patterns: DefaultPatternsSchema.optional(),
      charts: ChartOptionsSchema.optional(),
      parallelization: ParallelizationOptionsSchema.optional(),
      // NEW: Add exitStrategies to default config
      exitStrategies: ExitStrategiesConfigSchema.optional(),
    }),
    entry: EntryRootConfigSchema, // root-level entry configuration (optional)
    patterns: PatternsConfigSchema, // legacy; defaults to { entry: {} } if missing
    llmConfirmationScreen: LLMScreenConfigSchema.optional(),
    // Prefer 'exit' but accept legacy 'exitStrategies'
    exit: ExitStrategiesConfigSchema.optional(),
    exitStrategies: ExitStrategiesConfigSchema.optional(),
  })
  .refine(
    data => {
      if (data.default.direction === 'llm_decides') {
        return data.llmConfirmationScreen?.enabled === true;
      }
      return true;
    },
    {
      message:
        "If default.direction is 'llm_decides', then llmConfirmationScreen.enabled must be true",
      path: ['default', 'direction'], // Path to report error on
    }
  );

// Type for the validated config
export type Config = z.infer<typeof ConfigSchema>;
export type ExitStrategiesConfig = z.infer<typeof ExitStrategiesConfigSchema>; // Exporting for use elsewhere

// Export types for each strategy configuration
export type StopLossConfig = z.infer<typeof StopLossConfigSchema>;
export type ProfitTargetConfig = z.infer<typeof ProfitTargetConfigSchema>;
export type TrailingStopConfig = z.infer<typeof TrailingStopConfigSchema>;
export type EndOfDayConfig = z.infer<typeof EndOfDayConfigSchema>;
export type MaxHoldTimeConfig = z.infer<typeof MaxHoldTimeConfigSchema>;
export type SlippageConfig = z.infer<typeof SlippageConfigSchema>;

/**
 * Default configuration when no config file exists
 */
const DEFAULT_CONFIG: Config = {
  default: {
    ticker: 'SPY',
    timeframe: '1min',
    direction: 'long',
    patterns: {
      entry: 'quickRise',
    },
    charts: {
      generate: false,
      outputDir: './charts',
    },
    exitStrategies: {
      enabled: [],
      maxHoldTime: {
        minutes: 60,
      },
      endOfDay: {
        time: '16:00',
      },
      strategyOptions: {
        stopLoss: {
          percentFromEntry: 1.0,
          useLlmProposedPrice: false,
        },
        profitTarget: {
          percentFromEntry: 2.0,
          useLlmProposedPrice: false,
        },
        trailingStop: {
          activationPercent: 1.0,
          trailPercent: 0.5,
        },
      },
      slippage: {
        model: 'percent',
        value: 0.05,
      },
    },
  },
  patterns: {
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
        entryTime: '13:00', // Default to 1 PM for testing, but should be configurable
      },
    },
  },
  llmConfirmationScreen: LLMScreenConfigSchema.parse({
    // systemPrompt will be undefined by default due to .optional()
    // Explicitly set a default system prompt if desired when creating the config file
  }),
  exitStrategies: {
    enabled: [],
    maxHoldTime: {
      minutes: 60,
    },
    endOfDay: {
      time: '16:00',
    },
    strategyOptions: {
      stopLoss: {
        percentFromEntry: 1.0,
        useLlmProposedPrice: false,
      },
      profitTarget: {
        percentFromEntry: 2.0,
        useLlmProposedPrice: false,
      },
      trailingStop: {
        activationPercent: 1.0,
        trailPercent: 0.5,
      },
    },
    slippage: {
      model: 'percent',
      value: 0.05,
    },
  },
};

/**
 * Load configuration from a YAML file
 *
 * @param configPath - Path to the configuration file
 * @returns Validated configuration object
 */
export const loadConfig = (configPath?: string): Config => {
  const defaultConfigPath = path.join(process.cwd(), 'alphagroove.config.yaml');
  const configFilePath = configPath || defaultConfigPath;

  try {
    if (fs.existsSync(configFilePath)) {
      const fileContents = fs.readFileSync(configFilePath, 'utf8');
      const configData = yaml.load(fileContents) as Record<string, unknown>;

      // Parse and validate the config
      return ConfigSchema.parse(configData);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Invalid configuration file:');
      const issues = (
        error as unknown as { issues?: Array<{ path: Array<string | number>; message: string }> }
      ).issues;
      if (issues && Array.isArray(issues)) {
        issues.forEach(err => {
          const path = Array.isArray(err.path) ? err.path.join('.') : '';
          console.error(`- ${path}: ${err.message}`);
        });
      } else {
        console.error(String(error));
      }
    } else {
      console.error(
        `Error loading config file: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Return default config if no file or invalid
  console.log(
    'Using default configuration as alphagroove.config.yaml was not found or was invalid.'
  );
  return DEFAULT_CONFIG;
};

/**
 * Creates a default configuration file if none exists
 */
export const createDefaultConfigFile = (): void => {
  const configPath = path.join(process.cwd(), 'alphagroove.config.yaml');

  if (!fs.existsSync(configPath)) {
    const completeDefaultConfig: z.input<typeof ConfigSchema> = {
      default: {
        ticker: 'SPY',
        timeframe: '1min',
        direction: 'long',
        patterns: {
          entry: 'quickRise',
        },
        charts: {
          generate: false,
          outputDir: './charts',
        },
        exitStrategies: {
          enabled: [],
          maxHoldTime: {
            minutes: 60,
          },
          endOfDay: {
            time: '16:00',
          },
          strategyOptions: {
            stopLoss: {
              percentFromEntry: 1.0,
              useLlmProposedPrice: false,
            },
            profitTarget: {
              percentFromEntry: 2.0,
              useLlmProposedPrice: false,
            },
            trailingStop: {
              activationPercent: 1.0,
              trailPercent: 0.5,
            },
          },
          slippage: {
            model: 'percent',
            value: 0.05,
          },
        },
      },
      patterns: {
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
            entryTime: '12:00',
          },
        },
      },
      llmConfirmationScreen: {
        ...LLMScreenConfigSchema.parse({}),
        systemPrompt:
          'You are an AI assistant that strictly follows user instructions for output format. You will be provided with a task and an example of the JSON output required. Respond ONLY with the valid JSON object described.',
      },
      exitStrategies: {
        enabled: [],
        maxHoldTime: {
          minutes: 60,
        },
        endOfDay: {
          time: '16:00',
        },
        strategyOptions: {
          stopLoss: {
            percentFromEntry: 1.0,
            useLlmProposedPrice: false,
          },
          profitTarget: {
            percentFromEntry: 2.0,
            useLlmProposedPrice: false,
          },
          trailingStop: {
            activationPercent: 1.0,
            trailPercent: 0.5,
          },
        },
        slippage: {
          model: 'percent',
          value: 0.05,
        },
      },
    };

    const yamlContent = yaml.dump(completeDefaultConfig, {
      indent: 2,
      lineWidth: 100,
      quotingType: '"',
    });

    fs.writeFileSync(configPath, yamlContent, 'utf8');
    console.log(`Created default configuration file: ${configPath}`);
  }
};

/**
 * Merged configuration interface with added pattern-specific properties
 */
export interface MergedConfig {
  ticker: string;
  timeframe: string;
  direction: 'long' | 'short' | 'llm_decides';
  from: string;
  to: string;
  entryPattern: string;
  generateCharts: boolean;
  chartsDir: string;
  maxConcurrentDays: number;
  llmConfirmationScreen?: LLMScreenConfig;
  exitStrategies?: ExitStrategiesConfig; // NEW: Add exitStrategies
  quickRise?: Record<string, any>;
  quickFall?: Record<string, any>;
  fixedTimeEntry?: Record<string, any>;
  randomTimeEntry?: Record<string, any>;
  [key: string]: any;
}

/**
 * Merge CLI options with configuration file
 *
 * @param config - The loaded configuration
 * @param cliOptions - Command line options
 * @returns Merged configuration
 */
export const mergeConfigWithCliOptions = (
  loadedConfig: Config,
  cliOptions: Record<string, any>
): MergedConfig => {
  const normalizeEntryName = (name: string | undefined): string | undefined => {
    if (!name) return undefined;
    const map: Record<string, string> = {
      quickRise: 'quickRise',
      quickFall: 'quickFall',
      fixedTimeEntry: 'fixedTimeEntry',
      randomTimeEntry: 'randomTimeEntry',
      'quick-rise': 'quickRise',
      'quick-fall': 'quickFall',
      'fixed-time-entry': 'fixedTimeEntry',
      'random-time-entry': 'randomTimeEntry',
    };
    return map[name] || name;
  };

  const defaultEntryPattern =
    normalizeEntryName((loadedConfig.entry as any)?.enabled?.[0] as string | undefined) ||
    normalizeEntryName(loadedConfig.entry?.pattern as string | undefined) ||
    loadedConfig.default.patterns?.entry ||
    'quick-rise';

  // Get exit strategies configurations from different sources (prefer new 'exit')
  const rootFromLoaded = (loadedConfig as any).exit || loadedConfig.exitStrategies;

  // Exit strategies are configured at the ROOT level only
  const enabledArray = rootFromLoaded?.enabled || [];

  // Create merged exit strategies with strategyOptions-only structure
  const mergedExitStrategies: ExitStrategiesConfig = {
    enabled: enabledArray,
    // maxHoldTime stays at base level and is automatically active when configured
    maxHoldTime: (rootFromLoaded as any)?.maxHoldTime
      ? {
          minutes:
            (rootFromLoaded as any)?.maxHoldTime?.minutes ??
            MaxHoldTimeConfigSchema.parse({}).minutes,
        }
      : undefined,
    // endOfDay stays at base level and is automatically active when configured
    endOfDay: (rootFromLoaded as any)?.endOfDay
      ? {
          time: (rootFromLoaded as any)?.endOfDay?.time ?? EndOfDayConfigSchema.parse({}).time,
        }
      : undefined,
    // All other strategies must be in strategyOptions
    strategyOptions: {
      stopLoss: enabledArray?.includes('stopLoss')
        ? {
            percentFromEntry:
              (rootFromLoaded as any)?.strategyOptions?.stopLoss?.percentFromEntry ??
              StopLossConfigSchema.parse({}).percentFromEntry,
            atrMultiplier: (rootFromLoaded as any)?.strategyOptions?.stopLoss?.atrMultiplier,
            useLlmProposedPrice:
              (rootFromLoaded as any)?.strategyOptions?.stopLoss?.useLlmProposedPrice ?? false,
          }
        : undefined,
      profitTarget: enabledArray?.includes('profitTarget')
        ? {
            percentFromEntry:
              (rootFromLoaded as any)?.strategyOptions?.profitTarget?.percentFromEntry ??
              ProfitTargetConfigSchema.parse({}).percentFromEntry,
            atrMultiplier: (rootFromLoaded as any)?.strategyOptions?.profitTarget?.atrMultiplier,
            useLlmProposedPrice:
              (rootFromLoaded as any)?.strategyOptions?.profitTarget?.useLlmProposedPrice ?? false,
          }
        : undefined,
      trailingStop: enabledArray?.includes('trailingStop')
        ? (() => {
            const configActivationAtr = (rootFromLoaded as any)?.strategyOptions?.trailingStop
              ?.activationAtrMultiplier;
            const configTrailAtr = (rootFromLoaded as any)?.strategyOptions?.trailingStop
              ?.trailAtrMultiplier;

            const configActivationPercent = (rootFromLoaded as any)?.strategyOptions?.trailingStop
              ?.activationPercent;
            const configTrailPercent = (rootFromLoaded as any)?.strategyOptions?.trailingStop
              ?.trailPercent;

            const result = {
              // Only use percentage-based defaults if ATR-based values aren't specified
              activationPercent:
                configActivationPercent ?? (configActivationAtr !== undefined ? undefined : 1.0),
              trailPercent: configTrailPercent ?? (configTrailAtr !== undefined ? undefined : 0.5),
              activationAtrMultiplier: configActivationAtr,
              trailAtrMultiplier: configTrailAtr,
            };

            return result;
          })()
        : undefined,
    },
    slippage: {
      model: rootFromLoaded?.slippage?.model ?? SlippageConfigSchema.parse({}).model,
      value: rootFromLoaded?.slippage?.value ?? SlippageConfigSchema.parse({}).value,
    },
  };

  const mergedConfig: MergedConfig = {
    ticker: cliOptions.ticker || loadedConfig.default.ticker,
    timeframe: cliOptions.timeframe || loadedConfig.default.timeframe,
    direction: cliOptions.direction || loadedConfig.default.direction,
    from: cliOptions.from || loadedConfig.default.date?.from || '2010-01-01',
    to: cliOptions.to || loadedConfig.default.date?.to || '2025-12-31',
    entryPattern: cliOptions.entryPattern || cliOptions['entry-pattern'] || defaultEntryPattern,
    generateCharts:
      cliOptions.generateCharts !== undefined
        ? cliOptions.generateCharts
        : loadedConfig.default.charts?.generate || false,
    chartsDir: cliOptions.chartsDir || loadedConfig.default.charts?.outputDir || './charts',
    maxConcurrentDays:
      cliOptions.maxConcurrentDays || loadedConfig.default.parallelization?.maxConcurrentDays || 1,
    llmConfirmationScreen: loadedConfig.llmConfirmationScreen
      ? {
          ...LLMScreenConfigSchema.parse({}),
          ...loadedConfig.llmConfirmationScreen,
        }
      : LLMScreenConfigSchema.parse({}),
    exitStrategies: mergedExitStrategies,
  };

  const patternOptions: Record<string, Record<string, any>> = {};
  Object.entries(cliOptions).forEach(([key, value]) => {
    if (key.includes('.')) {
      const [patternName, optionName] = key.split('.');
      if (
        [
          mergedConfig.entryPattern,
          'quickRise',
          'quickFall',
          'fixedTimeEntry',
          'randomTimeEntry',
        ].includes(patternName)
      ) {
        if (!patternOptions[patternName]) {
          patternOptions[patternName] = {};
        }
        patternOptions[patternName][optionName] = value;
      }
    }
  });

  // Seed with legacy patterns.entry configs
  if (loadedConfig.patterns.entry.quickRise) {
    mergedConfig.quickRise = { ...loadedConfig.patterns.entry.quickRise };
  }
  if (loadedConfig.patterns.entry.quickFall) {
    mergedConfig.quickFall = { ...loadedConfig.patterns.entry.quickFall };
  }
  if (loadedConfig.patterns.entry.fixedTimeEntry) {
    mergedConfig.fixedTimeEntry = { ...loadedConfig.patterns.entry.fixedTimeEntry };
  }
  if (loadedConfig.patterns.entry.randomTimeEntry) {
    mergedConfig.randomTimeEntry = { ...loadedConfig.patterns.entry.randomTimeEntry };
  }

  // Overlay root-level entry options if provided
  if (loadedConfig.entry) {
    if ((loadedConfig.entry as any).quickRise) {
      mergedConfig.quickRise = {
        ...(mergedConfig.quickRise || {}),
        ...(loadedConfig.entry as any).quickRise,
      };
    }
    if ((loadedConfig.entry as any).quickFall) {
      mergedConfig.quickFall = {
        ...(mergedConfig.quickFall || {}),
        ...(loadedConfig.entry as any).quickFall,
      };
    }
    if ((loadedConfig.entry as any).fixedTimeEntry) {
      mergedConfig.fixedTimeEntry = {
        ...(mergedConfig.fixedTimeEntry || {}),
        ...(loadedConfig.entry as any).fixedTimeEntry,
      };
    }
    if ((loadedConfig.entry as any).randomTimeEntry) {
      mergedConfig.randomTimeEntry = {
        ...(mergedConfig.randomTimeEntry || {}),
        ...(loadedConfig.entry as any).randomTimeEntry,
      };
    }

    // Handle new strategyOptions format
    const strategyOptions = (loadedConfig.entry as any)?.strategyOptions;
    if (strategyOptions) {
      // Map quickRise
      if (strategyOptions.quickRise) {
        mergedConfig.quickRise = {
          ...(mergedConfig.quickRise || {}),
          risePct: strategyOptions.quickRise.risePct,
          withinMinutes: strategyOptions.quickRise.withinMinutes,
        };
      }

      // Map quickFall
      if (strategyOptions.quickFall) {
        mergedConfig.quickFall = {
          ...(mergedConfig.quickFall || {}),
          fallPct: strategyOptions.quickFall.fallPct,
          withinMinutes: strategyOptions.quickFall.withinMinutes,
        };
      }

      // Map fixedTimeEntry
      if (strategyOptions.fixedTimeEntry) {
        mergedConfig.fixedTimeEntry = {
          ...(mergedConfig.fixedTimeEntry || {}),
          entryTime: strategyOptions.fixedTimeEntry.entryTime,
        };
      }

      // Map randomTimeEntry
      if (strategyOptions.randomTimeEntry) {
        mergedConfig.randomTimeEntry = {
          ...(mergedConfig.randomTimeEntry || {}),
          startTime: strategyOptions.randomTimeEntry.startTime,
          endTime: strategyOptions.randomTimeEntry.endTime,
        };
      }
    }
  }

  Object.entries(patternOptions).forEach(([pattern, options]) => {
    if (!mergedConfig[pattern]) {
      if (pattern === 'quickRise' && loadedConfig.patterns.entry.quickRise) {
        mergedConfig[pattern] = { ...loadedConfig.patterns.entry.quickRise };
      } else if (pattern === 'quickFall' && loadedConfig.patterns.entry.quickFall) {
        mergedConfig[pattern] = { ...loadedConfig.patterns.entry.quickFall };
      } else if (pattern === 'fixedTimeEntry' && loadedConfig.patterns.entry.fixedTimeEntry) {
        mergedConfig[pattern] = { ...loadedConfig.patterns.entry.fixedTimeEntry };
      } else if (pattern === 'randomTimeEntry' && loadedConfig.patterns.entry.randomTimeEntry) {
        mergedConfig[pattern] = { ...loadedConfig.patterns.entry.randomTimeEntry };
      } else {
        mergedConfig[pattern] = {};
      }
    }
    mergedConfig[pattern] = { ...mergedConfig[pattern], ...options };
  });

  // Handle legacy CLI options for backward compatibility
  if (mergedConfig.entryPattern === 'quickRise' && cliOptions.risePct !== undefined) {
    if (!mergedConfig.quickRise) mergedConfig.quickRise = {};
    mergedConfig.quickRise.risePct = parseFloat(cliOptions.risePct as string);
  }
  if (mergedConfig.entryPattern === 'quickFall' && cliOptions.fallPct !== undefined) {
    if (!mergedConfig.quickFall) mergedConfig.quickFall = {};
    mergedConfig.quickFall.fallPct = parseFloat(cliOptions.fallPct as string);
  }

  const patternNamesFromConfig = Object.keys(loadedConfig.patterns.entry);
  patternNamesFromConfig.forEach(patternName => {
    if (cliOptions[patternName] && typeof cliOptions[patternName] === 'object') {
      mergedConfig[patternName] = {
        ...mergedConfig[patternName],
        ...cliOptions[patternName],
      };
    }
  });

  if (cliOptions.quickRise && typeof cliOptions.quickRise === 'object') {
    mergedConfig.quickRise = {
      ...(mergedConfig.quickRise || {}),
      ...cliOptions.quickRise,
    };
  }
  if (cliOptions.quickFall && typeof cliOptions.quickFall === 'object') {
    mergedConfig.quickFall = {
      ...(mergedConfig.quickFall || {}),
      ...cliOptions.quickFall,
    };
  }
  if (cliOptions.fixedTimeEntry && typeof cliOptions.fixedTimeEntry === 'object') {
    mergedConfig.fixedTimeEntry = {
      ...(mergedConfig.fixedTimeEntry || {}),
      ...cliOptions.fixedTimeEntry,
    };
  }
  if (cliOptions.randomTimeEntry && typeof cliOptions.randomTimeEntry === 'object') {
    mergedConfig.randomTimeEntry = {
      ...(mergedConfig.randomTimeEntry || {}),
      ...cliOptions.randomTimeEntry,
    };
  }

  if (cliOptions.generateCharts === true && mergedConfig.generateCharts === false) {
    mergedConfig.generateCharts = true;
  }

  return mergedConfig;
};
