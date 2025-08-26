import { describe, it, expect } from 'vitest';
import {
  StopLossStrategy,
  ProfitTargetStrategy,
  TrailingStopStrategy,
  MaxHoldTimeStrategy,
  EndOfDayStrategy,
  createExitStrategies,
  applySlippage,
} from './exit-strategy';
import { Bar } from '../../utils/calculations';

// Helper function to create a series of bars for testing
const createTestBars = (
  timestamps: string[],
  prices: { open: number; high: number; low: number; close: number }[]
): Bar[] => {
  return timestamps.map((timestamp, i) => ({
    timestamp,
    open: prices[i].open,
    high: prices[i].high,
    low: prices[i].low,
    close: prices[i].close,
    volume: 1000,
  }));
};

describe('Exit Strategies', () => {
  describe('StopLossStrategy', () => {
    it('should trigger stop loss for long position using percentage', () => {
      const strategy = new StopLossStrategy({ percentFromEntry: 1.0, useLlmProposedPrice: false });
      const entryPrice = 100;
      const entryTime = '2023-01-01 10:00:00';
      const bars = createTestBars(
        [
          '2023-01-01 10:00:00',
          '2023-01-01 10:01:00',
          '2023-01-01 10:02:00',
          '2023-01-01 10:03:00',
        ],
        [
          { open: 100, high: 101, low: 99.5, close: 100.5 },
          { open: 100.5, high: 100.8, low: 99.8, close: 100.2 },
          { open: 100.2, high: 100.3, low: 98.8, close: 99.0 }, // Stop loss hit
          { open: 99.0, high: 99.5, low: 98.5, close: 99.2 },
        ]
      );

      const result = strategy.evaluate(
        entryPrice,
        entryTime,
        bars,
        true,
        undefined,
        true,
        undefined
      );

      expect(result).not.toBeNull();
      expect(result?.timestamp).toBe('2023-01-01 10:02:00');
      expect(result?.price).toBe(99.0); // 1% below entry price
      expect(result?.reason).toBe('stopLoss');
    });

    it('should trigger stop loss for short position using percentage', () => {
      const strategy = new StopLossStrategy({ percentFromEntry: 1.0, useLlmProposedPrice: false });
      const entryPrice = 100;
      const entryTime = '2023-01-01 10:00:00';
      const bars = createTestBars(
        [
          '2023-01-01 10:00:00',
          '2023-01-01 10:01:00',
          '2023-01-01 10:02:00',
          '2023-01-01 10:03:00',
        ],
        [
          { open: 100, high: 101, low: 99.5, close: 100.5 },
          { open: 100.5, high: 100.8, low: 99.8, close: 100.2 },
          { open: 100.2, high: 101.1, low: 100.0, close: 101.0 }, // Stop loss hit
          { open: 101.0, high: 101.5, low: 100.8, close: 101.2 },
        ]
      );

      const result = strategy.evaluate(
        entryPrice,
        entryTime,
        bars,
        false,
        undefined,
        true,
        undefined
      );

      expect(result).not.toBeNull();
      expect(result?.timestamp).toBe('2023-01-01 10:02:00');
      expect(result?.price).toBe(101.0); // 1% above entry price
      expect(result?.reason).toBe('stopLoss');
    });

    it('should trigger stop loss using ATR multiplier for long position', () => {
      const strategy = new StopLossStrategy({
        percentFromEntry: 1.0,
        atrMultiplier: 2.0,
        useLlmProposedPrice: false,
      });
      const entryPrice = 100;
      const entryTime = '2023-01-01 10:00:00';
      const atr = 1.0; // 2 ATR = 2 points
      const bars = createTestBars(
        ['2023-01-01 10:00:00', '2023-01-01 10:01:00', '2023-01-01 10:02:00'],
        [
          { open: 100, high: 101, low: 99.5, close: 100.5 },
          { open: 100.5, high: 100.8, low: 98.5, close: 98.7 }, // Stop loss hit (below 98)
          { open: 98.7, high: 99.0, low: 98.0, close: 98.5 },
        ]
      );

      const result = strategy.evaluate(entryPrice, entryTime, bars, true, atr, true, undefined);

      expect(result).not.toBeNull();
      expect(result?.timestamp).toBe('2023-01-01 10:02:00');
      expect(result?.price).toBe(98.0); // Entry - (2 * ATR)
      expect(result?.reason).toBe('stopLoss');
    });

    it('should not trigger if stop loss level is not hit', () => {
      const strategy = new StopLossStrategy({ percentFromEntry: 2.0, useLlmProposedPrice: false });
      const entryPrice = 100;
      const entryTime = '2023-01-01 10:00:00';
      const bars = createTestBars(
        ['2023-01-01 10:00:00', '2023-01-01 10:01:00', '2023-01-01 10:02:00'],
        [
          { open: 100, high: 101, low: 99.5, close: 100.5 },
          { open: 100.5, high: 100.8, low: 99.0, close: 99.5 }, // Not hitting 98 (2% below)
          { open: 99.5, high: 100.0, low: 99.0, close: 99.8 },
        ]
      );

      const result = strategy.evaluate(
        entryPrice,
        entryTime,
        bars,
        true,
        undefined,
        true,
        undefined
      );

      expect(result).toBeNull();
    });

    it('should return null if no trading bars after entry', () => {
      const strategy = new StopLossStrategy({ percentFromEntry: 1.0, useLlmProposedPrice: false });
      const entryPrice = 100;
      const entryTime = '2023-01-01 10:00:00';
      const bars = createTestBars(
        ['2023-01-01 10:00:00'],
        [{ open: 100, high: 101, low: 99, close: 100.5 }]
      );

      const result = strategy.evaluate(
        entryPrice,
        entryTime,
        bars,
        true,
        undefined,
        true,
        undefined
      );

      expect(result).toBeNull();
    });
  });

  describe('ProfitTargetStrategy', () => {
    it('should trigger profit target for long position using percentage', () => {
      const strategy = new ProfitTargetStrategy({
        percentFromEntry: 2.0,
        useLlmProposedPrice: false,
      });
      const entryPrice = 100;
      const entryTime = '2023-01-01 10:00:00';
      const bars = createTestBars(
        [
          '2023-01-01 10:00:00',
          '2023-01-01 10:01:00',
          '2023-01-01 10:02:00',
          '2023-01-01 10:03:00',
        ],
        [
          { open: 100, high: 101, low: 99.5, close: 100.5 },
          { open: 100.5, high: 101.8, low: 100.2, close: 101.5 },
          { open: 101.5, high: 102.5, low: 101.0, close: 102.0 }, // Profit target hit at 102
          { open: 102.0, high: 102.8, low: 101.5, close: 102.5 },
        ]
      );

      const result = strategy.evaluate(
        entryPrice,
        entryTime,
        bars,
        true,
        undefined,
        true,
        undefined
      );

      expect(result).not.toBeNull();
      expect(result?.timestamp).toBe('2023-01-01 10:02:00');
      expect(result?.price).toBe(102.0); // 2% above entry
      expect(result?.reason).toBe('profitTarget');
    });

    it('should trigger profit target for short position using percentage', () => {
      const strategy = new ProfitTargetStrategy({
        percentFromEntry: 2.0,
        useLlmProposedPrice: false,
      });
      const entryPrice = 100;
      const entryTime = '2023-01-01 10:00:00';
      const bars = createTestBars(
        [
          '2023-01-01 10:00:00',
          '2023-01-01 10:01:00',
          '2023-01-01 10:02:00',
          '2023-01-01 10:03:00',
        ],
        [
          { open: 100, high: 100.5, low: 99, close: 99.5 },
          { open: 99.5, high: 99.8, low: 98.5, close: 99.0 },
          { open: 99.0, high: 99.2, low: 97.5, close: 98.0 }, // Profit target hit at 98
          { open: 98.0, high: 98.5, low: 97.0, close: 97.5 },
        ]
      );

      const result = strategy.evaluate(
        entryPrice,
        entryTime,
        bars,
        false,
        undefined,
        true,
        undefined
      );

      expect(result).not.toBeNull();
      expect(result?.timestamp).toBe('2023-01-01 10:02:00');
      expect(result?.price).toBe(98.0); // 2% below entry for short
      expect(result?.reason).toBe('profitTarget');
    });

    it('should trigger profit target using ATR multiplier for long position', () => {
      const strategy = new ProfitTargetStrategy({
        percentFromEntry: 2.0,
        atrMultiplier: 2.0,
        useLlmProposedPrice: false,
      });
      const entryPrice = 100;
      const entryTime = '2023-01-01 10:00:00';
      const atr = 1.5; // 2 ATR = 3 points
      const bars = createTestBars(
        ['2023-01-01 10:00:00', '2023-01-01 10:01:00', '2023-01-01 10:02:00'],
        [
          { open: 100, high: 101, low: 99.5, close: 100.5 },
          { open: 100.5, high: 102.0, low: 100.2, close: 101.5 },
          { open: 101.5, high: 103.5, low: 101.0, close: 103.0 }, // Target hit at 103
        ]
      );

      const result = strategy.evaluate(entryPrice, entryTime, bars, true, atr, true, undefined);

      expect(result).not.toBeNull();
      expect(result?.timestamp).toBe('2023-01-01 10:02:00');
      expect(result?.price).toBe(103.0); // Entry + (2 * ATR)
      expect(result?.reason).toBe('profitTarget');
    });

    it('should not trigger if profit target is not hit', () => {
      const strategy = new ProfitTargetStrategy({
        percentFromEntry: 3.0,
        useLlmProposedPrice: false,
      });
      const entryPrice = 100;
      const entryTime = '2023-01-01 10:00:00';
      const bars = createTestBars(
        ['2023-01-01 10:00:00', '2023-01-01 10:01:00', '2023-01-01 10:02:00'],
        [
          { open: 100, high: 101, low: 99.5, close: 100.5 },
          { open: 100.5, high: 102.0, low: 100.2, close: 101.5 }, // Not hitting 103 (3% above)
          { open: 101.5, high: 102.5, low: 101.0, close: 102.0 },
        ]
      );

      const result = strategy.evaluate(
        entryPrice,
        entryTime,
        bars,
        true,
        undefined,
        true,
        undefined
      );

      expect(result).toBeNull();
    });
  });

  describe('TrailingStopStrategy', () => {
    it('should trigger trailing stop for long position after activation', () => {
      const strategy = new TrailingStopStrategy({ activationPercent: 1.0, trailPercent: 0.5 });
      const entryPrice = 100;
      const entryTime = '2023-01-01 10:00:00';
      const bars = createTestBars(
        [
          '2023-01-01 10:00:00',
          '2023-01-01 10:01:00',
          '2023-01-01 10:02:00',
          '2023-01-01 10:03:00',
          '2023-01-01 10:04:00',
        ],
        [
          { open: 100, high: 100.5, low: 99.5, close: 100.2 },
          { open: 100.2, high: 101.2, low: 100.0, close: 101.0 }, // Activation at 101 (1% gain)
          { open: 101.0, high: 102.0, low: 100.8, close: 101.8 }, // New high = 102, trailing stop at 101.49
          { open: 101.8, high: 102.5, low: 101.5, close: 102.2 }, // New high = 102.5, trailing stop at 101.99
          { open: 102.2, high: 102.3, low: 101.6, close: 101.7 }, // Drops below trailing stop at 101.99
        ]
      );

      const result = strategy.evaluate(
        entryPrice,
        entryTime,
        bars,
        true,
        undefined,
        true,
        undefined
      );

      expect(result).not.toBeNull();
      expect(result?.timestamp).toBe('2023-01-01 10:01:00');
      expect(result?.price).toBeCloseTo(100.694, 3);
      expect(result?.reason).toBe('trailingStop');
    });

    it('should trigger trailing stop immediately when activationAtrMultiplier is 0 (long)', () => {
      const strategy = new TrailingStopStrategy({
        activationAtrMultiplier: 0,
        trailAtrMultiplier: 1.0,
        trailPercent: 0.5, // Required now
      });
      const entryPrice = 100;
      const entryTime = '2023-01-01 10:00:00';
      const atr = 2.0; // ATR value

      // Price moves up slightly, then down to trigger stop
      const bars = createTestBars(
        ['2023-01-01 10:00:00', '2023-01-01 10:01:00', '2023-01-01 10:02:00'],
        [
          { open: 100, high: 102, low: 100, close: 101 }, // Entry bar
          { open: 101, high: 103, low: 101, close: 102 }, // Price moves up
          { open: 102, high: 102, low: 97, close: 97 }, // Price drops, should trigger stop
        ]
      );

      const result = strategy.evaluate(entryPrice, entryTime, bars, true, atr);

      expect(result).not.toBeNull();
      expect(result?.reason).toBe('trailingStop');
      // With immediate activation and trail of 1.0 ATR (2.0), trailing stop should be at 100 - 2 = 98
      // When price drops to 97 (bar low), it should trigger
      expect(result?.timestamp).toBe('2023-01-01 10:02:00');
    });

    it('should trigger trailing stop immediately when activationAtrMultiplier is 0 (short)', () => {
      const strategy = new TrailingStopStrategy({
        activationAtrMultiplier: 0,
        trailAtrMultiplier: 1.0,
        trailPercent: 0.5, // Required now
      });
      const entryPrice = 100;
      const entryTime = '2023-01-01 10:00:00';
      const atr = 2.0; // ATR value

      // Price moves down slightly, then up to trigger stop
      const bars = createTestBars(
        ['2023-01-01 10:00:00', '2023-01-01 10:01:00', '2023-01-01 10:02:00'],
        [
          { open: 100, high: 100, low: 98, close: 99 }, // Entry bar
          { open: 99, high: 99, low: 97, close: 98 }, // Price moves down
          { open: 98, high: 103, low: 98, close: 103 }, // Price jumps up, should trigger stop
        ]
      );

      const result = strategy.evaluate(entryPrice, entryTime, bars, false, atr);

      expect(result).not.toBeNull();
      expect(result?.reason).toBe('trailingStop');
      // With immediate activation and trail of 1.0 ATR (2.0), trailing stop should be at 100 + 2 = 102
      // When price jumps to 103 (bar high), it should trigger
      expect(result?.timestamp).toBe('2023-01-01 10:02:00');
    });

    it('should work with ATR-only trailing stop (no trailPercent)', () => {
      const strategy = new TrailingStopStrategy({
        activationAtrMultiplier: 0,
        trailAtrMultiplier: 1.0,
        // No trailPercent - should use ATR only
      });
      const entryPrice = 100;
      const entryTime = '2023-01-01 10:00:00';
      const atr = 2.0; // ATR value

      const bars = createTestBars(
        ['2023-01-01 10:00:00', '2023-01-01 10:01:00', '2023-01-01 10:02:00'],
        [
          { open: 100, high: 102, low: 100, close: 101 }, // Entry bar
          { open: 101, high: 103, low: 99, close: 102 }, // Price moves up to 103, then trail stop at 101 (103-2), triggered by low 99
          { open: 102, high: 102, low: 102, close: 102 }, // This bar won't be reached
        ]
      );

      const result = strategy.evaluate(entryPrice, entryTime, bars, true, atr, true);

      expect(result).not.toBeNull();
      expect(result?.reason).toBe('trailingStop');
      // ATR trail: best price (103) - ATR trail (2.0) = 101, triggered when low hits 99
      expect(result?.timestamp).toBe('2023-01-01 10:01:00');
    });

    it('should trigger trailing stop for short position after activation', () => {
      const strategy = new TrailingStopStrategy({ activationPercent: 1.0, trailPercent: 0.5 });
      const entryPrice = 100;
      const entryTime = '2023-01-01 10:00:00';
      const bars = createTestBars(
        [
          '2023-01-01 10:00:00',
          '2023-01-01 10:01:00',
          '2023-01-01 10:02:00',
          '2023-01-01 10:03:00',
          '2023-01-01 10:04:00',
        ],
        [
          { open: 100, high: 100.5, low: 99.5, close: 99.8 },
          { open: 99.8, high: 100.0, low: 98.8, close: 99.0 }, // Activation at 99 (1% drop)
          { open: 99.0, high: 99.2, low: 98.0, close: 98.2 }, // New low = 98, trailing stop at 98.49
          { open: 98.2, high: 98.5, low: 97.5, close: 97.8 }, // New low = 97.5, trailing stop at 97.99
          { open: 97.8, high: 98.5, low: 97.6, close: 98.3 }, // Rises above trailing stop at 97.99
        ]
      );

      const result = strategy.evaluate(
        entryPrice,
        entryTime,
        bars,
        false,
        undefined,
        true,
        undefined
      );

      expect(result).not.toBeNull();
      expect(result?.timestamp).toBe('2023-01-01 10:01:00');
      expect(result?.price).toBeCloseTo(99.294, 3);
      expect(result?.reason).toBe('trailingStop');
    });

    it('should not trigger if activation level is not reached', () => {
      const strategy = new TrailingStopStrategy({ activationPercent: 2.0, trailPercent: 0.5 });
      const entryPrice = 100;
      const entryTime = '2023-01-01 10:00:00';
      const bars = createTestBars(
        ['2023-01-01 10:00:00', '2023-01-01 10:01:00', '2023-01-01 10:02:00'],
        [
          { open: 100, high: 100.5, low: 99.5, close: 100.2 },
          { open: 100.2, high: 101.5, low: 100.0, close: 101.0 }, // Not reaching activation at 102 (2% gain)
          { open: 101.0, high: 101.8, low: 100.5, close: 101.5 },
        ]
      );

      const result = strategy.evaluate(
        entryPrice,
        entryTime,
        bars,
        true,
        undefined,
        true,
        undefined
      );

      expect(result).toBeNull();
    });
  });

  describe('MaxHoldTimeStrategy', () => {
    it('should trigger exit after specified hold time for long position', () => {
      const strategy = new MaxHoldTimeStrategy({ minutes: 30 });
      const entryPrice = 100;
      const entryTime = '2023-01-01 10:00:00';
      const bars = createTestBars(
        [
          '2023-01-01 10:00:00',
          '2023-01-01 10:15:00',
          '2023-01-01 10:25:00',
          '2023-01-01 10:30:00', // Exactly 30 minutes after entry
          '2023-01-01 10:45:00',
        ],
        [
          { open: 100, high: 101, low: 99, close: 100.5 },
          { open: 100.5, high: 101.5, low: 100, close: 101 },
          { open: 101, high: 102, low: 100.5, close: 101.5 },
          { open: 101.5, high: 102, low: 101, close: 101.8 }, // Exit here
          { open: 101.8, high: 103, low: 101.5, close: 102.5 },
        ]
      );

      const result = strategy.evaluate(
        entryPrice,
        entryTime,
        bars,
        true,
        undefined,
        true,
        undefined
      );

      expect(result).not.toBeNull();
      expect(result?.timestamp).toBe('2023-01-01 10:30:00');
      expect(result?.price).toBe(101.8); // Close price at exit bar
      expect(result?.reason).toBe('maxHoldTime');
    });

    it('should trigger exit after specified hold time for short position', () => {
      const strategy = new MaxHoldTimeStrategy({ minutes: 15 });
      const entryPrice = 100;
      const entryTime = '2023-01-01 10:00:00';
      const bars = createTestBars(
        [
          '2023-01-01 10:00:00',
          '2023-01-01 10:10:00',
          '2023-01-01 10:15:00', // Exactly 15 minutes after entry
          '2023-01-01 10:20:00',
        ],
        [
          { open: 100, high: 101, low: 99, close: 99.5 },
          { open: 99.5, high: 100, low: 98.5, close: 99 },
          { open: 99, high: 99.5, low: 98, close: 98.5 }, // Exit here
          { open: 98.5, high: 99, low: 98, close: 98.2 },
        ]
      );

      const result = strategy.evaluate(
        entryPrice,
        entryTime,
        bars,
        false,
        undefined,
        true,
        undefined
      );

      expect(result).not.toBeNull();
      expect(result?.timestamp).toBe('2023-01-01 10:15:00');
      expect(result?.price).toBe(98.5); // Close price at exit bar
      expect(result?.reason).toBe('maxHoldTime');
    });

    it('should return null if no bar exists after max hold time', () => {
      const strategy = new MaxHoldTimeStrategy({ minutes: 60 });
      const entryPrice = 100;
      const entryTime = '2023-01-01 10:00:00';
      const bars = createTestBars(
        [
          '2023-01-01 10:00:00',
          '2023-01-01 10:15:00',
          '2023-01-01 10:30:00', // Only 30 minutes from entry, max is 60
        ],
        [
          { open: 100, high: 101, low: 99, close: 100.5 },
          { open: 100.5, high: 101.5, low: 100, close: 101 },
          { open: 101, high: 102, low: 100.5, close: 101.5 },
        ]
      );

      const result = strategy.evaluate(
        entryPrice,
        entryTime,
        bars,
        true,
        undefined,
        true,
        undefined
      );

      expect(result).toBeNull();
    });
  });

  describe('EndOfDayStrategy', () => {
    it('should trigger exit at specified end-of-day time', () => {
      const strategy = new EndOfDayStrategy({ time: '16:00' });
      const entryPrice = 100;
      const entryTime = '2023-01-01 10:00:00';
      const bars = createTestBars(
        [
          '2023-01-01 10:00:00',
          '2023-01-01 14:00:00',
          '2023-01-01 15:30:00',
          '2023-01-01 16:00:00', // End of day time
          '2023-01-01 16:30:00',
        ],
        [
          { open: 100, high: 101, low: 99, close: 100.5 },
          { open: 100.5, high: 102, low: 100, close: 101.5 },
          { open: 101.5, high: 102.5, low: 101, close: 102 },
          { open: 102, high: 102.8, low: 101.5, close: 102.5 }, // Exit here
          { open: 102.5, high: 103, low: 102, close: 102.8 },
        ]
      );

      const result = strategy.evaluate(
        entryPrice,
        entryTime,
        bars,
        true,
        undefined,
        true,
        undefined
      );

      expect(result).not.toBeNull();
      expect(result?.timestamp).toBe('2023-01-01 16:00:00');
      expect(result?.price).toBe(102.5); // Close price at EOD
      expect(result?.reason).toBe('endOfDay');
    });

    it('should trigger exit using last available bar if no exact EOD time match', () => {
      const strategy = new EndOfDayStrategy({ time: '16:00' });
      const entryPrice = 100;
      const entryTime = '2023-01-01 10:00:00';
      const bars = createTestBars(
        [
          '2023-01-01 10:00:00',
          '2023-01-01 14:00:00',
          '2023-01-01 15:30:00', // Last bar of the day, no 16:00 bar
        ],
        [
          { open: 100, high: 101, low: 99, close: 100.5 },
          { open: 100.5, high: 102, low: 100, close: 101.5 },
          { open: 101.5, high: 102.5, low: 101, close: 102 }, // Exit here
        ]
      );

      const result = strategy.evaluate(
        entryPrice,
        entryTime,
        bars,
        true,
        undefined,
        true,
        undefined
      );

      expect(result).not.toBeNull();
      expect(result?.timestamp).toBe('2023-01-01 15:30:00');
      expect(result?.price).toBe(102); // Close price of last bar
      expect(result?.reason).toBe('endOfDay');
    });

    it('should use the first bar from a different day as the exit when no same-day bars exist after EOD time', () => {
      const strategy = new EndOfDayStrategy({ time: '16:00' });
      const entryPrice = 100;
      const entryTime = '2023-01-01 10:00:00';
      const bars = createTestBars(
        [
          '2023-01-01 10:00:00',
          '2023-01-02 09:30:00', // Different day
          '2023-01-02 10:00:00', // Different day
        ],
        [
          { open: 100, high: 101, low: 99, close: 100.5 },
          { open: 101, high: 102, low: 100.5, close: 101.5 },
          { open: 101.5, high: 102, low: 101, close: 101.8 },
        ]
      );

      const result = strategy.evaluate(
        entryPrice,
        entryTime,
        bars,
        true,
        undefined,
        true,
        undefined
      );

      // The strategy should use the next day's opening bar as the exit point
      expect(result).not.toBeNull();
      expect(result?.timestamp).toBe('2023-01-02 09:30:00');
      expect(result?.price).toBe(101.5); // Close price of next day's first bar
      expect(result?.reason).toBe('endOfDay');
    });
  });

  describe('applySlippage', () => {
    // Entry price tests - slippage should make trades worse for entry
    it('should apply percentage slippage for long entries (price increases)', () => {
      const entryPrice = 100;
      const isLong = true;
      const slippageConfig = { model: 'percent' as const, value: 0.1 }; // 0.1% slippage
      const isEntry = true;

      const result = applySlippage(entryPrice, isLong, slippageConfig, isEntry);

      expect(result).toBe(100.1); // 100 + (100 * 0.001) - Long entries pay more (worse)
    });

    it('should apply percentage slippage for short entries (price decreases)', () => {
      const entryPrice = 100;
      const isLong = false;
      const slippageConfig = { model: 'percent' as const, value: 0.1 }; // 0.1% slippage
      const isEntry = true;

      const result = applySlippage(entryPrice, isLong, slippageConfig, isEntry);

      expect(result).toBe(99.9); // 100 - (100 * 0.001) - Short entries receive less (worse)
    });

    it('should apply fixed slippage for long entries (price increases)', () => {
      const entryPrice = 100;
      const isLong = true;
      const slippageConfig = { model: 'fixed' as const, value: 0.05 }; // 5 cents slippage
      const isEntry = true;

      const result = applySlippage(entryPrice, isLong, slippageConfig, isEntry);

      expect(result).toBe(100.05); // 100 + 0.05 - Long entries pay more (worse)
    });

    it('should apply fixed slippage for short entries (price decreases)', () => {
      const entryPrice = 100;
      const isLong = false;
      const slippageConfig = { model: 'fixed' as const, value: 0.05 }; // 5 cents slippage
      const isEntry = true;

      const result = applySlippage(entryPrice, isLong, slippageConfig, isEntry);

      expect(result).toBe(99.95); // 100 - 0.05 - Short entries receive less (worse)
    });

    // Exit price tests - slippage should make trades worse for exit
    it('should apply percentage slippage for long exits (price decreases)', () => {
      const exitPrice = 100;
      const isLong = true;
      const slippageConfig = { model: 'percent' as const, value: 0.1 }; // 0.1% slippage
      const isEntry = false;

      const result = applySlippage(exitPrice, isLong, slippageConfig, isEntry);

      expect(result).toBe(99.9); // 100 - (100 * 0.001) - Long exits receive less (worse)
    });

    it('should apply percentage slippage for short exits (price increases)', () => {
      const exitPrice = 100;
      const isLong = false;
      const slippageConfig = { model: 'percent' as const, value: 0.1 }; // 0.1% slippage
      const isEntry = false;

      const result = applySlippage(exitPrice, isLong, slippageConfig, isEntry);

      expect(result).toBe(100.1); // 100 + (100 * 0.001) - Short exits pay more (worse)
    });

    it('should apply fixed slippage for long exits (price decreases)', () => {
      const exitPrice = 100;
      const isLong = true;
      const slippageConfig = { model: 'fixed' as const, value: 0.05 }; // 5 cents slippage
      const isEntry = false;

      const result = applySlippage(exitPrice, isLong, slippageConfig, isEntry);

      expect(result).toBe(99.95); // 100 - 0.05 - Long exits receive less (worse)
    });

    it('should apply fixed slippage for short exits (price increases)', () => {
      const exitPrice = 100;
      const isLong = false;
      const slippageConfig = { model: 'fixed' as const, value: 0.05 }; // 5 cents slippage
      const isEntry = false;

      const result = applySlippage(exitPrice, isLong, slippageConfig, isEntry);

      expect(result).toBe(100.05); // 100 + 0.05 - Short exits pay more (worse)
    });

    it('should return original price if no slippage config is provided', () => {
      const price = 100;

      const resultLongEntry = applySlippage(price, true, undefined, true);
      const resultShortEntry = applySlippage(price, false, undefined, true);
      const resultLongExit = applySlippage(price, true, undefined, false);
      const resultShortExit = applySlippage(price, false, undefined, false);

      expect(resultLongEntry).toBe(100);
      expect(resultShortEntry).toBe(100);
      expect(resultLongExit).toBe(100);
      expect(resultShortExit).toBe(100);
    });

    // Validate slippage direction logic for all combinations
    it('should always apply slippage in the direction that makes trades worse', () => {
      const price = 100;
      const slippageConfig = { model: 'percent' as const, value: 0.5 }; // 0.5% slippage

      // Entry prices - slippage should increase cost for buyer, decrease proceeds for seller
      const longEntryPrice = applySlippage(price, true, slippageConfig, true);
      const shortEntryPrice = applySlippage(price, false, slippageConfig, true);

      // Exit prices - slippage should decrease proceeds for seller, increase cost for buyer
      const longExitPrice = applySlippage(price, true, slippageConfig, false);
      const shortExitPrice = applySlippage(price, false, slippageConfig, false);

      // Validate direction is always unfavorable
      expect(longEntryPrice).toBeCloseTo(100.5, 5); // Long entry pays MORE (worse)
      expect(shortEntryPrice).toBeCloseTo(99.5, 5); // Short entry receives LESS (worse)
      expect(longExitPrice).toBeCloseTo(99.5, 5); // Long exit receives LESS (worse)
      expect(shortExitPrice).toBeCloseTo(100.5, 5); // Short exit pays MORE (worse)
    });
  });

  describe('createExitStrategies', () => {
    it('should create strategies from config in correct order', () => {
      const config = {
        exitStrategies: {
          enabled: ['stopLoss', 'profitTarget', 'trailingStop'],
          strategyOptions: {
            stopLoss: { percentFromEntry: 1.5 },
            profitTarget: { percentFromEntry: 3.0 },
            trailingStop: { activationPercent: 1.5, trailPercent: 0.8 },
          },
        },
      };

      const strategies = createExitStrategies(config);

      expect(strategies.length).toBe(3);
      expect(strategies[0]).toBeInstanceOf(StopLossStrategy);
      expect(strategies[1]).toBeInstanceOf(ProfitTargetStrategy);
      expect(strategies[2]).toBeInstanceOf(TrailingStopStrategy);
    });

    it('should throw error if strategy-specific config is missing', () => {
      const config = {
        exitStrategies: {
          enabled: ['stopLoss', 'maxHoldTime'],
          // No specific configuration in strategyOptions
          strategyOptions: {},
        },
      };

      expect(() => createExitStrategies(config)).toThrow(
        'stopLoss strategy enabled but no configuration provided'
      );
    });

    it('should throw error if no exitStrategies config is provided', () => {
      const config = {}; // No exitStrategies configuration

      expect(() => createExitStrategies(config)).toThrow(
        'Exit strategies must be configured - no defaults provided to avoid hidden behavior'
      );
    });

    it('should throw error for unknown strategy names', () => {
      const config = {
        exitStrategies: {
          enabled: ['invalidStrategy', 'stopLoss'],
          strategyOptions: {
            stopLoss: { percentFromEntry: 1.0 },
          },
        },
      };

      expect(() => createExitStrategies(config)).toThrow('Unknown exit strategy: invalidStrategy');
    });

    it('should handle maxHoldTime at base level correctly (automatically active)', () => {
      const config = {
        exitStrategies: {
          enabled: ['stopLoss'], // maxHoldTime not needed in enabled array
          maxHoldTime: { minutes: 120 }, // Base level, automatically active
          strategyOptions: {
            stopLoss: { percentFromEntry: 1.0 },
          },
        },
      };

      const strategies = createExitStrategies(config);

      expect(strategies.length).toBe(2);
      expect(strategies[0]).toBeInstanceOf(StopLossStrategy); // Price-based strategies come first
      expect(strategies[1]).toBeInstanceOf(MaxHoldTimeStrategy); // Time-based constraints come after
    });

    it('should not add maxHoldTime if not configured at base level', () => {
      const config = {
        exitStrategies: {
          enabled: ['stopLoss'],
          // maxHoldTime not configured
          strategyOptions: {
            stopLoss: { percentFromEntry: 1.0 },
          },
        },
      };

      const strategies = createExitStrategies(config);

      expect(strategies.length).toBe(1);
      expect(strategies[0]).toBeInstanceOf(StopLossStrategy);
    });

    it('should skip maxHoldTime in enabled array gracefully', () => {
      const config = {
        exitStrategies: {
          enabled: ['maxHoldTime', 'stopLoss'], // maxHoldTime in enabled is ignored
          maxHoldTime: { minutes: 120 },
          strategyOptions: {
            stopLoss: { percentFromEntry: 1.0 },
          },
        },
      };

      const strategies = createExitStrategies(config);

      expect(strategies.length).toBe(2); // Still only creates one of each
      expect(strategies[0]).toBeInstanceOf(StopLossStrategy); // Price-based strategies come first
      expect(strategies[1]).toBeInstanceOf(MaxHoldTimeStrategy); // Time-based constraints come after
    });

    it('should handle endOfDay at base level correctly (automatically active)', () => {
      const config = {
        exitStrategies: {
          enabled: ['profitTarget'],
          endOfDay: { time: '16:00' },
          strategyOptions: {
            profitTarget: { percentFromEntry: 2.0 },
          },
        },
      };

      const strategies = createExitStrategies(config);

      expect(strategies.length).toBe(2);
      expect(strategies[0]).toBeInstanceOf(ProfitTargetStrategy); // Price-based strategies come first
      expect(strategies[1]).toBeInstanceOf(EndOfDayStrategy); // Time-based constraints come after
    });

    it('should not add endOfDay if not configured at base level', () => {
      const config = {
        exitStrategies: {
          enabled: ['profitTarget'],
          strategyOptions: {
            profitTarget: { percentFromEntry: 2.0 },
          },
        },
      };

      const strategies = createExitStrategies(config);

      expect(strategies.length).toBe(1);
      expect(strategies[0]).toBeInstanceOf(ProfitTargetStrategy);
    });

    it('should skip endOfDay in enabled array gracefully', () => {
      const config = {
        exitStrategies: {
          enabled: ['profitTarget', 'endOfDay'], // endOfDay here should be ignored
          endOfDay: { time: '16:00' },
          strategyOptions: {
            profitTarget: { percentFromEntry: 2.0 },
          },
        },
      };

      const strategies = createExitStrategies(config);

      expect(strategies.length).toBe(2); // Still only creates one of each
      expect(strategies[0]).toBeInstanceOf(ProfitTargetStrategy); // Price-based strategies come first
      expect(strategies[1]).toBeInstanceOf(EndOfDayStrategy); // Time-based constraints come after
    });

    it('should handle both maxHoldTime and endOfDay at base level', () => {
      const config = {
        exitStrategies: {
          enabled: ['stopLoss'],
          maxHoldTime: { minutes: 60 },
          endOfDay: { time: '16:00' },
          strategyOptions: {
            stopLoss: { percentFromEntry: 1.0 },
          },
        },
      };

      const strategies = createExitStrategies(config);

      expect(strategies.length).toBe(3);
      expect(strategies[0]).toBeInstanceOf(StopLossStrategy); // Price-based strategies come first
      expect(strategies[1]).toBeInstanceOf(MaxHoldTimeStrategy); // Time-based constraints come after
      expect(strategies[2]).toBeInstanceOf(EndOfDayStrategy);
    });
  });
});
