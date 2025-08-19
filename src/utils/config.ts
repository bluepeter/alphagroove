import fs from 'fs';
import path from 'path';

import yaml from 'js-yaml';
import { z } from 'zod';

// Define schema for the quick-rise pattern
const QuickRiseConfigSchema = z.object({
  'rise-pct': z.number().default(0.3),
  'within-minutes': z.number().default(5),
});

// Define schema for the quick-fall pattern
const QuickFallConfigSchema = z.object({
  'fall-pct': z.number().default(0.3),
  'within-minutes': z.number().default(5),
});

// Define schema for the Fixed Time Entry pattern configuration
const FixedTimeEntryConfigSchema = z.object({
  'entry-time': z
    .string()
    .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:MM format'),
});

// Define schema for entry pattern configurations
const EntryPatternsConfigSchema = z.object({
  'quick-rise': QuickRiseConfigSchema.optional(),
  'quick-fall': QuickFallConfigSchema.optional(),
  'fixed-time-entry': FixedTimeEntryConfigSchema.optional(),
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
    maxHoldTime: MaxHoldTimeConfigSchema.optional(),
    stopLoss: StopLossConfigSchema.optional(),
    profitTarget: ProfitTargetConfigSchema.optional(),
    trailingStop: TrailingStopConfigSchema.optional(),
    endOfDay: EndOfDayConfigSchema.optional(),
    slippage: SlippageConfigSchema.optional(),
    strategyOptions: z
      .object({
        maxHoldTime: MaxHoldTimeConfigSchema.optional(),
        stopLoss: StopLossConfigSchema.optional(),
        profitTarget: ProfitTargetConfigSchema.optional(),
        trailingStop: TrailingStopConfigSchema.optional(),
        endOfDay: EndOfDayConfigSchema.optional(),
      })
      .optional(),
  })
  .default({ enabled: [] });

// Optional root-level Entry configuration (preferred going forward)
const EntryRootConfigSchema = z
  .object({
    // New unified format
    enabled: z.array(z.enum(['quickRise', 'quickFall', 'fixedTimeEntry'])).optional(),
    pattern: z
      .enum(['quick-rise', 'quick-fall', 'fixed-time-entry'])
      .or(z.enum(['quickRise', 'quickFall', 'fixedTimeEntry']))
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
      })
      .optional(),

    // Legacy inline options (back-compat)
    'quick-rise': QuickRiseConfigSchema.optional(),
    'quick-fall': QuickFallConfigSchema.optional(),
    'fixed-time-entry': FixedTimeEntryConfigSchema.optional(),
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
  entry: z.string().default('quick-rise'),
});

