import { describe, it, expect } from 'vitest';

import {
  calculateTradePercentage,
  calculateAvgRise,
  calculateWinningTrades,
  calculateWinRate,
  calculateMeanReturn,
  calculateMedianReturn,
  calculateStdDevReturn,
  isWinningTrade,
  formatPercent,
  formatDollar,
  formatTime,
  formatDate,
} from './calculations';
import { Trade } from './output';

describe('calculation functions', () => {
  describe('formatters', () => {
    it('should format date correctly', () => {
      expect(formatDate('2023-05-15')).toBe('2023-05-15');
    });

    it('should format time correctly', () => {
      expect(formatTime('2023-05-15 14:30:00')).toBe('14:30');
      expect(formatTime('2023-05-15 09:05:30')).toBe('09:05');
      expect(formatTime('10:15:00')).toBe('10:15');
      expect(formatTime('10:15')).toBe('10:15');
      expect(formatTime(null)).toBe('--:--');
      expect(formatTime(undefined)).toBe('--:--');
      expect(formatTime('')).toBe('--:--');
    });

    it('should format dollar values correctly', () => {
      expect(formatDollar(123.456)).toBe('$123.46');
      expect(formatDollar(0)).toBe('$0.00');
      expect(formatDollar(-45.67)).toBe('$-45.67');
    });

    it('should format percentages correctly', () => {
      expect(formatPercent(0.0123)).toBe('1.23%');
      expect(formatPercent(0)).toBe('0.00%');
      expect(formatPercent(-0.0456)).toBe('-4.56%');
    });
  });

  describe('calculateTradePercentage', () => {
    it('should calculate trade percentage correctly', () => {
      expect(calculateTradePercentage(25, 250)).toBe('10.0');
      expect(calculateTradePercentage(0, 250)).toBe('0.0');
      expect(calculateTradePercentage(125, 250)).toBe('50.0');
    });
  });

  describe('calculateAvgRise', () => {
    it('should calculate average rise correctly', () => {
      expect(calculateAvgRise([0.01, 0.02, 0.03])).toBe(0.02);
      expect(calculateAvgRise([0.005, 0.015])).toBe(0.01);
      expect(calculateAvgRise([])).toBe(0);
    });
  });

  describe('calculateWinningTrades', () => {
    it('should calculate winning trades for long positions', () => {
      const trades: Trade[] = [
        {
          trade_date: '',
          entry_time: '',
          exit_time: '',
          market_open: 0,
          entry_price: 0,
          exit_price: 0,
          rise_pct: 0,
          return_pct: 0.01,
        },
        {
          trade_date: '',
          entry_time: '',
          exit_time: '',
          market_open: 0,
          entry_price: 0,
          exit_price: 0,
          rise_pct: 0,
          return_pct: 0,
        },
        {
          trade_date: '',
          entry_time: '',
          exit_time: '',
          market_open: 0,
          entry_price: 0,
          exit_price: 0,
          rise_pct: 0,
          return_pct: -0.01,
        },
      ];

      expect(calculateWinningTrades(trades, false)).toBe(2); // 0 and positive are wins for long
    });

    it('should calculate winning trades for short positions', () => {
      const trades: Trade[] = [
        {
          trade_date: '',
          entry_time: '',
          exit_time: '',
          market_open: 0,
          entry_price: 0,
          exit_price: 0,
          rise_pct: 0,
          return_pct: 0.01,
        },
        {
          trade_date: '',
          entry_time: '',
          exit_time: '',
          market_open: 0,
          entry_price: 0,
          exit_price: 0,
          rise_pct: 0,
          return_pct: 0,
        },
        {
          trade_date: '',
          entry_time: '',
          exit_time: '',
          market_open: 0,
          entry_price: 0,
          exit_price: 0,
          rise_pct: 0,
          return_pct: -0.01,
        },
      ];

      expect(calculateWinningTrades(trades, true)).toBe(1); // only positive are wins for short
    });
  });

  describe('calculateWinRate', () => {
    it('should calculate win rate correctly', () => {
      expect(calculateWinRate(75, 100)).toBe(75);
      expect(calculateWinRate(0, 100)).toBe(0);
      expect(calculateWinRate(100, 100)).toBe(100);
      expect(calculateWinRate(0, 0)).toBe(0); // handles division by zero
    });
  });

  describe('calculateMeanReturn', () => {
    it('should calculate mean return correctly', () => {
      expect(calculateMeanReturn([0.01, 0.02, 0.03])).toBe(0.02);
      expect(calculateMeanReturn([-0.01, 0.01])).toBe(0);
      expect(calculateMeanReturn([])).toBe(0);
    });
  });

  describe('calculateMedianReturn', () => {
    it('should calculate median return correctly', () => {
      expect(calculateMedianReturn([0.01, 0.02, 0.03])).toBe(0.02);
      expect(calculateMedianReturn([0.01, 0.02, 0.03, 0.04])).toBe(0.025);
      expect(calculateMedianReturn([-0.02, -0.01, 0.01, 0.02])).toBe(0);
      expect(calculateMedianReturn([])).toBe(0);
    });
  });

  describe('calculateStdDevReturn', () => {
    it('should calculate standard deviation correctly', () => {
      // For the sample [2, 4, 4, 4, 5, 5, 7, 9] with mean 5, the standard deviation is 2
      const returns = [2, 4, 4, 4, 5, 5, 7, 9];
      const mean = 5;
      expect(calculateStdDevReturn(returns, mean)).toBeCloseTo(2);

      // For a single value array, std dev should be 0
      expect(calculateStdDevReturn([0.01], 0.01)).toBe(0);

      // For an empty array, std dev should be 0
      expect(calculateStdDevReturn([], 0)).toBe(0);
    });
  });

  describe('isWinningTrade', () => {
    it('should correctly identify winning trades for long positions', () => {
      expect(isWinningTrade(0.01, false)).toBe(true); // positive return is a win
      expect(isWinningTrade(0, false)).toBe(false); // zero return is NOT a win
      expect(isWinningTrade(-0.01, false)).toBe(false); // negative return is a loss
    });

    it('should correctly identify winning trades for short positions', () => {
      expect(isWinningTrade(0.01, true)).toBe(true); // positive return is a win
      expect(isWinningTrade(0, true)).toBe(false); // zero return is a loss
      expect(isWinningTrade(-0.01, true)).toBe(false); // negative return is a loss
    });
  });
});
