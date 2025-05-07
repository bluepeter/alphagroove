import { describe, it, expect } from 'vitest';

import { buildAnalysisQuery } from './query-builder.js';

describe('buildAnalysisQuery', () => {
  it('should build a valid SQL query with correct parameters', () => {
    const options = {
      ticker: 'TEST',
      timeframe: '1min',
      from: '2025-05-02',
      to: '2025-05-05',
    };

    const query = buildAnalysisQuery(options);

    // Test that the query contains all the necessary components
    expect(query).toContain('tickers/TEST/1min.csv');
    expect(query).toContain("column0 >= '2025-05-02 00:00:00'");
    expect(query).toContain("column0 <= '2025-05-05 23:59:59'");
    expect(query).toContain('trading_days');
    expect(query).toContain('market_open_prices');
    expect(query).toContain('five_min_prices');
    expect(query).toContain('exit_prices');
    expect(query).toContain('individual_trades');
    expect(query).toContain('yearly_stats');
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

  it('should include the quick rise threshold condition', () => {
    const options = {
      ticker: 'TEST',
      timeframe: '1min',
      from: '2025-05-02',
      to: '2025-05-02',
    };

    const query = buildAnalysisQuery(options);
    expect(query).toContain('(five_min_high - market_open) / market_open >= 0.003'); // 0.3% rise
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
    expect(query).toContain('((exit_price - five_min_high) / five_min_high * 100) as return_pct');
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
    expect(query).toContain('MIN(t.return_pct)');
    expect(query).toContain('MAX(t.return_pct)');
    expect(query).toContain('AVG(t.return_pct)');
  });
});
