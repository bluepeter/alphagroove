import { describe, it, expect } from 'vitest';

import { Bar } from '../types.js';

import { detectQuickRiseEntry, QuickRiseEntryConfig, quickRisePattern } from './quick-rise.js';

describe('Quick Rise Pattern', () => {
  describe('pattern configuration', () => {
    it('should have default values', () => {
      // Cast quickRisePattern to unknown first to avoid TypeScript error
      const pattern = quickRisePattern as unknown as {
        config: QuickRiseEntryConfig;
        direction?: 'long' | 'short';
      };
      expect(pattern.config.percentIncrease).toBe(0.3);
      expect(pattern.config.maxBars).toBe(5);
      expect(pattern.config.direction).toBe('long');
    });

    it('should update configuration with updateConfig', () => {
      const updatedPattern = quickRisePattern.updateConfig({
        percentIncrease: 0.5,
        maxBars: 3,
        direction: 'short',
      });

      // Cast updatedPattern to unknown first to avoid TypeScript error
      const pattern = updatedPattern as unknown as {
        config: QuickRiseEntryConfig;
        direction?: 'long' | 'short';
      };
      expect(pattern.config.percentIncrease).toBe(0.5);
      expect(pattern.config.maxBars).toBe(3);
      expect(pattern.config.direction).toBe('short');
      expect(pattern.direction).toBe('short');
    });

    it('should update SQL query when configuration is changed', () => {
      const longPattern = quickRisePattern.updateConfig({
        percentIncrease: 0.5,
        direction: 'long',
      });
      const shortPattern = quickRisePattern.updateConfig({
        percentIncrease: 0.5,
        direction: 'short',
      });

      // Both should be looking for the same rise pattern
      expect(longPattern.sql).toContain('((five_min_high - market_open) / market_open) >= 0.005');
      expect(shortPattern.sql).toContain('((five_min_high - market_open) / market_open) >= 0.005');
    });
  });

  describe('long direction pattern detection', () => {
    const createBar = (timestamp: string, open: number, high: number, low = open): Bar => ({
      timestamp,
      open,
      high,
      low,
      close: high,
      volume: 1000,
    });

    it('should detect a 0.3% rise over 5 bars', () => {
      const bars: Bar[] = [
        createBar('2025-05-02 09:31:00', 100.0, 100.1),
        createBar('2025-05-02 09:32:00', 100.1, 100.2),
        createBar('2025-05-02 09:33:00', 100.2, 100.25),
        createBar('2025-05-02 09:34:00', 100.25, 100.29),
        createBar('2025-05-02 09:35:00', 100.29, 100.4), // 0.4% rise from 100.0
      ];

      const result = detectQuickRiseEntry(bars);
      expect(result).not.toBeNull();
      expect(result?.timestamp).toBe('2025-05-02 09:35:00');
      expect(result?.price).toBe(100.4);
      expect(result?.type).toBe('entry');
      expect(result?.direction).toBe('long');
    });

    it('should not detect a rise below threshold', () => {
      const bars: Bar[] = [
        createBar('2025-05-02 09:31:00', 100.0, 100.05),
        createBar('2025-05-02 09:32:00', 100.05, 100.1),
        createBar('2025-05-02 09:33:00', 100.1, 100.15),
        createBar('2025-05-02 09:34:00', 100.15, 100.2),
        createBar('2025-05-02 09:35:00', 100.2, 100.25), // 0.25% rise from 100.0
      ];

      const result = detectQuickRiseEntry(bars);
      expect(result).toBeNull();
    });

    it('should handle custom percentage threshold', () => {
      const bars: Bar[] = [
        createBar('2025-05-02 09:31:00', 100.0, 100.1),
        createBar('2025-05-02 09:32:00', 100.1, 100.2),
        createBar('2025-05-02 09:33:00', 100.2, 100.3),
        createBar('2025-05-02 09:34:00', 100.3, 100.4),
        createBar('2025-05-02 09:35:00', 100.4, 100.5), // 0.5% rise from 100.0
      ];

      // Should detect with 0.4% threshold
      const config1: QuickRiseEntryConfig = {
        percentIncrease: 0.4,
        maxBars: 5,
        direction: 'long',
      };
      const result1 = detectQuickRiseEntry(bars, config1);
      expect(result1).not.toBeNull();

      // Should not detect with 0.6% threshold
      const config2: QuickRiseEntryConfig = {
        percentIncrease: 0.6,
        maxBars: 5,
        direction: 'long',
      };
      const result2 = detectQuickRiseEntry(bars, config2);
      expect(result2).toBeNull();
    });
  });

  describe('short direction pattern detection', () => {
    const createBar = (timestamp: string, open: number, high: number, low: number): Bar => ({
      timestamp,
      open,
      high,
      low,
      close: low,
      volume: 1000,
    });

    it('should detect a 0.3% rise and return short direction signal', () => {
      const bars: Bar[] = [
        createBar('2025-05-02 09:31:00', 100.0, 100.1, 99.9),
        createBar('2025-05-02 09:32:00', 100.1, 100.2, 99.8),
        createBar('2025-05-02 09:33:00', 100.2, 100.25, 99.75),
        createBar('2025-05-02 09:34:00', 100.25, 100.29, 99.7),
        createBar('2025-05-02 09:35:00', 100.29, 100.4, 99.6), // 0.4% rise from 100.0
      ];

      const config: QuickRiseEntryConfig = {
        percentIncrease: 0.3,
        maxBars: 5,
        direction: 'short',
      };

      const result = detectQuickRiseEntry(bars, config);
      expect(result).not.toBeNull();
      expect(result?.timestamp).toBe('2025-05-02 09:35:00');
      expect(result?.price).toBe(100.4); // Shorting at the peak
      expect(result?.type).toBe('entry');
      expect(result?.direction).toBe('short');
    });

    it('should not detect a rise below threshold for short direction', () => {
      const bars: Bar[] = [
        createBar('2025-05-02 09:31:00', 100.0, 100.05, 99.95),
        createBar('2025-05-02 09:32:00', 100.05, 100.1, 99.9),
        createBar('2025-05-02 09:33:00', 100.1, 100.15, 99.85),
        createBar('2025-05-02 09:34:00', 100.15, 100.2, 99.8),
        createBar('2025-05-02 09:35:00', 100.2, 100.25, 99.75), // 0.25% rise from 100.0
      ];

      const config: QuickRiseEntryConfig = {
        percentIncrease: 0.3,
        maxBars: 5,
        direction: 'short',
      };

      const result = detectQuickRiseEntry(bars, config);
      expect(result).toBeNull();
    });

    it('should handle custom percentage threshold for short direction', () => {
      const bars: Bar[] = [
        createBar('2025-05-02 09:31:00', 100.0, 100.1, 99.9),
        createBar('2025-05-02 09:32:00', 100.1, 100.2, 99.8),
        createBar('2025-05-02 09:33:00', 100.2, 100.3, 99.7),
        createBar('2025-05-02 09:34:00', 100.3, 100.4, 99.6),
        createBar('2025-05-02 09:35:00', 100.4, 100.5, 99.5), // 0.5% rise from 100.0
      ];

      // Should detect with 0.4% threshold
      const config1: QuickRiseEntryConfig = {
        percentIncrease: 0.4,
        maxBars: 5,
        direction: 'short',
      };
      const result1 = detectQuickRiseEntry(bars, config1);
      expect(result1).not.toBeNull();

      // Should not detect with 0.6% threshold
      const config2: QuickRiseEntryConfig = {
        percentIncrease: 0.6,
        maxBars: 5,
        direction: 'short',
      };
      const result2 = detectQuickRiseEntry(bars, config2);
      expect(result2).toBeNull();
    });
  });
});
