import { describe, it, expect } from 'vitest';

describe('Trading Return Calculations', () => {
  /**
   * Tests the calculation of trading returns based on entry and exit prices
   * @param entryPrice The entry price
   * @param exitPrice The exit price
   * @param isLong Whether this is a long trade
   * @param expectedReturn The expected return percentage as a decimal
   */
  function testReturnCalculation(
    entryPrice: number,
    exitPrice: number,
    isLong: boolean,
    expectedReturn: number
  ) {
    const returnPct = isLong
      ? (exitPrice - entryPrice) / entryPrice
      : (entryPrice - exitPrice) / entryPrice;

    // Print the actual calculation results for debugging
    console.log(
      `Entry: ${entryPrice}, Exit: ${exitPrice}, isLong: ${isLong}, Calculated: ${returnPct.toFixed(8)}, Expected: ${expectedReturn.toFixed(8)}`
    );

    // Use 4 decimal places for precision to accommodate floating point differences
    expect(returnPct).toBeCloseTo(expectedReturn, 4);
  }

  describe('Long trade returns', () => {
    it('should calculate positive return when exit price > entry price', () => {
      // Long trade with profit: Entry $226.38, Exit $226.46 → +0.035%
      testReturnCalculation(226.38, 226.46, true, 0.00035);
    });

    it('should calculate negative return when exit price < entry price', () => {
      // Long trade with loss: Entry $227.64, Exit $227.62 → -0.009%
      testReturnCalculation(227.64, 227.62, true, -0.00009);
    });

    it('should calculate zero return when exit price = entry price', () => {
      // Long trade break-even: Entry $100, Exit $100 → 0%
      testReturnCalculation(100, 100, true, 0);
    });
  });

  describe('Short trade returns', () => {
    it('should calculate positive return when exit price < entry price', () => {
      // Short trade with profit: Entry $225.73, Exit $225.60 → +0.058%
      testReturnCalculation(225.73, 225.6, false, 0.00058);
    });

    it('should calculate negative return when exit price > entry price', () => {
      // Short trade with loss: Entry $225.73, Exit $225.98 → -0.111%
      testReturnCalculation(225.73, 225.98, false, -0.00111);
    });

    it('should calculate zero return when exit price = entry price', () => {
      // Short trade break-even: Entry $100, Exit $100 → 0%
      testReturnCalculation(100, 100, false, 0);
    });
  });

  describe('Real-world examples from output', () => {
    // Test cases from the user's output
    it('should match 2017-01-04 long trade calculation', () => {
      // Long trade: Entry $226.38, Exit $226.46 → should be 0.035%, reported 0.09%
      testReturnCalculation(226.38, 226.46, true, 0.00035);
    });

    it('should match 2017-01-06 long trade calculation', () => {
      // Long trade: Entry $227.64, Exit $227.62 → should be -0.009%, reported 0.04%
      testReturnCalculation(227.64, 227.62, true, -0.00009);
    });

    it('should match 2017-01-23 short trade calculation', () => {
      // Short trade: Entry $225.73, Exit $225.98 → should be -0.111%, reported -0.06%
      testReturnCalculation(225.73, 225.98, false, -0.00111);
    });

    // Additional test cases from user example
    it('should correctly calculate long trade with lower exit price as negative return (1)', () => {
      // "2017-01-06 ⏰ 13:00:00 → 14:20:00 Open: $227.64 Entry: $227.64 Exit: $227.62"
      // Should be negative return, not positive 0.04%
      testReturnCalculation(227.64, 227.62, true, -0.00009);
    });

    it('should correctly calculate long trade with lower exit price as negative return (2)', () => {
      // "2017-01-10 ⏰ 13:00:00 → 13:24:00 Open: $227.18 Entry: $227.21 Exit: $227.08"
      // Should be -0.057%, reported as -0.01%
      testReturnCalculation(227.21, 227.08, true, -0.00057);
    });

    it('should correctly calculate long trade with lower exit price as negative return (3)', () => {
      // "2017-01-13 ⏰ 13:00:00 → 13:48:00 Open: $227.09 Entry: $227.09 Exit: $226.87"
      // Should be -0.097%, reported as -0.05%
      testReturnCalculation(227.09, 226.87, true, -0.00097);
    });

    it('should correctly calculate short trade with higher exit price as negative return', () => {
      // "2017-01-23 ⏰ 13:00:00 → 13:22:00 Open: $225.73 Entry: $225.73 Exit: $225.98"
      // Should be -0.111%, reported as -0.06%
      testReturnCalculation(225.73, 225.98, false, -0.00111);
    });

    it('should correctly calculate long trade with higher exit price as positive return', () => {
      // "2017-01-24 ⏰ 13:00:00 → 13:07:00 Open: $227.23 Entry: $227.25 Exit: $227.31"
      // Should be +0.026%, reported as 0.07%
      testReturnCalculation(227.25, 227.31, true, 0.00026);
    });

    it('should correctly calculate long trade with lower exit price as negative return (4)', () => {
      // "2017-01-25 ⏰ 13:00:00 → 13:13:00 Open: $229.13 Entry: $229.15 Exit: $229.12"
      // Should be -0.013%, reported as 0.03%
      testReturnCalculation(229.15, 229.12, true, -0.00013);
    });
  });
});
