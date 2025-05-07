import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  printHeader,
  printYearHeader,
  printTradeDetails,
  printYearSummary,
  printOverallSummary,
  printFooter,
} from './output.js';

describe('output utilities', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log');
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('printHeader', () => {
    it('should print header with correct pattern and date information', () => {
      printHeader('quick-rise', 'fixed-time', '2025-05-02', '2025-05-05');

      const output = consoleLogSpy.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('SPY Analysis (2025-05-02 to 2025-05-05)');
      expect(output).toContain('Entry Pattern: quick-rise');
      expect(output).toContain('Exit Pattern: fixed-time');
    });
  });

  describe('printYearHeader', () => {
    it('should print year header with correct formatting', () => {
      printYearHeader('2025');

      const output = consoleLogSpy.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('2025');
    });
  });

  describe('printTradeDetails', () => {
    it('should print trade details with correct formatting and colors for a profitable trade', () => {
      const trade = {
        trade_date: '2025-05-02',
        entry_time: '2025-05-02 16:54:00',
        exit_time: '2025-05-02 16:55:00',
        market_open: 566.81,
        entry_price: 566.83,
        exit_price: 567.19,
        rise_pct: 0.36,
        return_pct: 0.64,
      };

      printTradeDetails(trade);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('2025-05-02');
      expect(output).toContain('16:54:00 → 16:55:00');
      expect(output).toContain('Open: $566.81');
      expect(output).toContain('Entry: $566.83');
      expect(output).toContain('Exit: $567.19');
      expect(output).toContain('Rise: 0.36%');
      expect(output).toContain('Return: 0.64%');
      expect(output).toContain('✅'); // Success emoji for positive return
    });

    it('should show error emoji for negative returns using real data', () => {
      const trade = {
        trade_date: '2025-05-02',
        entry_time: '2025-05-02 16:56:00',
        exit_time: '2025-05-02 16:57:00',
        market_open: 566.81,
        entry_price: 567.12,
        exit_price: 566.94,
        rise_pct: 0.31,
        return_pct: -0.32,
      };

      printTradeDetails(trade);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('❌'); // Error emoji for negative return
      expect(output).toContain('Return: -0.32%');
    });
  });

  describe('printYearSummary', () => {
    it('should print year summary with correct statistics using real data ranges', () => {
      const stats = {
        year: '2025',
        trading_days: 2,
        match_count: 12,
        min_rise_pct: 0.3,
        max_rise_pct: 0.45,
        avg_rise_pct: 0.35,
        min_return: -0.32,
        max_return: 0.64,
        avg_return: 0.15,
      };

      printYearSummary(stats);

      const output = consoleLogSpy.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('2025 Summary');
      expect(output).toContain('Trading Days: 2');
      expect(output).toContain('Trades: 12 (600.0% of days)');
      expect(output).toContain('Rise Range: 0.30% to 0.45%');
      expect(output).toContain('Return Range: -0.32% to 0.64%');
      expect(output).toContain('Average Return: 0.15%');
      expect(output).toContain('✅'); // Success emoji for positive return
    });
  });

  describe('printOverallSummary', () => {
    it('should print overall summary with correct statistics using real data', () => {
      const stats = {
        trading_days: 2,
        total_matches: 12,
        total_return_sum: 1.8,
      };

      printOverallSummary(stats);

      const output = consoleLogSpy.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('Overall Summary');
      expect(output).toContain('Total Trading Days: 2');
      expect(output).toContain('Total Trades: 12 (600.0% of days)');
      expect(output).toContain('Average Return: 0.15%');
      expect(output).toContain('✅'); // Success emoji for positive return
    });

    it('should handle zero trades correctly', () => {
      const stats = {
        trading_days: 2,
        total_matches: 0,
        total_return_sum: 0,
      };

      printOverallSummary(stats);

      const output = consoleLogSpy.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('Total Trades: 0 (0.0% of days)');
      expect(output).toContain('Average Return: 0.00%');
    });
  });

  describe('printFooter', () => {
    it('should print footer message', () => {
      printFooter();

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('Analysis complete');
    });
  });
});
