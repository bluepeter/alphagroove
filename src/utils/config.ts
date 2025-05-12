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
    .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:MM format')
    .default('12:00'),
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
});

// Profit Target configuration
const ProfitTargetConfigSchema = z.object({
  percentFromEntry: z.number().default(2.0),
  atrMultiplier: z.number().optional(),
});

// Trailing Stop configuration
const TrailingStopConfigSchema = z.object({
  activationPercent: z.number().default(1.0),
  trailPercent: z.number().default(0.5),
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
    enabled: z.array(z.string()).default(['maxHoldTime']),
    maxHoldTime: MaxHoldTimeConfigSchema.optional(),
    stopLoss: StopLossConfigSchema.optional(),
    profitTarget: ProfitTargetConfigSchema.optional(),
    trailingStop: TrailingStopConfigSchema.optional(),
    endOfDay: EndOfDayConfigSchema.optional(),
    slippage: SlippageConfigSchema.optional(),
  })
  .default({
    enabled: ['maxHoldTime'],
  });

// Define schema for pattern configurations
const PatternsConfigSchema = z.object({
  entry: EntryPatternsConfigSchema,
  // exit: ExitPatternsConfigSchema, // Removed
});

// Schema for date range
const DateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
});

// Schema for default pattern selection
const DefaultPatternsSchema = z.object({
  entry: z.string().default('quick-rise'),
  // exit: z.string().default('fixed-time'), // Removed
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
    modelName: z.string().default('claude-3-7-sonnet-latest'),
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
        'Your response MUST be a valid JSON object and nothing else. For example: `{"action": "long", "rationalization": "Price broke resistance with volume."}`'
      ),
    systemPrompt: z.string().optional(),
    maxOutputTokens: z.number().int().min(1).default(150),
    timeoutMs: z.number().int().optional(),
  })
  .default({});

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
    patterns: PatternsConfigSchema,
    llmConfirmationScreen: LLMScreenConfigSchema.optional(),
    // NEW: Add exitStrategies to root config
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
      },
      profitTarget: {
        percentFromEntry: 2.0,
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
    },
    profitTarget: {
      percentFromEntry: 2.0,
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
      error.errors.forEach(err => {
        console.error(`- ${err.path.join('.')}: ${err.message}`);
      });
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
          },
          profitTarget: {
            percentFromEntry: 2.0,
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
        },
        profitTarget: {
          percentFromEntry: 2.0,
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
  const defaultEntryPattern = loadedConfig.default.patterns?.entry || 'quick-rise';

  // Get exit strategies configurations from different sources
  const defaultFromLoaded = loadedConfig.default.exitStrategies;
  const rootFromLoaded = loadedConfig.exitStrategies;
  const schemaDefaultFromZod = ExitStrategiesConfigSchema.parse({});
  const schemaDefaultMinutes = MaxHoldTimeConfigSchema.parse({}).minutes; // 60

  // Determine which enabled array to use with precedence: root > default > schema
  const enabledArray =
    rootFromLoaded?.enabled || defaultFromLoaded?.enabled || schemaDefaultFromZod.enabled;

  // Fix: Correctly determine minutes value with proper precedence
  let finalMhtMinutes: number | undefined;

  // Priority order for maxHoldTime.minutes: root > default > schema default (if enabled)
  if (rootFromLoaded?.maxHoldTime?.minutes !== undefined) {
    finalMhtMinutes = rootFromLoaded.maxHoldTime.minutes;
  } else if (defaultFromLoaded?.maxHoldTime?.minutes !== undefined) {
    finalMhtMinutes = defaultFromLoaded.maxHoldTime.minutes;
  } else if (enabledArray?.includes('maxHoldTime')) {
    finalMhtMinutes = schemaDefaultMinutes;
  }

  const mergedExitStrategies: ExitStrategiesConfig = {
    enabled: enabledArray,
    maxHoldTime:
      enabledArray?.includes('maxHoldTime') && finalMhtMinutes !== undefined
        ? { minutes: finalMhtMinutes }
        : undefined,
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

  if (loadedConfig.patterns.entry['quick-rise']) {
    mergedConfig['quick-rise'] = { ...loadedConfig.patterns.entry['quick-rise'] };
  }
  if (loadedConfig.patterns.entry['quick-fall']) {
    mergedConfig['quick-fall'] = { ...loadedConfig.patterns.entry['quick-fall'] };
  }
  if (loadedConfig.patterns.entry['fixed-time-entry']) {
    mergedConfig['fixed-time-entry'] = { ...loadedConfig.patterns.entry['fixed-time-entry'] };
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
