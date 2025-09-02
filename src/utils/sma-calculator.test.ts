import { describe, it, expect } from 'vitest';
import {
  calculateSMA,
  calculateSMAResult,
  aggregateIntradayToDaily,
  convertPolygonToDailyBars,
  calculateTradingDaysAgo,
  type DailyBar,
} from './sma-calculator';
import { Bar } from '../patterns/types';

describe('SMA Calculator', () => {
  // Helper function to create mock daily bars
  const createMockDailyBar = (
    date: string,
    open: number,
    high: number,
    low: number,
    close: number,
    volume: number = 1000000
  ): DailyBar => ({
    date,
    open,
    high,
    low,
    close,
    volume,
  });

  describe('calculateSMA', () => {
    it('should calculate SMA correctly for sufficient data', () => {
      const dailyBars = [
        createMockDailyBar('2023-01-01', 100, 102, 98, 101),
        createMockDailyBar('2023-01-02', 101, 103, 99, 102),
        createMockDailyBar('2023-01-03', 102, 104, 100, 103),
        createMockDailyBar('2023-01-04', 103, 105, 101, 104),
        createMockDailyBar('2023-01-05', 104, 106, 102, 105),
      ];

      const sma5 = calculateSMA(dailyBars, 5);

      // SMA = (101 + 102 + 103 + 104 + 105) / 5 = 103
      expect(sma5).toBeCloseTo(103, 2);
    });

    it('should calculate SMA using only the last N periods', () => {
      const dailyBars = [
        createMockDailyBar('2023-01-01', 100, 102, 98, 90), // Should be ignored
        createMockDailyBar('2023-01-02', 101, 103, 99, 91), // Should be ignored
        createMockDailyBar('2023-01-03', 102, 104, 100, 100),
        createMockDailyBar('2023-01-04', 103, 105, 101, 101),
        createMockDailyBar('2023-01-05', 104, 106, 102, 102),
      ];

      const sma3 = calculateSMA(dailyBars, 3);

      // SMA = (100 + 101 + 102) / 3 = 101
      expect(sma3).toBeCloseTo(101, 2);
    });

    it('should return undefined for insufficient data', () => {
      const dailyBars = [
        createMockDailyBar('2023-01-01', 100, 102, 98, 101),
        createMockDailyBar('2023-01-02', 101, 103, 99, 102),
      ];

      const sma5 = calculateSMA(dailyBars, 5);
      expect(sma5).toBeUndefined();
    });

    it('should handle empty array', () => {
      const sma20 = calculateSMA([], 20);
      expect(sma20).toBeUndefined();
    });

    it('should calculate 20-day SMA correctly', () => {
      // Create 20 days of data with closes from 100 to 119
      const dailyBars = Array.from({ length: 20 }, (_, i) =>
        createMockDailyBar(
          `2023-01-${String(i + 1).padStart(2, '0')}`,
          100 + i,
          102 + i,
          98 + i,
          100 + i
        )
      );

      const sma20 = calculateSMA(dailyBars, 20);

      // SMA = (100 + 101 + ... + 119) / 20 = 109.5
      expect(sma20).toBeCloseTo(109.5, 2);
    });
  });

  describe('calculateSMAResult', () => {
    const mockDailyBars = [
      createMockDailyBar('2023-01-01', 98, 102, 96, 100),
      createMockDailyBar('2023-01-02', 100, 104, 98, 102),
      createMockDailyBar('2023-01-03', 102, 106, 100, 104),
    ];

    it('should calculate result when price is above SMA', () => {
      const currentPrice = 105;
      const result = calculateSMAResult(mockDailyBars, 3, currentPrice);

      expect(result).toBeDefined();
      expect(result!.sma).toBeCloseTo(102, 2); // (100 + 102 + 104) / 3
      expect(result!.priceVsSma).toBeCloseTo(3, 2); // 105 - 102
      expect(result!.priceVsSmaPercent).toBeCloseTo(2.94, 1); // (3/102) * 100
      expect(result!.position).toBe('above');
    });

    it('should calculate result when price is below SMA', () => {
      const currentPrice = 99;
      const result = calculateSMAResult(mockDailyBars, 3, currentPrice);

      expect(result).toBeDefined();
      expect(result!.priceVsSma).toBeLessThan(0);
      expect(result!.priceVsSmaPercent).toBeLessThan(0);
      expect(result!.position).toBe('below');
    });

    it('should identify when price is at SMA', () => {
      const currentPrice = 102;
      const result = calculateSMAResult(mockDailyBars, 3, currentPrice);

      expect(result).toBeDefined();
      expect(result!.position).toBe('at');
    });

    it('should return undefined when insufficient data', () => {
      const result = calculateSMAResult(mockDailyBars, 10, 100);
      expect(result).toBeUndefined();
    });
  });

  describe('aggregateIntradayToDaily', () => {
    it('should aggregate intraday bars to daily bars correctly', () => {
      const intradayBars: Bar[] = [
        {
          timestamp: '2023-01-01 09:30:00',
          open: 100,
          high: 102,
          low: 100,
          close: 101,
          volume: 1000,
          trade_date: '2023-01-01',
        },
        {
          timestamp: '2023-01-01 10:30:00',
          open: 101,
          high: 105,
          low: 99,
          close: 103,
          volume: 1500,
          trade_date: '2023-01-01',
        },
        {
          timestamp: '2023-01-02 09:30:00',
          open: 103,
          high: 106,
          low: 102,
          close: 105,
          volume: 2000,
          trade_date: '2023-01-02',
        },
      ];

      const dailyBars = aggregateIntradayToDaily(intradayBars);

      expect(dailyBars).toHaveLength(2);

      // First day
      expect(dailyBars[0].date).toBe('2023-01-01');
      expect(dailyBars[0].open).toBe(100); // First open
      expect(dailyBars[0].high).toBe(105); // Max high
      expect(dailyBars[0].low).toBe(99); // Min low
      expect(dailyBars[0].close).toBe(103); // Last close
      expect(dailyBars[0].volume).toBe(2500); // Sum volume

      // Second day
      expect(dailyBars[1].date).toBe('2023-01-02');
      expect(dailyBars[1].open).toBe(103);
      expect(dailyBars[1].high).toBe(106);
      expect(dailyBars[1].low).toBe(102);
      expect(dailyBars[1].close).toBe(105);
      expect(dailyBars[1].volume).toBe(2000);
    });

    it('should handle empty array', () => {
      const dailyBars = aggregateIntradayToDaily([]);
      expect(dailyBars).toEqual([]);
    });

    it('should sort daily bars by date', () => {
      const intradayBars: Bar[] = [
        {
          timestamp: '2023-01-03 09:30:00',
          open: 105,
          high: 107,
          low: 105,
          close: 106,
          volume: 1000,
          trade_date: '2023-01-03',
        },
        {
          timestamp: '2023-01-01 09:30:00',
          open: 100,
          high: 102,
          low: 100,
          close: 101,
          volume: 1000,
          trade_date: '2023-01-01',
        },
      ];

      const dailyBars = aggregateIntradayToDaily(intradayBars);

      expect(dailyBars[0].date).toBe('2023-01-01');
      expect(dailyBars[1].date).toBe('2023-01-03');
    });
  });

  describe('convertPolygonToDailyBars', () => {
    it('should convert Polygon bars to DailyBar format', () => {
      const polygonBars = [
        {
          t: new Date('2023-01-01').getTime(),
          o: 100,
          h: 105,
          l: 98,
          c: 103,
          v: 1000000,
        },
        {
          t: new Date('2023-01-02').getTime(),
          o: 103,
          h: 107,
          l: 101,
          c: 106,
          v: 1200000,
        },
      ];

      const dailyBars = convertPolygonToDailyBars(polygonBars);

      expect(dailyBars).toHaveLength(2);
      expect(dailyBars[0].date).toBe('2023-01-01');
      expect(dailyBars[0].open).toBe(100);
      expect(dailyBars[0].high).toBe(105);
      expect(dailyBars[0].low).toBe(98);
      expect(dailyBars[0].close).toBe(103);
      expect(dailyBars[0].volume).toBe(1000000);
    });

    it('should sort bars by date', () => {
      const polygonBars = [
        {
          t: new Date('2023-01-03').getTime(),
          o: 106,
          h: 108,
          l: 104,
          c: 107,
          v: 1000000,
        },
        {
          t: new Date('2023-01-01').getTime(),
          o: 100,
          h: 105,
          l: 98,
          c: 103,
          v: 1000000,
        },
      ];

      const dailyBars = convertPolygonToDailyBars(polygonBars);

      expect(dailyBars[0].date).toBe('2023-01-01');
      expect(dailyBars[1].date).toBe('2023-01-03');
    });
  });

  describe('calculateTradingDaysAgo', () => {
    it('should calculate approximate date for trading days ago', () => {
      const testDate = new Date('2023-06-15'); // Thursday
      const result = calculateTradingDaysAgo(5, testDate);

      // Should be roughly a week ago, accounting for weekends
      expect(result).toMatch(/2023-06-0[7-9]/);
    });

    it('should use current date when no date provided', () => {
      const result = calculateTradingDaysAgo(1);

      // Should be a valid date string
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('Real-world SMA scenarios', () => {
    it('should calculate 20-day SMA for realistic stock data', () => {
      // Simulate 20 days of SPY data with realistic closes
      const dailyBars = [
        createMockDailyBar('2023-05-01', 410.0, 412.5, 408.0, 411.2),
        createMockDailyBar('2023-05-02', 411.5, 414.0, 410.0, 413.8),
        createMockDailyBar('2023-05-03', 413.0, 415.5, 411.5, 414.6),
        createMockDailyBar('2023-05-04', 414.2, 416.8, 413.0, 415.9),
        createMockDailyBar('2023-05-05', 415.5, 418.0, 414.2, 417.3),
        // ... continue with 15 more days
        ...Array.from({ length: 15 }, (_, i) =>
          createMockDailyBar(
            `2023-05-${String(i + 6).padStart(2, '0')}`,
            417 + i * 0.5,
            419 + i * 0.5,
            415 + i * 0.5,
            418 + i * 0.5
          )
        ),
      ];

      const sma20 = calculateSMA(dailyBars, 20);
      const currentPrice = 425.5;
      const result = calculateSMAResult(dailyBars, 20, currentPrice);

      expect(sma20).toBeDefined();
      expect(sma20).toBeGreaterThan(410);
      expect(sma20).toBeLessThan(430);

      expect(result).toBeDefined();
      expect(result!.position).toBe('above'); // Price should be above SMA
      expect(result!.period).toBe(20);
    });
  });
});
