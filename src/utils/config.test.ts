import { describe, it, expect } from 'vitest';

import { mergeConfigWithCliOptions, Config } from './config';

describe('Configuration System', () => {
  describe('mergeConfigWithCliOptions', () => {
    it('should merge default config with CLI options', () => {
      // Setup
      const config: Config = {
        default: {
          ticker: 'SPY',
          timeframe: '1min',
          direction: 'long',
          date: {
            from: '2023-01-01',
            to: '2023-12-31',
          },
          patterns: {
            entry: 'quick-rise',
            exit: 'fixed-time',
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

      const cliOptions = {
        ticker: 'QQQ',
        from: '2024-01-01',
      };

      // Execute
      const merged = mergeConfigWithCliOptions(config, cliOptions);

      // Verify
      expect(merged).toMatchObject({
        ticker: 'QQQ',
        timeframe: '1min',
        direction: 'long',
        from: '2024-01-01',
        to: '2023-12-31',
        entryPattern: 'quick-rise',
        exitPattern: 'fixed-time',
        'quick-rise': {
          'rise-pct': 0.3,
          'within-minutes': 5,
        },
      });
    });

    it('should handle pattern-specific options with dot notation', () => {
      // Setup
      const config: Config = {
        default: {
          ticker: 'SPY',
          timeframe: '1min',
          direction: 'long',
          patterns: {
            entry: 'quick-rise',
            exit: 'fixed-time',
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

      const cliOptions = {
        'quick-rise.rise-pct': 0.7,
        'fixed-time.hold-minutes': 20,
      };

      // Execute
      const merged = mergeConfigWithCliOptions(config, cliOptions);

      // Verify
      expect(merged).toMatchObject({
        'quick-rise': {
          'rise-pct': 0.7,
          'within-minutes': 5,
        },
        'fixed-time': {
          'hold-minutes': 20,
        },
      });
    });

    it('should handle legacy risePct option for backward compatibility', () => {
      // Setup
      const config: Config = {
        default: {
          ticker: 'SPY',
          timeframe: '1min',
          direction: 'long',
          patterns: {
            entry: 'quick-rise',
            exit: 'fixed-time',
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

      const cliOptions = {
        entryPattern: 'quick-rise',
        risePct: '0.8',
      };

      // Execute
      const merged = mergeConfigWithCliOptions(config, cliOptions);

      // Verify
      expect(merged).toMatchObject({
        entryPattern: 'quick-rise',
        'quick-rise': {
          'rise-pct': 0.8,
          'within-minutes': 5,
        },
      });
    });

    it('should use entry pattern specified in config when not provided in CLI', () => {
      // Setup
      const config: Config = {
        default: {
          ticker: 'SPY',
          timeframe: '1min',
          direction: 'long',
          patterns: {
            entry: 'quick-fall',
            exit: 'fixed-time',
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

      const cliOptions = {};

      // Execute
      const merged = mergeConfigWithCliOptions(config, cliOptions);

      // Verify
      expect(merged.entryPattern).toBe('quick-fall');
      expect(merged.exitPattern).toBe('fixed-time');
    });
  });
});
