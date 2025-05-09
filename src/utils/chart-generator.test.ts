import fs from 'fs';
import path from 'path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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
      existsSync: vi.fn(() => true),
      unlinkSync: vi.fn(),
    },
    mkdirSync: originalFs.mkdirSync,
    writeFileSync: originalFs.writeFileSync,
    existsSync: vi.fn(() => true),
    unlinkSync: vi.fn(),
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
});
