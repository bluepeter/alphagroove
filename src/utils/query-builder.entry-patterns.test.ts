import { describe, it, expect } from 'vitest';
import { PatternDefinition } from '../patterns/types.js';
import { buildAnalysisQuery } from './query-builder.js';
import { MergedConfig } from './config.js';

// Minimal mock pattern definitions for testing
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

describe('Quick Rise pattern handling', () => {
  it('should build a query for quick-rise with correct pattern logic', () => {
    const options: MergedConfig = {
      ...baseOptions,
      entryPattern: 'Quick Rise',
      direction: 'long',
    };
    const entryPattern = createMockEntryPattern('Quick Rise', 'Test pattern', 'long');
    const query = buildAnalysisQuery(options, entryPattern, mockExitPatternGeneric);

    expect(query).toContain("strftime(r.timestamp, '%H:%M') = '09:35'");
    expect(query).toContain('((five_min_high - market_open) / market_open) >= 0.005');
  });

  it('should use custom rise threshold from configuration', () => {
    const options: MergedConfig = {
      ...baseOptions,
      entryPattern: 'Quick Rise',
      'quick-rise': { 'rise-pct': 0.9 },
    };
    const entryPattern = createMockEntryPattern('Quick Rise', 'Test pattern');
    const query = buildAnalysisQuery(options, entryPattern, mockExitPatternGeneric);

    expect(query).toContain('((five_min_high - market_open) / market_open) >= 0.009');
  });

  it('should use default rise percentage if not specified', () => {
    const options: MergedConfig = {
      ...baseOptions,
      entryPattern: 'Quick Rise',
      'quick-rise': {},
    };
    const entryPattern = createMockEntryPattern('Quick Rise', 'Test pattern');
    const query = buildAnalysisQuery(options, entryPattern, mockExitPatternGeneric);

    expect(query).toContain('((five_min_high - market_open) / market_open) >= 0.003');
  });
});

describe('Quick Fall pattern handling', () => {
  it('should build a query for quick-fall with correct pattern logic', () => {
    const options: MergedConfig = {
      ...baseOptions,
      entryPattern: 'Quick Fall',
      direction: 'short',
      'quick-fall': { 'fall-pct': 0.4 },
    };
    const entryPattern = createMockEntryPattern('Quick Fall', 'Test pattern', 'short');
    const query = buildAnalysisQuery(options, entryPattern, mockExitPatternGeneric);

    expect(query).toContain('((market_open - five_min_low) / market_open) >= 0.004');
  });

  it('should use default fall percentage if not specified', () => {
    const options: MergedConfig = {
      ...baseOptions,
      entryPattern: 'Quick Fall',
      direction: 'short',
      'quick-fall': {},
    };
    const entryPattern = createMockEntryPattern('Quick Fall', 'Test pattern', 'short');
    const query = buildAnalysisQuery(options, entryPattern, mockExitPatternGeneric);

    expect(query).toContain('((market_open - five_min_low) / market_open) >= 0.003');
  });
});

describe('Market filtering', () => {
  it('should exclude weekends from trading days', () => {
    const options: MergedConfig = {
      ...baseOptions,
      entryPattern: 'Quick Rise',
    };
    const entryPattern = createMockEntryPattern('Quick Rise', 'Test pattern');
    const query = buildAnalysisQuery(options, entryPattern, mockExitPatternGeneric);

    expect(query).toContain("strftime(timestamp, '%w') NOT IN ('0', '6')");
  });

  it('should use market opening time for initial price', () => {
    const options: MergedConfig = {
      ...baseOptions,
      entryPattern: 'Quick Rise',
    };
    const entryPattern = createMockEntryPattern('Quick Rise', 'Test pattern');
    const query = buildAnalysisQuery(options, entryPattern, mockExitPatternGeneric);

    expect(query).toContain("strftime(timestamp, '%H:%M') = '09:30'");
  });
});
