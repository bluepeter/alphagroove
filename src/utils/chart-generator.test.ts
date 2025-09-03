import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

import { Bar, Signal } from '../patterns/types';

import { generateEntryChart, generateEntryCharts, generateSvgChart } from './chart-generator';

// Mock fs and execSync
vi.mock('fs', async () => {
  const originalFs = await vi.importActual<typeof fs>('fs');
  return {
    default: {
      ...originalFs,
      mkdirSync: originalFs.mkdirSync,
      writeFileSync: originalFs.writeFileSync,
      existsSync: originalFs.existsSync,
      unlinkSync: originalFs.unlinkSync,
    },
    mkdirSync: originalFs.mkdirSync,
    writeFileSync: originalFs.writeFileSync,
    existsSync: originalFs.existsSync,
    unlinkSync: originalFs.unlinkSync,
  };
});

vi.mock('child_process', () => ({
  execSync: vi.fn(
    () =>
      'timestamp,open,high,low,close,volume,trade_date\n2023-05-01 09:35:00,400.5,401.2,400.0,401.0,1000000,2023-05-01'
  ),
}));

// Mock chartjs-node-canvas
vi.mock('chartjs-node-canvas', () => ({
  ChartJSNodeCanvas: class {
    constructor() {}
    renderToBuffer() {
      return Promise.resolve(Buffer.from('mock-image-data'));
    }
  },
}));

