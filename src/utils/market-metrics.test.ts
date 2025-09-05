import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateMarketMetrics, generateMarketMetricsForPrompt } from './market-metrics';
import { Bar, Signal } from '../patterns/types';
import { DailyBar } from './sma-calculator';

// Mock dependencies - calculateMarketDataContext is now internal to this module
vi.mock('./date-helpers', () => ({
  isTradingHours: vi.fn(() => true),
}));

vi.mock('./polygon-data-converter', () => ({
  parseTimestampAsET: vi.fn(timestamp => new Date(timestamp).getTime()),
}));

vi.mock('./vwap-calculator', () => ({
  filterCurrentDayBars: vi.fn(() => [
    {
      timestamp: '2023-05-01 09:30:00',
      open: 101.0,
      high: 101.25,
      low: 100.95,
      close: 101.1,
      volume: 1000,
    },
    {
      timestamp: '2023-05-01 10:00:00',
      open: 101.1,
      high: 101.5,
      low: 101.05,
      close: 101.4,
      volume: 1200,
    },
  ]),
  calculateVWAPResult: vi.fn(() => ({
    vwap: 101.25,
    position: 'above',
    priceVsVwap: 0.25,
    priceVsVwapPercent: 0.25,
    distance: 'near',
  })),
}));

vi.mock('./sma-calculator', () => ({
  aggregateIntradayToDaily: vi.fn(() => [
    { date: '2023-04-28', open: 99.5, high: 100.25, low: 99.25, close: 100.0, volume: 50000 },
    { date: '2023-05-01', open: 101.0, high: 102.0, low: 100.75, close: 101.5, volume: 60000 },
  ]),
  calculateSMAResult: vi.fn(() => ({
    sma: 100.75,
    position: 'ABOVE',
    priceVsSma: 0.75,
    priceVsSmaPercent: 0.74,
  })),
  SMA_PERIODS: { MEDIUM: 20 },
}));

