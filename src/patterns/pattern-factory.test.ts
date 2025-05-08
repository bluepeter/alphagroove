import { describe, it, expect } from 'vitest';

import { getEntryPattern, getExitPattern } from './pattern-factory.js';

// Mock config object that matches our new format
const mockConfig = {
  ticker: 'SPY',
  timeframe: '1min',
  direction: 'long',
  'quick-rise': {
    'rise-pct': 0.3,
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

    it('should create unique instances for different configurations', () => {
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
      expect(pattern1.sql).not.toBe(pattern2.sql);
    });

    it('should maintain pattern identity for same configuration', () => {
      const pattern1 = getEntryPattern('quick-rise', mockConfig);
      const pattern2 = getEntryPattern('quick-rise', mockConfig);

      expect(pattern1).toStrictEqual(pattern2);
    });
  });

  describe('getExitPattern', () => {
    it('should return a valid pattern instance with required properties', () => {
      const pattern = getExitPattern('fixed-time', mockConfig);
      expect(pattern).toHaveProperty('name');
      expect(pattern).toHaveProperty('description');
      expect(pattern).toHaveProperty('sql');
    });

    it('should throw error for unknown pattern', () => {
      expect(() => getExitPattern('unknown', mockConfig)).toThrow(
        "Exit pattern 'unknown' not found"
      );
    });

    it('should return the same instance for repeated calls', () => {
      const pattern1 = getExitPattern('fixed-time', mockConfig);
      const pattern2 = getExitPattern('fixed-time', mockConfig);

      expect(pattern1).toStrictEqual(pattern2);
    });
  });
});
