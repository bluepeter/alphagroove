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
        },
        patterns: {
          'quick-rise': {
            'rise-pct': 0.3,
            'within-minutes': 5,
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
        },
        patterns: {
          'quick-rise': {
            'rise-pct': 0.3,
            'within-minutes': 5,
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
        },
        patterns: {
          'quick-rise': {
            'rise-pct': 0.3,
            'within-minutes': 5,
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
  });
});
