import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getPreviousTradingDay,
  formatTimestampET,
  isTradingHours,
  isBeforeEntryTime,
  generateTimestamp,
} from './date-helpers';

describe('Date Helpers', () => {
  describe('getPreviousTradingDay', () => {
    it('should return previous day when current day is Tuesday-Friday', () => {
      // Wednesday, January 3, 2024
      const wednesday = new Date('2024-01-03');
      expect(getPreviousTradingDay(wednesday)).toBe('2024-01-02');
    });

    it('should skip weekend and return Friday when current day is Monday', () => {
      // Monday, January 9, 2024 -> Sunday Jan 8 -> Saturday Jan 7 -> Friday Jan 6
      const monday = new Date('2024-01-09');
      expect(getPreviousTradingDay(monday)).toBe('2024-01-06');
    });

    it('should return Friday when current day is Saturday', () => {
      // Saturday, January 7, 2024 -> Friday Jan 6 (skip Saturday -> Friday Jan 5)
      const saturday = new Date('2024-01-07');
      expect(getPreviousTradingDay(saturday)).toBe('2024-01-06');
    });

    it('should return Friday when current day is Sunday', () => {
      // Sunday, January 8, 2024 -> Saturday Jan 7 -> Friday Jan 6
      const sunday = new Date('2024-01-08');
      expect(getPreviousTradingDay(sunday)).toBe('2024-01-06');
    });

    it('should handle month boundaries correctly', () => {
      // February 1, 2024 (Thursday) -> January 31, 2024 (Wednesday)
      const feb1 = new Date('2024-02-01');
      expect(getPreviousTradingDay(feb1)).toBe('2024-01-31');
    });

    it('should handle year boundaries correctly', () => {
      // January 2, 2024 (Tuesday) -> January 1, 2024 (Monday) -> skip weekend -> Dec 30, 2023 (Saturday) -> Dec 29, 2023 (Friday)
      const jan2 = new Date('2024-01-02');
      expect(getPreviousTradingDay(jan2)).toBe('2023-12-30');
    });
  });

  describe('formatTimestampET', () => {
    it('should format UTC timestamp to Eastern Time', () => {
      // January 3, 2024 10:30:00 AM EST (UTC-5)
      const utcTimestamp = 1704290200000; // Wed Jan 03 2024 15:30:00 GMT+0000
      const result = formatTimestampET(utcTimestamp);

      // Should be formatted as MM/DD/YYYY, HH:MM:SS in ET
      expect(result).toMatch(/01\/03\/2024, \d{2}:\d{2}:\d{2}/);
    });

    it('should handle daylight saving time correctly', () => {
      // July 3, 2024 10:30:00 AM EDT (UTC-4)
      const utcTimestamp = 1720006200000; // Wed Jul 03 2024 14:30:00 GMT+0000
      const result = formatTimestampET(utcTimestamp);

      expect(result).toMatch(/07\/03\/2024, \d{2}:\d{2}:\d{2}/);
    });
  });

  describe('isTradingHours', () => {
    it('should return true for 9:30 AM ET', () => {
      // Create a timestamp for 9:30 AM ET
      const date = new Date('2024-01-03T14:30:00.000Z'); // 9:30 AM EST in UTC
      expect(isTradingHours(date.getTime())).toBe(true);
    });

    it('should return true for 4:00 PM ET', () => {
      // Create a timestamp for 4:00 PM ET
      const date = new Date('2024-01-03T21:00:00.000Z'); // 4:00 PM EST in UTC
      expect(isTradingHours(date.getTime())).toBe(true);
    });

    it('should return false for 9:29 AM ET (before market open)', () => {
      // Create a timestamp for 9:29 AM ET
      const date = new Date('2024-01-03T14:29:00.000Z'); // 9:29 AM EST in UTC
      expect(isTradingHours(date.getTime())).toBe(false);
    });

    it('should return false for 4:01 PM ET (after market close)', () => {
      // Create a timestamp for 4:01 PM ET
      const date = new Date('2024-01-03T21:01:00.000Z'); // 4:01 PM EST in UTC
      expect(isTradingHours(date.getTime())).toBe(false);
    });

    it('should return false for midnight', () => {
      const date = new Date('2024-01-03T05:00:00.000Z'); // Midnight EST in UTC
      expect(isTradingHours(date.getTime())).toBe(false);
    });
  });

  describe('isBeforeEntryTime', () => {
    const tradeDate = '2024-01-03';
    const entryTime = new Date('2024-01-03T15:00:00.000Z'); // 10:00 AM EST

    it('should return true for bars from previous days', () => {
      const previousDayTimestamp = new Date('2024-01-02T15:00:00.000Z').getTime();
      expect(isBeforeEntryTime(previousDayTimestamp, tradeDate, entryTime)).toBe(true);
    });

    it('should return true for bars on trade date before entry time', () => {
      const beforeEntryTimestamp = new Date('2024-01-03T14:30:00.000Z').getTime(); // 9:30 AM EST
      expect(isBeforeEntryTime(beforeEntryTimestamp, tradeDate, entryTime)).toBe(true);
    });

    it('should return true for bars exactly at entry time', () => {
      const exactEntryTimestamp = entryTime.getTime();
      expect(isBeforeEntryTime(exactEntryTimestamp, tradeDate, entryTime)).toBe(true);
    });

    it('should return false for bars on trade date after entry time', () => {
      const afterEntryTimestamp = new Date('2024-01-03T16:00:00.000Z').getTime(); // 11:00 AM EST
      expect(isBeforeEntryTime(afterEntryTimestamp, tradeDate, entryTime)).toBe(false);
    });
  });

  describe('generateTimestamp', () => {
    let mockDate: Date;

    beforeEach(() => {
      // Mock Date to return a fixed timestamp
      mockDate = new Date('2024-01-03T15:30:45.123Z');
      vi.useFakeTimers();
      vi.setSystemTime(mockDate);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should generate a filename-safe timestamp string', () => {
      const result = generateTimestamp();

      // Should be in format YYYY-MM-DDTHH-MM-SS (colons replaced with dashes)
      expect(result).toBe('2024-01-03T15-30-45');
    });

    it('should not contain colons or periods', () => {
      const result = generateTimestamp();

      expect(result).not.toMatch(/[:.]/);
    });
  });
});
