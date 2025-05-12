import { describe, it, expect, vi } from 'vitest';
// import chalk from 'chalk'; // Remove unused import
import {
  printHeader,
  printYearHeader,
  printTradeDetails,
  printYearSummary,
  printOverallSummary,
  printFooter,
  type Trade,
  type DirectionalTradeStats,
  type OverallTradeStats,
  calculatePortfolioGrowth,
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

vi.mock('./calculations', async () => {
  const actual = await vi.importActual('./calculations');
  return {
    ...actual,
  };
});

describe('output utilities', () => {
  describe('printHeader', () => {
    it('should print header with correct pattern and date information', () => {
      const consoleLogSpy = vi.spyOn(console, 'log');

      printHeader('SPY', '2025-05-02', '2025-05-05', 'quick-rise', 'fixed-time', 'long');

      const output = consoleLogSpy.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('SPY Analysis (2025-05-02 to 2025-05-05)');
      expect(output).toContain('Entry Pattern: quick-rise');
      expect(output).toContain('Exit Pattern: fixed-time');
      expect(output).toContain('Direction Strategy: Long ↗️');

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
        direction: 'long',
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
        direction: 'long',
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
    const baseTrade: Trade = {
      trade_date: '2025-01-15',
      entry_time: '09:30',
      exit_time: '10:30',
      market_open: 100,
      entry_price: 101,
      exit_price: 102,
      rise_pct: 0.01,
      return_pct: 0.01, // (102-101)/101 approx 0.01
      direction: 'long',
      total_trading_days: 252, // Example value
    };

    it('should print year summary with correct statistics for long trades', () => {
      const consoleLogSpy = vi.spyOn(console, 'log');
      const longTrades: Trade[] = [{ ...baseTrade, return_pct: 0.01, direction: 'long' }];
      printYearSummary(2025, longTrades, [], 0.0123); // Pass longTrades, empty shortTrades, and llmCost
      const output = consoleLogSpy.mock.calls.map(call => call.join(' ')).join('\n');
      expect(output).toContain('2025 Long Trades ↗️: 1 trades');
      expect(output).toContain('Win Rate: 100.0%');
      expect(output).toContain('LLM Cost: $0.0123');
      consoleLogSpy.mockRestore();
    });

    it('should print year summary for short trades if only short trades exist', () => {
      const consoleLogSpy = vi.spyOn(console, 'log');
      const shortTrades: Trade[] = [{ ...baseTrade, return_pct: 0.02, direction: 'short' }]; // Positive return for short is a win
      printYearSummary(2025, [], shortTrades, 0.005);
      const output = consoleLogSpy.mock.calls.map(call => call.join(' ')).join('\n');
      expect(output).toContain('2025 Short Trades ↘️: 1 trades');
      expect(output).toContain('Win Rate: 100.0%');
      expect(output).toContain('LLM Cost: $0.0050');
      consoleLogSpy.mockRestore();
    });

    it('should print summaries for both long and short trades if both exist', () => {
      const consoleLogSpy = vi.spyOn(console, 'log');
      const longTrades: Trade[] = [
        { ...baseTrade, return_pct: 0.03, direction: 'long' },
        { ...baseTrade, return_pct: -0.01, direction: 'long' },
      ];
      const shortTrades: Trade[] = [
        { ...baseTrade, trade_date: '2025-01-16', return_pct: 0.01, direction: 'short' },
      ];
      printYearSummary(2025, longTrades, shortTrades, 0.02);
      const output = consoleLogSpy.mock.calls.map(call => call.join(' ')).join('\n');
      expect(output).toContain('2025 Long Trades ↗️: 2 trades');
      expect(output).toContain('Win Rate: 50.0%'); // For long trades
      expect(output).toContain('2025 Short Trades ↘️: 1 trades');
      expect(output).toContain('Win Rate: 100.0%'); // For short trades
      expect(output).toContain('LLM Cost: $0.0200');
      consoleLogSpy.mockRestore();
    });

    it('should handle no trades correctly', () => {
      const consoleLogSpy = vi.spyOn(console, 'log');
      printYearSummary(2025, [], [], 0);
      const output = consoleLogSpy.mock.calls.map(call => call.join(' ')).join('\n');
      expect(output).toContain('No trades for 2025 to summarize.');
      consoleLogSpy.mockRestore();
    });
  });

  describe('printOverallSummary', () => {
    const createDirectionalStats = (
      trades: Trade[] = [],
      winning: number = 0,
      sum: number = 0
    ): DirectionalTradeStats => ({
      trades,
      winning_trades: winning,
      total_return_sum: sum,
      all_returns: trades.map(t => t.return_pct),
    });

    it('should print overall summary with correct statistics', () => {
      const consoleLogSpy = vi.spyOn(console, 'log');
      const longTrades: Trade[] = [
        {
          trade_date: '2023-01-01',
          entry_time: '09:30',
          exit_time: '10:00',
          market_open: 100,
          entry_price: 101,
          exit_price: 102,
          rise_pct: 0.01,
          return_pct: 0.01,
          direction: 'long',
        },
      ];
      const shortTrades: Trade[] = [
        {
          trade_date: '2023-01-02',
          entry_time: '09:30',
          exit_time: '10:00',
          market_open: 100,
          entry_price: 102,
          exit_price: 101,
          rise_pct: -0.01,
          return_pct: 0.01,
          direction: 'short',
        }, // profit for short
      ];

      const stats: OverallTradeStats = {
        long_stats: createDirectionalStats(longTrades, 1, 0.01),
        short_stats: createDirectionalStats(shortTrades, 1, 0.01),
        total_trading_days: 252,
        total_raw_matches: 10,
        total_llm_confirmed_trades: 2,
        grandTotalLlmCost: 0.1234,
      };
      printOverallSummary(stats);
      const output = consoleLogSpy.mock.calls.map(call => call.join(' ')).join('\n');

      expect(output).toContain('Overall Long Trades ↗️: 1 trades');
      expect(output).toContain('Overall Short Trades ↘️: 1 trades');
      expect(output).toContain('Total LLM Cost: $0.1234');
      consoleLogSpy.mockRestore();
    });

    it('should handle zero trades correctly', () => {
      const consoleLogSpy = vi.spyOn(console, 'log');
      const stats: OverallTradeStats = {
        long_stats: createDirectionalStats(),
        short_stats: createDirectionalStats(),
        total_trading_days: 252,
        total_raw_matches: 5,
        total_llm_confirmed_trades: 0,
        grandTotalLlmCost: 0.005,
      };
      printOverallSummary(stats);
      const output = consoleLogSpy.mock.calls.map(call => call.join(' ')).join('\n');
      expect(output).toContain('No LLM-confirmed trades to summarize for overall performance.');
      expect(output).toContain('Total LLM Cost: $0.0050');
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

describe('calculatePortfolioGrowth', () => {
  const initialCapital = 10000;

  it('should return initial capital if no trades are made', () => {
    const result = calculatePortfolioGrowth([], initialCapital);
    expect(result.finalCapital).toBe(initialCapital);
    expect(result.totalDollarReturn).toBe(0);
    expect(result.percentageGrowth).toBe(0);
  });

  it('should calculate growth for a single positive return', () => {
    // 0.02 means 2%
    const result = calculatePortfolioGrowth([0.02], initialCapital);
    expect(result.finalCapital).toBeCloseTo(10200);
    expect(result.totalDollarReturn).toBeCloseTo(200);
    expect(result.percentageGrowth).toBeCloseTo(2);
  });

  it('should calculate growth for a single negative return', () => {
    // -0.01 means -1%
    const result = calculatePortfolioGrowth([-0.01], initialCapital);
    expect(result.finalCapital).toBeCloseTo(9900);
    expect(result.totalDollarReturn).toBeCloseTo(-100);
    expect(result.percentageGrowth).toBeCloseTo(-1);
  });

  it('should compound multiple positive returns', () => {
    // 10% then 10% on the new capital
    const returns = [0.1, 0.1]; // 10%, 10%
    const result = calculatePortfolioGrowth(returns, initialCapital);
    expect(result.finalCapital).toBeCloseTo(12100);
    expect(result.totalDollarReturn).toBeCloseTo(2100);
    expect(result.percentageGrowth).toBeCloseTo(21);
  });

  it('should compound multiple negative returns', () => {
    // -10% then -10% on the new capital
    const returns = [-0.1, -0.1]; // -10%, -10%
    const result = calculatePortfolioGrowth(returns, initialCapital);
    expect(result.finalCapital).toBeCloseTo(8100);
    expect(result.totalDollarReturn).toBeCloseTo(-1900);
    expect(result.percentageGrowth).toBeCloseTo(-19);
  });

  it('should compound mixed positive and negative returns', () => {
    const returns = [0.1, -0.05, 0.02]; // +10%, -5%, +2%
    const result = calculatePortfolioGrowth(returns, initialCapital);
    expect(result.finalCapital).toBeCloseTo(10659);
    expect(result.totalDollarReturn).toBeCloseTo(659);
    expect(result.percentageGrowth).toBeCloseTo(6.59);
  });

  it('should handle the specific sequence from user data correctly', () => {
    // Returns from user: -0.10%, +0.46%, +0.42%, +0.49%, -0.20%
    // These are decimals: -0.0010, 0.0046, 0.0042, 0.0049, -0.0020
    const returns = [-0.001, 0.0046, 0.0042, 0.0049, -0.002];
    const result = calculatePortfolioGrowth(returns, initialCapital);
    // Actual result for finalCapital with these inputs is approx 10107.232745890653
    // Actual result for totalDollarReturn is approx 107.232745890653
    // Actual result for percentageGrowth is approx 1.07232745890653
    expect(result.finalCapital).toBeCloseTo(10107.2327459, 7);
    expect(result.totalDollarReturn).toBeCloseTo(107.2327459, 7);
    expect(result.percentageGrowth).toBeCloseTo(1.0723275, 7);
  });

  it('should work with a different initial capital', () => {
    const returns = [0.05]; // 5%
    const result = calculatePortfolioGrowth(returns, 50000);
    expect(result.finalCapital).toBeCloseTo(52500);
    expect(result.totalDollarReturn).toBeCloseTo(2500);
    expect(result.percentageGrowth).toBeCloseTo(5);
  });
});
