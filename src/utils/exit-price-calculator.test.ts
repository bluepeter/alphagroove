import { describe, it, expect, vi } from 'vitest';
import { calculateExitPrice, calculateExitPrices } from './exit-price-calculator';

// Mock the calculateATRStopLoss function
vi.mock('./calculations', () => ({
  calculateATRStopLoss: vi.fn((entryPrice, atr, multiplier, isLong) => {
    if (isLong) {
      return entryPrice - atr * multiplier;
    } else {
      return entryPrice + atr * multiplier;
    }
  }),
}));

describe('Exit Price Calculator', () => {
  describe('calculateExitPrice', () => {
    describe('Stop Loss Calculations', () => {
      it('should use LLM price when useLlmProposedPrice is true and LLM price is available', () => {
        const result = calculateExitPrice(
          {
            entryPrice: 100,
            atr: 2,
            isLong: true,
            config: {
              useLlmProposedPrice: true,
              atrMultiplier: 2,
            },
            llmProposedPrice: 95,
          },
          true // isStopLoss
        );

        expect(result.price).toBe(95);
        expect(result.source).toBe('llm');
      });

      it('should use ATR calculation when useLlmProposedPrice is false', () => {
        const result = calculateExitPrice(
          {
            entryPrice: 100,
            atr: 2,
            isLong: true,
            config: {
              useLlmProposedPrice: false,
              atrMultiplier: 2,
            },
            llmProposedPrice: 95,
          },
          true // isStopLoss
        );

        expect(result.price).toBe(96); // 100 - (2 * 2) = 96
        expect(result.source).toBe('atr');
        expect(result.multiplierUsed).toBe(2);
      });

      it('should use ATR calculation when LLM price is not available', () => {
        const result = calculateExitPrice(
          {
            entryPrice: 100,
            atr: 2,
            isLong: true,
            config: {
              useLlmProposedPrice: true,
              atrMultiplier: 2,
            },
            llmProposedPrice: undefined,
          },
          true // isStopLoss
        );

        expect(result.price).toBe(96); // 100 - (2 * 2) = 96
        expect(result.source).toBe('atr');
      });

      it('should use percentage calculation when ATR is not available', () => {
        const result = calculateExitPrice(
          {
            entryPrice: 100,
            atr: undefined,
            isLong: true,
            config: {
              useLlmProposedPrice: false,
              percentFromEntry: 5, // 5%
            },
          },
          true // isStopLoss
        );

        expect(result.price).toBe(95); // 100 * (1 - 0.05) = 95
        expect(result.source).toBe('percentage');
      });

      it('should return none when no valid configuration', () => {
        const result = calculateExitPrice(
          {
            entryPrice: 100,
            atr: undefined,
            isLong: true,
            config: {},
          },
          true // isStopLoss
        );

        expect(result.price).toBeUndefined();
        expect(result.source).toBe('none');
      });
    });

    describe('Profit Target Calculations', () => {
      it('should calculate profit target using ATR for long trades', () => {
        const result = calculateExitPrice(
          {
            entryPrice: 100,
            atr: 2,
            isLong: true,
            config: {
              useLlmProposedPrice: false,
              atrMultiplier: 3,
            },
          },
          false // isStopLoss = false (profit target)
        );

        expect(result.price).toBe(106); // 100 + (2 * 3) = 106
        expect(result.source).toBe('atr');
        expect(result.multiplierUsed).toBe(3);
      });

      it('should calculate profit target using ATR for short trades', () => {
        const result = calculateExitPrice(
          {
            entryPrice: 100,
            atr: 2,
            isLong: false,
            config: {
              useLlmProposedPrice: false,
              atrMultiplier: 3,
            },
          },
          false // isStopLoss = false (profit target)
        );

        expect(result.price).toBe(94); // 100 - (2 * 3) = 94
        expect(result.source).toBe('atr');
      });

      it('should calculate profit target using percentage for long trades', () => {
        const result = calculateExitPrice(
          {
            entryPrice: 100,
            atr: undefined,
            isLong: true,
            config: {
              useLlmProposedPrice: false,
              percentFromEntry: 10, // 10%
            },
          },
          false // isStopLoss = false (profit target)
        );

        expect(result.price).toBeCloseTo(110, 2); // 100 * (1 + 0.10) = 110
        expect(result.source).toBe('percentage');
      });

      it('should calculate profit target using percentage for short trades', () => {
        const result = calculateExitPrice(
          {
            entryPrice: 100,
            atr: undefined,
            isLong: false,
            config: {
              useLlmProposedPrice: false,
              percentFromEntry: 10, // 10%
            },
          },
          false // isStopLoss = false (profit target)
        );

        expect(result.price).toBe(90); // 100 * (1 - 0.10) = 90
        expect(result.source).toBe('percentage');
      });
    });

    describe('Short Trade Stop Loss Calculations', () => {
      it('should calculate stop loss correctly for short trades using percentage', () => {
        const result = calculateExitPrice(
          {
            entryPrice: 100,
            atr: undefined,
            isLong: false,
            config: {
              useLlmProposedPrice: false,
              percentFromEntry: 5, // 5%
            },
          },
          true // isStopLoss
        );

        expect(result.price).toBe(105); // 100 * (1 + 0.05) = 105 (stop above entry for short)
        expect(result.source).toBe('percentage');
      });
    });

    describe('Edge Cases', () => {
      it('should handle NaN LLM price', () => {
        const result = calculateExitPrice(
          {
            entryPrice: 100,
            atr: 2,
            isLong: true,
            config: {
              useLlmProposedPrice: true,
              atrMultiplier: 2,
            },
            llmProposedPrice: NaN,
          },
          true // isStopLoss
        );

        expect(result.price).toBe(96); // Falls back to ATR
        expect(result.source).toBe('atr');
      });

      it('should handle zero ATR', () => {
        const result = calculateExitPrice(
          {
            entryPrice: 100,
            atr: 0,
            isLong: true,
            config: {
              useLlmProposedPrice: false,
              atrMultiplier: 2,
              percentFromEntry: 5,
            },
          },
          true // isStopLoss
        );

        expect(result.price).toBe(95); // Falls back to percentage
        expect(result.source).toBe('percentage');
      });
    });
  });

  describe('calculateExitPrices', () => {
    it('should calculate both stop loss and profit target', () => {
      const result = calculateExitPrices(
        100, // entryPrice
        2, // atr
        true, // isLong
        { atrMultiplier: 2, useLlmProposedPrice: false }, // stopLossConfig
        { atrMultiplier: 5, useLlmProposedPrice: false }, // profitTargetConfig
        98, // llmStopLoss
        110 // llmProfitTarget
      );

      expect(result.stopLoss.price).toBe(96); // 100 - (2 * 2) = 96
      expect(result.stopLoss.source).toBe('atr');
      expect(result.profitTarget.price).toBe(110); // 100 + (2 * 5) = 110
      expect(result.profitTarget.source).toBe('atr');
    });

    it('should handle missing configurations', () => {
      const result = calculateExitPrices(
        100, // entryPrice
        2, // atr
        true, // isLong
        undefined, // stopLossConfig
        undefined, // profitTargetConfig
        98, // llmStopLoss
        110 // llmProfitTarget
      );

      expect(result.stopLoss.source).toBe('none');
      expect(result.profitTarget.source).toBe('none');
    });

    it('should use LLM prices when configured', () => {
      const result = calculateExitPrices(
        100, // entryPrice
        2, // atr
        true, // isLong
        { atrMultiplier: 2, useLlmProposedPrice: true }, // stopLossConfig
        { atrMultiplier: 5, useLlmProposedPrice: true }, // profitTargetConfig
        98, // llmStopLoss
        110 // llmProfitTarget
      );

      expect(result.stopLoss.price).toBe(98); // LLM proposed
      expect(result.stopLoss.source).toBe('llm');
      expect(result.profitTarget.price).toBe(110); // LLM proposed
      expect(result.profitTarget.source).toBe('llm');
    });

    it('should handle mixed LLM and ATR configurations', () => {
      const result = calculateExitPrices(
        100, // entryPrice
        2, // atr
        true, // isLong
        { atrMultiplier: 2, useLlmProposedPrice: true }, // stopLossConfig (use LLM)
        { atrMultiplier: 5, useLlmProposedPrice: false }, // profitTargetConfig (use ATR)
        98, // llmStopLoss
        110 // llmProfitTarget
      );

      expect(result.stopLoss.price).toBe(98); // LLM proposed
      expect(result.stopLoss.source).toBe('llm');
      expect(result.profitTarget.price).toBe(110); // ATR: 100 + (2 * 5) = 110
      expect(result.profitTarget.source).toBe('atr');
    });
  });

  describe('Real-world Scenarios', () => {
    it('should match scout configuration with 2x ATR stop and 5x ATR target', () => {
      const entryPrice = 637.08;
      const atr = 0.26;

      const result = calculateExitPrices(
        entryPrice,
        atr,
        false, // short trade
        { atrMultiplier: 2.0, useLlmProposedPrice: false }, // stopLossConfig
        { atrMultiplier: 5.0, useLlmProposedPrice: false }, // profitTargetConfig
        640.5, // llmStopLoss (ignored)
        634.5 // llmProfitTarget (ignored)
      );

      // For short trade:
      // Stop Loss: entry + (atr * multiplier) = 637.08 + (0.26 * 2) = 637.60
      // Profit Target: entry - (atr * multiplier) = 637.08 - (0.26 * 5) = 635.78
      expect(result.stopLoss.price).toBeCloseTo(637.6, 2);
      expect(result.stopLoss.source).toBe('atr');
      expect(result.profitTarget.price).toBeCloseTo(635.78, 2);
      expect(result.profitTarget.source).toBe('atr');
    });
  });
});
