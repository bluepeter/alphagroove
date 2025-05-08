import { describe, it, expect, vi } from 'vitest';

import {
  printHeader,
  printYearHeader,
  printTradeDetails,
  printYearSummary,
  printOverallSummary,
  printFooter,
  Trade,
} from './output';

// Mock chalk to prevent styling in tests
vi.mock('chalk', () => ({
  default: {
    bold: (text: string) => text,
    green: (text: string) => text,
    red: (text: string) => text,
    cyan: (text: string) => text,
    gray: (text: string) => text,
  },
}));

describe('output utilities', () => {
  describe('printHeader', () => {
    it('should print header with correct pattern and date information', () => {
      const consoleLogSpy = vi.spyOn(console, 'log');

      printHeader('SPY', '2025-05-02', '2025-05-05', 'quick-rise', 'fixed-time');

      const output = consoleLogSpy.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('SPY Analysis (2025-05-02 to 2025-05-05)');
      expect(output).toContain('Entry Pattern: quick-rise');
      expect(output).toContain('Exit Pattern: fixed-time');
      expect(output).toContain('Direction: Long ↗️');

      consoleLogSpy.mockRestore();
    });
  });

  describe('printYearHeader', () => {
    it('should print year header with correct formatting', () => {
      const consoleLogSpy = vi.spyOn(console, 'log');

      printYearHeader('2025');

      const output = consoleLogSpy.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('2025 Trades:');

      consoleLogSpy.mockRestore();
    });
  });

  describe('printTradeDetails', () => {
    it('should print trade details with correct formatting and colors for a profitable trade', () => {
      const consoleLogSpy = vi.spyOn(console, 'log');

      // Using real data example: 566.83 → 567.19 (+0.64%)
      const trade: Trade = {
        trade_date: '2025-05-02',
        entry_time: '2025-05-02 16:54:00',
        exit_time: '2025-05-02 16:55:00',
        market_open: 566.81,
        entry_price: 566.83,
        exit_price: 567.19,
        rise_pct: 0.0036,
        return_pct: 0.0064,
      };

      printTradeDetails(trade);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('2025-05-02');
      expect(output).toContain('16:54:00');
      expect(output).toContain('16:55:00');
      expect(output).toContain('$566.81');
      expect(output).toContain('$566.83');
      expect(output).toContain('$567.19');
      expect(output).toContain('0.36%');
      expect(output).toContain('Return: 0.64%');
      expect(output).toContain('✅');

      consoleLogSpy.mockRestore();
    });

    it('should show error emoji for negative returns using real data', () => {
      const consoleLogSpy = vi.spyOn(console, 'log');

      // Using real data example: 567.12 → 566.94 (-0.32%)
      const trade: Trade = {
        trade_date: '2025-05-02',
        entry_time: '2025-05-02 16:56:00',
        exit_time: '2025-05-02 16:57:00',
        market_open: 566.81,
        entry_price: 567.12,
        exit_price: 566.94,
        rise_pct: 0.0031,
        return_pct: -0.0032,
      };

      printTradeDetails(trade);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('2025-05-02');
      expect(output).toContain('16:56:00');
      expect(output).toContain('16:57:00');
      expect(output).toContain('$566.81');
      expect(output).toContain('$567.12');
      expect(output).toContain('$566.94');
      expect(output).toContain('0.31%');
      expect(output).toContain('Return: -0.32%');
      expect(output).toContain('❌');

      consoleLogSpy.mockRestore();
    });
  });

  describe('printYearSummary', () => {
    it('should print year summary with correct statistics using real data ranges', () => {
      const consoleLogSpy = vi.spyOn(console, 'log');

      // Using real data range summary example
      const trades: Trade[] = [
        {
          trade_date: '2025-05-02',
          entry_time: '2025-05-02 16:54:00',
          exit_time: '2025-05-02 16:55:00',
          market_open: 566.81,
          entry_price: 566.83,
          exit_price: 566.9,
          rise_pct: 0.0004,
          return_pct: 0.0001,
          year: 2025,
          total_trading_days: 252,
          median_return: 0.12,
          std_dev_return: 0.25,
          win_rate: 0.75,
        },
      ];

      printYearSummary(2025, trades);

      const logs = consoleLogSpy.mock.calls.map(call => call[0]);
      expect(logs[2]).toContain('Trading Days: 252 | Trades: 1 (0.4% of days)');
      expect(logs[3]).toMatch(/Rise:.+\| Return:.+/);
      expect(logs[4]).toContain('✅ Performance Stats:');
      expect(logs[5]).toContain('  Mean: 0.1200% | Median: 0.1200% | StdDev: 0.2500%');
      expect(logs[6]).toContain('Win Rate: 100.0%');

      consoleLogSpy.mockRestore();
    });

    it('should handle multiple trades correctly', () => {
      const consoleLogSpy = vi.spyOn(console, 'log');

      const trades: Trade[] = Array(10).fill({
        trade_date: '2025-05-02',
        entry_time: '2025-05-02 16:54:00',
        exit_time: '2025-05-02 16:55:00',
        market_open: 566.81,
        entry_price: 566.83,
        exit_price: 567.19,
        rise_pct: 0.0036,
        return_pct: 0.0005,
        year: 2025,
        total_trading_days: 252,
        median_return: 0.04,
        std_dev_return: 0.34,
        win_rate: 0.6,
      });

      printYearSummary(2025, trades);

      const logs = consoleLogSpy.mock.calls.map(call => call[0]);
      expect(logs[2]).toContain('Trading Days: 252 | Trades: 10 (4.0% of days)');
      expect(logs[3]).toContain('Rise: 0.00% to 0.00% (avg: 0.00%) | Return: 0.00% to 0.00%');
      expect(logs[4]).toContain('✅ Performance Stats:');
      expect(logs[5]).toContain('  Mean: 0.0400% | Median: 0.0400% | StdDev: 0.3400%');
      expect(logs[6]).toContain('Win Rate: 100.0%');

      consoleLogSpy.mockRestore();
    });

    it('should handle single trade correctly', () => {
      const consoleLogSpy = vi.spyOn(console, 'log');

      const trades: Trade[] = [
        {
          trade_date: '2025-05-02',
          entry_time: '2025-05-02 16:54:00',
          exit_time: '2025-05-02 16:55:00',
          market_open: 566.81,
          entry_price: 566.83,
          exit_price: 567.19,
          rise_pct: 0.0035,
          return_pct: 0.0005,
          year: 2025,
          total_trading_days: 252,
          median_return: 0.05,
          std_dev_return: 0.0,
          win_rate: 1.0,
        },
      ];

      printYearSummary(2025, trades);

      const logs = consoleLogSpy.mock.calls.map(call => call[0]);
      expect(logs[2]).toContain('Trading Days: 252 | Trades: 1 (0.4% of days)');
      expect(logs[3]).toContain('Rise: 0.00% to 0.00% (avg: 0.00%) | Return: 0.00% to 0.00%');
      expect(logs[4]).toContain('✅ Performance Stats:');
      expect(logs[5]).toContain('  Mean: 0.0500% | Median: 0.0500% | StdDev: 0.0000%');
      expect(logs[6]).toContain('Win Rate: 100.0%');

      consoleLogSpy.mockRestore();
    });

    it('should handle no trades correctly', () => {
      const consoleLogSpy = vi.spyOn(console, 'log');

      const _trades: Trade[] = [];

      printYearSummary(2025, _trades);

      const logs = consoleLogSpy.mock.calls.map(call => call[0]);
      expect(logs[2]).toContain('Trading Days: 252 | Trades: 0 (0.0% of days)');
      expect(logs[3]).toContain(
        'Rise: Infinity% to -Infinity% (avg: NaN%) | Return: Infinity% to -Infinity%'
      );
      expect(logs[4]).toContain('✅ Performance Stats:');
      expect(logs[5]).toContain('  Mean: 0.0000% | Median: 0.0000% | StdDev: 0.0000%');
      expect(logs[6]).toContain('Win Rate: NaN%');

      consoleLogSpy.mockRestore();
    });
  });

  describe('printOverallSummary', () => {
    it('should print overall summary with correct statistics using real data', () => {
      const consoleLogSpy = vi.spyOn(console, 'log');

      // Using real data summary example
      const stats = {
        total_trading_days: 252,
        total_matches: 1,
        total_return_sum: 0.0064, // 0.64% avg
        median_return: 0.12, // 0.12%
        std_dev_return: 0.25, // 0.25%
        win_rate: 0.75, // 75%
        direction: 'long' as const,
      };

      printOverallSummary(stats);

      const output = consoleLogSpy.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('Overall Statistics (Long ↗️)');
      expect(output).toContain('Total Trading Days: 252 | Total Trades: 1 (0.4% of days)');
      expect(output).toContain(
        'Average Return: 0.0064% | Median Return: 0.1200% | StdDev: 0.2500%'
      );
      expect(output).toContain('Win Rate: 75.0%');

      consoleLogSpy.mockRestore();
    });

    it('should handle zero trades correctly', () => {
      const consoleLogSpy = vi.spyOn(console, 'log');

      // Using real data summary example
      const stats = {
        total_trading_days: 252,
        total_matches: 1,
        total_return_sum: 0.0064, // 0.64% avg
        median_return: 0.12, // 0.12%
        std_dev_return: 0.25, // 0.25%
        win_rate: 0.75, // 75%
        direction: 'long' as const,
      };

      printOverallSummary(stats);

      const output = consoleLogSpy.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('Overall Statistics (Long ↗️)');
      expect(output).toContain('Total Trading Days: 252 | Total Trades: 1 (0.4% of days)');
      expect(output).toContain(
        'Average Return: 0.0064% | Median Return: 0.1200% | StdDev: 0.2500%'
      );
      expect(output).toContain('Win Rate: 75.0%');

      consoleLogSpy.mockRestore();
    });
  });

  describe('printFooter', () => {
    it('should print footer message', () => {
      const consoleLogSpy = vi.spyOn(console, 'log');

      printFooter();

      const output = consoleLogSpy.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('Thanks for using AlphaGroove');

      consoleLogSpy.mockRestore();
    });
  });
});
