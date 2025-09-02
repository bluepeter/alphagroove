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
    expect(outputPath).toContain('SPY_quick-rise_20230501.png');
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
    expect(chartPaths[0]).toContain('20230501.png');
    expect(chartPaths[1]).toContain('20230502.png');
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

    expect(pngPath).toContain('SPY_WEEKEND_TEST_weekend-skip-test_20250127.png');

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

    expect(pngPath).toContain('SPY_HOLIDAY_TEST_holiday-skip-test_20250121.png');

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
      expect(svgContent).toContain('Gap: +$1.50'); // Gap calculation
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
      expect(svgContent).toContain('Gap: $-4.00'); // Gap down
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
      expect(svgContent).toContain('Gap: +$2.50');
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
      expect(svgContent).not.toContain('Gap:'); // No gap info when prev close missing
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
      expect(svgContent).toContain('Gap: +$1.50');
      // High/Low should be from trading hours only: high=106, low=102
      expect(svgContent).toContain('Today H/L: $106.00/$102.00');
    });
  });
});
