import { describe, it, expect } from 'vitest';

import { PatternDefinition } from '../pattern-factory.js';
import { Bar } from '../types.js';

import { detectQuickRiseEntry, QuickRiseEntryConfig, quickRisePattern } from './quick-rise.js';

type ConfigurablePattern = PatternDefinition & {
  config: QuickRiseEntryConfig;
  updateConfig: (newConfig: Partial<QuickRiseEntryConfig>) => ConfigurablePattern;
};

describe('Quick Rise Entry Pattern', () => {
  describe('pattern definition', () => {
    it('should have correct name and description', () => {
      expect(quickRisePattern.name).toBe('Quick Rise');
      expect(quickRisePattern.description).toBeTruthy();
      expect(quickRisePattern.description.length).toBeGreaterThan(0);
    });

    it('should have valid SQL query', () => {
      expect(quickRisePattern.name).toBe('Quick Rise');
      expect(quickRisePattern.sql).toContain('FROM');
      expect(quickRisePattern.sql).toContain('WHERE');
      expect(quickRisePattern.sql).toContain('0.003'); // Default 0.3% as decimal
    });

    it('should handle different rise percentages', () => {
      const pattern1 = (quickRisePattern as unknown as ConfigurablePattern).updateConfig({
        percentIncrease: 0.5,
      });
      expect(pattern1.sql).toContain('0.005'); // 0.5% as decimal

      const pattern2 = (pattern1 as unknown as ConfigurablePattern).updateConfig({
        percentIncrease: 0.1,
      });
      expect(pattern2.sql).toContain('0.001'); // 0.1% as decimal
    });

    it('should create new instances for each configuration', () => {
      // First get pattern with default config
      expect(quickRisePattern.sql).toContain('0.003'); // Default 0.3% as decimal

      // Then get pattern with custom config
      const pattern2 = (quickRisePattern as unknown as ConfigurablePattern).updateConfig({
        percentIncrease: 0.5,
      });
      expect(pattern2.sql).toContain('0.005'); // 0.5% as decimal

      // Original pattern should still have default config
      expect(quickRisePattern.sql).toContain('0.003'); // Default 0.3% as decimal
    });
  });

  describe('pattern detection', () => {
    const createBar = (timestamp: string, open: number, high: number): Bar => ({
      timestamp,
      open,
      high,
      low: open,
      close: high,
      volume: 1000,
    });

    it('should detect a quick rise when price increases by configured percentage', () => {
      // Using real data example: 566.83 → 568.53 (+0.3%)
      const bars: Bar[] = [
        createBar('2025-05-02 09:31:00', 566.83, 566.85),
        createBar('2025-05-02 09:32:00', 566.85, 567.5),
        createBar('2025-05-02 09:33:00', 567.5, 568.0),
        createBar('2025-05-02 09:34:00', 568.0, 568.25),
        createBar('2025-05-02 09:35:00', 568.25, 568.53),
      ];

      const config: QuickRiseEntryConfig = {
        percentIncrease: 0.3,
        maxBars: 5,
      };

      const result = detectQuickRiseEntry(bars, config);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('entry');
      expect(result?.price).toBe(568.53);
      expect(result?.timestamp).toBe('2025-05-02 09:35:00');
    });

    it('should not detect a rise when price increase is below threshold', () => {
      // Using real data example with smaller rise
      const bars: Bar[] = [
        createBar('2025-05-02 09:31:00', 566.83, 566.85),
        createBar('2025-05-02 09:32:00', 566.85, 566.87),
        createBar('2025-05-02 09:33:00', 566.87, 566.9),
        createBar('2025-05-02 09:34:00', 566.9, 566.92),
        createBar('2025-05-02 09:35:00', 566.92, 566.95),
      ];

      const config: QuickRiseEntryConfig = {
        percentIncrease: 0.3,
        maxBars: 5,
      };

      const result = detectQuickRiseEntry(bars, config);
      expect(result).toBeNull();
    });

    it('should return null when not enough bars are provided', () => {
      const bars: Bar[] = [
        createBar('2025-05-02 09:31:00', 566.83, 566.85),
        createBar('2025-05-02 09:32:00', 566.85, 566.9),
        createBar('2025-05-02 09:33:00', 566.9, 567.05),
      ];

      const config: QuickRiseEntryConfig = {
        percentIncrease: 0.3,
        maxBars: 5,
      };

      const result = detectQuickRiseEntry(bars, config);
      expect(result).toBeNull();
    });

    it('should use default configuration when none provided', () => {
      // Using real data example: 566.83 → 568.53 (+0.3%)
      const bars: Bar[] = [
        createBar('2025-05-02 09:31:00', 566.83, 566.85),
        createBar('2025-05-02 09:32:00', 566.85, 567.5),
        createBar('2025-05-02 09:33:00', 567.5, 568.0),
        createBar('2025-05-02 09:34:00', 568.0, 568.25),
        createBar('2025-05-02 09:35:00', 568.25, 568.53),
      ];

      const result = detectQuickRiseEntry(bars);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('entry');
      expect(result?.price).toBe(568.53);
    });
  });
});
