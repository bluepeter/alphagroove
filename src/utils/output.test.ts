import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// import chalk from 'chalk'; // Unused
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
// import { formatDate, formatTime, formatDollar, formatPercent } from './calculations'; // Unused

// Mock chalk to prevent styling in tests
vi.mock('chalk', () => ({
  default: {
    bold: (text: string) => text,
    green: (text: string) => text,
    red: (text: string) => text,
    cyan: (text: string) => text,
    gray: (text: string) => text,
    dim: (text: string) => text,
  },
}));

vi.mock('./calculations', async () => {
  const actual = await vi.importActual('./calculations');
  return {
    ...actual,
  };
});

// Minimal mock trade object base
const mockTradeBase: Omit<Trade, 'entry_price' | 'exit_price' | 'return_pct'> = {
  trade_date: '2025-01-06',
  entry_time: '13:00:00',
  exit_time: '13:03:00',
  executionPriceBase: 597.75,
  rise_pct: -0.1,
  direction: 'short',
  exit_reason: 'profitTarget',
  year: 2025,
};

describe('output utilities', () => {
  describe('printHeader', () => {
    it('should print header with detailed exit strategy information', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const exitStrategiesConfig = {
        enabled: ['stopLoss', 'profitTarget'],
        endOfDay: { time: '16:00' },
        strategyOptions: {
          stopLoss: { percentFromEntry: 1.0, useLlmProposedPrice: true, atrMultiplier: 2.0 },
          profitTarget: { percentFromEntry: 2.0, useLlmProposedPrice: false, atrMultiplier: 3.0 },
        },
      };
      printHeader(
        'SPY',
        '2025-05-02',
        '2025-05-05',
        'quick-rise',
        exitStrategiesConfig,
        'llm_decides',
        { numCalls: 2, temperatures: [0.1, 1.0], agreementThreshold: 2 }
      );
      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');
      expect(output).toContain('SPY Analysis (2025-05-02 to 2025-05-05)');
      expect(output).toContain('Entry Pattern: quick-rise');
      expect(output).toContain('Exit Strategies: Stop Loss (LLM), Profit Target (ATR), End of Day');
      expect(output).toContain('LLM Analysis: 2 calls, temps [0.1, 1], threshold 2 🧠');
      consoleLogSpy.mockRestore();
    });

    it('should print header with percent based exit strategies if ATR and LLM are not set', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const exitStrategiesConfig = {
        enabled: ['stopLoss', 'profitTarget'],
        stopLoss: { percentFromEntry: 1.0, useLlmProposedPrice: false }, // No atrMultiplier
        profitTarget: { percentFromEntry: 2.0, useLlmProposedPrice: false }, // No atrMultiplier
      };
      printHeader('QQQ', '2024-01-01', '2024-01-02', 'quick-fall', exitStrategiesConfig, 'short');
      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');
      expect(output).toContain('QQQ Analysis (2024-01-01 to 2024-01-02)');
      expect(output).toContain('Entry Pattern: quick-fall');
      expect(output).toContain('Exit Strategies: Stop Loss (Percent), Profit Target (Percent)');
      consoleLogSpy.mockRestore();
    });

    it('should default to Max Hold Time if exitStrategiesConfig is undefined', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      printHeader('AAPL', '2023-01-01', '2023-01-02', 'test-pattern', undefined, 'long');
      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');
      expect(output).toContain('Exit Strategies: Default (Max Hold Time)');
      consoleLogSpy.mockRestore();
    });

    it('should handle other strategies correctly', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const exitStrategiesConfig = {
        enabled: ['maxHoldTime', 'trailingStop'],
        maxHoldTime: { minutes: 30 },
        trailingStop: { activationPercent: 1, trailPercent: 0.5 },
      };
      printHeader(
        'MSFT',
        '2023-01-01',
        '2023-01-02',
        'another-pattern',
        exitStrategiesConfig,
        'long'
      );
      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');
      expect(output).toContain('Exit Strategies: Max Hold Time, Trailing Stop');
      consoleLogSpy.mockRestore();
    });
  });

  describe('printYearHeader', () => {
    it('should print year header with correct formatting', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      printYearHeader('2025');
      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');
      expect(output).toContain('2025 Trades:');
      consoleLogSpy.mockRestore();
    });
  });

  describe('printTradeDetails', () => {
    let consoleLogSpy: any;
    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });
    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    it('should print trade details with correct formatting and colors for a profitable trade', () => {
      const trade: Trade = {
        trade_date: '2025-05-02',
        entry_time: '2025-05-02 16:54:00',
        exit_time: '2025-05-02 16:55:00',
        executionPriceBase: 566.81,
        entry_price: 566.83,
        exit_price: 567.19,
        rise_pct: 0.0036,
        return_pct: 0.0064,
        direction: 'long',
        year: 2025,
      };

      printTradeDetails(trade);
      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');
      expect(output).toContain('2025-05-02');
      expect(output).toContain('16:54');
      expect(output).toContain('16:55');
      expect(output).toContain('$566.81');
      expect(output).toContain('$566.83');
      expect(output).toContain('$567.19');
      expect(output).toContain('0.36%');
      expect(output).toContain('0.64%');
      expect(output).toContain('✅');
    });

    it('should show error emoji for negative returns using real data', () => {
      const trade: Trade = {
        trade_date: '2025-05-02',
        entry_time: '2025-05-02 16:56:00',
        exit_time: '2025-05-02 16:57:00',
        executionPriceBase: 566.81,
        entry_price: 567.12,
        exit_price: 566.94,
        rise_pct: 0.0031,
        return_pct: -0.0032,
        direction: 'long',
        year: 2025,
      };

      printTradeDetails(trade);
      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');
      expect(output).toContain('2025-05-02');
      expect(output).toContain('16:56');
      expect(output).toContain('16:57');
      expect(output).toContain('$566.81');
      expect(output).toContain('$567.12');
      expect(output).toContain('$566.94');
      expect(output).toContain('0.31%');
      expect(output).toContain('-0.32%');
      expect(output).toContain('❌');
    });

    it('should display ATR-based stop loss correctly', () => {
      const trade: Trade = {
        ...mockTradeBase,
        entry_price: 597.47,
        exit_price: 597.46,
        return_pct: -0.0001,
        isStopLossAtrBased: true,
        stopLossAtrMultiplierUsed: 2.0,
        initialStopLossPrice: 599.47,
        entryAtrValue: 1.0,
      };
      printTradeDetails(trade);
      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');
      expect(output).toContain('ATR: $1.00');
      expect(output).toContain('ATR SL [2.0x]: $599.47 (+$2.00, 0.33%)');
    });

    it('should display percentage-based stop loss correctly', () => {
      const trade: Trade = {
        ...mockTradeBase,
        entry_price: 597.47,
        exit_price: 597.46,
        return_pct: -0.0001,
        isStopLossAtrBased: false,
        initialStopLossPrice: 599.47,
      };
      printTradeDetails(trade);
      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');
      expect(output).toContain('SL: $599.47 (+$2.00, 0.33%)');
    });

    it('should display ATR-based profit target correctly', () => {
      const trade: Trade = {
        ...mockTradeBase,
        entry_price: 597.47,
        exit_price: 596.68,
        return_pct: (597.47 - 596.68) / 597.47,
        isProfitTargetAtrBased: true,
        profitTargetAtrMultiplierUsed: 1.5,
        initialProfitTargetPrice: 596.68,
        entryAtrValue: 0.5266666666666666,
      };
      printTradeDetails(trade);
      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');
      expect(output).toContain('ATR: $0.53');
      expect(output).toContain('ATR PT [1.5x]: $596.68 (-$0.79, -0.13%)');
    });

    it('should display trailing stop activation level correctly (non-ATR)', () => {
      const trade: Trade = {
        ...mockTradeBase,
        entry_price: 597.47,
        exit_price: 590.0,
        return_pct: (597.47 - 590.0) / 597.47,
        tsActivationLevel: 591.5,
        isTrailingStopAtrBased: false,
      };
      printTradeDetails(trade);
      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');
      expect(output).toContain('TS Act: $591.50 (-$5.97, -1.00%)');
    });

    it('should display ATR-based trail amount with percentage conversion', () => {
      const trade: Trade = {
        ...mockTradeBase,
        entry_price: 597.47,
        exit_price: 597.0,
        return_pct: (597.47 - 597.0) / 597.47,
        isTrailingStopAtrBased: true,
        tsTrailAtrMultiplierUsed: 0.5,
        tsTrailAmount: 0.26,
        entryAtrValue: 0.52,
      };
      printTradeDetails(trade);
      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');
      expect(output).toContain('ATR: $0.52');
      expect(output).toContain('TS Trail [0.5x ATR]: $0.26 (0.04%)');
    });

    it('should display percentage-based trail amount correctly', () => {
      const trade: Trade = {
        ...mockTradeBase,
        entry_price: 597.47,
        exit_price: 597.0,
        return_pct: (597.47 - 597.0) / 597.47,
        isTrailingStopAtrBased: false,
        tsTrailAmount: 0.5,
      };
      printTradeDetails(trade);
      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');
      expect(output).toContain('TS Trail: 0.50% of price');
    });

    it('should display full trade with all ATR-based parameters correctly', () => {
      const trade: Trade = {
        trade_date: '2025-01-07',
        entry_time: '13:00:00',
        exit_time: '14:39:00',
        executionPriceBase: 590.91,
        entry_price: 591.06,
        exit_price: 590.52,
        rise_pct: 0.1,
        return_pct: (591.06 - 590.52) / 591.06,
        direction: 'short',
        exit_reason: 'profitTarget',
        year: 2025,
        entryAtrValue: 0.5,
        isStopLossAtrBased: true,
        stopLossAtrMultiplierUsed: 2.0,
        initialStopLossPrice: 592.06,
        isProfitTargetAtrBased: true,
        profitTargetAtrMultiplierUsed: 1.64,
        initialProfitTargetPrice: 590.24,
        isTrailingStopAtrBased: true,
        tsActivationAtrMultiplierUsed: 1.0,
        tsActivationLevel: 590.56,
        tsTrailAtrMultiplierUsed: 0.5,
        tsTrailAmount: 0.25,
      };
      printTradeDetails(trade);
      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');
      expect(output).toContain('ATR: $0.50');
      expect(output).toContain('ATR SL [2.0x]: $592.06 (+$1.00, 0.17%)');
      expect(output).toContain('ATR PT [1.6x]: $590.24 (-$0.82, -0.14%)');
      expect(output).toContain('TS Act [1.0x ATR]: $590.56 (-$0.50, -0.08%)');
      expect(output).toContain('TS Trail [0.5x ATR]: $0.25 (0.04%)');
    });
  });

  describe('printYearSummary', () => {
    let consoleLogSpy: any;
    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });
    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    const baseTrade: Trade = {
      trade_date: '2025-01-15',
      entry_time: '09:30',
      exit_time: '10:30',
      executionPriceBase: 100,
      entry_price: 101,
      exit_price: 102,
      rise_pct: 0.01,
      return_pct: 0.01, // (102-101)/101 approx 0.01
      direction: 'long',
      total_trading_days: 252, // Example value
      year: 2025,
    };

    it('should print year summary with correct statistics for long trades', () => {
      const longTrades: Trade[] = [{ ...baseTrade, return_pct: 0.01, direction: 'long' }];
      printYearSummary(2025, longTrades, [], 0.0123); // Pass longTrades, empty shortTrades, and llmCost
      const output = consoleLogSpy.mock.calls.map((call: any[]) => call.join(' ')).join('\n');
      expect(output).toContain('2025 Long Trades ↗️: 1 trades');
      expect(output).toContain('Win Rate: 100.0%');
      expect(output).toContain('LLM Cost: $0.0123');
    });

    it('should print year summary for short trades if only short trades exist', () => {
      const shortTrades: Trade[] = [{ ...baseTrade, return_pct: 0.02, direction: 'short' }]; // Positive return for short is a win
      printYearSummary(2025, [], shortTrades, 0.005);
      const output = consoleLogSpy.mock.calls.map((call: any[]) => call.join(' ')).join('\n');
      expect(output).toContain('2025 Short Trades ↘️: 1 trades');
      expect(output).toContain('Win Rate: 100.0%');
      expect(output).toContain('LLM Cost: $0.0050');
    });

    it('should print summaries for both long and short trades if both exist', () => {
      const longTrades: Trade[] = [
        { ...baseTrade, return_pct: 0.03, direction: 'long' },
        { ...baseTrade, return_pct: -0.01, direction: 'long' },
      ];
      const shortTrades: Trade[] = [
        { ...baseTrade, trade_date: '2025-01-16', return_pct: 0.01, direction: 'short' },
      ];
      printYearSummary(2025, longTrades, shortTrades, 0.02);
      const output = consoleLogSpy.mock.calls.map((call: any[]) => call.join(' ')).join('\n');
      expect(output).toContain('2025 Long Trades ↗️: 2 trades');
      expect(output).toContain('Win Rate: 50.0%'); // For long trades
      expect(output).toContain('2025 Short Trades ↘️: 1 trades');
      expect(output).toContain('Win Rate: 100.0%'); // For short trades
      expect(output).toContain('LLM Cost: $0.0200');
    });

    it('should handle no trades correctly', () => {
      printYearSummary(2025, [], [], 0);
      const output = consoleLogSpy.mock.calls.map((call: any[]) => call.join(' ')).join('\n');
      expect(output).toContain('No trades for 2025 to summarize.');
    });
  });

  describe('printOverallSummary', () => {
    let consoleLogSpy: any;
    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });
    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

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
      const longTrades: Trade[] = [
        {
          trade_date: '2023-01-01',
          entry_time: '09:30',
          exit_time: '10:00',
          executionPriceBase: 100,
          entry_price: 101,
          exit_price: 102,
          rise_pct: 0.01,
          return_pct: 0.01,
          direction: 'long',
          year: 2023,
        },
      ];
      const shortTrades: Trade[] = [
        {
          trade_date: '2023-01-02',
          entry_time: '09:30',
          exit_time: '10:00',
          executionPriceBase: 100,
          entry_price: 102,
          exit_price: 101,
          rise_pct: -0.01,
          return_pct: 0.01,
          direction: 'short',
          year: 2023,
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
      const output = consoleLogSpy.mock.calls.map((call: any[]) => call.join(' ')).join('\n');

      expect(output).toContain('Overall Long Trades ↗️: 1 trades');
      expect(output).toContain('Overall Short Trades ↘️: 1 trades');
      expect(output).toContain('Total LLM Cost: $0.1234');
    });

    it('should handle zero trades correctly', () => {
      const stats: OverallTradeStats = {
        long_stats: createDirectionalStats(),
        short_stats: createDirectionalStats(),
        total_trading_days: 252,
        total_raw_matches: 5,
        total_llm_confirmed_trades: 0,
        grandTotalLlmCost: 0.005,
      };
      printOverallSummary(stats);
      const output = consoleLogSpy.mock.calls.map((call: any[]) => call.join(' ')).join('\n');
      expect(output).toContain('No LLM-confirmed trades to summarize for overall performance.');
      expect(output).toContain('Total LLM Cost: $0.0050');
    });
  });

  describe('printFooter', () => {
    let consoleLogSpy: any;
    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });
    afterEach(() => {
      consoleLogSpy.mockRestore();
    });
    it('should print footer message', () => {
      printFooter();
      const output = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');
      expect(output).toContain('Thanks for using AlphaGroove');
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
