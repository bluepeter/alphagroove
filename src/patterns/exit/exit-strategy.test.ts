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
      const strategy = new StopLossStrategy({ percentFromEntry: 1.0 });
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

      const result = strategy.evaluate(entryPrice, entryTime, bars, true);

      expect(result).not.toBeNull();
      expect(result?.timestamp).toBe('2023-01-01 10:02:00');
      expect(result?.price).toBe(99.0); // 1% below entry price
      expect(result?.reason).toBe('stopLoss');
    });

    it('should trigger stop loss for short position using percentage', () => {
      const strategy = new StopLossStrategy({ percentFromEntry: 1.0 });
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

      const result = strategy.evaluate(entryPrice, entryTime, bars, false);

      expect(result).not.toBeNull();
      expect(result?.timestamp).toBe('2023-01-01 10:02:00');
      expect(result?.price).toBe(101.0); // 1% above entry price
      expect(result?.reason).toBe('stopLoss');
    });

    it('should trigger stop loss using ATR multiplier for long position', () => {
      const strategy = new StopLossStrategy({ percentFromEntry: 1.0, atrMultiplier: 2.0 });
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

      const result = strategy.evaluate(entryPrice, entryTime, bars, true, atr);

      expect(result).not.toBeNull();
      expect(result?.timestamp).toBe('2023-01-01 10:02:00');
      expect(result?.price).toBe(98.0); // Entry - (2 * ATR)
      expect(result?.reason).toBe('stopLoss');
    });

    it('should not trigger if stop loss level is not hit', () => {
      const strategy = new StopLossStrategy({ percentFromEntry: 2.0 });
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

      const result = strategy.evaluate(entryPrice, entryTime, bars, true);

      expect(result).toBeNull();
    });

    it('should return null if no trading bars after entry', () => {
      const strategy = new StopLossStrategy({ percentFromEntry: 1.0 });
      const entryPrice = 100;
      const entryTime = '2023-01-01 10:00:00';
      const bars = createTestBars(
        ['2023-01-01 10:00:00'],
        [{ open: 100, high: 101, low: 99, close: 100.5 }]
      );

      const result = strategy.evaluate(entryPrice, entryTime, bars, true);

      expect(result).toBeNull();
    });
  });

  describe('ProfitTargetStrategy', () => {
    it('should trigger profit target for long position using percentage', () => {
      const strategy = new ProfitTargetStrategy({ percentFromEntry: 2.0 });
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

      const result = strategy.evaluate(entryPrice, entryTime, bars, true);

      expect(result).not.toBeNull();
      expect(result?.timestamp).toBe('2023-01-01 10:02:00');
      expect(result?.price).toBe(102.0); // 2% above entry
      expect(result?.reason).toBe('profitTarget');
    });

    it('should trigger profit target for short position using percentage', () => {
      const strategy = new ProfitTargetStrategy({ percentFromEntry: 2.0 });
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

      const result = strategy.evaluate(entryPrice, entryTime, bars, false);

      expect(result).not.toBeNull();
      expect(result?.timestamp).toBe('2023-01-01 10:02:00');
      expect(result?.price).toBe(98.0); // 2% below entry for short
      expect(result?.reason).toBe('profitTarget');
    });

    it('should trigger profit target using ATR multiplier for long position', () => {
      const strategy = new ProfitTargetStrategy({ percentFromEntry: 2.0, atrMultiplier: 2.0 });
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

      const result = strategy.evaluate(entryPrice, entryTime, bars, true, atr);

      expect(result).not.toBeNull();
      expect(result?.timestamp).toBe('2023-01-01 10:02:00');
      expect(result?.price).toBe(103.0); // Entry + (2 * ATR)
      expect(result?.reason).toBe('profitTarget');
    });

    it('should not trigger if profit target is not hit', () => {
      const strategy = new ProfitTargetStrategy({ percentFromEntry: 3.0 });
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

      const result = strategy.evaluate(entryPrice, entryTime, bars, true);

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

      const result = strategy.evaluate(entryPrice, entryTime, bars, true);

      expect(result).not.toBeNull();
      expect(result?.timestamp).toBe('2023-01-01 10:02:00');
      expect(result?.price).toBeCloseTo(101.49, 2); // Trailing stop level
      expect(result?.reason).toBe('trailingStop');
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

      const result = strategy.evaluate(entryPrice, entryTime, bars, false);

      expect(result).not.toBeNull();
      expect(result?.timestamp).toBe('2023-01-01 10:02:00');
      expect(result?.price).toBeCloseTo(98.49, 2); // Trailing stop level
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

      const result = strategy.evaluate(entryPrice, entryTime, bars, true);

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

      const result = strategy.evaluate(entryPrice, entryTime, bars, true);

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

      const result = strategy.evaluate(entryPrice, entryTime, bars, false);

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

      const result = strategy.evaluate(entryPrice, entryTime, bars, true);

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

      const result = strategy.evaluate(entryPrice, entryTime, bars, true);

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

      const result = strategy.evaluate(entryPrice, entryTime, bars, true);

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

      const result = strategy.evaluate(entryPrice, entryTime, bars, true);

      // The strategy should use the next day's opening bar as the exit point
      expect(result).not.toBeNull();
      expect(result?.timestamp).toBe('2023-01-02 09:30:00');
      expect(result?.price).toBe(101.5); // Close price of next day's first bar
      expect(result?.reason).toBe('endOfDay');
    });
  });

  describe('applySlippage', () => {
    it('should apply percentage slippage for long trades', () => {
      const exitPrice = 100;
      const isLong = true;
      const slippageConfig = { model: 'percent' as const, value: 0.1 }; // 0.1% slippage

      const result = applySlippage(exitPrice, isLong, slippageConfig);

      expect(result).toBe(99.9); // 100 - (100 * 0.001)
    });

    it('should apply percentage slippage for short trades', () => {
      const exitPrice = 100;
      const isLong = false;
      const slippageConfig = { model: 'percent' as const, value: 0.1 }; // 0.1% slippage

      const result = applySlippage(exitPrice, isLong, slippageConfig);

      expect(result).toBe(100.1); // 100 + (100 * 0.001)
    });

    it('should apply fixed slippage for long trades', () => {
      const exitPrice = 100;
      const isLong = true;
      const slippageConfig = { model: 'fixed' as const, value: 0.05 }; // 5 cents slippage

      const result = applySlippage(exitPrice, isLong, slippageConfig);

      expect(result).toBe(99.95); // 100 - 0.05
    });

    it('should apply fixed slippage for short trades', () => {
      const exitPrice = 100;
      const isLong = false;
      const slippageConfig = { model: 'fixed' as const, value: 0.05 }; // 5 cents slippage

      const result = applySlippage(exitPrice, isLong, slippageConfig);

      expect(result).toBe(100.05); // 100 + 0.05
    });

    it('should return original price if no slippage config is provided', () => {
      const exitPrice = 100;

      const resultLong = applySlippage(exitPrice, true);
      const resultShort = applySlippage(exitPrice, false);

      expect(resultLong).toBe(100);
      expect(resultShort).toBe(100);
    });
  });

  describe('createExitStrategies', () => {
    it('should create strategies from config in correct order', () => {
      const config = {
        exitStrategies: {
          enabled: ['stopLoss', 'profitTarget', 'trailingStop'],
          stopLoss: { percentFromEntry: 1.5 },
          profitTarget: { percentFromEntry: 3.0 },
          trailingStop: { activationPercent: 1.5, trailPercent: 0.8 },
        },
      };

      const strategies = createExitStrategies(config);

      expect(strategies.length).toBe(3);
      expect(strategies[0]).toBeInstanceOf(StopLossStrategy);
      expect(strategies[1]).toBeInstanceOf(ProfitTargetStrategy);
      expect(strategies[2]).toBeInstanceOf(TrailingStopStrategy);
    });

    it('should use default values if strategy-specific config is missing', () => {
      const config = {
        exitStrategies: {
          enabled: ['stopLoss', 'maxHoldTime'],
          // No specific configuration
        },
      };

      const strategies = createExitStrategies(config);

      expect(strategies.length).toBe(2);
      expect(strategies[0]).toBeInstanceOf(StopLossStrategy);
      expect(strategies[1]).toBeInstanceOf(MaxHoldTimeStrategy);
    });

    it('should default to MaxHoldTimeStrategy if no exitStrategies config is provided', () => {
      const config = {}; // No exitStrategies configuration

      const strategies = createExitStrategies(config);

      expect(strategies.length).toBe(1);
      expect(strategies[0]).toBeInstanceOf(MaxHoldTimeStrategy);
      expect((strategies[0] as MaxHoldTimeStrategy)['config'].minutes).toBe(60); // Default value
    });

    it('should handle unknown strategy names gracefully', () => {
      const config = {
        exitStrategies: {
          enabled: ['invalidStrategy', 'stopLoss'],
          stopLoss: { percentFromEntry: 1.0 },
        },
      };

      const strategies = createExitStrategies(config);

      // Should have two strategies, with the invalid one replaced by MaxHoldTime
      expect(strategies.length).toBe(2);
      expect(strategies[0]).toBeInstanceOf(MaxHoldTimeStrategy); // Default for unknown
      expect(strategies[1]).toBeInstanceOf(StopLossStrategy);
    });
  });
});
