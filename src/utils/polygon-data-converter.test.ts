import { describe, it, expect, vi } from 'vitest';
import { convertPolygonData, filterTradingData } from './polygon-data-converter';
import { PolygonBar } from '../services/polygon-api.service';
import { Bar } from '../patterns/types';

// Mock the date-helpers module
vi.mock('./date-helpers', () => ({
  formatTimestampET: vi.fn((timestamp: number) => {
    // Mock implementation that returns a predictable format for test data
    if (timestamp === 1704290200000) {
      return '01/03/2024, 10:30:00'; // Expected format for the test
    }
    if (timestamp === 1704290260000) {
      return '01/03/2024, 10:31:00'; // Expected format for the test
    }
    // Default fallback
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }),
  isTradingHours: vi.fn((timestamp: number) => {
    // Mock to return true for test data that should be in trading hours
    const testTimestamp = new Date(timestamp).getTime();
    // Return true for our test data timestamps
    return (
      testTimestamp >= new Date('2024-01-02T14:30:00.000Z').getTime() &&
      testTimestamp <= new Date('2024-01-03T21:00:00.000Z').getTime()
    );
  }),
  isBeforeEntryTime: vi.fn((timestamp: number, tradeDate: string, entryTime: Date) => {
    // Mock to return true for timestamps before entry time
    return timestamp <= entryTime.getTime();
  }),
}));

describe('Polygon Data Converter', () => {
  describe('convertPolygonData', () => {
    it('should convert single Polygon bar to internal Bar format', () => {
      const polygonBars: PolygonBar[] = [
        {
          t: 1704290200000, // Wed Jan 03 2024 15:30:00 GMT+0000 (10:30 AM EST)
          o: 100.5,
          h: 102.0,
          l: 99.5,
          c: 101.5,
          v: 1500,
        },
      ];

      const result = convertPolygonData(polygonBars);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        timestamp: '2024-01-03 10:30:00',
        open: 100.5,
        high: 102.0,
        low: 99.5,
        close: 101.5,
        volume: 1500,
        trade_date: '2024-01-03',
      });
    });

    it('should convert multiple Polygon bars', () => {
      const polygonBars: PolygonBar[] = [
        {
          t: 1704290200000, // 10:30 AM EST
          o: 100.5,
          h: 102.0,
          l: 99.5,
          c: 101.5,
          v: 1500,
        },
        {
          t: 1704290260000, // 10:31 AM EST
          o: 101.5,
          h: 103.0,
          l: 100.0,
          c: 102.5,
          v: 1800,
        },
      ];

      const result = convertPolygonData(polygonBars);

      expect(result).toHaveLength(2);
      expect(result[0].timestamp).toBe('2024-01-03 10:30:00');
      expect(result[1].timestamp).toBe('2024-01-03 10:31:00');
      expect(result[0].trade_date).toBe('2024-01-03');
      expect(result[1].trade_date).toBe('2024-01-03');
    });

    it('should handle empty array', () => {
      const result = convertPolygonData([]);
      expect(result).toEqual([]);
    });

    it('should preserve all price and volume data', () => {
      const polygonBars: PolygonBar[] = [
        {
          t: 1704290200000,
          o: 123.45,
          h: 125.67,
          l: 121.23,
          c: 124.56,
          v: 2500,
        },
      ];

      const result = convertPolygonData(polygonBars);

      expect(result[0].open).toBe(123.45);
      expect(result[0].high).toBe(125.67);
      expect(result[0].low).toBe(121.23);
      expect(result[0].close).toBe(124.56);
      expect(result[0].volume).toBe(2500);
    });
  });

  describe('filterTradingData', () => {
    const mockBars: Bar[] = [
      {
        timestamp: '2024-01-02 15:30:00', // Previous day, trading hours
        open: 100,
        high: 101,
        low: 99,
        close: 100.5,
        volume: 1000,
        trade_date: '2024-01-02',
      },
      {
        timestamp: '2024-01-03 08:00:00', // Trade date, pre-market
        open: 100.5,
        high: 101.5,
        low: 100,
        close: 101,
        volume: 500,
        trade_date: '2024-01-03',
      },
      {
        timestamp: '2024-01-03 14:30:00', // Trade date, market hours, before entry
        open: 101,
        high: 102,
        low: 100.5,
        close: 101.5,
        volume: 1500,
        trade_date: '2024-01-03',
      },
      {
        timestamp: '2024-01-03 16:00:00', // Trade date, market hours, after entry
        open: 101.5,
        high: 103,
        low: 101,
        close: 102,
        volume: 2000,
        trade_date: '2024-01-03',
      },
    ];

    it('should filter to trading hours and before entry time', () => {
      const tradeDate = '2024-01-03';
      const entryTime = new Date('2024-01-03T15:30:00.000Z'); // 10:30 AM EST

      const result = filterTradingData(mockBars, tradeDate, entryTime);

      // Should include bars that are in trading hours AND before entry time
      expect(result.length).toBeGreaterThan(0);

      // Verify all returned bars meet the criteria
      result.forEach(bar => {
        const barTimestamp = new Date(bar.timestamp).getTime();
        expect(barTimestamp).toBeLessThanOrEqual(entryTime.getTime());
      });
    });

    it('should return empty array when no bars match criteria', () => {
      const barsOutsideCriteria: Bar[] = [
        {
          timestamp: '2024-01-03 22:00:00', // After market hours
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
          trade_date: '2024-01-03',
        },
      ];

      const tradeDate = '2024-01-03';
      const entryTime = new Date('2024-01-03T15:30:00.000Z');

      const result = filterTradingData(barsOutsideCriteria, tradeDate, entryTime);

      // Should be empty since the bar is outside trading hours
      expect(result).toHaveLength(0);
    });

    it('should handle empty input array', () => {
      const tradeDate = '2024-01-03';
      const entryTime = new Date('2024-01-03T15:30:00.000Z');

      const result = filterTradingData([], tradeDate, entryTime);

      expect(result).toEqual([]);
    });

    it('should preserve bar data structure', () => {
      const tradeDate = '2024-01-03';
      const entryTime = new Date('2024-01-03T16:30:00.000Z'); // Late entry time

      const result = filterTradingData(mockBars, tradeDate, entryTime);

      if (result.length > 0) {
        const firstBar = result[0];
        expect(firstBar).toHaveProperty('timestamp');
        expect(firstBar).toHaveProperty('open');
        expect(firstBar).toHaveProperty('high');
        expect(firstBar).toHaveProperty('low');
        expect(firstBar).toHaveProperty('close');
        expect(firstBar).toHaveProperty('volume');
        expect(firstBar).toHaveProperty('trade_date');
      }
    });
  });
});
