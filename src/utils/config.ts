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

// Define schema for entry pattern configurations
const EntryPatternsConfigSchema = z.object({
  'quick-rise': QuickRiseConfigSchema.optional(),
  'quick-fall': QuickFallConfigSchema.optional(),
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

// Define the root config schema
const ConfigSchema = z.object({
  default: z.object({
    date: DateRangeSchema.optional(),
    ticker: z.string().default('SPY'),
    timeframe: z.string().default('1min'),
    direction: z.enum(['long', 'short']).default('long'),
    patterns: DefaultPatternsSchema.optional(),
    charts: ChartOptionsSchema.optional(),
  }),
  patterns: PatternsConfigSchema,
});

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
    },
    exit: {
      'fixed-time': {
        'hold-minutes': 10,
      },
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
  return DEFAULT_CONFIG;
};

/**
 * Creates a default configuration file if none exists
 */
export const createDefaultConfigFile = (): void => {
  const configPath = path.join(process.cwd(), 'alphagroove.config.yaml');

  if (!fs.existsSync(configPath)) {
    const yamlContent = yaml.dump(DEFAULT_CONFIG, {
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
interface MergedConfig {
  ticker: string;
  timeframe: string;
  direction: string;
  from: string;
  to: string;
  entryPattern: string;
  exitPattern: string;
  generateCharts: boolean;
  chartsDir: string;
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
  config: Config,
  cliOptions: Record<string, any>
): MergedConfig => {
  // Get default patterns from config
  const defaultEntryPattern = config.default.patterns?.entry || 'quick-rise';
  const defaultExitPattern = config.default.patterns?.exit || 'fixed-time';

  // Start with the default settings
  const mergedConfig: MergedConfig = {
    // Base options
    ticker: cliOptions.ticker || config.default.ticker,
    timeframe: cliOptions.timeframe || config.default.timeframe,
    direction: cliOptions.direction || config.default.direction,

    // Dates - CLI always takes precedence
    from: cliOptions.from || config.default.date?.from || '2010-01-01',
    to: cliOptions.to || config.default.date?.to || '2025-12-31',

    // Pattern selection - handle both camelCase and kebab-case
    entryPattern: cliOptions.entryPattern || cliOptions['entry-pattern'] || defaultEntryPattern,
    exitPattern: cliOptions.exitPattern || cliOptions['exit-pattern'] || defaultExitPattern,

    // Chart generation options
    generateCharts: cliOptions.generateCharts || config.default.charts?.generate || false,
    chartsDir: cliOptions.chartsDir || config.default.charts?.outputDir || './charts',
  };

  // Handle namespaced options for specific patterns
  // Extract pattern-specific options from CLI (format: pattern.option)
  const patternOptions: Record<string, Record<string, any>> = {};

  // Process CLI options that use the namespaced format (pattern.option)
  Object.entries(cliOptions).forEach(([key, value]) => {
    if (key.includes('.')) {
      const [patternName, optionName] = key.split('.');
      if (!patternOptions[patternName]) {
        patternOptions[patternName] = {};
      }
      patternOptions[patternName][optionName] = value;
    }
  });

  // Add pattern-specific config from default config
  if (mergedConfig.entryPattern === 'quick-rise' && config.patterns.entry['quick-rise']) {
    mergedConfig['quick-rise'] = { ...config.patterns.entry['quick-rise'] };
  } else if (mergedConfig.entryPattern === 'quick-fall' && config.patterns.entry['quick-fall']) {
    mergedConfig['quick-fall'] = { ...config.patterns.entry['quick-fall'] };
  }

  if (mergedConfig.exitPattern === 'fixed-time' && config.patterns.exit['fixed-time']) {
    mergedConfig['fixed-time'] = { ...config.patterns.exit['fixed-time'] };
  }

  // Handle legacy option pattern (backward compatibility)
  if (mergedConfig.entryPattern === 'quick-rise' && cliOptions.risePct !== undefined) {
    if (!mergedConfig['quick-rise']) {
      mergedConfig['quick-rise'] = { ...config.patterns.entry['quick-rise'] };
    }
    mergedConfig['quick-rise']['rise-pct'] = parseFloat(cliOptions.risePct);
  }

  if (mergedConfig.entryPattern === 'quick-fall' && cliOptions.fallPct !== undefined) {
    if (!mergedConfig['quick-fall']) {
      mergedConfig['quick-fall'] = { ...config.patterns.entry['quick-fall'] };
    }
    mergedConfig['quick-fall']['fall-pct'] = parseFloat(cliOptions.fallPct);
  }

  // Apply pattern-specific options from dot notation
  Object.entries(patternOptions).forEach(([pattern, options]) => {
    if (!mergedConfig[pattern]) {
      // If this pattern hasn't been set up yet, use config defaults
      if (pattern === 'quick-rise' && config.patterns.entry['quick-rise']) {
        mergedConfig[pattern] = { ...config.patterns.entry['quick-rise'] };
      } else if (pattern === 'quick-fall' && config.patterns.entry['quick-fall']) {
        mergedConfig[pattern] = { ...config.patterns.entry['quick-fall'] };
      } else if (pattern === 'fixed-time' && config.patterns.exit['fixed-time']) {
        mergedConfig[pattern] = { ...config.patterns.exit['fixed-time'] };
      } else {
        mergedConfig[pattern] = {};
      }
    }

    // Apply the dot notation options
    mergedConfig[pattern] = { ...mergedConfig[pattern], ...options };
  });

  // Override with CLI options for pattern-specific config objects
  if (cliOptions['quick-rise'] && typeof cliOptions['quick-rise'] === 'object') {
    mergedConfig['quick-rise'] = {
      ...mergedConfig['quick-rise'],
      ...cliOptions['quick-rise'],
    };
  }

  if (cliOptions['quick-fall'] && typeof cliOptions['quick-fall'] === 'object') {
    mergedConfig['quick-fall'] = {
      ...mergedConfig['quick-fall'],
      ...cliOptions['quick-fall'],
    };
  }

  if (cliOptions['fixed-time'] && typeof cliOptions['fixed-time'] === 'object') {
    mergedConfig['fixed-time'] = {
      ...mergedConfig['fixed-time'],
      ...cliOptions['fixed-time'],
    };
  }

  return mergedConfig;
};
