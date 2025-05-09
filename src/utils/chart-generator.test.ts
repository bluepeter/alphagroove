import fs from 'fs';
import path from 'path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { Signal } from '../patterns/types';

import { generateEntryChart, generateEntryCharts } from './chart-generator';

// Mock fs and execSync
vi.mock('fs', () => ({
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(() => true),
    unlinkSync: vi.fn(),
  },
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(() => true),
  unlinkSync: vi.fn(),
}));

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
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should generate a chart for a single entry signal', async () => {
    const outputPath = await generateEntryChart({
      ticker: 'SPY',
      timeframe: '1min',
      entryPatternName: 'quick-rise',
      tradeDate: '2023-05-01',
      entryTimestamp: '2023-05-01 09:35:00',
      entrySignal: mockSignal,
      outputDir: testOutputDir,
    });

    // Directory should be created
    expect(fs.mkdirSync).toHaveBeenCalledWith(path.join(testOutputDir, 'quick-rise'), {
      recursive: true,
    });

    // SQL query should be created
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('temp_chart_query.sql'),
      expect.stringContaining('tickers/SPY/1min.csv'),
      'utf-8'
    );

    // SVG data should be written
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('.svg'),
      expect.stringContaining('<svg'),
      'utf-8'
    );

    // Output path should contain the expected format
    expect(outputPath).toContain('SPY_quick-rise_20230501.svg');
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

    // Should return the correct number of paths
    expect(chartPaths.length).toBe(2);

    // Directory should be created for each chart
    expect(fs.mkdirSync).toHaveBeenCalledTimes(2);

    // Paths should contain the trade dates
    expect(chartPaths[0]).toContain('20230501');
    expect(chartPaths[1]).toContain('20230502');
  });
});
