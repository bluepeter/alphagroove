import { describe, it, expect } from 'vitest';

import { buildAnalysisQuery } from './query-builder.js';

describe('buildAnalysisQuery', () => {
  it('should build a valid SQL query with correct parameters', () => {
    const options = {
      ticker: 'TEST',
      timeframe: '1min',
      from: '2025-05-02',
      to: '2025-05-02',
    };

    const query = buildAnalysisQuery(options);
    expect(query).toContain("read_csv_auto('tickers/TEST/1min.csv'");
    expect(query).toContain("column0 >= '2025-05-02 00:00:00'");
    expect(query).toContain("column0 <= '2025-05-02 23:59:59'");
  });

  it('should handle different timeframes', () => {
    const options = {
      ticker: 'TEST',
      timeframe: '5min',
      from: '2025-05-02',
      to: '2025-05-05',
    };

    const query = buildAnalysisQuery(options);
    expect(query).toContain('tickers/TEST/5min.csv');
  });

  it('should handle different tickers', () => {
    const options = {
      ticker: 'SPY',
      timeframe: '1min',
      from: '2025-05-02',
      to: '2025-05-05',
    };

    const query = buildAnalysisQuery(options);
    expect(query).toContain('tickers/SPY/1min.csv');
  });

  it('should properly format timestamps for market hours', () => {
    const options = {
      ticker: 'TEST',
      timeframe: '1min',
      from: '2025-05-02',
      to: '2025-05-02',
    };

    const query = buildAnalysisQuery(options);
    // Market open check in both trading_days and market_open_prices
    expect(query).toContain("strftime(timestamp, '%H:%M') = '09:30'");
    // Entry time check in five_min_prices
    expect(query).toContain("strftime(r.timestamp, '%H:%M') = '09:35'");
    // Exit time check in exit_prices
    expect(query).toContain("strftime(r.timestamp, '%H:%M') = '09:45'");
  });

  it('should use default rise threshold when not specified', () => {
    const options = {
      ticker: 'TEST',
      timeframe: '1min',
      from: '2025-05-02',
      to: '2025-05-02',
    };

    const query = buildAnalysisQuery(options);
    expect(query).toContain('((five_min_high - market_open) / market_open) >= 0.003'); // Default 0.3%
  });

  it('should use custom rise threshold when specified', () => {
    const options = {
      ticker: 'TEST',
      timeframe: '1min',
      from: '2025-05-02',
      to: '2025-05-02',
      risePct: '0.9',
    };

    const query = buildAnalysisQuery(options);
    expect(query).toContain('((five_min_high - market_open) / market_open) >= 0.009'); // 0.9% rise
  });

  it('should exclude weekends from trading days', () => {
    const options = {
      ticker: 'TEST',
      timeframe: '1min',
      from: '2025-05-02',
      to: '2025-05-02',
    };

    const query = buildAnalysisQuery(options);
    expect(query).toContain("strftime(timestamp, '%w') NOT IN ('0', '6')"); // Sunday = 0, Saturday = 6
  });

  it('should calculate return percentages correctly', () => {
    const options = {
      ticker: 'TEST',
      timeframe: '1min',
      from: '2025-05-02',
      to: '2025-05-02',
    };

    const query = buildAnalysisQuery(options);
    expect(query).toContain('((exit_price - five_min_high) / five_min_high) as return_pct');
  });

  it('should group yearly statistics', () => {
    const options = {
      ticker: 'TEST',
      timeframe: '1min',
      from: '2025-05-02',
      to: '2025-05-02',
    };

    const query = buildAnalysisQuery(options);
    expect(query).toContain('GROUP BY t.year');
    expect(query).toContain('MIN(t.return_pct * 100)');
    expect(query).toContain('MAX(t.return_pct * 100)');
    expect(query).toContain('AVG(t.return_pct * 100)');
  });
});

describe('query builder', () => {
  it('should use default rise percentage when not specified', () => {
    const query = buildAnalysisQuery({
      ticker: 'SPY',
      timeframe: '1min',
      from: '2020-01-01',
      to: '2020-12-31',
    });

    expect(query).toContain('0.003'); // Default rise percentage (0.3%)
  });

  it('should use specified rise percentage', () => {
    const query = buildAnalysisQuery({
      ticker: 'SPY',
      timeframe: '1min',
      from: '2020-01-01',
      to: '2020-12-31',
      risePct: '1.0',
    });

    expect(query).toContain('0.01'); // 1.0% as decimal
  });

  it('should handle different rise percentages', () => {
    const query1 = buildAnalysisQuery({
      ticker: 'SPY',
      timeframe: '1min',
      from: '2020-01-01',
      to: '2020-12-31',
      risePct: '0.2',
    });
    expect(query1).toContain('0.002'); // 0.2% as decimal

    const query2 = buildAnalysisQuery({
      ticker: 'SPY',
      timeframe: '1min',
      from: '2020-01-01',
      to: '2020-12-31',
      risePct: '2.0',
    });
    expect(query2).toContain('0.02'); // 2.0% as decimal
  });

  it('should handle standard deviation for single trades', () => {
    const query = buildAnalysisQuery({
      ticker: 'SPY',
      timeframe: '1min',
      from: '2020-01-01',
      to: '2020-12-31',
      risePct: '1.0',
    });

    expect(query).toContain(
      'CASE WHEN COUNT(*) > 1 THEN STDDEV(t.return_pct * 100) ELSE 0 END as std_dev_return'
    );
  });
});
