import { describe, it, expect } from 'vitest';
import {
  calculateVWAP,
  calculateVWAPLine,
  calculateVWAPResult,
  filterCurrentDayBars,
} from './vwap-calculator';
import { Bar } from '../patterns/types';

describe('VWAP Calculator', () => {
  // Helper function to create mock bars
  const createMockBar = (
    timestamp: string,
    high: number,
    low: number,
    close: number,
    volume: number
  ): Bar => ({
    timestamp,
    open: (high + low) / 2, // Simple open price
    high,
    low,
    close,
    volume,
    trade_date: timestamp.split(' ')[0],
  });

  describe('calculateVWAP', () => {
    it('should calculate VWAP correctly for single bar', () => {
      const bars = [createMockBar('2023-01-01 09:30:00', 100, 98, 99, 1000)];

      const vwap = calculateVWAP(bars);

      // Typical price = (100 + 98 + 99) / 3 = 99
      // VWAP = (99 * 1000) / 1000 = 99
      expect(vwap).toBeCloseTo(99, 2);
    });

    it('should calculate VWAP correctly for multiple bars', () => {
      const bars = [
        createMockBar('2023-01-01 09:30:00', 100, 98, 99, 1000), // Typical: 99, PV: 99000
        createMockBar('2023-01-01 09:31:00', 102, 100, 101, 2000), // Typical: 101, PV: 202000
        createMockBar('2023-01-01 09:32:00', 98, 96, 97, 1500), // Typical: 97, PV: 145500
      ];

      const vwap = calculateVWAP(bars);

      // Total PV = 99000 + 202000 + 145500 = 446500
      // Total Volume = 1000 + 2000 + 1500 = 4500
      // VWAP = 446500 / 4500 = 99.222...
      expect(vwap).toBeCloseTo(99.22, 2);
    });

    it('should handle bars with zero volume', () => {
      const bars = [
        createMockBar('2023-01-01 09:30:00', 100, 98, 99, 1000),
        createMockBar('2023-01-01 09:31:00', 102, 100, 101, 0), // Zero volume - should be ignored
        createMockBar('2023-01-01 09:32:00', 98, 96, 97, 1500),
      ];

      const vwap = calculateVWAP(bars);

      // Should ignore the zero volume bar
      // Total PV = 99000 + 145500 = 244500
      // Total Volume = 1000 + 1500 = 2500
      // VWAP = 244500 / 2500 = 97.8
      expect(vwap).toBeCloseTo(97.8, 2);
    });

    it('should return undefined for empty array', () => {
      const vwap = calculateVWAP([]);
      expect(vwap).toBeUndefined();
    });

    it('should return undefined when all bars have zero volume', () => {
      const bars = [
        createMockBar('2023-01-01 09:30:00', 100, 98, 99, 0),
        createMockBar('2023-01-01 09:31:00', 102, 100, 101, 0),
      ];

      const vwap = calculateVWAP(bars);
      expect(vwap).toBeUndefined();
    });
  });

  describe('calculateVWAPLine', () => {
    it('should calculate cumulative VWAP points', () => {
      const bars = [
        createMockBar('2023-01-01 09:30:00', 100, 98, 99, 1000),
        createMockBar('2023-01-01 09:31:00', 102, 100, 101, 2000),
        createMockBar('2023-01-01 09:32:00', 98, 96, 97, 1500),
      ];

      const vwapLine = calculateVWAPLine(bars);

      expect(vwapLine).toHaveLength(3);

      // First point: only first bar
      expect(vwapLine[0].timestamp).toBe('2023-01-01 09:30:00');
      expect(vwapLine[0].vwap).toBeCloseTo(99, 2);

      // Second point: first two bars
      expect(vwapLine[1].timestamp).toBe('2023-01-01 09:31:00');
      expect(vwapLine[1].vwap).toBeCloseTo(100.33, 2); // (99*1000 + 101*2000) / 3000

      // Third point: all three bars
      expect(vwapLine[2].timestamp).toBe('2023-01-01 09:32:00');
      expect(vwapLine[2].vwap).toBeCloseTo(99.22, 2); // As calculated above
    });

    it('should return empty array for empty input', () => {
      const vwapLine = calculateVWAPLine([]);
      expect(vwapLine).toEqual([]);
    });

    it('should skip points with undefined VWAP', () => {
      const bars = [
        createMockBar('2023-01-01 09:30:00', 100, 98, 99, 0), // Zero volume
        createMockBar('2023-01-01 09:31:00', 102, 100, 101, 2000),
      ];

      const vwapLine = calculateVWAPLine(bars);

      // Should only have one point (second bar, since first has zero volume)
      expect(vwapLine).toHaveLength(1);
      expect(vwapLine[0].timestamp).toBe('2023-01-01 09:31:00');
      expect(vwapLine[0].vwap).toBeCloseTo(101, 2);
    });
  });

  describe('calculateVWAPResult', () => {
    const mockBars = [
      createMockBar('2023-01-01 09:30:00', 100, 98, 99, 1000),
      createMockBar('2023-01-01 09:31:00', 102, 100, 101, 2000),
    ];

    it('should calculate result when price is above VWAP', () => {
      const currentPrice = 101.5;
      const result = calculateVWAPResult(mockBars, currentPrice);

      expect(result).toBeDefined();
      expect(result!.vwap).toBeCloseTo(100.33, 2);
      expect(result!.priceVsVwap).toBeCloseTo(1.17, 1); // Less precision for floating point
      expect(result!.priceVsVwapPercent).toBeCloseTo(1.16, 1); // Actual calculated value
      expect(result!.position).toBe('above');
      expect(result!.distance).toBe('far'); // > 0.1%
    });

    it('should calculate result when price is below VWAP', () => {
      const currentPrice = 99.5;
      const result = calculateVWAPResult(mockBars, currentPrice);

      expect(result).toBeDefined();
      expect(result!.priceVsVwap).toBeLessThan(0);
      expect(result!.priceVsVwapPercent).toBeLessThan(0);
      expect(result!.position).toBe('below');
    });

    it('should identify when price is at VWAP', () => {
      const currentPrice = 100.33;
      const result = calculateVWAPResult(mockBars, currentPrice);

      expect(result).toBeDefined();
      expect(result!.position).toBe('at');
    });

    it('should identify near vs far distance', () => {
      // Near VWAP (within 0.1%)
      const nearPrice = 100.43; // ~0.1% above VWAP of 100.33
      const nearResult = calculateVWAPResult(mockBars, nearPrice);
      expect(nearResult!.distance).toBe('near');

      // Far from VWAP (> 0.1%)
      const farPrice = 101.5; // ~1.17% above VWAP
      const farResult = calculateVWAPResult(mockBars, farPrice);
      expect(farResult!.distance).toBe('far');
    });

    it('should return undefined when VWAP cannot be calculated', () => {
      const emptyBars: Bar[] = [];
      const result = calculateVWAPResult(emptyBars, 100);

      expect(result).toBeUndefined();
    });
  });

  describe('filterCurrentDayBars', () => {
    const mixedBars = [
      createMockBar('2023-01-01 09:30:00', 100, 98, 99, 1000),
      createMockBar('2023-01-01 10:30:00', 102, 100, 101, 2000),
      createMockBar('2023-01-02 09:30:00', 98, 96, 97, 1500), // Different day
      createMockBar('2023-01-01 14:30:00', 104, 102, 103, 1800),
    ];

    it('should filter bars to specific trading day', () => {
      const currentDayBars = filterCurrentDayBars(mixedBars, '2023-01-01');

      expect(currentDayBars).toHaveLength(3);
      expect(currentDayBars.every(bar => bar.timestamp.startsWith('2023-01-01'))).toBe(true);
    });

    it('should return empty array when no bars match the date', () => {
      const currentDayBars = filterCurrentDayBars(mixedBars, '2023-01-03');

      expect(currentDayBars).toHaveLength(0);
    });

    it('should handle empty input', () => {
      const currentDayBars = filterCurrentDayBars([], '2023-01-01');

      expect(currentDayBars).toHaveLength(0);
    });
  });

  describe('Real-world scenario', () => {
    it('should calculate VWAP correctly for realistic trading data', () => {
      // Simulate first few bars of a trading day
      const bars = [
        createMockBar('2023-05-01 09:30:00', 420.5, 419.2, 420.0, 125000), // Opening bar
        createMockBar('2023-05-01 09:31:00', 420.8, 419.9, 420.3, 98000), // Price rises
        createMockBar('2023-05-01 09:32:00', 420.6, 419.8, 420.1, 87000), // Slight pullback
        createMockBar('2023-05-01 09:33:00', 421.2, 420.0, 421.0, 156000), // Strong move up
      ];

      const vwap = calculateVWAP(bars);
      const vwapLine = calculateVWAPLine(bars);
      const currentPrice = 421.0;
      const result = calculateVWAPResult(bars, currentPrice);

      // VWAP should be reasonable for this price range
      expect(vwap).toBeGreaterThan(419);
      expect(vwap).toBeLessThan(422);

      // VWAP line should have 4 points
      expect(vwapLine).toHaveLength(4);

      // Each subsequent VWAP should be influenced by all previous bars
      expect(vwapLine[0].vwap).toBeCloseTo(419.9, 1); // Just first bar
      expect(vwapLine[3].vwap).toBe(vwap); // Final VWAP

      // Result should show price above VWAP (strong move up)
      expect(result).toBeDefined();
      expect(result!.position).toBe('above');
    });
  });
});
