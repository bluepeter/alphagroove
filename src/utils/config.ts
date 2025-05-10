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

// Define schema for the fixed-time pattern
const FixedTimeConfigSchema = z.object({
  'hold-minutes': z.number().default(10),
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

// Define schema for exit pattern configurations
const ExitPatternsConfigSchema = z.object({
  'fixed-time': FixedTimeConfigSchema.optional(),
});

// Define schema for pattern configurations
const PatternsConfigSchema = z.object({
  entry: EntryPatternsConfigSchema,
  exit: ExitPatternsConfigSchema,
});

// Schema for date range
const DateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
});

// Schema for default pattern selection
const DefaultPatternsSchema = z.object({
  entry: z.string().default('quick-rise'),
  exit: z.string().default('fixed-time'),
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
    }),
    patterns: PatternsConfigSchema,
    llmConfirmationScreen: LLMScreenConfigSchema.optional(),
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
      exit: 'fixed-time',
    },
    charts: {
      generate: false,
      outputDir: './charts',
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
    exit: {
      'fixed-time': {
        'hold-minutes': 10,
      },
    },
  },
  llmConfirmationScreen: LLMScreenConfigSchema.parse({
    // systemPrompt will be undefined by default due to .optional()
    // Explicitly set a default system prompt if desired when creating the config file
  }),
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
          exit: 'fixed-time',
        },
        charts: {
          generate: false,
          outputDir: './charts',
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
        exit: {
          'fixed-time': {
            'hold-minutes': 10,
          },
        },
      },
      llmConfirmationScreen: {
        ...LLMScreenConfigSchema.parse({}),
        systemPrompt:
          'You are an AI assistant that strictly follows user instructions for output format. You will be provided with a task and an example of the JSON output required. Respond ONLY with the valid JSON object described.',
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
  exitPattern: string;
  generateCharts: boolean;
  chartsDir: string;
  llmConfirmationScreen?: LLMScreenConfig;
  'quick-rise'?: Record<string, any>;
  'quick-fall'?: Record<string, any>;
  'fixed-time'?: Record<string, any>;
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
  const defaultExitPattern = loadedConfig.default.patterns?.exit || 'fixed-time';

  const mergedConfig: MergedConfig = {
    ticker: cliOptions.ticker || loadedConfig.default.ticker,
    timeframe: cliOptions.timeframe || loadedConfig.default.timeframe,
    direction: cliOptions.direction || loadedConfig.default.direction,
    from: cliOptions.from || loadedConfig.default.date?.from || '2010-01-01',
    to: cliOptions.to || loadedConfig.default.date?.to || '2025-12-31',
    entryPattern: cliOptions.entryPattern || cliOptions['entry-pattern'] || defaultEntryPattern,
    exitPattern: cliOptions.exitPattern || cliOptions['exit-pattern'] || defaultExitPattern,
    generateCharts:
      cliOptions.generateCharts !== undefined
        ? cliOptions.generateCharts
        : loadedConfig.default.charts?.generate || false,
    chartsDir: cliOptions.chartsDir || loadedConfig.default.charts?.outputDir || './charts',
    llmConfirmationScreen: loadedConfig.llmConfirmationScreen
      ? {
          ...LLMScreenConfigSchema.parse({}), // Ensure all defaults from Zod schema
          ...loadedConfig.llmConfirmationScreen, // Then overlay loaded YAML values
        }
      : LLMScreenConfigSchema.parse({}), // Fallback to schema defaults if not in YAML
  };

  const patternOptions: Record<string, Record<string, any>> = {};
  Object.entries(cliOptions).forEach(([key, value]) => {
    if (key.includes('.')) {
      const [patternName, optionName] = key.split('.');
      if (
        [
          mergedConfig.entryPattern,
          mergedConfig.exitPattern,
          'quick-rise',
          'quick-fall',
          'fixed-time',
        ].includes(patternName)
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
  if (loadedConfig.patterns.exit['fixed-time']) {
    mergedConfig['fixed-time'] = { ...loadedConfig.patterns.exit['fixed-time'] };
  }

  Object.entries(patternOptions).forEach(([pattern, options]) => {
    if (!mergedConfig[pattern]) {
      if (pattern === 'quick-rise' && loadedConfig.patterns.entry['quick-rise']) {
        mergedConfig[pattern] = { ...loadedConfig.patterns.entry['quick-rise'] };
      } else if (pattern === 'quick-fall' && loadedConfig.patterns.entry['quick-fall']) {
        mergedConfig[pattern] = { ...loadedConfig.patterns.entry['quick-fall'] };
      } else if (pattern === 'fixed-time' && loadedConfig.patterns.exit['fixed-time']) {
        mergedConfig[pattern] = { ...loadedConfig.patterns.exit['fixed-time'] };
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
  if (mergedConfig.exitPattern === 'fixed-time' && cliOptions.holdMinutes !== undefined) {
    if (!mergedConfig['fixed-time']) mergedConfig['fixed-time'] = {};
    mergedConfig['fixed-time']['hold-minutes'] = parseInt(cliOptions.holdMinutes as string, 10);
  }

  const patternNamesFromConfig = Object.keys(loadedConfig.patterns.entry).concat(
    Object.keys(loadedConfig.patterns.exit)
  );
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
  if (cliOptions['fixed-time'] && typeof cliOptions['fixed-time'] === 'object') {
    mergedConfig['fixed-time'] = {
      ...(mergedConfig['fixed-time'] || {}),
      ...cliOptions['fixed-time'],
    };
  }

  if (cliOptions.generateCharts === true && mergedConfig.generateCharts === false) {
    mergedConfig.generateCharts = true;
  }

  return mergedConfig;
};
