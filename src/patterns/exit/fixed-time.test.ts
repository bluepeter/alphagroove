import { describe, it, expect } from 'vitest';

import { Bar, Signal } from '../types.js';

import { detectFixedTimeExit, FixedTimeExitConfig, fixedTimeExitPattern } from './fixed-time.js';

// Type with configuration support specifically for the fixed time exit pattern
interface FixedTimePatternWithConfig {
  name: string;
  description: string;
  sql: string;
  config: FixedTimeExitConfig;
  updateConfig: (newConfig: Partial<FixedTimeExitConfig>) => FixedTimePatternWithConfig;
}

describe('Fixed Time Exit Pattern', () => {
  describe('pattern definition', () => {
    it('should have correct name and description', () => {
      expect(fixedTimeExitPattern.name).toBe('Fixed Time Exit');
      expect(fixedTimeExitPattern.description).toBeDefined();
      expect(fixedTimeExitPattern.description.length).toBeGreaterThan(0);
    });

    it('should initially have empty SQL query', () => {
      expect(fixedTimeExitPattern.sql).toBeDefined();
      // Initially empty query until configured
      const initializedPattern = (fixedTimeExitPattern as FixedTimePatternWithConfig).updateConfig({
        barsAfterEntry: 10,
      });
      expect(initializedPattern.sql).toContain('exit_time');
      expect(initializedPattern.sql).toContain('total_returns');
      expect(initializedPattern.sql).toContain('match_count');
      expect(initializedPattern.sql).toContain('GROUP BY year');
    });

    it('should update description when configuration is changed', () => {
      const originalPattern = (fixedTimeExitPattern as FixedTimePatternWithConfig).updateConfig({
        barsAfterEntry: 10,
      });
      const updatedPattern = originalPattern.updateConfig({ barsAfterEntry: 15 });

      expect(updatedPattern.description).toBe('Exits exactly 15 minutes after entry');
      expect(originalPattern.description).toBe('Exits exactly 10 minutes after entry');
    });

    it('should keep the original pattern unchanged when creating updated version', () => {
      const originalPattern = (fixedTimeExitPattern as FixedTimePatternWithConfig).updateConfig({
        barsAfterEntry: 10,
      });
      const originalConfig = { ...originalPattern.config };

      // Create updated pattern
      const updatedPattern = originalPattern.updateConfig({ barsAfterEntry: 20 });

      // Original pattern should remain unchanged
      expect(originalPattern.config).toEqual(originalConfig);
      expect(originalPattern.config.barsAfterEntry).toBe(10);

      // New pattern should have the updated config
      expect(updatedPattern.config.barsAfterEntry).toBe(20);
    });

    it('should apply multiple configuration updates', () => {
      // Type assertions to properly chain the updateConfig calls
      const pattern1 = (fixedTimeExitPattern as FixedTimePatternWithConfig).updateConfig({
        barsAfterEntry: 5,
      });
      const pattern2 = pattern1.updateConfig({
        barsAfterEntry: 15,
      });

      expect(pattern1.config.barsAfterEntry).toBe(5);
      expect(pattern2.config.barsAfterEntry).toBe(15);
      expect(pattern2.description).toBe('Exits exactly 15 minutes after entry');
    });
  });

  describe('pattern detection', () => {
    const createBar = (timestamp: string, close: number): Bar => ({
      timestamp,
      open: close,
      high: close,
      low: close,
      close,
      volume: 1000,
    });

    const createEntrySignal = (timestamp: string, price: number): Signal => ({
      timestamp,
      price,
      type: 'entry',
    });

    it('should exit after configured number of bars', () => {
      // Using real data example: 567.12 → 566.94 (-0.32%)
      const bars: Bar[] = [
        createBar('2025-05-02 09:35:00', 567.12), // Entry
        createBar('2025-05-02 09:36:00', 567.1),
        createBar('2025-05-02 09:37:00', 567.05),
        createBar('2025-05-02 09:38:00', 567.0),
        createBar('2025-05-02 09:39:00', 566.98),
        createBar('2025-05-02 09:40:00', 566.97),
        createBar('2025-05-02 09:41:00', 566.96),
        createBar('2025-05-02 09:42:00', 566.95),
        createBar('2025-05-02 09:43:00', 566.95),
        createBar('2025-05-02 09:44:00', 566.94),
        createBar('2025-05-02 09:45:00', 566.94), // Exit
      ];

      const entry = createEntrySignal('2025-05-02 09:35:00', 567.12);
      const config: FixedTimeExitConfig = { barsAfterEntry: 10 };

      const result = detectFixedTimeExit(bars, entry, config);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('exit');
      expect(result?.price).toBe(566.94);
      expect(result?.timestamp).toBe('2025-05-02 09:45:00');
    });

    it('should return null when entry signal is not found in bars', () => {
      const bars: Bar[] = [
        createBar('2025-05-02 09:35:00', 567.12),
        createBar('2025-05-02 09:36:00', 567.1),
      ];

      const entry = createEntrySignal('2025-05-02 09:34:00', 567.0); // Different timestamp
      const config: FixedTimeExitConfig = { barsAfterEntry: 10 };

      const result = detectFixedTimeExit(bars, entry, config);
      expect(result).toBeNull();
    });

    it('should return null when not enough bars after entry', () => {
      const bars: Bar[] = [
        createBar('2025-05-02 09:35:00', 567.12),
        createBar('2025-05-02 09:36:00', 567.1),
        createBar('2025-05-02 09:37:00', 567.05),
      ];

      const entry = createEntrySignal('2025-05-02 09:35:00', 567.12);
      const config: FixedTimeExitConfig = { barsAfterEntry: 10 };

      const result = detectFixedTimeExit(bars, entry, config);
      expect(result).toBeNull();
    });

    it('should always require explicit configuration', () => {
      const bars: Bar[] = Array(11)
        .fill(null)
        .map((_, i) => createBar(`2025-05-02 09:${35 + i}:00`, 567.12 - i * 0.02));

      const entry = createEntrySignal('2025-05-02 09:35:00', 567.12);
      const config: FixedTimeExitConfig = { barsAfterEntry: 10 };

      const result = detectFixedTimeExit(bars, entry, config);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('exit');
      expect(result?.timestamp).toBe('2025-05-02 09:45:00');
    });
  });
});
