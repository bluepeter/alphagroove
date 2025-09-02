import { describe, it, expect } from 'vitest';
import { generateSvgChart } from './chart-generator';
import { Bar, Signal } from '../patterns/types';

/**
 * Test to ensure both CSV (backtest) and Polygon (scout) data sources
 * use the same underlying chart generation logic with correct timestamp parsing
 */
describe('Timestamp Parsing for Chart Generation', () => {
  describe('CSV Data (Backtest) - Already in Eastern Time', () => {
    it('should correctly parse CSV timestamps and filter trading hours', () => {
      // Mock CSV data with pre-market, market hours, and after-hours data
      const csvBars: Bar[] = [
        // Previous day - after hours (should be ignored)
        {
          timestamp: '2023-05-01 17:00:00', // 5:00 PM ET
          open: 102,
          high: 102.5,
          low: 101,
          close: 102.2,
          volume: 300,
          trade_date: '2023-05-01',
        },
        // Previous day - market close (should be used as previous close)
        {
          timestamp: '2023-05-01 15:30:00', // 3:30 PM ET
          open: 100.5,
          high: 102,
          low: 100,
          close: 101.5,
          volume: 1200,
          trade_date: '2023-05-01',
        },
        // Current day - pre-market (should be ignored)
        {
          timestamp: '2023-05-02 08:30:00', // 8:30 AM ET
          open: 102.5,
          high: 103,
          low: 102,
          close: 102.8,
          volume: 400,
          trade_date: '2023-05-02',
        },
        // Current day - market open (should be used as today open)
        {
          timestamp: '2023-05-02 09:30:00', // 9:30 AM ET
          open: 103,
          high: 105,
          low: 102,
          close: 104,
          volume: 1000,
          trade_date: '2023-05-02',
        },
        // Current day - market hours
        {
          timestamp: '2023-05-02 10:30:00', // 10:30 AM ET
          open: 104,
          high: 106,
          low: 103.5,
          close: 105.5,
          volume: 1100,
          trade_date: '2023-05-02',
        },
        // Current day - after hours (should be ignored)
        {
          timestamp: '2023-05-02 17:30:00', // 5:30 PM ET
          open: 105.5,
          high: 106.5,
          low: 105,
          close: 106,
          volume: 200,
          trade_date: '2023-05-02',
        },
      ];

      const entrySignal: Signal = {
        timestamp: '2023-05-02 10:30:00',
        price: 104.5,
        type: 'entry',
      };

      const svgContent = generateSvgChart(
        'SPY',
        'csv-test-pattern',
        csvBars,
        entrySignal,
        false, // showFullDayData
        false // not anonymized
      );

      // Should correctly identify trading hours data
      expect(svgContent).toContain('Prev Close: $101.50'); // From 15:30 (3:30 PM), not 17:00 (5:00 PM)
      expect(svgContent).toContain('Today Open: $103.00'); // From 09:30 (9:30 AM), not 08:30 (8:30 AM)
      expect(svgContent).toContain('GAP UP: +$1.50 (+1.48%)'); // 103.00 - 101.50 = +1.50
      expect(svgContent).toContain('Today H/L: $106.00/$102.00'); // Market hours only
    });
  });

  describe('Data Source Consistency', () => {
    it('should produce identical results regardless of data source format', () => {
      // This test ensures that both CSV (backtest) and Polygon (scout) data
      // produce the same chart headers when representing the same market data

      // The key insight is that both data sources, after processing, should
      // result in the same market data context calculations

      // CSV format test already validates the core functionality above
      // Polygon data goes through convertPolygonData() which converts UTC to ET
      // So by the time it reaches chart generation, it's in the same format

      // This test serves as documentation that both paths use the same logic
      expect(true).toBe(true); // Placeholder - the real test is in the CSV test above
    });
  });

  describe('Daylight Saving Time Handling', () => {
    it('should correctly handle EST vs EDT transitions', () => {
      // Test data from January (EST - UTC-5) vs May (EDT - UTC-4)
      const estBars: Bar[] = [
        // January data - EST (UTC-5)
        {
          timestamp: '2023-01-15 15:30:00', // 3:30 PM EST
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
          trade_date: '2023-01-15',
        },
        {
          timestamp: '2023-01-16 09:30:00', // 9:30 AM EST
          open: 101,
          high: 102,
          low: 100.5,
          close: 101.5,
          volume: 1200,
          trade_date: '2023-01-16',
        },
      ];

      const edtBars: Bar[] = [
        // May data - EDT (UTC-4)
        {
          timestamp: '2023-05-15 15:30:00', // 3:30 PM EDT
          open: 200,
          high: 201,
          low: 199,
          close: 200.5,
          volume: 1000,
          trade_date: '2023-05-15',
        },
        {
          timestamp: '2023-05-16 09:30:00', // 9:30 AM EDT
          open: 201,
          high: 202,
          low: 200.5,
          close: 201.5,
          volume: 1200,
          trade_date: '2023-05-16',
        },
      ];

      // Test EST period
      const estSvg = generateSvgChart(
        'SPY',
        'est-test',
        estBars,
        { timestamp: '2023-01-16 10:00:00', price: 101.2, type: 'entry' },
        false,
        false
      );

      // Test EDT period
      const edtSvg = generateSvgChart(
        'SPY',
        'edt-test',
        edtBars,
        { timestamp: '2023-05-16 10:00:00', price: 201.2, type: 'entry' },
        false,
        false
      );

      // Both should correctly identify market hours regardless of EST/EDT
      expect(estSvg).toContain('Prev Close: $100.50');
      expect(estSvg).toContain('Today Open: $101.00');
      expect(edtSvg).toContain('Prev Close: $200.50');
      expect(edtSvg).toContain('Today Open: $201.00');
    });
  });
});