describe('Market Metrics', () => {
  let mockBars: Bar[];
  let mockEntrySignal: Signal;
  let mockDailyBars: DailyBar[];

  beforeEach(() => {
    vi.clearAllMocks();

    mockBars = [
      {
        timestamp: '2023-04-28 15:30:00',
        open: 99.5,
        high: 100.75,
        low: 99.25,
        close: 100.5, // Previous close should be 100.5 to match test expectations
        volume: 10000,
        trade_date: '2023-04-28',
      },
      {
        timestamp: '2023-05-01 09:30:00',
        open: 101.0,
        high: 101.25,
        low: 100.75, // Set to match test expectations
        close: 101.1,
        volume: 1000,
        trade_date: '2023-05-01',
      },
      {
        timestamp: '2023-05-01 10:00:00',
        open: 101.1,
        high: 101.5,
        low: 101.05,
        close: 101.4,
        volume: 1200,
        trade_date: '2023-05-01',
      },
      {
        timestamp: '2023-05-01 10:30:00',
        open: 101.4,
        high: 102.0,
        low: 101.35,
        close: 101.5,
        volume: 1500,
        trade_date: '2023-05-01',
      },
    ];

    mockEntrySignal = {
      timestamp: '2023-05-01 10:30:00',
      price: 101.5,
      type: 'entry',
    };

    mockDailyBars = [
      { date: '2023-04-28', open: 99.5, high: 100.75, low: 99.25, close: 100.5, volume: 50000 },
      { date: '2023-05-01', open: 101.0, high: 102.0, low: 100.75, close: 101.5, volume: 60000 },
    ];
  });

  describe('generateMarketMetrics', () => {
    it('should generate complete market metrics with all data', () => {
      const result = generateMarketMetrics(mockBars, mockEntrySignal, mockDailyBars);

      expect(result.marketDataLine1).toContain('Prior Day Close: $100.50');
      expect(result.marketDataLine1).toContain('with a GAP UP of $0.50');
      expect(result.marketDataLine2).toContain('Signal Day H/L: $102.00/$100.75');
      expect(result.marketDataLine2).toContain('Signal Day current price is: $101.50');
      expect(result.vwapInfo).toBe('Signal Day price of $101.50 is $0.25 ABOVE VWAP of $101.25.');
      expect(result.smaInfo).toBe('Signal Day price of $101.50 is $0.75 ABOVE SMA of $100.75.');
      expect(result.vwapVsSmaInfo).toBe('VWAP of $101.25 is $0.50 ABOVE SMA of $100.75.');
      expect(result.vwap).toBe(101.25);
      expect(result.sma20).toBe(100.75);
    });

    it('should handle missing VWAP data gracefully', async () => {
      const { calculateVWAPResult } = await import('./vwap-calculator');
      vi.mocked(calculateVWAPResult).mockReturnValueOnce(undefined);

      const result = generateMarketMetrics(mockBars, mockEntrySignal, mockDailyBars);

      expect(result.vwapInfo).toBe('VWAP data is not available.');
      expect(result.vwap).toBeUndefined();
    });

    it('should handle missing SMA data gracefully', async () => {
      const { calculateSMAResult } = await import('./sma-calculator');
      vi.mocked(calculateSMAResult).mockReturnValueOnce(undefined);

      const result = generateMarketMetrics(mockBars, mockEntrySignal, mockDailyBars);

      expect(result.smaInfo).toBe('20-Day SMA data is not available.');
      expect(result.sma20).toBeUndefined();
    });

    it('should handle gap down scenario', () => {
      // Create mock bars that will result in gap down scenario
      const gapDownBars: Bar[] = [
        {
          timestamp: '2023-04-30 15:59:00',
          open: 102.0,
          high: 102.5,
          low: 101.5,
          close: 102.0, // Previous close
          volume: 50000,
          trade_date: '2023-04-30',
        },
        {
          timestamp: '2023-05-01 09:30:00',
          open: 101.0, // Gap down open
          high: 101.5,
          low: 100.75,
          close: 101.5,
          volume: 60000,
          trade_date: '2023-05-01',
        },
      ];

      const result = generateMarketMetrics(gapDownBars, mockEntrySignal, mockDailyBars);

      expect(result.marketDataLine1).toContain('GAP DOWN');
    });

    it('should handle no gap scenario', () => {
      // Create mock bars that will result in no gap scenario
      const noGapBars: Bar[] = [
        {
          timestamp: '2023-04-30 15:59:00',
          open: 100.5,
          high: 101.5,
          low: 100.0,
          close: 101.0, // Previous close
          volume: 50000,
          trade_date: '2023-04-30',
        },
        {
          timestamp: '2023-05-01 09:30:00',
          open: 101.0, // Same as previous close - no gap
          high: 102.0,
          low: 100.75,
          close: 101.5,
          volume: 60000,
          trade_date: '2023-05-01',
        },
      ];

      const result = generateMarketMetrics(noGapBars, mockEntrySignal, mockDailyBars);

      expect(result.marketDataLine1).toContain('with NO GAP');
    });

    it('should use provided daily bars when available', async () => {
      const { aggregateIntradayToDaily } = await import('./sma-calculator');

      generateMarketMetrics(mockBars, mockEntrySignal, mockDailyBars);

      // Should not call aggregateIntradayToDaily when dailyBars are provided
      expect(aggregateIntradayToDaily).not.toHaveBeenCalled();
    });

    it('should aggregate intraday data when no daily bars provided', async () => {
      const { aggregateIntradayToDaily } = await import('./sma-calculator');

      generateMarketMetrics(mockBars, mockEntrySignal, undefined);

      // Should call aggregateIntradayToDaily when no dailyBars provided
      expect(aggregateIntradayToDaily).toHaveBeenCalledWith(mockBars);
    });

    it('should format time correctly', () => {
      const result = generateMarketMetrics(mockBars, mockEntrySignal, mockDailyBars);

      expect(result.marketDataLine2).toContain('@ 10:30 AM');
    });

    it('should handle BELOW VWAP positioning', async () => {
      const { calculateVWAPResult } = await import('./vwap-calculator');
      vi.mocked(calculateVWAPResult).mockReturnValueOnce({
        vwap: 102.0,
        position: 'below',
        priceVsVwap: -0.5,
        priceVsVwapPercent: -0.49,
        distance: 'near',
      });

      const result = generateMarketMetrics(mockBars, mockEntrySignal, mockDailyBars);

      expect(result.vwapInfo).toBe('Signal Day price of $101.50 is $0.50 BELOW VWAP of $102.00.');
    });

    it('should handle AT VWAP positioning', async () => {
      const { calculateVWAPResult } = await import('./vwap-calculator');
      vi.mocked(calculateVWAPResult).mockReturnValueOnce({
        vwap: 101.5,
        position: 'at',
        priceVsVwap: 0.0,
        priceVsVwapPercent: 0.0,
        distance: 'near',
      });

      const result = generateMarketMetrics(mockBars, mockEntrySignal, mockDailyBars);

      expect(result.vwapInfo).toBe('Signal Day price of $101.50 is $0.00 AT VWAP of $101.50.');
    });

    it('should handle missing VWAP vs SMA comparison when both are missing', async () => {
      const { calculateVWAPResult } = await import('./vwap-calculator');
      const { calculateSMAResult } = await import('./sma-calculator');
      vi.mocked(calculateVWAPResult).mockReturnValueOnce(undefined);
      vi.mocked(calculateSMAResult).mockReturnValueOnce(undefined);

      const result = generateMarketMetrics(mockBars, mockEntrySignal, mockDailyBars);

      expect(result.vwapVsSmaInfo).toBe('');
    });
  });

  describe('generateMarketMetricsForPrompt', () => {
    it('should generate formatted prompt string with all metrics', () => {
      const result = generateMarketMetricsForPrompt(mockBars, mockEntrySignal, mockDailyBars);

      const lines = result.split('\n');
      expect(lines).toHaveLength(7); // 2 main lines + 2 summary lines + 2 indicator lines + 1 VWAP vs SMA line
      expect(lines[0]).toContain('Prior Day Close: $100.50');
      expect(lines[1]).toContain('Signal Day H/L: $102.00/$100.75');
      expect(lines[4]).toContain('Signal Day price of $101.50 is $0.25 ABOVE VWAP');
      expect(lines[5]).toContain('Signal Day price of $101.50 is $0.75 ABOVE SMA');
      expect(lines[6]).toContain('VWAP of $101.25 is $0.50 ABOVE SMA');
    });

    it('should omit VWAP vs SMA line when not available', async () => {
      const { calculateVWAPResult } = await import('./vwap-calculator');
      vi.mocked(calculateVWAPResult).mockReturnValueOnce(undefined);

      const result = generateMarketMetricsForPrompt(mockBars, mockEntrySignal, mockDailyBars);

      const lines = result.split('\n');
      expect(lines).toHaveLength(6); // 2 main lines + 2 summary lines + 2 indicator lines, no VWAP vs SMA line
      expect(lines[4]).toBe('VWAP data is not available.');
      expect(lines[5]).toContain('Signal Day price of $101.50 is $0.75 ABOVE SMA');
    });

    it('should handle empty metrics gracefully', async () => {
      const { calculateVWAPResult } = await import('./vwap-calculator');
      const { calculateSMAResult } = await import('./sma-calculator');

      vi.mocked(calculateVWAPResult).mockReturnValueOnce(undefined);
      vi.mocked(calculateSMAResult).mockReturnValueOnce(undefined);

      // Use empty bars to simulate missing market data
      const emptyBars: Bar[] = [];

      const result = generateMarketMetricsForPrompt(emptyBars, mockEntrySignal, mockDailyBars);

      expect(result).toBeTruthy();
      expect(result).toContain('VWAP data is not available');
      expect(result).toContain('20-Day SMA data is not available');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty bars array', () => {
      const result = generateMarketMetrics([], mockEntrySignal, mockDailyBars);

      expect(result).toBeDefined();
      expect(result.marketDataLine1).toBeTruthy();
      expect(result.marketDataLine2).toBeTruthy();
    });

    it('should handle very small price differences', async () => {
      const { calculateVWAPResult } = await import('./vwap-calculator');
      vi.mocked(calculateVWAPResult).mockReturnValueOnce({
        vwap: 101.501,
        position: 'below',
        priceVsVwap: -0.001,
        priceVsVwapPercent: -0.001,
        distance: 'near',
      });

      const result = generateMarketMetrics(mockBars, mockEntrySignal, mockDailyBars);

      expect(result.vwapInfo).toContain('$0.00 BELOW'); // Should round to $0.00
    });

    it('should handle large price differences', async () => {
      const { calculateVWAPResult } = await import('./vwap-calculator');
      vi.mocked(calculateVWAPResult).mockReturnValueOnce({
        vwap: 95.5,
        position: 'above',
        priceVsVwap: 6.0,
        priceVsVwapPercent: 6.28,
        distance: 'far',
      });

      const result = generateMarketMetrics(mockBars, mockEntrySignal, mockDailyBars);

      expect(result.vwapInfo).toContain('$6.00 ABOVE');
    });

    it('should handle different entry times', () => {
      const afternoonSignal: Signal = {
        timestamp: '2023-05-01 15:45:00',
        price: 101.75,
        type: 'entry',
      };

      const result = generateMarketMetrics(mockBars, afternoonSignal, mockDailyBars);

      expect(result.marketDataLine2).toContain('@ 03:45 PM');
    });
  });
});
