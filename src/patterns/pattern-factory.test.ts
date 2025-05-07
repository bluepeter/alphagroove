import { describe, it, expect } from 'vitest';

import { getEntryPattern, getExitPattern } from './pattern-factory.js';

describe('pattern factory', () => {
  describe('getEntryPattern', () => {
    it('should return a valid pattern instance with required properties', () => {
      const pattern = getEntryPattern('quick-rise');
      expect(pattern).toHaveProperty('name');
      expect(pattern).toHaveProperty('description');
      expect(pattern).toHaveProperty('sql');
    });

    it('should throw error for unknown pattern', () => {
      expect(() => getEntryPattern('unknown')).toThrow("Entry pattern 'unknown' not found");
    });

    it('should create unique instances for different configurations', () => {
      const pattern1 = getEntryPattern('quick-rise');
      const pattern2 = getEntryPattern('quick-rise', {
        'quick-rise': { percentIncrease: 0.5 },
      });

      expect(pattern1).not.toBe(pattern2);
      expect(pattern1.sql).not.toBe(pattern2.sql);
    });

    it('should maintain pattern identity for same configuration', () => {
      const config = {
        'quick-rise': { percentIncrease: 0.5 },
      };

      const pattern1 = getEntryPattern('quick-rise', config);
      const pattern2 = getEntryPattern('quick-rise', config);

      expect(pattern1).toStrictEqual(pattern2);
    });
  });

  describe('getExitPattern', () => {
    it('should return a valid pattern instance with required properties', () => {
      const pattern = getExitPattern('fixed-time');
      expect(pattern).toHaveProperty('name');
      expect(pattern).toHaveProperty('description');
      expect(pattern).toHaveProperty('sql');
    });

    it('should throw error for unknown pattern', () => {
      expect(() => getExitPattern('unknown')).toThrow("Exit pattern 'unknown' not found");
    });

    it('should return the same instance for repeated calls', () => {
      const pattern1 = getExitPattern('fixed-time');
      const pattern2 = getExitPattern('fixed-time');

      expect(pattern1).toStrictEqual(pattern2);
    });
  });
});
