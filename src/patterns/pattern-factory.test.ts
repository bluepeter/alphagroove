import { describe, it, expect } from 'vitest';

import { getEntryPattern, getExitPattern } from './pattern-factory.js';

describe('pattern factory', () => {
  describe('getEntryPattern', () => {
    it('should return quick-rise pattern by default', () => {
      const pattern = getEntryPattern('quick-rise');
      expect(pattern.name).toBe('Quick Rise');
      expect(pattern.sql).toContain('0.003'); // Default 0.3%
    });

    it('should throw error for unknown pattern', () => {
      expect(() => getEntryPattern('unknown')).toThrow("Entry pattern 'unknown' not found");
    });

    it('should update SQL with custom rise percentage', () => {
      const pattern = getEntryPattern('quick-rise', {
        'quick-rise': {
          percentIncrease: 0.5,
        },
      });
      expect(pattern.name).toBe('Quick Rise');
      expect(pattern.sql).toContain('0.005'); // 0.5%
    });

    it('should handle different rise percentages', () => {
      const pattern1 = getEntryPattern('quick-rise', {
        'quick-rise': {
          percentIncrease: 0.1,
        },
      });
      expect(pattern1.sql).toContain('0.001'); // 0.1%

      const pattern2 = getEntryPattern('quick-rise', {
        'quick-rise': {
          percentIncrease: 1.0,
        },
      });
      expect(pattern2.sql).toContain('0.01'); // 1.0%
    });
  });

  describe('getExitPattern', () => {
    it('should return fixed-time pattern', () => {
      const pattern = getExitPattern('fixed-time');
      expect(pattern.name).toBe('Fixed Time Exit');
    });

    it('should throw error for unknown pattern', () => {
      expect(() => getExitPattern('unknown')).toThrow("Exit pattern 'unknown' not found");
    });
  });
});
