import { vi, describe, it, expect } from 'vitest';
import { buildAnalysisQuery } from './query-builder.js';
import { MergedConfig } from './config.js';

describe('buildAnalysisQuery', () => {
  const mockEntryPattern = {
    name: 'Test Pattern',
    description: 'Test pattern for testing',
    sql: `
      SELECT 
        timestamp as entry_time,
        trade_date,
        year,
        open as open_price,
        close as entry_price
      FROM raw_data
    `,
    defaultConfig: {},
    info: vi.fn(),
  };

  const mockFixedTimeEntryPattern = {
    name: 'Fixed Time Entry',
    description: 'Enter at fixed time',
    sql: `
      SELECT 
        timestamp as entry_time,
        trade_date,
        year,
        open as open_price_at_entry,
        close as entry_price,
        '{direction}' as direction
      FROM raw_data
      WHERE strftime(timestamp, '%H:%M') = '12:00'
    `,
    defaultConfig: {},
    info: vi.fn(),
  };

  it('should include ticker and timeframe in the query', () => {
    const mergedConfig: MergedConfig = {
      ticker: 'SPY',
      timeframe: '1min',
      direction: 'long',
      from: '2023-01-01',
      to: '2023-01-05',
      entryPattern: 'Test Pattern',
      generateCharts: false,
      chartsDir: './charts',
    };

    const query = buildAnalysisQuery(mergedConfig, mockEntryPattern);
    expect(query).toContain('tickers/SPY/1min.csv');
  });

  it('should include date range in the query', () => {
    const mergedConfig: MergedConfig = {
      ticker: 'SPY',
      timeframe: '1min',
      direction: 'long',
      from: '2023-01-01',
      to: '2023-01-05',
      entryPattern: 'Test Pattern',
      generateCharts: false,
      chartsDir: './charts',
    };

    const query = buildAnalysisQuery(mergedConfig, mockEntryPattern);
    expect(query).toContain("'2023-01-01 00:00:00'");
    expect(query).toContain("'2023-01-05 23:59:59'");
  });

  it('should include direction in the query', () => {
    const mergedConfig: MergedConfig = {
      ticker: 'SPY',
      timeframe: '1min',
      direction: 'short',
      from: '2023-01-01',
      to: '2023-01-05',
      entryPattern: 'Test Pattern',
      generateCharts: false,
      chartsDir: './charts',
    };

    const query = buildAnalysisQuery(mergedConfig, mockEntryPattern);
    expect(query).toContain("'short' as direction");
  });

  it('should use the entry pattern SQL', () => {
    const mergedConfig: MergedConfig = {
      ticker: 'SPY',
      timeframe: '1min',
      direction: 'long',
      from: '2023-01-01',
      to: '2023-01-05',
      entryPattern: 'Fixed Time Entry',
      generateCharts: false,
      chartsDir: './charts',
    };

    const query = buildAnalysisQuery(mergedConfig, mockFixedTimeEntryPattern);
    expect(query).toContain("WHERE strftime(timestamp, '%H:%M') = '12:00'");
  });

  it('should include trading days calculation', () => {
    const mergedConfig: MergedConfig = {
      ticker: 'SPY',
      timeframe: '1min',
      direction: 'long',
      from: '2023-01-01',
      to: '2023-01-05',
      entryPattern: 'Test Pattern',
      generateCharts: false,
      chartsDir: './charts',
    };

    const query = buildAnalysisQuery(mergedConfig, mockEntryPattern);
    expect(query).toContain('trading_days');
    expect(query).toContain('COUNT(DISTINCT trade_date) as total_trading_days');
  });
});
