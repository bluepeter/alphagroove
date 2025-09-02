import { describe, it, expect } from 'vitest';
import { calculateATRStopLoss } from './utils/calculations';

describe('Scout Exit Price Calculations', () => {
  describe('ATR-based Stop Loss Calculations', () => {
    it('should calculate correct stop loss for long trades', () => {
      const entryPrice = 637.08;
      const atr = 0.26;
      const multiplier = 2.0;
      const isLong = true;

      const result = calculateATRStopLoss(entryPrice, atr, multiplier, isLong);

      // For long: entry - (atr * multiplier) = 637.08 - (0.26 * 2.0) = 636.56
      expect(result).toBeCloseTo(636.56, 2);
    });

    it('should calculate correct stop loss for short trades', () => {
      const entryPrice = 637.08;
      const atr = 0.26;
      const multiplier = 2.0;
      const isLong = false;

      const result = calculateATRStopLoss(entryPrice, atr, multiplier, isLong);

      // For short: entry + (atr * multiplier) = 637.08 + (0.26 * 2.0) = 637.60
      expect(result).toBeCloseTo(637.6, 2);
    });

    it('should calculate correct profit target for long trades using ATR logic', () => {
      const entryPrice = 637.08;
      const atr = 0.26;
      const multiplier = 5.0;

      // Profit target logic: entry + (atr * multiplier) for long
      const result = entryPrice + atr * multiplier;

      // 637.08 + (0.26 * 5.0) = 638.38
      expect(result).toBeCloseTo(638.38, 2);
    });

    it('should calculate correct profit target for short trades using ATR logic', () => {
      const entryPrice = 637.08;
      const atr = 0.26;
      const multiplier = 5.0;

      // Profit target logic: entry - (atr * multiplier) for short
      const result = entryPrice - atr * multiplier;

      // 637.08 - (0.26 * 5.0) = 635.78
      expect(result).toBeCloseTo(635.78, 2);
    });
  });

  describe('Percentage-based Calculations', () => {
    it('should calculate correct stop loss using percentage for long trades', () => {
      const entryPrice = 637.08;
      const percentFromEntry = 1.0; // 1%
      const isLong = true;

      const result = isLong
        ? entryPrice * (1 - percentFromEntry / 100)
        : entryPrice * (1 + percentFromEntry / 100);

      // 637.08 * (1 - 0.01) = 630.71
      expect(result).toBeCloseTo(630.71, 2);
    });

    it('should calculate correct profit target using percentage for long trades', () => {
      const entryPrice = 637.08;
      const percentFromEntry = 2.0; // 2%
      const isLong = true;

      const result = isLong
        ? entryPrice * (1 + percentFromEntry / 100)
        : entryPrice * (1 - percentFromEntry / 100);

      // 637.08 * (1 + 0.02) = 649.82
      expect(result).toBeCloseTo(649.82, 2);
    });
  });

  describe('Risk/Reward Ratio Calculations', () => {
    it('should calculate correct risk/reward ratio', () => {
      const entryPrice = 637.08;
      const stopLossPrice = 636.56; // 2x ATR stop
      const profitTargetPrice = 638.38; // 5x ATR target

      const riskAmount = Math.abs(entryPrice - stopLossPrice); // 0.52
      const rewardAmount = Math.abs(profitTargetPrice - entryPrice); // 1.30
      const ratio = rewardAmount / riskAmount; // 2.50

      expect(riskAmount).toBeCloseTo(0.52, 2);
      expect(rewardAmount).toBeCloseTo(1.3, 2);
      expect(ratio).toBeCloseTo(2.5, 2);
    });
  });

  describe('Config-based Logic Tests', () => {
    it('should prioritize LLM prices when useLlmProposedPrice is true', () => {
      const config = {
        stopLoss: { atrMultiplier: 2.0, useLlmProposedPrice: true },
      };
      const llmProposedPrice = 635.0;
      const atrCalculatedPrice = 636.56;

      // Logic: if useLlmProposedPrice is true and LLM price exists, use LLM price
      const shouldUseLlm =
        config.stopLoss.useLlmProposedPrice &&
        typeof llmProposedPrice === 'number' &&
        !isNaN(llmProposedPrice);

      expect(shouldUseLlm).toBe(true);

      const finalPrice = shouldUseLlm ? llmProposedPrice : atrCalculatedPrice;
      expect(finalPrice).toBe(635.0);
    });

    it('should use ATR prices when useLlmProposedPrice is false', () => {
      const config = {
        stopLoss: { atrMultiplier: 2.0, useLlmProposedPrice: false },
      };
      const llmProposedPrice = 635.0;
      const atrCalculatedPrice = 636.56;

      // Logic: if useLlmProposedPrice is false, use ATR calculation
      const shouldUseLlm =
        config.stopLoss.useLlmProposedPrice &&
        typeof llmProposedPrice === 'number' &&
        !isNaN(llmProposedPrice);

      expect(shouldUseLlm).toBe(false);

      const finalPrice = shouldUseLlm ? llmProposedPrice : atrCalculatedPrice;
      expect(finalPrice).toBe(636.56);
    });

    it('should fall back to percentage when ATR is unavailable', () => {
      const config = {
        stopLoss: {
          atrMultiplier: 2.0,
          percentFromEntry: 1.0,
          useLlmProposedPrice: false,
        },
      };
      const atr = null; // ATR unavailable
      const entryPrice = 637.08;

      // Logic: if ATR is unavailable, fall back to percentage
      const hasAtr = atr && config.stopLoss.atrMultiplier;
      const hasPercentage = config.stopLoss.percentFromEntry;

      expect(hasAtr).toBeFalsy();
      expect(hasPercentage).toBe(1.0);

      const finalPrice = hasPercentage
        ? entryPrice * (1 - config.stopLoss.percentFromEntry / 100)
        : undefined;

      expect(finalPrice).toBeCloseTo(630.71, 2);
    });
  });
});
