import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Bar } from '../types.js';
// No need to import PatternDefinition here if TestPatternType defines the full shape
import {
  detectFixedTimeEntry,
  FixedTimeEntryConfig,
  fixedTimeEntryPattern, // This is PatternDefinition & { config: FixedTimeEntryConfig; ... }
  createSqlQuery,
} from './fixed-time-entry.js';

// This type should match the known structure of fixedTimeEntryPattern
type FixedTimeEntryPatternType = typeof fixedTimeEntryPattern;

describe('Fixed Time Entry Pattern', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createBar = (timestamp: string, close: number): Bar => ({
    timestamp,
    open: close - 0.1,
    high: close + 0.1,
    low: close - 0.1,
    close,
    volume: 1000,
    trade_date: timestamp.substring(0, 10),
  });

  describe('pattern configuration', () => {
    it('should initialize with default time and direction', () => {
      // fixedTimeEntryPattern already has a specific type
      expect(fixedTimeEntryPattern.config.time).toBe('12:00');
      expect(fixedTimeEntryPattern.direction).toBe('long');
    });

    it('should update configuration with updateConfig', () => {
      const updatedPattern = fixedTimeEntryPattern.updateConfig({
        time: '14:30',
      });
      // The returned type from updateConfig is PatternDefinition, but we know it's our specific shape
      const specificUpdatedPattern = updatedPattern as FixedTimeEntryPatternType;
      expect(specificUpdatedPattern.config.time).toBe('14:30');
      expect(specificUpdatedPattern.direction).toBe('long'); // updateConfig preserves the original pattern's direction
    });

    it('should update SQL query when configuration is changed', () => {
      const pattern1200 = fixedTimeEntryPattern.updateConfig({
        time: '12:00',
      }) as FixedTimeEntryPatternType;
      const pattern1430 = fixedTimeEntryPattern.updateConfig({
        time: '14:30',
      }) as FixedTimeEntryPatternType;

      expect(pattern1200.sql).toContain("WHERE bar_time = '12:00'");
      expect(pattern1200.sql).toContain("'long' as direction");
      expect(pattern1430.sql).toContain("WHERE bar_time = '14:30'");
      expect(pattern1430.sql).toContain("'long' as direction");
    });

    it("should use pattern's direction for SQL query in updateConfig", () => {
      // Create a pattern variant for testing with a different direction
      const shortPatternInstance: FixedTimeEntryPatternType = {
        ...fixedTimeEntryPattern, // Spread the original pattern
        direction: 'short', // Override the direction
        // updateConfig is inherited and will use `this.direction` which is now 'short'
      };

      const updatedShortPattern = shortPatternInstance.updateConfig({
        time: '10:00',
      }) as FixedTimeEntryPatternType;

      expect(updatedShortPattern.config.time).toBe('10:00'); // Config time is updated
      expect(updatedShortPattern.direction).toBe('short'); // Direction remains short
      expect(updatedShortPattern.sql).toContain("WHERE bar_time = '10:00'");
      expect(updatedShortPattern.sql).toContain("'short' as direction");
    });
  });

  describe('pattern detection (detectFixedTimeEntry)', () => {
    it('should detect entry signal at the configured time for long direction', () => {
      const entryTime = '15:00';
      // The bar for 15:00 should be the last bar in this array for detection
      const bars: Bar[] = [
        createBar('2025-05-02 14:58:00', 99.0),
        createBar('2025-05-02 14:59:00', 100.0),
        createBar('2025-05-02 15:00:00', 100.5), // This is the target bar
      ];
      const config: FixedTimeEntryConfig = { time: entryTime };
      // Mock system time to ensure toLocaleTimeString works as expected in test environment
      // The actual bar time comes from lastBar.timestamp
      vi.setSystemTime(new Date('2025-05-02 15:00:00'));
      const result = detectFixedTimeEntry(bars, config, 'long');

      expect(result).not.toBeNull();
      expect(result?.timestamp).toBe('2025-05-02 15:00:00');
      expect(result?.price).toBe(100.5);
      expect(result?.type).toBe('entry');
      expect(result?.direction).toBe('long');
    });

    it('should detect entry signal at the configured time for short direction', () => {
      const entryTime = '10:30';
      const bars: Bar[] = [
        createBar('2025-05-02 10:28:00', 200.0),
        createBar('2025-05-02 10:29:00', 200.1),
        createBar('2025-05-02 10:30:00', 199.5), // Target bar
      ];
      const config: FixedTimeEntryConfig = { time: entryTime };
      vi.setSystemTime(new Date('2025-05-02 10:30:00'));
      const result = detectFixedTimeEntry(bars, config, 'short');

      expect(result).not.toBeNull();
      expect(result?.timestamp).toBe('2025-05-02 10:30:00');
      expect(result?.price).toBe(199.5);
      expect(result?.type).toBe('entry');
      expect(result?.direction).toBe('short');
    });

    it('should not detect entry signal if time does not match', () => {
      const entryTime = '11:00';
      const bars: Bar[] = [
        createBar('2025-05-02 10:58:00', 99.0),
        createBar('2025-05-02 10:59:00', 100.0), // Last bar is 10:59
      ];
      const config: FixedTimeEntryConfig = { time: entryTime }; // Configured for 11:00
      vi.setSystemTime(new Date('2025-05-02 10:59:00'));
      const result = detectFixedTimeEntry(bars, config, 'long');
      expect(result).toBeNull();
    });

    it('should return null if no bars are provided', () => {
      const config: FixedTimeEntryConfig = { time: '12:00' };
      const result = detectFixedTimeEntry([], config, 'long');
      expect(result).toBeNull();
    });

    it('should correctly format time with leading zeros from Date object', () => {
      const entryTime = '09:05';
      const bars: Bar[] = [createBar('2025-05-02 09:05:00', 100.0)];
      const config: FixedTimeEntryConfig = { time: entryTime };
      vi.setSystemTime(new Date('2025-05-02 09:05:00'));
      const result = detectFixedTimeEntry(bars, config, 'long');
      expect(result).not.toBeNull();
      expect(result?.timestamp).toBe('2025-05-02 09:05:00');
    });
  });

  describe('createSqlQuery', () => {
    it('should generate correct SQL for long direction', () => {
      const config: FixedTimeEntryConfig = { time: '12:30' };
      const sql = createSqlQuery(config, 'long');
      expect(sql).toContain("strftime(column0, '%H:%M') as bar_time");
      expect(sql).toContain("WHERE bar_time = '12:30'");
      expect(sql).toContain("'long' as direction");
      expect(sql).toContain('close as entry_price');
    });

    it('should generate correct SQL for short direction', () => {
      const config: FixedTimeEntryConfig = { time: '09:45' };
      const sql = createSqlQuery(config, 'short');
      expect(sql).toContain("WHERE bar_time = '09:45'");
      expect(sql).toContain("'short' as direction");
    });
  });
});
