import { describe, it, expect } from 'vitest';
import { MergedConfig } from './config';
import { buildAnalysisQuery } from './query-builder';

describe('buildAnalysisQuery with entry patterns', () => {
  const baseOptions: MergedConfig = {
    ticker: 'TEST',
    timeframe: '1min',
    direction: 'long',
    from: '2023-01-01',
    to: '2023-01-05',
    entryPattern: 'test-pattern',

    maxConcurrentDays: 1,
  };

  const entryPattern = {
    name: 'Test Pattern',
    description: 'Test pattern',
    sql: `SELECT 
      timestamp as entry_time, 
      trade_date, 
      year,
      open as market_open, 
      high as price, 
      '{direction}' as direction
    FROM raw_data`,
    defaultConfig: {},
  };

  it('should replace {ticker} placeholder in entry pattern SQL', () => {
    const options: MergedConfig = {
      ...baseOptions,
      ticker: 'AAPL',
    };

    const query = buildAnalysisQuery(options, entryPattern);

    expect(query).toContain('tickers/AAPL/1min.csv');
  });

  it('should replace {timeframe} placeholder in entry pattern SQL', () => {
    const options: MergedConfig = {
      ...baseOptions,
      timeframe: '5min',
    };

    const query = buildAnalysisQuery(options, entryPattern);

    expect(query).toContain('tickers/TEST/5min.csv');
  });

  it('should replace {from} and {to} placeholder in entry pattern SQL', () => {
    const options: MergedConfig = {
      ...baseOptions,
      from: '2022-01-01',
      to: '2022-12-31',
    };

    const query = buildAnalysisQuery(options, entryPattern);

    expect(query).toContain("'2022-01-01 00:00:00'");
    expect(query).toContain("'2022-12-31 23:59:59'");
  });

  it('should replace {direction} placeholder with long direction', () => {
    const options: MergedConfig = {
      ...baseOptions,
      direction: 'long',
    };

    const query = buildAnalysisQuery(options, entryPattern);

    expect(query).toContain("'long' as direction");
  });

  it('should replace {direction} placeholder with short direction', () => {
    const options: MergedConfig = {
      ...baseOptions,
      direction: 'short',
    };

    const query = buildAnalysisQuery(options, entryPattern);

    expect(query).toContain("'short' as direction");
  });

  it('should default to long direction for llm_decides in SQL', () => {
    const options: MergedConfig = {
      ...baseOptions,
      direction: 'llm_decides',
    };

    const query = buildAnalysisQuery(options, entryPattern);

    expect(query).toContain("'long' as direction");
  });
});
