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
    it('should initialize with empty time and long direction', () => {
      // fixedTimeEntryPattern already has a specific type
      expect(fixedTimeEntryPattern.config.entryTime).toBe('');
      expect(fixedTimeEntryPattern.direction).toBe('long');
    });

    it('should update configuration with updateConfig', () => {
      const updatedPattern = fixedTimeEntryPattern.updateConfig({
        entryTime: '14:30',
      });
      // The returned type from updateConfig is PatternDefinition, but we know it's our specific shape
      const specificUpdatedPattern = updatedPattern as FixedTimeEntryPatternType;
      expect(specificUpdatedPattern.config.entryTime).toBe('14:30');
      expect(specificUpdatedPattern.direction).toBe('long'); // updateConfig preserves the original pattern's direction
    });

    it('should handle entry-time property from config file', () => {
      // This simulates how the property is named in the alphagroove.config.yaml
      const updatedPattern = fixedTimeEntryPattern.updateConfig({
        entryTime: '13:00',
      });
      const specificUpdatedPattern = updatedPattern as FixedTimeEntryPatternType;
      expect(specificUpdatedPattern.config.entryTime).toBe('13:00');
      expect(specificUpdatedPattern.sql).toContain("WHERE bar_time = '13:00'");
    });

    it('should update configuration with entryTime', () => {
      const updatedPattern = fixedTimeEntryPattern.updateConfig({
        entryTime: '13:45',
      });
      const specificUpdatedPattern = updatedPattern as FixedTimeEntryPatternType;
      expect(specificUpdatedPattern.config.entryTime).toBe('13:45');
      expect(specificUpdatedPattern.sql).toContain("WHERE bar_time = '13:45'");
    });

    it('should throw error if no entry time is provided', () => {
      expect(() => {
        fixedTimeEntryPattern.updateConfig({});
      }).toThrow('Fixed Time Entry pattern requires an entryTime to be configured');
    });

    it('should throw error if entry time is empty string', () => {
      expect(() => {
        fixedTimeEntryPattern.updateConfig({ entryTime: '' });
      }).toThrow('Fixed Time Entry pattern requires an entryTime to be configured');
    });

    it('should update SQL query when configuration is changed', () => {
      const patternOriginal = fixedTimeEntryPattern;
      const pattern1200 = patternOriginal.updateConfig({ entryTime: '12:00' });
      const pattern1430 = patternOriginal.updateConfig({ entryTime: '14:30' });

      expect(pattern1200.sql).toContain("WHERE bar_time = '12:00'");
      expect(pattern1200.sql).toContain("'{direction}' as direction");
      expect(pattern1430.sql).toContain("WHERE bar_time = '14:30'");
      expect(pattern1430.sql).toContain("'{direction}' as direction");
    });

    it("should use pattern's direction for SQL query in updateConfig", () => {
      const basePattern = fixedTimeEntryPattern;
      // Default direction is long
      const defaultDirPattern = basePattern.updateConfig({ entryTime: '09:30' });
      expect(defaultDirPattern.sql).toContain("'{direction}' as direction");

      // Create a new pattern instance context for 'short' testing if pattern objects are mutable
      // or assume updateConfig returns a new object if immutable
      // const shortPatternConfig = { ...basePattern, direction: 'short' as 'long' | 'short' }; // Unused variable
      const createShortPattern = (
        config: Partial<FixedTimeEntryConfig>,
        initialDirection: 'long' | 'short' = 'short'
      ) => {
        // Simulate how getEntryPattern might work: create a base with direction, then update
        const patternWithDirection = {
          ...fixedTimeEntryPattern, // from import
          direction: initialDirection,
        };
        return patternWithDirection.updateConfig(config);
      };

      const updatedShortPattern = createShortPattern({ entryTime: '10:00' }, 'short');
      expect(updatedShortPattern.direction).toBe('short'); // Direction on pattern object
      expect(updatedShortPattern.sql).toContain("WHERE bar_time = '10:00'");
      expect(updatedShortPattern.sql).toContain("'{direction}' as direction");
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
      const config: FixedTimeEntryConfig = { entryTime: entryTime };
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
      const config: FixedTimeEntryConfig = { entryTime: entryTime };
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
      const config: FixedTimeEntryConfig = { entryTime: entryTime }; // Configured for 11:00
      vi.setSystemTime(new Date('2025-05-02 10:59:00'));
      const result = detectFixedTimeEntry(bars, config, 'long');
      expect(result).toBeNull();
    });

    it('should return null if no bars are provided', () => {
      const config: FixedTimeEntryConfig = { entryTime: '12:00' };
      const result = detectFixedTimeEntry([], config, 'long');
      expect(result).toBeNull();
    });

    it('should correctly format time with leading zeros from Date object', () => {
      const entryTime = '09:05';
      const bars: Bar[] = [createBar('2025-05-02 09:05:00', 100.0)];
      const config: FixedTimeEntryConfig = { entryTime: entryTime };
      vi.setSystemTime(new Date('2025-05-02 09:05:00'));
      const result = detectFixedTimeEntry(bars, config, 'long');
      expect(result).not.toBeNull();
      expect(result?.timestamp).toBe('2025-05-02 09:05:00');
    });
  });

  describe('createSqlQuery', () => {
    it('should generate correct SQL for long direction', () => {
      const config: FixedTimeEntryConfig = { entryTime: '12:30' };
      const sql = createSqlQuery(config, 'long');
      expect(sql).toContain("strftime(column0, '%H:%M') as bar_time");
      expect(sql).toContain("WHERE bar_time = '12:30'");
      expect(sql).toContain("'{direction}' as direction");
      expect(sql).toContain('close as entry_price');
    });

    it('should generate correct SQL for short direction', () => {
      const config: FixedTimeEntryConfig = { entryTime: '09:45' };
      const sql = createSqlQuery(config, 'short');
      expect(sql).toContain("WHERE bar_time = '09:45'");
      expect(sql).toContain("'{direction}' as direction");
    });
  });
});