// Schema for chart options
const ChartOptionsSchema = z.object({
  generate: z.boolean().default(false),
  outputDir: z.string().default('./charts'),
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
      entry: 'quick-rise',
    },
    charts: {
      generate: false,
      outputDir: './charts',
    },
    exitStrategies: {
      enabled: ['maxHoldTime'],
      maxHoldTime: {
        minutes: 60,
      },
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
      endOfDay: {
        time: '16:00',
      },
      slippage: {
        model: 'percent',
        value: 0.05,
      },
    },
  },
  patterns: {
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
        'entry-time': '13:00', // Default to 1 PM for testing, but should be configurable
      },
    },
  },
  llmConfirmationScreen: LLMScreenConfigSchema.parse({
    // systemPrompt will be undefined by default due to .optional()
    // Explicitly set a default system prompt if desired when creating the config file
  }),
  exitStrategies: {
    enabled: ['maxHoldTime'],
    maxHoldTime: {
      minutes: 60,
    },
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
    endOfDay: {
      time: '16:00',
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
          entry: 'quick-rise',
        },
        charts: {
          generate: false,
          outputDir: './charts',
        },
        exitStrategies: {
          enabled: ['maxHoldTime'],
          maxHoldTime: {
            minutes: 60,
          },
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
          endOfDay: {
            time: '16:00',
          },
          slippage: {
            model: 'percent',
            value: 0.05,
          },
        },
      },
      patterns: {
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
            'entry-time': '12:00',
          },
        },
      },
      llmConfirmationScreen: {
        ...LLMScreenConfigSchema.parse({}),
        systemPrompt:
          'You are an AI assistant that strictly follows user instructions for output format. You will be provided with a task and an example of the JSON output required. Respond ONLY with the valid JSON object described.',
      },
      exitStrategies: {
        enabled: ['maxHoldTime'],
        maxHoldTime: {
          minutes: 60,
        },
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
        endOfDay: {
          time: '16:00',
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
  llmConfirmationScreen?: LLMScreenConfig;
  exitStrategies?: ExitStrategiesConfig; // NEW: Add exitStrategies
  'quick-rise'?: Record<string, any>;
  'quick-fall'?: Record<string, any>;
  'fixed-time-entry'?: Record<string, any>; // Added for consistency, was missing before
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
      quickRise: 'quick-rise',
      quickFall: 'quick-fall',
      fixedTimeEntry: 'fixed-time-entry',
      'quick-rise': 'quick-rise',
      'quick-fall': 'quick-fall',
      'fixed-time-entry': 'fixed-time-entry',
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

  // Create merged exit strategies with all configurations merged properly
  const mergedExitStrategies: ExitStrategiesConfig = {
    enabled: enabledArray,
    maxHoldTime: enabledArray?.includes('maxHoldTime')
      ? {
          minutes:
            (rootFromLoaded as any)?.strategyOptions?.maxHoldTime?.minutes ??
            (rootFromLoaded as any)?.maxHoldTime?.minutes ??
            MaxHoldTimeConfigSchema.parse({}).minutes,
        }
      : undefined,
    stopLoss: enabledArray?.includes('stopLoss')
      ? {
          percentFromEntry:
            (rootFromLoaded as any)?.strategyOptions?.stopLoss?.percentFromEntry ??
            (rootFromLoaded as any)?.stopLoss?.percentFromEntry ??
            StopLossConfigSchema.parse({}).percentFromEntry,
          atrMultiplier:
            (rootFromLoaded as any)?.strategyOptions?.stopLoss?.atrMultiplier ??
            (rootFromLoaded as any)?.stopLoss?.atrMultiplier,
          useLlmProposedPrice:
            (rootFromLoaded as any)?.strategyOptions?.stopLoss?.useLlmProposedPrice ??
            (rootFromLoaded as any)?.stopLoss?.useLlmProposedPrice ??
            false,
        }
      : undefined,
    profitTarget: enabledArray?.includes('profitTarget')
      ? {
          percentFromEntry:
            (rootFromLoaded as any)?.strategyOptions?.profitTarget?.percentFromEntry ??
            (rootFromLoaded as any)?.profitTarget?.percentFromEntry ??
            ProfitTargetConfigSchema.parse({}).percentFromEntry,
          atrMultiplier:
            (rootFromLoaded as any)?.strategyOptions?.profitTarget?.atrMultiplier ??
            (rootFromLoaded as any)?.profitTarget?.atrMultiplier,
          useLlmProposedPrice:
            (rootFromLoaded as any)?.strategyOptions?.profitTarget?.useLlmProposedPrice ??
            (rootFromLoaded as any)?.profitTarget?.useLlmProposedPrice ??
            false,
        }
      : undefined,
    trailingStop: enabledArray?.includes('trailingStop')
      ? (() => {
          const configActivationAtr =
            (rootFromLoaded as any)?.strategyOptions?.trailingStop?.activationAtrMultiplier ??
            (rootFromLoaded as any)?.trailingStop?.activationAtrMultiplier;
          const configTrailAtr =
            (rootFromLoaded as any)?.strategyOptions?.trailingStop?.trailAtrMultiplier ??
            (rootFromLoaded as any)?.trailingStop?.trailAtrMultiplier;

          const configActivationPercent =
            (rootFromLoaded as any)?.strategyOptions?.trailingStop?.activationPercent ??
            (rootFromLoaded as any)?.trailingStop?.activationPercent;
          const configTrailPercent =
            (rootFromLoaded as any)?.strategyOptions?.trailingStop?.trailPercent ??
            (rootFromLoaded as any)?.trailingStop?.trailPercent;

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
    endOfDay: enabledArray?.includes('endOfDay')
      ? {
          time:
            (rootFromLoaded as any)?.strategyOptions?.endOfDay?.time ??
            (rootFromLoaded as any)?.endOfDay?.time ??
            EndOfDayConfigSchema.parse({}).time,
        }
      : undefined,
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
        [mergedConfig.entryPattern, 'quick-rise', 'quick-fall', 'fixed-time-entry'].includes(
          patternName
        )
      ) {
        if (!patternOptions[patternName]) {
          patternOptions[patternName] = {};
        }
        patternOptions[patternName][optionName] = value;
      }
    }
  });

  // Seed with legacy patterns.entry configs
  if (loadedConfig.patterns.entry['quick-rise']) {
    mergedConfig['quick-rise'] = { ...loadedConfig.patterns.entry['quick-rise'] };
  }
  if (loadedConfig.patterns.entry['quick-fall']) {
    mergedConfig['quick-fall'] = { ...loadedConfig.patterns.entry['quick-fall'] };
  }
  if (loadedConfig.patterns.entry['fixed-time-entry']) {
    mergedConfig['fixed-time-entry'] = { ...loadedConfig.patterns.entry['fixed-time-entry'] };
  }

  // Overlay root-level entry options if provided
  if (loadedConfig.entry) {
    if ((loadedConfig.entry as any)['quick-rise']) {
      mergedConfig['quick-rise'] = {
        ...(mergedConfig['quick-rise'] || {}),
        ...(loadedConfig.entry as any)['quick-rise'],
      };
    }
    if ((loadedConfig.entry as any)['quick-fall']) {
      mergedConfig['quick-fall'] = {
        ...(mergedConfig['quick-fall'] || {}),
        ...(loadedConfig.entry as any)['quick-fall'],
      };
    }
    if ((loadedConfig.entry as any)['fixed-time-entry']) {
      mergedConfig['fixed-time-entry'] = {
        ...(mergedConfig['fixed-time-entry'] || {}),
        ...(loadedConfig.entry as any)['fixed-time-entry'],
      };
    }

    // Handle new strategyOptions format
    const strategyOptions = (loadedConfig.entry as any)?.strategyOptions;
    if (strategyOptions) {
      // Map quickRise
      if (strategyOptions.quickRise) {
        mergedConfig['quick-rise'] = {
          ...(mergedConfig['quick-rise'] || {}),
          'rise-pct': strategyOptions.quickRise.risePct,
          'within-minutes': strategyOptions.quickRise.withinMinutes,
        };
      }

      // Map quickFall
      if (strategyOptions.quickFall) {
        mergedConfig['quick-fall'] = {
          ...(mergedConfig['quick-fall'] || {}),
          'fall-pct': strategyOptions.quickFall.fallPct,
          'within-minutes': strategyOptions.quickFall.withinMinutes,
        };
      }

      // Map fixedTimeEntry
      if (strategyOptions.fixedTimeEntry) {
        mergedConfig['fixed-time-entry'] = {
          ...(mergedConfig['fixed-time-entry'] || {}),
          'entry-time': strategyOptions.fixedTimeEntry.entryTime,
        };
      }
    }
  }

  Object.entries(patternOptions).forEach(([pattern, options]) => {
    if (!mergedConfig[pattern]) {
      if (pattern === 'quick-rise' && loadedConfig.patterns.entry['quick-rise']) {
        mergedConfig[pattern] = { ...loadedConfig.patterns.entry['quick-rise'] };
      } else if (pattern === 'quick-fall' && loadedConfig.patterns.entry['quick-fall']) {
        mergedConfig[pattern] = { ...loadedConfig.patterns.entry['quick-fall'] };
      } else if (
        pattern === 'fixed-time-entry' &&
        loadedConfig.patterns.entry['fixed-time-entry']
      ) {
        mergedConfig[pattern] = { ...loadedConfig.patterns.entry['fixed-time-entry'] };
      } else {
        mergedConfig[pattern] = {};
      }
    }
    mergedConfig[pattern] = { ...mergedConfig[pattern], ...options };
  });

  // Handle legacy CLI options for backward compatibility
  if (mergedConfig.entryPattern === 'quick-rise' && cliOptions.risePct !== undefined) {
    if (!mergedConfig['quick-rise']) mergedConfig['quick-rise'] = {};
    mergedConfig['quick-rise']['rise-pct'] = parseFloat(cliOptions.risePct as string);
  }
  if (mergedConfig.entryPattern === 'quick-fall' && cliOptions.fallPct !== undefined) {
    if (!mergedConfig['quick-fall']) mergedConfig['quick-fall'] = {};
    mergedConfig['quick-fall']['fall-pct'] = parseFloat(cliOptions.fallPct as string);
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

  if (cliOptions['quick-rise'] && typeof cliOptions['quick-rise'] === 'object') {
    mergedConfig['quick-rise'] = {
      ...(mergedConfig['quick-rise'] || {}),
      ...cliOptions['quick-rise'],
    };
  }
  if (cliOptions['quick-fall'] && typeof cliOptions['quick-fall'] === 'object') {
    mergedConfig['quick-fall'] = {
      ...(mergedConfig['quick-fall'] || {}),
      ...cliOptions['quick-fall'],
    };
  }
  if (cliOptions['fixed-time-entry'] && typeof cliOptions['fixed-time-entry'] === 'object') {
    mergedConfig['fixed-time-entry'] = {
      ...(mergedConfig['fixed-time-entry'] || {}),
      ...cliOptions['fixed-time-entry'],
    };
  }

  if (cliOptions.generateCharts === true && mergedConfig.generateCharts === false) {
    mergedConfig.generateCharts = true;
  }

  return mergedConfig;
};
