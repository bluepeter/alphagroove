import { describe, it, expect } from 'vitest';

import { Bar } from '../types.js';

import { detectQuickFallEntry, QuickFallEntryConfig, quickFallPattern } from './quick-fall.js';

describe('Quick Fall Pattern', () => {
  describe('pattern configuration', () => {
    it('should have default values', () => {
      // Cast quickFallPattern to unknown first to avoid TypeScript error
      const pattern = quickFallPattern as unknown as {
        config: QuickFallEntryConfig;
        direction?: 'long' | 'short';
      };
      expect(pattern.config.percentDecrease).toBe(0.3);
      expect(pattern.config.maxBars).toBe(5);
      expect(pattern.config.direction).toBe('short');
    });

    it('should update configuration with updateConfig', () => {
      const updatedPattern = quickFallPattern.updateConfig({
        percentDecrease: 0.5,
        maxBars: 3,
        direction: 'long',
      });

      // Cast updatedPattern to unknown first to avoid TypeScript error
      const pattern = updatedPattern as unknown as {
        config: QuickFallEntryConfig;
        direction?: 'long' | 'short';
      };
      expect(pattern.config.percentDecrease).toBe(0.5);
      expect(pattern.config.maxBars).toBe(3);
      expect(pattern.config.direction).toBe('long');
      expect(pattern.direction).toBe('long');
    });

    it('should update SQL query when configuration is changed', () => {
      const shortPattern = quickFallPattern.updateConfig({
        percentDecrease: 0.5,
        direction: 'short',
      });
      const longPattern = quickFallPattern.updateConfig({
        percentDecrease: 0.5,
        direction: 'long',
      });

      // Both should be looking for the same fall pattern
      expect(shortPattern.sql).toContain('((market_open - five_min_low) / market_open) >= 0.005');
      expect(longPattern.sql).toContain('((market_open - five_min_low) / market_open) >= 0.005');
    });
  });

  describe('short direction pattern detection', () => {
    const createBar = (timestamp: string, open: number, low: number, high = open): Bar => ({
      timestamp,
      open,
      high,
      low,
      close: low,
      volume: 1000,
    });

    it('should detect a 0.3% fall over 5 bars', () => {
      const bars: Bar[] = [
        createBar('2025-05-02 09:31:00', 100.0, 99.9),
        createBar('2025-05-02 09:32:00', 99.9, 99.8),
        createBar('2025-05-02 09:33:00', 99.8, 99.75),
        createBar('2025-05-02 09:34:00', 99.75, 99.7),
        createBar('2025-05-02 09:35:00', 99.7, 99.6), // 0.4% fall from 100.0
      ];

      const result = detectQuickFallEntry(bars);
      expect(result).not.toBeNull();
      expect(result?.timestamp).toBe('2025-05-02 09:35:00');
      expect(result?.price).toBe(99.6);
      expect(result?.type).toBe('entry');
      expect(result?.direction).toBe('short');
    });

    it('should not detect a fall below threshold', () => {
      const bars: Bar[] = [
        createBar('2025-05-02 09:31:00', 100.0, 99.95),
        createBar('2025-05-02 09:32:00', 99.95, 99.9),
        createBar('2025-05-02 09:33:00', 99.9, 99.85),
        createBar('2025-05-02 09:34:00', 99.85, 99.8),
        createBar('2025-05-02 09:35:00', 99.8, 99.75), // 0.25% fall from 100.0
      ];

      const result = detectQuickFallEntry(bars);
      expect(result).toBeNull();
    });
  });

  describe('long direction pattern detection', () => {
    const createBar = (timestamp: string, open: number, low: number, high: number): Bar => ({
      timestamp,
      open,
      high,
      low,
      close: low,
      volume: 1000,
    });

    it('should detect a 0.3% fall and return long direction signal', () => {
      const bars: Bar[] = [
        createBar('2025-05-02 09:31:00', 100.0, 99.9, 100.1),
        createBar('2025-05-02 09:32:00', 99.9, 99.8, 100.0),
        createBar('2025-05-02 09:33:00', 99.8, 99.75, 99.9),
        createBar('2025-05-02 09:34:00', 99.75, 99.7, 99.85),
        createBar('2025-05-02 09:35:00', 99.7, 99.6, 99.8), // 0.4% fall from 100.0
      ];

      const config: QuickFallEntryConfig = {
        percentDecrease: 0.3,
        maxBars: 5,
        direction: 'long',
      };

      const result = detectQuickFallEntry(bars, config);
      expect(result).not.toBeNull();
      expect(result?.timestamp).toBe('2025-05-02 09:35:00');
      expect(result?.price).toBe(99.6); // Buying at the bottom
      expect(result?.type).toBe('entry');
      expect(result?.direction).toBe('long');
    });

    it('should not detect a fall below threshold for long direction', () => {
      const bars: Bar[] = [
        createBar('2025-05-02 09:31:00', 100.0, 99.95, 100.05),
        createBar('2025-05-02 09:32:00', 99.95, 99.9, 100.0),
        createBar('2025-05-02 09:33:00', 99.9, 99.85, 99.95),
        createBar('2025-05-02 09:34:00', 99.85, 99.8, 99.9),
        createBar('2025-05-02 09:35:00', 99.8, 99.75, 99.85), // 0.25% fall from 100.0
      ];

      const config: QuickFallEntryConfig = {
        percentDecrease: 0.3,
        maxBars: 5,
        direction: 'long',
      };

      const result = detectQuickFallEntry(bars, config);
      expect(result).toBeNull();
    });
  });
});
