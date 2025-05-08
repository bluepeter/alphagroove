import fs from 'fs';
import path from 'path';

import yaml from 'js-yaml';
import { z } from 'zod';

// Define schema for the quick-rise pattern
const QuickRiseConfigSchema = z.object({
  'rise-pct': z.number().default(0.3),
  'within-minutes': z.number().default(5),
});

// Define schema for the fixed-time pattern
const FixedTimeConfigSchema = z.object({
  'hold-minutes': z.number().default(10),
});

// Define schema for pattern configurations
const PatternsConfigSchema = z.object({
  'quick-rise': QuickRiseConfigSchema.optional(),
  'fixed-time': FixedTimeConfigSchema.optional(),
});

// Schema for date range
const DateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
});

// Define the root config schema
const ConfigSchema = z.object({
  default: z.object({
    date: DateRangeSchema.optional(),
    ticker: z.string().default('SPY'),
    timeframe: z.string().default('1min'),
    direction: z.enum(['long', 'short']).default('long'),
  }),
  patterns: PatternsConfigSchema.optional(),
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
  },
  patterns: {
    'quick-rise': {
      'rise-pct': 0.3,
      'within-minutes': 5,
    },
    'fixed-time': {
      'hold-minutes': 10,
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
  'quick-rise'?: Record<string, any>;
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
  // Start with the default settings
  const mergedConfig: MergedConfig = {
    // Base options
    ticker: cliOptions.ticker || config.default.ticker,
    timeframe: cliOptions.timeframe || config.default.timeframe,
    direction: cliOptions.direction || config.default.direction,

    // Dates - CLI always takes precedence
    from: cliOptions.from || config.default.date?.from || '2010-01-01',
    to: cliOptions.to || config.default.date?.to || '2025-12-31',

    // Pattern selection
    entryPattern: cliOptions.entryPattern || 'quick-rise',
    exitPattern: cliOptions.exitPattern || 'fixed-time',
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

  // Handle pattern-specific options
  // For backward compatibility, we still handle old-style CLI options
  if (mergedConfig.entryPattern === 'quick-rise') {
    // Legacy option handling
    if (cliOptions.risePct !== undefined) {
      if (!patternOptions['quick-rise']) {
        patternOptions['quick-rise'] = {};
      }
      patternOptions['quick-rise']['rise-pct'] = parseFloat(cliOptions.risePct);
    }

    // Default values for quick-rise
    const quickRiseDefaults = {
      'rise-pct': 0.3,
      'within-minutes': 5,
    };

    // Merge with config file values for this pattern
    mergedConfig['quick-rise'] = {
      ...quickRiseDefaults,
      ...(config.patterns?.['quick-rise'] || {}),
      ...(patternOptions['quick-rise'] || {}),
    };
  }

  if (mergedConfig.exitPattern === 'fixed-time') {
    // Default values for fixed-time
    const fixedTimeDefaults = {
      'hold-minutes': 10,
    };

    // Merge with config file values for this pattern
    mergedConfig['fixed-time'] = {
      ...fixedTimeDefaults,
      ...(config.patterns?.['fixed-time'] || {}),
      ...(patternOptions['fixed-time'] || {}),
    };
  }

  return mergedConfig;
};
