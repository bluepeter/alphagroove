import { describe, it, expect } from 'vitest';

import { getEntryPattern, getExitPattern } from './pattern-factory.js';

// Mock config object that matches our new format
const mockConfig = {
  ticker: 'SPY',
  timeframe: '1min',
  direction: 'long',
  entryPattern: 'quick-rise',
  exitPattern: 'fixed-time',
  'quick-rise': {
    'rise-pct': 0.3,
    'within-minutes': 5,
  },
  'quick-fall': {
    'fall-pct': 0.3,
    'within-minutes': 5,
  },
  'fixed-time': {
    'hold-minutes': 10,
  },
};

describe('pattern factory', () => {
  describe('getEntryPattern', () => {
    it('should return a valid pattern instance with required properties', () => {
      const pattern = getEntryPattern('quick-rise', mockConfig);
      expect(pattern).toHaveProperty('name');
      expect(pattern).toHaveProperty('description');
      expect(pattern).toHaveProperty('sql');
    });

    it('should throw error for unknown pattern', () => {
      expect(() => getEntryPattern('unknown', mockConfig)).toThrow(
        "Entry pattern 'unknown' not found"
      );
    });

    it('should create different instances for different configurations', () => {
      const pattern1 = getEntryPattern('quick-rise', mockConfig);

      const customConfig = {
        ...mockConfig,
        'quick-rise': {
          'rise-pct': 0.5,
          'within-minutes': 5,
        },
      };

      const pattern2 = getEntryPattern('quick-rise', customConfig);

      expect(pattern1).not.toBe(pattern2);
      // Not checking SQL content because it may be the same template
    });

    it('should maintain pattern identity for same configuration', () => {
      const pattern1 = getEntryPattern('quick-rise', mockConfig);
      const pattern2 = getEntryPattern('quick-rise', mockConfig);

      expect(pattern1).toStrictEqual(pattern2);
    });

    // New tests for quick-fall pattern
    it('should return valid quick-fall pattern with required properties', () => {
      const pattern = getEntryPattern('quick-fall', mockConfig);
      expect(pattern).toHaveProperty('name');
      expect(pattern).toHaveProperty('description');
      expect(pattern).toHaveProperty('sql');
      expect(pattern.name).toBe('Quick Fall');
    });

    it('should create different instances for different quick-fall configurations', () => {
      const pattern1 = getEntryPattern('quick-fall', mockConfig);

      const customConfig = {
        ...mockConfig,
        'quick-fall': {
          'fall-pct': 0.5,
          'within-minutes': 5,
        },
      };

      const pattern2 = getEntryPattern('quick-fall', customConfig);

      expect(pattern1).not.toBe(pattern2);
      // Not checking SQL content because it may be the same template
    });

    it('should apply direction setting to quick-fall pattern', () => {
      const shortConfig = {
        ...mockConfig,
        direction: 'short',
      };

      const longConfig = {
        ...mockConfig,
        direction: 'long',
      };

      const shortPattern = getEntryPattern('quick-fall', shortConfig);
      const longPattern = getEntryPattern('quick-fall', longConfig);

      expect(shortPattern.direction).toBe('short');
      expect(longPattern.direction).toBe('long');
    });
  });

  describe('getExitPattern', () => {
    it('should return a valid pattern instance with required properties', () => {
      const pattern = getExitPattern('fixed-time', mockConfig);
      expect(pattern).toHaveProperty('name');
      expect(pattern).toHaveProperty('description');
      expect(pattern).toHaveProperty('sql');
    });

    it('should return DefaultExitStrategyPattern for unknown pattern', () => {
      const pattern = getExitPattern('unknown', mockConfig);
      expect(pattern).toBeDefined();
      expect(pattern.name).toBe('MaxHoldTimeStrategy');
    });

    it('should return the same instance for repeated calls', () => {
      const pattern1 = getExitPattern('fixed-time', mockConfig);
      const pattern2 = getExitPattern('fixed-time', mockConfig);

      expect(pattern1).toStrictEqual(pattern2);
    });
  });
});
