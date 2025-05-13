import { describe, it, expect } from 'vitest';
import { applySlippage } from './exit-strategy';

describe('Slippage Debug Tests', () => {
  const slippageConfig = { model: 'percent' as const, value: 0.01 };

  describe('Specific real-world cases that showed inconsistency', () => {
    it('Case 1: 2017-01-04 long entry (should increase)', () => {
      const rawEntryPrice = 226.37;
      const isLong = true;

      const result = applySlippage(rawEntryPrice, isLong, slippageConfig, true);
      const expected = rawEntryPrice * 1.0001; // Entry price should increase by 0.01%

      console.log(`Case 1: ${rawEntryPrice} → ${result} (expected: ${expected})`);
      expect(result).toBeCloseTo(expected, 8); // Use expected value for precision
      expect(result).toBeGreaterThan(rawEntryPrice); // Must be higher
    });

    it('Case 2: 2017-02-09 long entry (showed no change)', () => {
      const rawEntryPrice = 230.56;
      const isLong = true;

      const result = applySlippage(rawEntryPrice, isLong, slippageConfig, true);
      const expected = rawEntryPrice * 1.0001; // Entry price should increase by 0.01%

      console.log(`Case 2: ${rawEntryPrice} → ${result} (expected: ${expected})`);
      expect(result).toBeCloseTo(expected, 8); // Use expected value for precision
      expect(result).toBeGreaterThan(rawEntryPrice); // Must be higher
    });

    it('Case 3: 2017-02-14 long entry (showed decrease)', () => {
      const rawEntryPrice = 233.17;
      const isLong = true;

      const result = applySlippage(rawEntryPrice, isLong, slippageConfig, true);
      const expected = rawEntryPrice * 1.0001; // Entry price should increase by 0.01%

      console.log(`Case 3: ${rawEntryPrice} → ${result} (expected: ${expected})`);
      expect(result).toBeCloseTo(expected, 8); // Use expected value for precision
      expect(result).toBeGreaterThan(rawEntryPrice); // Must be higher
    });

    it('Case 4: 2017-02-06 short entry (showed increase)', () => {
      const rawEntryPrice = 228.74;
      const isLong = false;

      const result = applySlippage(rawEntryPrice, isLong, slippageConfig, true);
      const expected = rawEntryPrice * 0.9999; // Entry price should decrease by 0.01%

      console.log(`Case 4: ${rawEntryPrice} → ${result} (expected: ${expected})`);
      expect(result).toBeCloseTo(expected, 8); // Use expected value for precision
      expect(result).toBeLessThan(rawEntryPrice); // Must be lower
    });

    it('Case 5: 2017-02-07 short entry (correctly showed decrease)', () => {
      const rawEntryPrice = 228.8;
      const isLong = false;

      const result = applySlippage(rawEntryPrice, isLong, slippageConfig, true);
      const expected = rawEntryPrice * 0.9999; // Entry price should decrease by 0.01%

      console.log(`Case 5: ${rawEntryPrice} → ${result} (expected: ${expected})`);
      expect(result).toBeCloseTo(expected, 8); // Use expected value for precision
      expect(result).toBeLessThan(rawEntryPrice); // Must be lower
    });
  });

  describe('Slippage precalculated table', () => {
    it('should show exact precise slippage calculations for common cases', () => {
      const testCases = [
        { price: 100.0, isLong: true, isEntry: true },
        { price: 100.0, isLong: true, isEntry: false },
        { price: 100.0, isLong: false, isEntry: true },
        { price: 100.0, isLong: false, isEntry: false },
        { price: 200.0, isLong: true, isEntry: true },
        { price: 200.0, isLong: true, isEntry: false },
        { price: 200.0, isLong: false, isEntry: true },
        { price: 200.0, isLong: false, isEntry: false },
        { price: 230.56, isLong: true, isEntry: true }, // 2017-02-09 case
        { price: 233.17, isLong: true, isEntry: true }, // 2017-02-14 case
        { price: 228.74, isLong: false, isEntry: true }, // 2017-02-06 case
      ];

      for (const tc of testCases) {
        const result = applySlippage(tc.price, tc.isLong, slippageConfig, tc.isEntry);
        const preciseExpected = tc.isEntry
          ? tc.isLong
            ? tc.price * 1.0001
            : tc.price * 0.9999
          : tc.isLong
            ? tc.price * 0.9999
            : tc.price * 1.0001;

        console.log(
          `Price: ${tc.price}, isLong: ${tc.isLong}, isEntry: ${tc.isEntry} → ` +
            `Result: ${result}, Expected: ${preciseExpected}`
        );

        expect(result).toBeCloseTo(preciseExpected, 8);

        // Verify direction:
        if (tc.isEntry) {
          if (tc.isLong) expect(result).toBeGreaterThan(tc.price);
          else expect(result).toBeLessThan(tc.price);
        } else {
          if (tc.isLong) expect(result).toBeLessThan(tc.price);
          else expect(result).toBeGreaterThan(tc.price);
        }
      }
    });
  });
});
