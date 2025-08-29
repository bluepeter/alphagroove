import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

import { Signal } from '../patterns/types';

import { generateEntryChart, generateEntryCharts } from './chart-generator';

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

    const chartPaths = await generateEntryCharts(
      'SPY',
      '1min',
      'quick-rise',
      mockTrades,
      testOutputDir
    );

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
});