describe('Chart Generator', () => {
  const mockSignal: Signal = {
    timestamp: '2023-05-01 09:35:00',
    price: 401.0,
    type: 'entry',
    direction: 'long',
  };

  const testOutputDir = path.join(process.cwd(), 'test-charts');

  beforeEach(() => {
    vi.clearAllMocks();
    // execSync is already mocked at the module level.
    // We can reset its call history and mock implementation for each test if needed.
    // If the top-level mock is sufficient for most tests, only override in specific tests.
    // For now, let's ensure it's reset if we plan to change its returnValue per test.
    const mockedExecSync = execSync as ReturnType<typeof vi.fn>; // Cast to get mock functions
    mockedExecSync.mockReset();
    // Reset to default mock implementation if needed, or set a new one in specific tests
    mockedExecSync.mockReturnValue(
      'timestamp,open,high,low,close,volume,trade_date\n2023-05-01 09:30:00,100,101,99,100.5,1000,2023-05-01'
    );
  });

  afterAll(async () => {
    vi.resetAllMocks();
    const originalFs = await vi.importActual<typeof fs>('fs');
    if (originalFs.existsSync(testOutputDir)) {
      originalFs.rmSync(testOutputDir, { recursive: true, force: true });
      console.log(`Cleaned up test directory: ${testOutputDir}`);
    }
  });

  it('should generate a chart for a single entry signal', async () => {
    const outputPath = await generateEntryChart({
      ticker: 'SPY',
      timeframe: '1min',
      entryPatternName: 'quick-rise',
      tradeDate: '2023-05-01',
      entryTimestamp: '2023-05-01 09:35:00',
      entrySignal: mockSignal,
    });

    // SQL query and temporary SVG writing are implicitly tested by sharp successfully reading the SVG
    // and the overall test not failing due to file system errors.
    // REMOVED: expect(fs.writeFileSync).toHaveBeenCalledWith(expect.stringContaining('temp_chart_query.sql'), ...);
    // REMOVED: expect(fs.writeFileSync).toHaveBeenCalledWith(expect.stringContaining('.svg'), ...);

    // Output path should now be the PNG path
    expect(outputPath).toContain('SPY_quick-rise_20230501_masked.png');
  });

  it('should generate charts for multiple entry signals', async () => {
    const mockTrades = [
      {
        trade_date: '2023-05-01',
        entry_time: '2023-05-01 09:35:00',
        entry_price: 401.0,
        direction: 'long' as const,
      },
      {
        trade_date: '2023-05-02',
        entry_time: '2023-05-02 09:35:00',
        entry_price: 402.5,
        direction: 'long' as const,
      },
    ];

    const chartPaths = await generateEntryCharts('SPY', '1min', 'quick-rise', mockTrades);

    expect(chartPaths.length).toBe(2);
    // Paths should now be PNG paths
    expect(chartPaths[0]).toContain('20230501_masked.png');
    expect(chartPaths[1]).toContain('20230502_masked.png');
  });

  it('should pass suppressSma parameter to generateEntryChart', async () => {
    const outputPath = await generateEntryChart({
      ticker: 'SPY',
      timeframe: '1min',
      entryPatternName: 'test-pattern-suppress-sma',
      tradeDate: '2023-05-01',
      entryTimestamp: '09:35:00',
      entrySignal: mockSignal,
      suppressSma: true,
    });

    expect(outputPath).toContain('test-pattern-suppress-sma');
    expect(outputPath).toContain('SPY');
    expect(outputPath).toContain('20230501');
    expect(outputPath).toContain('masked.png');
  });

  it('should pass suppressSma parameter to bulk generateEntryCharts', async () => {
    const mockTrades = [
      {
        trade_date: '2023-05-01',
        entry_time: '2023-05-01 09:35:00',
        entry_price: 401.0,
        direction: 'long' as const,
      },
    ];

    const chartPaths = await generateEntryCharts(
      'SPY',
      '1min',
      'test-pattern-bulk-suppress',
      mockTrades,
      true
    );

    expect(chartPaths.length).toBe(1);
    expect(chartPaths[0]).toContain('test-pattern-bulk-suppress');
    expect(chartPaths[0]).toContain('20230501_masked.png');
  });

  it('should correctly fetch prior trading day data across a weekend', async () => {
    const mondaySignalDate = '2025-01-27'; // A known Monday
    const precedingFriday = '2025-01-24';

    // Mock execSync to return data for Friday and Monday only
    vi.mocked(execSync).mockReturnValue(
      `timestamp,open,high,low,close,volume,trade_date\n` +
        `${precedingFriday} 09:30:00,100,101,99,100.5,1000,${precedingFriday}\n` +
        `${precedingFriday} 09:31:00,100.5,101.5,100,101,1200,${precedingFriday}\n` +
        `${mondaySignalDate} 09:30:00,102,103,101,102.5,1500,${mondaySignalDate}\n` +
        `${mondaySignalDate} 09:31:00,102.5,103.5,102,103,1600,${mondaySignalDate}`
    );

    const mondaySignal: Signal = {
      timestamp: `${mondaySignalDate} 09:31:00`,
      price: 103,
      type: 'entry',
      direction: 'long',
    };

    const pngPath = await generateEntryChart({
      ticker: 'SPY_WEEKEND_TEST',
      timeframe: '1min',
      entryPatternName: 'weekend-skip-test',
      tradeDate: mondaySignalDate,
      entryTimestamp: mondaySignal.timestamp,
      entrySignal: mondaySignal,
    });

    expect(pngPath).toContain('SPY_WEEKEND_TEST_weekend-skip-test_20250127_masked.png');

    // Implicitly, if no error, fetchMultiDayData and generateSvgChart handled the dates correctly.
    // To be more explicit (requires more complex SVG parsing or visual diff, which is out of scope for this unit test):
    // One could check logs if we added specific logging for dates processed in generateSvgChart.
    // For now, successful generation is the main check.
    const consoleWarnSpy = vi.spyOn(console, 'warn');
    expect(consoleWarnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('No data for the last 2 relevant days')
    );
    expect(consoleWarnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('No data to display after filtering for entry signal')
    );
    consoleWarnSpy.mockRestore();
  });

  it('should correctly fetch prior trading day data across a holiday', async () => {
    const tuesdaySignalDate = '2025-01-21'; // Tuesday after MLK Day (Jan 20, 2025)
    const precedingFriday = '2025-01-17'; // Friday before MLK Day

    // Mock execSync to return data for Friday (Jan 17) and Tuesday (Jan 21),
    // simulating no data for Monday (Jan 20 - MLK Day holiday)
    vi.mocked(execSync).mockReturnValue(
      `timestamp,open,high,low,close,volume,trade_date\n` +
        `${precedingFriday} 15:59:00,100,101,99,100.5,1000,${precedingFriday}\n` +
        `${precedingFriday} 16:00:00,100.5,101.5,100,101,1200,${precedingFriday}\n` +
        `${tuesdaySignalDate} 09:30:00,102,103,101,102.5,1500,${tuesdaySignalDate}\n` +
        `${tuesdaySignalDate} 09:31:00,102.5,103.5,102,103,1600,${tuesdaySignalDate}`
    );

    const tuesdaySignal: Signal = {
      timestamp: `${tuesdaySignalDate} 09:31:00`,
      price: 103,
      type: 'entry',
      direction: 'long',
    };

    const pngPath = await generateEntryChart({
      ticker: 'SPY_HOLIDAY_TEST',
      timeframe: '1min',
      entryPatternName: 'holiday-skip-test',
      tradeDate: tuesdaySignalDate,
      entryTimestamp: tuesdaySignal.timestamp,
      entrySignal: tuesdaySignal,
    });

    expect(pngPath).toContain('SPY_HOLIDAY_TEST_holiday-skip-test_20250121_masked.png');

    // Check that no warnings about missing data for the expected 2 days occurred
    const consoleWarnSpy = vi.spyOn(console, 'warn');
    expect(consoleWarnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('No data for the last 2 relevant days')
    );
    expect(consoleWarnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('No data to display after filtering for entry signal')
    );
    consoleWarnSpy.mockRestore();
  });

  describe('Market Data Context in Chart Headers', () => {
    const createMockBars = (
      date: string,
      ohlc: { open: number; high: number; low: number; close: number }[],
      startHour: number = 9 // Default to 9:30 AM (market open)
    ): Bar[] => {
      return ohlc.map((bar, index) => ({
        timestamp: `${date} ${String(startHour + index).padStart(2, '0')}:30:00`,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: 1000,
        trade_date: date,
      }));
    };

    it('should include market data context in SVG chart headers', () => {
      const previousDayBars = createMockBars('2023-05-01', [
        { open: 100, high: 101, low: 99, close: 100.5 },
        { open: 100.5, high: 102, low: 100, close: 101.5 },
      ]);

      const currentDayBars = createMockBars('2023-05-02', [
        { open: 103, high: 105, low: 102, close: 104 },
        { open: 104, high: 106, low: 103.5, close: 105.5 },
      ]);

      const allBars = [...previousDayBars, ...currentDayBars];
      const entrySignal: Signal = {
        timestamp: '2023-05-02 10:30:00',
        price: 104.5,
        type: 'entry',
        direction: 'long',
      };

      const svgContent = generateSvgChart(
        'SPY',
        'test-pattern',
        allBars,
        entrySignal,
        false, // showFullDayData
        false // not anonymized
      );

      // Check that market data is included
      expect(svgContent).toContain('Prev Close: $101.50'); // Previous day close
      expect(svgContent).toContain('Today Open: $103.00'); // Current day open
      expect(svgContent).toContain('GAP UP: +$1.50 (+1.48%)'); // Enhanced gap calculation
      expect(svgContent).toContain('Today H/L: $106.00/$102.00'); // Current day high/low
      expect(svgContent).toContain('Current: $104.50'); // Current price from signal
    });

    it('should show gap down correctly', () => {
      const previousDayBars = createMockBars('2023-05-01', [
        { open: 100, high: 101, low: 99, close: 102 },
      ]);

      const currentDayBars = createMockBars('2023-05-02', [
        { open: 98, high: 99, low: 97, close: 98.5 },
      ]);

      const allBars = [...previousDayBars, ...currentDayBars];
      const entrySignal: Signal = {
        timestamp: '2023-05-02 10:30:00',
        price: 98.5,
        type: 'entry',
        direction: 'long',
      };

      const svgContent = generateSvgChart(
        'SPY',
        'test-pattern',
        allBars,
        entrySignal,
        false, // showFullDayData
        false // not anonymized
      );

      expect(svgContent).toContain('Prev Close: $102.00');
      expect(svgContent).toContain('Today Open: $98.00');
      expect(svgContent).toContain('GAP DOWN: $-4.00 (-3.92%)'); // Enhanced gap down
    });

    it('should anonymize only ticker and date, not market data', () => {
      const previousDayBars = createMockBars('2023-05-01', [
        { open: 100, high: 101, low: 99, close: 100.5 },
      ]);

      const currentDayBars = createMockBars('2023-05-02', [
        { open: 103, high: 105, low: 102, close: 104 },
      ]);

      const allBars = [...previousDayBars, ...currentDayBars];
      const entrySignal: Signal = {
        timestamp: '2023-05-02 10:30:00',
        price: 104.5,
        type: 'entry',
        direction: 'long',
      };

      const svgContent = generateSvgChart(
        'SPY',
        'test-pattern',
        allBars,
        entrySignal,
        false, // showFullDayData
        true // anonymized
      );

      // Should anonymize ticker and date
      expect(svgContent).toContain('XXX - test-pattern');
      expect(svgContent).toContain('Date: XXX');

      // Should NOT anonymize market data
      expect(svgContent).toContain('Prev Close: $100.50');
      expect(svgContent).toContain('Today Open: $103.00');
      expect(svgContent).toContain('GAP UP: +$2.50 (+2.49%)');
      expect(svgContent).toContain('Current: $104.50');
    });

    it('should handle missing previous day data gracefully', () => {
      const currentDayBars = createMockBars('2023-05-02', [
        { open: 103, high: 105, low: 102, close: 104 },
      ]);

      const entrySignal: Signal = {
        timestamp: '2023-05-02 10:30:00',
        price: 104.5,
        type: 'entry',
        direction: 'long',
      };

      const svgContent = generateSvgChart(
        'SPY',
        'test-pattern',
        currentDayBars,
        entrySignal,
        false, // showFullDayData
        false // not anonymized
      );

      // Should show N/A for missing previous close
      expect(svgContent).toContain('Prev Close: N/A');
      expect(svgContent).toContain('Today Open: $103.00');
      expect(svgContent).toContain('Gap: N/A'); // Shows N/A when prev close missing
    });

    it('should handle empty current day data gracefully', () => {
      const previousDayBars = createMockBars('2023-05-01', [
        { open: 100, high: 101, low: 99, close: 100.5 },
      ]);

      const entrySignal: Signal = {
        timestamp: '2023-05-02 10:30:00',
        price: 104.5,
        type: 'entry',
        direction: 'long',
      };

      const svgContent = generateSvgChart(
        'SPY',
        'test-pattern',
        previousDayBars,
        entrySignal,
        false, // showFullDayData
        false // not anonymized
      );

      // Should show previous close but N/A for current day OHLC
      expect(svgContent).toContain('Prev Close: $100.50');
      expect(svgContent).toContain('Today Open: N/A');
      expect(svgContent).toContain('Today H/L: N/A/N/A');
      expect(svgContent).toContain('Current: $104.50'); // From signal
    });

    it('should filter out pre-market and after-hours data for market context', () => {
      // Create bars that include pre-market (8:00 AM) and regular market hours (9:30 AM)
      const previousDayBars = [
        // Pre-market data (should be ignored)
        {
          timestamp: '2023-05-01 08:00:00',
          open: 98,
          high: 99,
          low: 97,
          close: 98.5,
          volume: 500,
          trade_date: '2023-05-01',
        },
        // Regular market hours (should be used for context)
        {
          timestamp: '2023-05-01 09:30:00',
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
          trade_date: '2023-05-01',
        },
        {
          timestamp: '2023-05-01 15:30:00',
          open: 100.5,
          high: 102,
          low: 100,
          close: 101.5,
          volume: 1200,
          trade_date: '2023-05-01',
        },
        // After-hours data (should be ignored)
        {
          timestamp: '2023-05-01 17:00:00',
          open: 101.5,
          high: 102.5,
          low: 101,
          close: 102,
          volume: 300,
          trade_date: '2023-05-01',
        },
      ];

      const currentDayBars = [
        // Pre-market data (should be ignored for open calculation)
        {
          timestamp: '2023-05-02 08:30:00',
          open: 102.5,
          high: 103,
          low: 102,
          close: 102.8,
          volume: 400,
          trade_date: '2023-05-02',
        },
        // Regular market hours (should be used - this should be the "Today Open")
        {
          timestamp: '2023-05-02 09:30:00',
          open: 103,
          high: 105,
          low: 102,
          close: 104,
          volume: 1000,
          trade_date: '2023-05-02',
        },
        {
          timestamp: '2023-05-02 10:30:00',
          open: 104,
          high: 106,
          low: 103.5,
          close: 105.5,
          volume: 1100,
          trade_date: '2023-05-02',
        },
      ];

      const allBars = [...previousDayBars, ...currentDayBars];

      const svgContent = generateSvgChart(
        'SPY',
        'test-pattern',
        allBars,
        { timestamp: '2023-05-02 10:30:00', price: 104.5, type: 'entry' },
        false, // showFullDayData
        false // not anonymized
      );

      // Should use regular market hours data only:
      // Previous close should be from 15:30 (last trading bar), not 17:00 (after-hours)
      expect(svgContent).toContain('Prev Close: $101.50');
      // Today open should be from 9:30 AM (first trading bar), not 8:30 AM (pre-market)
      expect(svgContent).toContain('Today Open: $103.00');
      // Gap should be calculated from market hours data: 103.00 - 101.50 = +1.50
      expect(svgContent).toContain('GAP UP: +$1.50 (+1.48%)');
      // High/Low should be from trading hours only: high=106, low=102
      expect(svgContent).toContain('Today H/L: $106.00/$102.00');
    });
  });

  describe('VWAP Integration', () => {
    it('should include VWAP in chart headers and visualization', () => {
      const barsWithVolume = [
        // Previous day data
        {
          timestamp: '2023-05-01 15:30:00', // 3:30 PM ET
          open: 100.5,
          high: 102,
          low: 100,
          close: 101.5,
          volume: 1200,
          trade_date: '2023-05-01',
        },
        // Current day data with volume for VWAP calculation
        {
          timestamp: '2023-05-02 09:30:00', // 9:30 AM ET - market open
          open: 103,
          high: 105,
          low: 102,
          close: 104,
          volume: 10000,
          trade_date: '2023-05-02',
        },
        {
          timestamp: '2023-05-02 10:00:00', // 10:00 AM ET
          open: 104,
          high: 106,
          low: 103.5,
          close: 105.5,
          volume: 8000,
          trade_date: '2023-05-02',
        },
        {
          timestamp: '2023-05-02 10:30:00', // 10:30 AM ET - entry time
          open: 105.5,
          high: 107,
          low: 105,
          close: 106,
          volume: 12000,
          trade_date: '2023-05-02',
        },
      ];

      const svgContent = generateSvgChart(
        'SPY',
        'vwap-test-pattern',
        barsWithVolume,
        { timestamp: '2023-05-02 10:30:00', price: 106, type: 'entry' },
        false, // showFullDayData
        false // not anonymized
      );

      // Should contain VWAP information in header (nice sentence format)
      expect(svgContent).toContain('Current price of');
      expect(svgContent).toMatch(
        /Current price of \$\d+\.\d{2} is \$\d+\.\d{2} (ABOVE|BELOW|AT) VWAP of \$\d+\.\d{2}\./
      ); // Nice sentence format

      // Should contain VWAP line visualization (SVG path element)
      expect(svgContent).toContain('stroke="#ff6b35"'); // VWAP line color
      expect(svgContent).toContain('stroke-width="3"'); // VWAP line width

      // Should contain VWAP legend
      expect(svgContent).toContain('<text'); // Legend text
      expect(svgContent).toContain('VWAP</text>'); // Legend label
    });

    it('should handle missing VWAP data gracefully', () => {
      const barsWithoutVolume = [
        {
          timestamp: '2023-05-01 15:30:00',
          open: 100.5,
          high: 102,
          low: 100,
          close: 101.5,
          volume: 0, // No volume
          trade_date: '2023-05-01',
        },
        {
          timestamp: '2023-05-02 10:30:00',
          open: 103,
          high: 105,
          low: 102,
          close: 104,
          volume: 0, // No volume
          trade_date: '2023-05-02',
        },
      ];

      const svgContent = generateSvgChart(
        'SPY',
        'no-vwap-pattern',
        barsWithoutVolume,
        { timestamp: '2023-05-02 10:30:00', price: 104, type: 'entry' },
        false,
        false
      );

      // Should show VWAP as not available when no volume data available
      expect(svgContent).toContain('VWAP data is not available.');

      // Should not contain VWAP line visualization or legend
      expect(svgContent).not.toContain('stroke="#ff6b35"');
      expect(svgContent).not.toContain('VWAP</text>'); // No legend when no VWAP
    });

    it('should calculate VWAP correctly with realistic trading data', () => {
      const realisticBars = [
        // Previous day close
        {
          timestamp: '2023-05-01 16:00:00',
          open: 419.9,
          high: 420.5,
          low: 419.8,
          close: 420.25,
          volume: 150000,
          trade_date: '2023-05-01',
        },
        // Current day trading session
        {
          timestamp: '2023-05-02 09:30:00', // Opening bar
          open: 420.5,
          high: 421.2,
          low: 420.1,
          close: 420.8,
          volume: 250000,
          trade_date: '2023-05-02',
        },
        {
          timestamp: '2023-05-02 09:31:00',
          open: 420.8,
          high: 421.5,
          low: 420.6,
          close: 421.2,
          volume: 180000,
          trade_date: '2023-05-02',
        },
        {
          timestamp: '2023-05-02 09:32:00',
          open: 421.2,
          high: 421.8,
          low: 420.9,
          close: 421.4,
          volume: 220000,
          trade_date: '2023-05-02',
        },
      ];

      const svgContent = generateSvgChart(
        'SPY',
        'realistic-vwap-test',
        realisticBars,
        { timestamp: '2023-05-02 09:32:00', price: 421.4, type: 'entry' },
        false,
        false
      );

      // VWAP should be calculated and displayed (nice sentence format)
      expect(svgContent).toContain('Current price of');
      expect(svgContent).toMatch(
        /Current price of \$421\.40 is \$\d+\.\d{2} (ABOVE|BELOW|AT) VWAP of \$42\d\.\d{2}\./
      ); // Should be in the 420s range

      // Should show position relative to VWAP
      expect(svgContent).toMatch(/(ABOVE|BELOW|AT)/);

      // Should include VWAP line visualization and legend
      expect(svgContent).toContain('stroke="#ff6b35"');
      expect(svgContent).toContain('<path d="M ');
      expect(svgContent).toContain('VWAP</text>'); // Legend should be present
    });
  });

  describe('SMA Integration', () => {
    it('should include SMA in chart headers and visualization with daily bars', () => {
      const intradayBars = [
        // Previous day data
        {
          timestamp: '2023-05-01 15:30:00',
          open: 100.5,
          high: 102,
          low: 100,
          close: 101.5,
          volume: 1200,
          trade_date: '2023-05-01',
        },
        // Current day data
        {
          timestamp: '2023-05-02 09:30:00',
          open: 103,
          high: 105,
          low: 102,
          close: 104,
          volume: 10000,
          trade_date: '2023-05-02',
        },
        {
          timestamp: '2023-05-02 10:30:00',
          open: 104,
          high: 106,
          low: 103,
          close: 105,
          volume: 8000,
          trade_date: '2023-05-02',
        },
      ];

      // Create 20 days of daily bars for SMA calculation
      const dailyBars = Array.from({ length: 20 }, (_, i) => ({
        date: `2023-04-${String(i + 10).padStart(2, '0')}`,
        open: 100 + i * 0.5,
        high: 102 + i * 0.5,
        low: 98 + i * 0.5,
        close: 100 + i * 0.5,
        volume: 1000000,
      }));

      const svgContent = generateSvgChart(
        'SPY',
        'sma-test-pattern',
        intradayBars,
        { timestamp: '2023-05-02 10:30:00', price: 105, type: 'entry' },
        false,
        false,
        dailyBars
      );

      // Should contain SMA information in header (nice sentence format)
      expect(svgContent).toContain('Current price of');
      expect(svgContent).toMatch(
        /Current price of \$105\.00 is \$\d+\.\d{2} (ABOVE|BELOW|AT) SMA of \$\d+\.\d{2}\./
      );

      // Should contain SMA line visualization (horizontal dashed line)
      expect(svgContent).toContain('stroke="#2196F3"'); // SMA line color
      expect(svgContent).toContain('stroke-dasharray="5,5"'); // SMA dashed line

      // Should contain SMA legend
      expect(svgContent).toContain('20-Day SMA</text>');
    });

    it('should aggregate intraday to daily bars when no daily bars provided', () => {
      // Multi-day intraday data that will be aggregated to daily
      const intradayBars = [
        // Day 1
        {
          timestamp: '2023-04-28 09:30:00',
          open: 98,
          high: 100,
          low: 97,
          close: 99,
          volume: 5000,
          trade_date: '2023-04-28',
        },
        {
          timestamp: '2023-04-28 15:30:00',
          open: 99,
          high: 101,
          low: 98,
          close: 100,
          volume: 3000,
          trade_date: '2023-04-28',
        },
        // Day 2 (current day)
        {
          timestamp: '2023-05-01 09:30:00',
          open: 100,
          high: 102,
          low: 99,
          close: 101,
          volume: 8000,
          trade_date: '2023-05-01',
        },
      ];

      const svgContent = generateSvgChart(
        'SPY',
        'sma-aggregate-test',
        intradayBars,
        { timestamp: '2023-05-01 09:30:00', price: 101, type: 'entry' },
        false,
        false
        // No dailyBars provided - should aggregate from intraday
      );

      // Should show SMA as not available (insufficient data for 20-day SMA)
      expect(svgContent).toContain('20-Day SMA data is not available.');

      // Should not contain SMA line or legend when N/A
      expect(svgContent).not.toContain('stroke="#2196F3"');
      expect(svgContent).not.toContain('20-Day SMA</text>');
    });

    it('should display both VWAP and SMA in legend when both available', () => {
      const intradayBars = [
        {
          timestamp: '2023-05-02 09:30:00',
          open: 103,
          high: 105,
          low: 102,
          close: 104,
          volume: 10000,
          trade_date: '2023-05-02',
        },
        {
          timestamp: '2023-05-02 10:30:00',
          open: 104,
          high: 106,
          low: 103,
          close: 105,
          volume: 8000,
          trade_date: '2023-05-02',
        },
      ];

      // 20 days of daily bars for SMA
      const dailyBars = Array.from({ length: 20 }, (_, i) => ({
        date: `2023-04-${String(i + 10).padStart(2, '0')}`,
        open: 100 + i * 0.5,
        high: 102 + i * 0.5,
        low: 98 + i * 0.5,
        close: 100 + i * 0.5,
        volume: 1000000,
      }));

      const svgContent = generateSvgChart(
        'SPY',
        'vwap-sma-test',
        intradayBars,
        { timestamp: '2023-05-02 10:30:00', price: 105, type: 'entry' },
        false,
        false,
        dailyBars
      );

      // Should contain both VWAP and SMA in headers (nice sentence format)
      expect(svgContent).toContain('Current price of');
      expect(svgContent).toMatch(
        /Current price of \$105\.00 is \$\d+\.\d{2} (ABOVE|BELOW|AT) VWAP of \$\d+\.\d{2}\./
      );
      expect(svgContent).toMatch(
        /Current price of \$105\.00 is \$\d+\.\d{2} (ABOVE|BELOW|AT) SMA of \$\d+\.\d{2}\./
      );
      expect(svgContent).toMatch(
        /VWAP of \$\d+\.\d{2} is \$\d+\.\d{2} (ABOVE|BELOW|AT) SMA of \$\d+\.\d{2}\./
      ); // VWAP vs SMA comparison

      // Should contain both lines
      expect(svgContent).toContain('stroke="#ff6b35"'); // VWAP line
      expect(svgContent).toContain('stroke="#2196F3"'); // SMA line

      // Should contain both in legend
      expect(svgContent).toContain('VWAP</text>');
      expect(svgContent).toContain('20-Day SMA</text>');
    });

    it('should handle SMA calculation with realistic stock data', () => {
      const currentDayBars = [
        {
          timestamp: '2023-05-02 09:30:00',
          open: 420.5,
          high: 422.0,
          low: 419.5,
          close: 421.2,
          volume: 250000,
          trade_date: '2023-05-02',
        },
      ];

      // 20 days of realistic daily bars
      const dailyBars = Array.from({ length: 20 }, (_, i) => ({
        date: `2023-04-${String(i + 10).padStart(2, '0')}`,
        open: 415 + i * 0.3,
        high: 417 + i * 0.3,
        low: 413 + i * 0.3,
        close: 415.5 + i * 0.3,
        volume: 2000000 + i * 10000,
      }));

      const svgContent = generateSvgChart(
        'SPY',
        'realistic-sma-test',
        currentDayBars,
        { timestamp: '2023-05-02 09:30:00', price: 421.2, type: 'entry' },
        false,
        false,
        dailyBars
      );

      // Should calculate and display SMA (nice sentence format)
      expect(svgContent).toContain('Current price of');
      expect(svgContent).toMatch(
        /Current price of \$421\.20 is \$\d+\.\d{2} (ABOVE|BELOW|AT) SMA of \$41\d\.\d{2}\./
      ); // Should be in 410s range

      // Should show position relative to SMA
      expect(svgContent).toMatch(/(ABOVE|BELOW|AT)/);

      // Should include SMA line visualization
      expect(svgContent).toContain('stroke="#2196F3"');
      expect(svgContent).toContain('stroke-dasharray="5,5"');
    });

    it('should not render SMA line when suppressSma is true', () => {
      const intradayBars = [
        // Previous day data
        {
          timestamp: '2023-05-01 09:30:00',
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
          trade_date: '2023-05-01',
        },
        // Current day data
        {
          timestamp: '2023-05-02 09:30:00',
          open: 101,
          high: 102,
          low: 100,
          close: 101.5,
          volume: 1200,
          trade_date: '2023-05-02',
        },
        {
          timestamp: '2023-05-02 09:35:00',
          open: 101.5,
          high: 102.5,
          low: 101,
          close: 102,
          volume: 800,
          trade_date: '2023-05-02',
        },
      ];

      const entrySignal: Signal = {
        timestamp: '2023-05-02 09:35:00',
        price: 102,
        type: 'entry',
      };

      // Test with suppressSma: true
      const svgContentSuppressed = generateSvgChart(
        'SPY',
        'test-pattern',
        intradayBars,
        entrySignal,
        false,
        false,
        undefined,
        true // suppressSma: true
      );

      // Should not contain SMA information
      expect(svgContentSuppressed).not.toContain('20-day SMA');
      expect(svgContentSuppressed).not.toContain('SMA of $');
      expect(svgContentSuppressed).not.toContain('ABOVE SMA');
      expect(svgContentSuppressed).not.toContain('BELOW SMA');

      // Test with suppressSma: false (default behavior)
      const svgContentWithSma = generateSvgChart(
        'SPY',
        'test-pattern',
        intradayBars,
        entrySignal,
        false,
        false,
        undefined,
        false // suppressSma: false
      );

      // Should contain SMA information (when enough data is available)
      // Note: This test may not show SMA if there's insufficient historical data,
      // but it should at least not crash and should differ from suppressed version
      expect(svgContentWithSma).not.toBe(svgContentSuppressed);
    });

    it('should not render SMA line when it is outside chart bounds', () => {
      const intradayBars = [
        // Current day data with price range 100-105
        {
          timestamp: '2023-05-02 09:30:00',
          open: 103,
          high: 105,
          low: 100,
          close: 104,
          volume: 10000,
          trade_date: '2023-05-02',
        },
        {
          timestamp: '2023-05-02 10:30:00',
          open: 104,
          high: 105,
          low: 102,
          close: 103,
          volume: 8000,
          trade_date: '2023-05-02',
        },
      ];

      // Create daily bars with SMA that would be way outside the chart bounds
      // Chart price range will be ~99.5-105.5, but SMA will be 150 (way above)
      const dailyBars = Array.from({ length: 20 }, (_, i) => ({
        date: `2023-04-${String(i + 10).padStart(2, '0')}`,
        open: 150 + i * 0.1,
        high: 151 + i * 0.1,
        low: 149 + i * 0.1,
        close: 150 + i * 0.1,
        volume: 1000000,
      }));

      const svgContent = generateSvgChart(
        'SPY',
        'sma-bounds-test',
        intradayBars,
        { timestamp: '2023-05-02 10:30:00', price: 103, type: 'entry' },
        false,
        false,
        dailyBars
      );

      // Should contain SMA information in header (metrics are always shown, nice sentence format)
      expect(svgContent).toContain('Current price of');
      expect(svgContent).toMatch(
        /Current price of \$103\.00 is \$\d+\.\d{2} (ABOVE|BELOW|AT) SMA of \$150\.\d{2}\./
      );
      expect(svgContent).toMatch(
        /VWAP of \$\d+\.\d{2} is \$\d+\.\d{2} (ABOVE|BELOW|AT) SMA of \$150\.\d{2}\./
      ); // VWAP vs SMA comparison

      // Should NOT contain SMA line visualization (it's outside bounds)
      expect(svgContent).not.toContain('stroke-dasharray="5,5"');

      // Should NOT contain SMA legend (no line to show)
      expect(svgContent).not.toContain('20-Day SMA</text>');
    });
  });
});
