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
});
