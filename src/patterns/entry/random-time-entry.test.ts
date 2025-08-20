import { describe, it, expect } from 'vitest';
import {
  randomTimeEntryPattern,
  generateRandomTimeForDay,
  detectRandomTimeEntry,
  createSqlQuery,
  RandomTimeEntryConfig,
} from './random-time-entry';
import { Bar } from '../../utils/calculations';

type RandomTimeEntryPatternType = typeof randomTimeEntryPattern;

// Helper function to create test bars
const createTestBar = (
  timestamp: string,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number
): Bar => ({
  timestamp,
  open,
  high,
  low,
  close,
  volume,
  trade_date: timestamp.substring(0, 10),
});

describe('Random Time Entry Pattern', () => {
  describe('generateRandomTimeForDay', () => {
    it('should generate consistent random time for the same date', () => {
      const date = '2023-05-15';
      const startTime = '09:30';
      const endTime = '15:30';

      const time1 = generateRandomTimeForDay(date, startTime, endTime);
      const time2 = generateRandomTimeForDay(date, startTime, endTime);

      expect(time1).toBe(time2); // Same date should produce same random time
    });

    it('should generate different times for different dates', () => {
      const startTime = '09:30';
      const endTime = '15:30';

      const time1 = generateRandomTimeForDay('2023-05-15', startTime, endTime);
      const time2 = generateRandomTimeForDay('2023-05-16', startTime, endTime);

      expect(time1).not.toBe(time2); // Different dates should produce different times
    });

    it('should generate time within specified range', () => {
      const date = '2023-05-15';
      const startTime = '10:00';
      const endTime = '14:00';

      const randomTime = generateRandomTimeForDay(date, startTime, endTime);

      // Convert times to minutes for comparison
      const [randomHour, randomMin] = randomTime.split(':').map(Number);
      const randomMinutes = randomHour * 60 + randomMin;

      const startMinutes = 10 * 60; // 10:00
      const endMinutes = 14 * 60; // 14:00

      expect(randomMinutes).toBeGreaterThanOrEqual(startMinutes);
      expect(randomMinutes).toBeLessThan(endMinutes);
    });

    it('should format time correctly with leading zeros', () => {
      const date = '2023-01-01'; // Use a date that might produce early morning time
      const startTime = '09:30';
      const endTime = '10:30';

      const randomTime = generateRandomTimeForDay(date, startTime, endTime);

      expect(randomTime).toMatch(/^\d{2}:\d{2}$/); // Should be HH:MM format
    });

    it('should handle edge case times correctly', () => {
      const date = '2023-05-15';
      const startTime = '09:30';
      const endTime = '09:31'; // Very narrow window

      const randomTime = generateRandomTimeForDay(date, startTime, endTime);

      expect(randomTime).toBe('09:30'); // Should be the only possible time
    });
  });

  describe('detectRandomTimeEntry', () => {
    it('should find bar matching random time', () => {
      const config: RandomTimeEntryConfig = {
        startTime: '10:00',
        endTime: '14:00',
      };

      // Generate random time for specific date
      const testDate = '2023-05-15';
      const randomTime = generateRandomTimeForDay(testDate, config.startTime, config.endTime);

      // Create bars including one at the random time
      const bars = [
        createTestBar(`${testDate} 09:30:00`, 100, 101, 99, 100.5, 1000),
        createTestBar(`${testDate} ${randomTime}:00`, 100.5, 102, 100, 101, 1200),
        createTestBar(`${testDate} 15:00:00`, 101, 102, 100.5, 101.5, 1100),
      ];

      const result = detectRandomTimeEntry(bars, config, 'long', testDate);

      expect(result).not.toBeNull();
      expect(result?.timestamp).toBe(`${testDate} ${randomTime}:00`);
    });

    it('should return null if no bar matches random time', () => {
      const config: RandomTimeEntryConfig = {
        startTime: '10:00',
        endTime: '14:00',
      };

      const bars = [
        createTestBar('2023-05-15 09:30:00', 100, 101, 99, 100.5, 1000),
        createTestBar('2023-05-15 15:00:00', 101, 102, 100.5, 101.5, 1100),
      ];

      const result = detectRandomTimeEntry(bars, config, 'long', '2023-05-15');

      expect(result).toBeNull();
    });

    it('should return null if no bars are provided', () => {
      const config: RandomTimeEntryConfig = {
        startTime: '09:30',
        endTime: '15:30',
      };

      const result = detectRandomTimeEntry([], config, 'long', '2023-05-15');

      expect(result).toBeNull();
    });

    it('should use first bar date if no target date provided', () => {
      const config: RandomTimeEntryConfig = {
        startTime: '10:00',
        endTime: '14:00',
      };

      const testDate = '2023-05-15';
      const randomTime = generateRandomTimeForDay(testDate, config.startTime, config.endTime);

      const bars = [createTestBar(`${testDate} ${randomTime}:00`, 100.5, 102, 100, 101, 1200)];

      const result = detectRandomTimeEntry(bars, config, 'long'); // No target date

      expect(result).not.toBeNull();
      expect(result?.timestamp).toBe(`${testDate} ${randomTime}:00`);
    });
  });

  describe('createSqlQuery', () => {
    it('should generate correct SQL for long direction', () => {
      const config: RandomTimeEntryConfig = {
        startTime: '09:30',
        endTime: '15:30',
      };

      const sql = createSqlQuery(config, 'long');

      expect(sql).toContain("'long' as direction");
      expect(sql).toContain('daily_random_times');
      expect(sql).toContain('random_time');
    });

    it('should generate correct SQL for short direction', () => {
      const config: RandomTimeEntryConfig = {
        startTime: '09:30',
        endTime: '15:30',
      };

      const sql = createSqlQuery(config, 'short');

      expect(sql).toContain("'short' as direction");
      expect(sql).toContain('daily_random_times');
    });
  });

  describe('pattern configuration', () => {
    it('should initialize with default times', () => {
      expect(randomTimeEntryPattern.config.startTime).toBe('09:30');
      expect(randomTimeEntryPattern.config.endTime).toBe('15:30');
      expect(randomTimeEntryPattern.direction).toBe('long');
    });

    it('should update configuration with new times', () => {
      const updatedPattern = randomTimeEntryPattern.updateConfig({
        startTime: '10:00',
        endTime: '14:00',
      });

      const specificUpdatedPattern = updatedPattern as RandomTimeEntryPatternType;
      expect(specificUpdatedPattern.config.startTime).toBe('10:00');
      expect(specificUpdatedPattern.config.endTime).toBe('14:00');
    });

    it('should handle dash-separated config keys', () => {
      const updatedPattern = randomTimeEntryPattern.updateConfig({
        'start-time': '11:00',
        'end-time': '13:00',
      } as any);

      const specificUpdatedPattern = updatedPattern as RandomTimeEntryPatternType;
      expect(specificUpdatedPattern.config.startTime).toBe('11:00');
      expect(specificUpdatedPattern.config.endTime).toBe('13:00');
    });

    it('should validate time format', () => {
      expect(() => {
        randomTimeEntryPattern.updateConfig({
          startTime: '25:00', // Invalid hour
        });
      }).toThrow('startTime must be in HH:MM format');

      expect(() => {
        randomTimeEntryPattern.updateConfig({
          endTime: '10:70', // Invalid minutes
        });
      }).toThrow('endTime must be in HH:MM format');
    });

    it('should validate time order', () => {
      expect(() => {
        randomTimeEntryPattern.updateConfig({
          startTime: '15:00',
          endTime: '10:00', // End before start
        });
      }).toThrow('startTime must be before endTime');

      expect(() => {
        randomTimeEntryPattern.updateConfig({
          startTime: '12:00',
          endTime: '12:00', // Same time
        });
      }).toThrow('startTime must be before endTime');
    });

    it('should update SQL query when configuration is changed', () => {
      const originalPattern = randomTimeEntryPattern;
      const updatedPattern = originalPattern.updateConfig({
        startTime: '10:00',
        endTime: '14:00',
      });

      expect(updatedPattern.sql).toContain('daily_random_times');
      expect(updatedPattern.sql).toContain('random_time');
    });
  });

  describe('randomness distribution', () => {
    it('should generate diverse times across multiple days', () => {
      const startTime = '09:30';
      const endTime = '15:30';
      const dates = [
        '2023-01-01',
        '2023-01-02',
        '2023-01-03',
        '2023-01-04',
        '2023-01-05',
        '2023-01-08',
        '2023-01-09',
        '2023-01-10',
        '2023-01-11',
        '2023-01-12',
      ];

      const times = dates.map(date => generateRandomTimeForDay(date, startTime, endTime));
      const uniqueTimes = new Set(times);

      // Should have multiple unique times (allowing for some collisions)
      expect(uniqueTimes.size).toBeGreaterThan(1);
      expect(uniqueTimes.size).toBeLessThanOrEqual(times.length);

      // All times should be within range
      times.forEach(time => {
        const [hour, min] = time.split(':').map(Number);
        const minutes = hour * 60 + min;
        expect(minutes).toBeGreaterThanOrEqual(9 * 60 + 30); // 09:30
        expect(minutes).toBeLessThan(15 * 60 + 30); // 15:30
      });
    });

    it('should be deterministic for the same date', () => {
      const date = '2023-05-15';
      const startTime = '09:30';
      const endTime = '15:30';

      // Generate same random time multiple times
      const times = Array.from({ length: 10 }, () =>
        generateRandomTimeForDay(date, startTime, endTime)
      );

      // All should be identical
      const uniqueTimes = new Set(times);
      expect(uniqueTimes.size).toBe(1);
    });
  });
});
