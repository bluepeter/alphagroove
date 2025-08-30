import { describe, it, expect } from 'vitest';

// Test the validation logic directly
describe('Scout Trading Date Validation', () => {
  // Extract the validation function for testing
  const validateTradingDate = (bars: any[], requestedDate: string): boolean => {
    // Check if any bars exist for the exact requested date
    const requestedDateBars = bars.filter(bar => bar.timestamp.startsWith(requestedDate));
    return requestedDateBars.length > 0;
  };

  it('should return false for non-trading days (no data for requested date)', () => {
    const bars = [
      {
        timestamp: '2025-03-21 10:30:00', // Friday data only
        open: 100,
        high: 105,
        low: 95,
        close: 102,
        volume: 1000,
        trade_date: '2025-03-21',
      },
      {
        timestamp: '2025-03-21 15:30:00', // More Friday data
        open: 102,
        high: 107,
        low: 100,
        close: 105,
        volume: 1200,
        trade_date: '2025-03-21',
      },
    ];

    // Sunday - should be rejected
    expect(validateTradingDate(bars, '2025-03-23')).toBe(false);

    // Saturday - should be rejected
    expect(validateTradingDate(bars, '2025-03-22')).toBe(false);
  });

  it('should return true for valid trading days (data exists for requested date)', () => {
    const bars = [
      {
        timestamp: '2025-03-20 15:30:00', // Previous day
        open: 98,
        high: 102,
        low: 96,
        close: 100,
        volume: 800,
        trade_date: '2025-03-20',
      },
      {
        timestamp: '2025-03-21 10:30:00', // Requested day
        open: 100,
        high: 105,
        low: 95,
        close: 102,
        volume: 1000,
        trade_date: '2025-03-21',
      },
      {
        timestamp: '2025-03-21 12:30:00', // More data for requested day
        open: 102,
        high: 107,
        low: 100,
        close: 105,
        volume: 1200,
        trade_date: '2025-03-21',
      },
    ];

    // Friday - should be accepted
    expect(validateTradingDate(bars, '2025-03-21')).toBe(true);

    // Previous day - should also be accepted if requested
    expect(validateTradingDate(bars, '2025-03-20')).toBe(true);
  });

  it('should handle empty data correctly', () => {
    const bars: any[] = [];

    expect(validateTradingDate(bars, '2025-03-21')).toBe(false);
  });

  it('should handle partial date matches correctly', () => {
    const bars = [
      {
        timestamp: '2025-03-21 10:30:00',
        open: 100,
        high: 105,
        low: 95,
        close: 102,
        volume: 1000,
        trade_date: '2025-03-21',
      },
    ];

    // Exact date should match
    expect(validateTradingDate(bars, '2025-03-21')).toBe(true);

    // Similar but different date should not match
    expect(validateTradingDate(bars, '2025-03-22')).toBe(false);
    expect(validateTradingDate(bars, '2025-03-20')).toBe(false);

    // Partial date should match since it's using startsWith
    expect(validateTradingDate(bars, '2025-03')).toBe(true);
  });
});
