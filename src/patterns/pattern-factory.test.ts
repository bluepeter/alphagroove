import { describe, it, expect } from 'vitest';

import { getEntryPattern, getExitPattern } from './pattern-factory.js';

describe('pattern factory', () => {
  describe('getEntryPattern', () => {
    it('should return the quick-rise pattern', () => {
      const pattern = getEntryPattern('quick-rise');

      expect(pattern.name).toBeDefined();
      expect(pattern.description).toBeDefined();
      expect(pattern.sql).toBeDefined();
      expect(pattern.sql).toContain('market_open');
      expect(pattern.sql).toContain('rise_pct');
    });

    it('should throw an error for unknown entry patterns', () => {
      const getUnknown = () => getEntryPattern('unknown-pattern');

      expect(getUnknown).toThrow();
      expect(getUnknown).toThrow('Entry pattern');
      expect(getUnknown).toThrow('quick-rise'); // Should list available patterns
    });
  });

  describe('getExitPattern', () => {
    it('should return the fixed-time pattern', () => {
      const pattern = getExitPattern('fixed-time');

      expect(pattern.name).toBeDefined();
      expect(pattern.description).toBeDefined();
      expect(pattern.sql).toBeDefined();
      expect(pattern.sql).toContain('exit_time');
      expect(pattern.sql).toContain('total_returns');
    });

    it('should throw an error for unknown exit patterns', () => {
      const getUnknown = () => getExitPattern('unknown-pattern');

      expect(getUnknown).toThrow();
      expect(getUnknown).toThrow('Exit pattern');
      expect(getUnknown).toThrow('fixed-time'); // Should list available patterns
    });
  });
});
