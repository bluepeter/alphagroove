import { describe, it, expect } from 'vitest';
import { PatternDefinition } from '../patterns/types.js';
import { buildAnalysisQuery } from './query-builder.js';
import { MergedConfig } from './config.js';

// Minimal mock pattern definitions for testing buildAnalysisQuery
const mockExitPatternGeneric: PatternDefinition = {
  name: 'mock-exit',
  description: 'Mock exit pattern',
  sql: "SELECT 'mock_exit_signal' as exit_signal;",
};

const createMockEntryPattern = (
  name: string,
  description: string,
  direction: 'long' | 'short' = 'long',
  sql?: string
): PatternDefinition => ({
  name,
  description,
  sql:
    sql ||
    `SELECT 
        timestamp as entry_time, 
        strftime(timestamp, '%Y-%m-%d') as trade_date, 
        strftime(timestamp, '%Y') as year, 
        column1::DOUBLE as open_price_at_entry, 
        column4::DOUBLE as entry_price, 
        '${direction}' as direction 
      FROM raw_data WHERE name = '${name}';`,
  direction,
});

// Base options used across all tests
const baseOptions: MergedConfig = {
  ticker: 'TEST',
  timeframe: '1min',
  from: '2023-01-01',
  to: '2023-01-05',
  direction: 'long',
  entryPattern: 'Quick Rise',
  'quick-rise': { 'rise-pct': 0.5 },
  exitStrategies: {
    enabled: ['maxHoldTime'],
    maxHoldTime: { minutes: 15 },
  },
  generateCharts: false,
  chartsDir: './charts',
};

describe('buildAnalysisQuery core functionality', () => {
  it('should build a query with correct ticker and timeframe path', () => {
    const options = { ...baseOptions };
    const entryPattern = createMockEntryPattern('Quick Rise', 'Test Pattern');
    const query = buildAnalysisQuery(options, entryPattern, mockExitPatternGeneric);

    expect(query).toContain('tickers/TEST/1min.csv');
  });

  it('should handle different timeframes', () => {
    const options = { ...baseOptions, timeframe: '5min' };
    const entryPattern = createMockEntryPattern('Quick Rise', 'Test Pattern');
    const query = buildAnalysisQuery(options, entryPattern, mockExitPatternGeneric);

    expect(query).toContain('tickers/TEST/5min.csv');
  });

  it('should handle different tickers', () => {
    const options = { ...baseOptions, ticker: 'SPY' };
    const entryPattern = createMockEntryPattern('Quick Rise', 'Test Pattern');
    const query = buildAnalysisQuery(options, entryPattern, mockExitPatternGeneric);

    expect(query).toContain('tickers/SPY/1min.csv');
  });

  it('should use provided date range in query', () => {
    const options = {
      ...baseOptions,
      from: '2024-01-01',
      to: '2024-01-31',
    };
    const entryPattern = createMockEntryPattern('Quick Rise', 'Test Pattern');
    const query = buildAnalysisQuery(options, entryPattern, mockExitPatternGeneric);

    expect(query).toContain("WHERE column0 >= '2024-01-01 00:00:00'");
    expect(query).toContain("AND column0 <= '2024-01-31 23:59:59'");
  });
});

describe('trade direction handling', () => {
  it('should calculate return percentage correctly for long direction', () => {
    const options = { ...baseOptions, direction: 'long' as const };
    const entryPattern = createMockEntryPattern('Quick Rise', 'Test Pattern', 'long');
    const query = buildAnalysisQuery(options, entryPattern, mockExitPatternGeneric);

    expect(query).toContain('((exit_price - entry_price) / entry_price) as return_pct');
  });

  it('should calculate return percentage correctly for short direction', () => {
    const options = { ...baseOptions, direction: 'short' as const };
    const entryPattern = createMockEntryPattern('Quick Rise', 'Test Pattern', 'short');
    const query = buildAnalysisQuery(options, entryPattern, mockExitPatternGeneric);

    expect(query).toContain('((entry_price - exit_price) / entry_price) as return_pct');
  });
});

describe('exit strategy handling', () => {
  it('should calculate exit time based on maxHoldTime minutes configuration', () => {
    const options = {
      ...baseOptions,
      exitStrategies: {
        enabled: ['maxHoldTime'],
        maxHoldTime: { minutes: 25 },
      },
    };
    const entryPattern = createMockEntryPattern('Quick Rise', 'Test Pattern');
    const query = buildAnalysisQuery(options, entryPattern, mockExitPatternGeneric);

    expect(query).toContain("strftime(r.timestamp, '%H:%M') = '10:00'"); // 9:35 + 25
  });

  it('should use default exit time if maxHoldTime is not configured', () => {
    const options = {
      ...baseOptions,
      exitStrategies: { enabled: [] },
    };
    const entryPattern = createMockEntryPattern('Quick Rise', 'Test Pattern');
    const query = buildAnalysisQuery(options, entryPattern, mockExitPatternGeneric);

    // Should fall back to default behavior
    expect(query).toContain("strftime(r.timestamp, '%H:%M')");
  });
});

describe('Fixed Time Entry pattern handling', () => {
  const fixedTimeEntryPatternDef: PatternDefinition = {
    name: 'Fixed Time Entry',
    description: 'Fixed time entry test pattern',
    sql: `
      WITH raw_data AS (
        SELECT
          column0::TIMESTAMP as timestamp,
          column1::DOUBLE as open,
          column4::DOUBLE as close,
          strftime(column0, '%Y-%m-%d') as trade_date,
          strftime(column0, '%Y') as year,
          strftime(column0, '%H:%M') as bar_time
        FROM read_csv_auto('{ticker}/{timeframe}.csv', header=false)
        WHERE column0 >= '{from} 00:00:00' AND column0 <= '{to} 23:59:59'
      )
      SELECT 
        timestamp as entry_time, 
        trade_date, 
        year, 
        open as open_price_at_entry, 
        close as entry_price, 
        '{direction}' as direction 
      FROM raw_data WHERE bar_time = '12:00'`,
  };

  const fixedTimeOptions: MergedConfig = {
    ...baseOptions,
    entryPattern: 'Fixed Time Entry',
    direction: 'long',
    'fixed-time-entry': { 'entry-time': '12:00' },
    exitStrategies: {
      enabled: ['maxHoldTime'],
      maxHoldTime: { minutes: 20 },
    },
  };

  it('should use the entry SQL from FixedTimeEntryPatternDefinition', () => {
    const query = buildAnalysisQuery(
      fixedTimeOptions,
      fixedTimeEntryPatternDef,
      mockExitPatternGeneric
    );
    expect(query).toContain("WHERE bar_time = '12:00'");
    expect(query).toContain('open as open_price_at_entry');
  });

  it('should calculate exit time based on entry_time + holdMinutes for Fixed Time Entry', () => {
    const query = buildAnalysisQuery(
      fixedTimeOptions,
      fixedTimeEntryPatternDef,
      mockExitPatternGeneric
    );
    expect(query).toContain("es.entry_time + INTERVAL '20 minutes' as calculated_exit_timestamp");
  });
});
