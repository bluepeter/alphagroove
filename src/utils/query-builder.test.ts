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

describe('buildAnalysisQuery', () => {
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

  it('should build a query for quick-rise (long)', () => {
    const options: MergedConfig = { ...baseOptions, entryPattern: 'Quick Rise', direction: 'long' };
    const entryPattern = createMockEntryPattern('Quick Rise', 'Desc for Quick Rise', 'long');
    const query = buildAnalysisQuery(options, entryPattern, mockExitPatternGeneric);
    expect(query).toContain('tickers/TEST/1min.csv');
    expect(query).toContain("strftime(r.timestamp, '%H:%M') = '09:35'");
    expect(query).toContain('((five_min_high - market_open) / market_open) >= 0.005');
    expect(query).toContain('((exit_price - entry_price) / entry_price) as return_pct');
  });

  it('should build a query for quick-fall (short)', () => {
    const options: MergedConfig = {
      ...baseOptions,
      entryPattern: 'Quick Fall',
      direction: 'short',
      'quick-fall': { 'fall-pct': 0.4 },
    };
    const entryPattern = createMockEntryPattern('Quick Fall', 'Desc for Quick Fall', 'short');
    const query = buildAnalysisQuery(options, entryPattern, mockExitPatternGeneric);
    expect(query).toContain('((market_open - five_min_low) / market_open) >= 0.004');
    expect(query).toContain('((entry_price - exit_price) / entry_price) as return_pct');
  });

  it('should use default rise/fall percentages if not specified for quick-rise/fall', () => {
    const quickRiseOptions: MergedConfig = {
      ...baseOptions,
      entryPattern: 'Quick Rise',
      direction: 'long',
      'quick-rise': {},
    };
    const entryPatternRise = createMockEntryPattern('Quick Rise', 'Desc default rise', 'long');
    const queryRise = buildAnalysisQuery(
      quickRiseOptions,
      entryPatternRise,
      mockExitPatternGeneric
    );
    expect(queryRise).toContain('((five_min_high - market_open) / market_open) >= 0.003');

    const quickFallOptions: MergedConfig = {
      ...baseOptions,
      entryPattern: 'Quick Fall',
      direction: 'short',
      'quick-fall': {},
    };
    const entryPatternFall = createMockEntryPattern('Quick Fall', 'Desc default fall', 'short');
    const queryFall = buildAnalysisQuery(
      quickFallOptions,
      entryPatternFall,
      mockExitPatternGeneric
    );
    expect(queryFall).toContain('((market_open - five_min_low) / market_open) >= 0.003');
  });

  it('should calculate exit time correctly based on holdMinutes for quick-rise/fall', () => {
    const entryPatternDefault = createMockEntryPattern('Quick Rise', 'Desc exit time');

    const defaultHoldOptions: MergedConfig = {
      ...baseOptions,
      entryPattern: 'Quick Rise',
      exitStrategies: {
        enabled: ['maxHoldTime'],
        maxHoldTime: { minutes: 10 },
      },
    };
    const queryDefault = buildAnalysisQuery(
      defaultHoldOptions,
      entryPatternDefault,
      mockExitPatternGeneric
    );
    expect(queryDefault).toContain("strftime(r.timestamp, '%H:%M') = '09:45'"); // 9:35 + 10

    const customHoldOptions: MergedConfig = {
      ...baseOptions,
      entryPattern: 'Quick Rise',
      exitStrategies: {
        enabled: ['maxHoldTime'],
        maxHoldTime: { minutes: 25 },
      },
    };
    const queryCustom = buildAnalysisQuery(
      customHoldOptions,
      entryPatternDefault,
      mockExitPatternGeneric
    );
    expect(queryCustom).toContain("strftime(r.timestamp, '%H:%M') = '10:00'"); // 9:35 + 25

    const longHoldOptions: MergedConfig = {
      ...baseOptions,
      entryPattern: 'Quick Rise',
      exitStrategies: {
        enabled: ['maxHoldTime'],
        maxHoldTime: { minutes: 85 },
      },
    };
    const queryLong = buildAnalysisQuery(
      longHoldOptions,
      entryPatternDefault,
      mockExitPatternGeneric
    );
    expect(queryLong).toContain("strftime(r.timestamp, '%H:%M') = '11:00'"); // 9:35 + 85 (1h 25m)
  });

  describe('Fixed Time Entry Query Path', () => {
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
      expect(query).not.toContain('five_min_high');
    });

    it('should calculate exit time based on entry_time + holdMinutes for Fixed Time Entry', () => {
      const query = buildAnalysisQuery(
        fixedTimeOptions,
        fixedTimeEntryPatternDef,
        mockExitPatternGeneric
      );
      expect(query).toContain("es.entry_time + INTERVAL '20 minutes' as calculated_exit_timestamp");
    });

    it('should have dummy rise_pct for Fixed Time Entry', () => {
      const query = buildAnalysisQuery(
        fixedTimeOptions,
        fixedTimeEntryPatternDef,
        mockExitPatternGeneric
      );
      expect(query).toContain('NULL as rise_pct');
    });

    it('should handle short direction for Fixed Time Entry', () => {
      const shortFixedTimeOptions: MergedConfig = {
        ...fixedTimeOptions,
        direction: 'short',
      };
      const shortPatternDef = {
        ...fixedTimeEntryPatternDef,
      };
      const query = buildAnalysisQuery(
        shortFixedTimeOptions,
        shortPatternDef as PatternDefinition,
        mockExitPatternGeneric
      );
      expect(query).toContain('((entry_price - exit_price) / entry_price) as return_pct');
      expect(query).toContain("'short' as direction");
    });
  });

  it('should use specific ticker, timeframe, from, and to dates provided in options', () => {
    const specificOptions: MergedConfig = {
      ticker: 'MSFT',
      timeframe: '5min',
      from: '2024-01-01',
      to: '2024-01-31',
      entryPattern: 'Quick Rise',
      direction: 'long',
      'quick-rise': { 'rise-pct': 0.2 },
      exitStrategies: {
        enabled: ['maxHoldTime'],
        maxHoldTime: { minutes: 10 },
      },
      generateCharts: false,
      chartsDir: './charts',
    };
    const entryPattern = createMockEntryPattern('Quick Rise', 'Desc specific options');
    const query = buildAnalysisQuery(specificOptions, entryPattern, mockExitPatternGeneric);
    expect(query).toContain('tickers/MSFT/5min.csv');
    expect(query).toContain("WHERE column0 >= '2024-01-01 00:00:00'");
    expect(query).toContain("AND column0 <= '2024-01-31 23:59:59'");
  });

  // Legacy tests adapted
  it('[Legacy] should handle different timeframes', () => {
    const options: MergedConfig = {
      ...baseOptions,
      timeframe: '5min',
      entryPattern: 'Quick Rise',
    };
    const entryPattern = createMockEntryPattern('Quick Rise', 'Desc timeframe legacy');
    const query = buildAnalysisQuery(options, entryPattern, mockExitPatternGeneric);
    expect(query).toContain('tickers/TEST/5min.csv');
  });

  it('[Legacy] should handle different tickers', () => {
    const options: MergedConfig = {
      ...baseOptions,
      ticker: 'SPY',
      entryPattern: 'Quick Rise',
    };
    const entryPattern = createMockEntryPattern('Quick Rise', 'Desc ticker legacy');
    const query = buildAnalysisQuery(options, entryPattern, mockExitPatternGeneric);
    expect(query).toContain('tickers/SPY/1min.csv');
  });

  it('[Legacy] should properly format timestamps for market hours (quick-rise/fall path)', () => {
    const options: MergedConfig = {
      ...baseOptions,
      entryPattern: 'Quick Rise',
    };
    const entryPattern = createMockEntryPattern('Quick Rise', 'Desc market hours legacy');
    const query = buildAnalysisQuery(options, entryPattern, mockExitPatternGeneric);
    expect(query).toContain("strftime(timestamp, '%H:%M') = '09:30'");
    expect(query).toContain("strftime(r.timestamp, '%H:%M') = '09:35'");
    expect(query).toContain("strftime(r.timestamp, '%H:%M') = '09:50'"); // 9:35 + 15 min
  });

  it('[Legacy] should use custom rise threshold for quick-rise', () => {
    const options: MergedConfig = {
      ...baseOptions,
      entryPattern: 'Quick Rise',
      'quick-rise': { 'rise-pct': 0.9 },
    };
    const entryPattern = createMockEntryPattern('Quick Rise', 'Desc custom rise legacy');
    const query = buildAnalysisQuery(options, entryPattern, mockExitPatternGeneric);
    expect(query).toContain('((five_min_high - market_open) / market_open) >= 0.009');
  });

  it('[Legacy] should use custom fall threshold for quick-fall', () => {
    const options: MergedConfig = {
      ...baseOptions,
      entryPattern: 'Quick Fall',
      direction: 'short',
      'quick-fall': { 'fall-pct': 0.9 },
    };
    const entryPattern = createMockEntryPattern('Quick Fall', 'Desc custom fall legacy', 'short');
    const query = buildAnalysisQuery(options, entryPattern, mockExitPatternGeneric);
    expect(query).toContain('((market_open - five_min_low) / market_open) >= 0.009');
  });

  it('[Legacy] should exclude weekends from trading days (quick-rise/fall path)', () => {
    const options: MergedConfig = {
      ...baseOptions,
      entryPattern: 'Quick Rise',
    };
    const entryPattern = createMockEntryPattern('Quick Rise', 'Desc weekends legacy');
    const query = buildAnalysisQuery(options, entryPattern, mockExitPatternGeneric);
    expect(query).toContain("strftime(timestamp, '%w') NOT IN ('0', '6')");
  });

  it("[Legacy] should use specified risePct from MergedConfig if pattern.'quick-rise'.'rise-pct' missing", () => {
    const options: MergedConfig = {
      ...baseOptions,
      entryPattern: 'Quick Rise',
      risePct: '0.2',
      'quick-rise': {},
    };
    const entryPattern = createMockEntryPattern('Quick Rise', 'Desc legacy MergedConfig.risePct');
    const query = buildAnalysisQuery(options, entryPattern, mockExitPatternGeneric);
    expect(query).toContain('0.002');
  });

  it('[Legacy] should use default risePct (0.3) if specific and legacy MergedConfig.risePct missing', () => {
    const options: MergedConfig = {
      ...baseOptions,
      entryPattern: 'Quick Rise',
      'quick-rise': {},
    };
    delete options.risePct;
    const entryPattern = createMockEntryPattern('Quick Rise', 'Desc default legacy');
    const query = buildAnalysisQuery(options, entryPattern, mockExitPatternGeneric);
    expect(query).toContain('0.003');
  });

  it('[Legacy] should prioritize pattern-specific config over MergedConfig.risePct', () => {
    const options: MergedConfig = {
      ...baseOptions,
      entryPattern: 'Quick Rise',
      risePct: '0.2',
      'quick-rise': { 'rise-pct': 1.0 },
    };
    const entryPattern = createMockEntryPattern('Quick Rise', 'Desc priority legacy');
    const query = buildAnalysisQuery(options, entryPattern, mockExitPatternGeneric);
    expect(query).toContain('0.01');
    expect(query).not.toContain('0.002');
  });
});
