import { Bar } from '../patterns/types';

/**
 * Daily OHLC data for SMA calculation
 */
export interface DailyBar {
  date: string; // YYYY-MM-DD format
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * SMA calculation result
 */
export interface SMAResult {
  sma: number;
  period: number;
  currentPrice: number;
  priceVsSma: number;
  priceVsSmaPercent: number;
  position: 'above' | 'below' | 'at';
}

/**
 * Calculate Simple Moving Average from daily bars
 * @param dailyBars Array of daily OHLC data (should be sorted by date ascending)
 * @param period Number of days for SMA calculation (e.g., 20)
 * @returns SMA value or undefined if insufficient data
 */
export const calculateSMA = (dailyBars: DailyBar[], period: number): number | undefined => {
  if (dailyBars.length < period) {
    return undefined;
  }

  // Take the last 'period' bars for SMA calculation
  const recentBars = dailyBars.slice(-period);
  const sum = recentBars.reduce((total, bar) => total + bar.close, 0);

  return sum / period;
};

/**
 * Calculate SMA with context for display
 * @param dailyBars Array of daily OHLC data
 * @param period SMA period (e.g., 20)
 * @param currentPrice Current price for comparison
 * @returns SMA result with position context
 */
export const calculateSMAResult = (
  dailyBars: DailyBar[],
  period: number,
  currentPrice: number
): SMAResult | undefined => {
  const sma = calculateSMA(dailyBars, period);

  if (sma === undefined) {
    return undefined;
  }

  const priceVsSma = currentPrice - sma;
  const priceVsSmaPercent = (priceVsSma / sma) * 100;

  // Determine position
  let position: 'above' | 'below' | 'at';
  if (Math.abs(priceVsSma) < 0.01) {
    // Within 1 cent
    position = 'at';
  } else if (priceVsSma > 0) {
    position = 'above';
  } else {
    position = 'below';
  }

  return {
    sma,
    period,
    currentPrice,
    priceVsSma,
    priceVsSmaPercent,
    position,
  };
};

/**
 * Convert intraday bars to daily bars by aggregating OHLC data
 * This is used for backtest when we only have CSV intraday data
 * @param intradayBars Array of intraday bars (must be sorted by timestamp)
 * @returns Array of daily bars aggregated by date
 */
export const aggregateIntradayToDaily = (intradayBars: Bar[]): DailyBar[] => {
  const dailyMap = new Map<string, DailyBar>();

  for (const bar of intradayBars) {
    const date = bar.timestamp.split(' ')[0]; // Extract YYYY-MM-DD

    if (!dailyMap.has(date)) {
      // First bar of the day
      dailyMap.set(date, {
        date,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      });
    } else {
      // Update existing day with new bar data
      const dailyBar = dailyMap.get(date)!;
      dailyBar.high = Math.max(dailyBar.high, bar.high);
      dailyBar.low = Math.min(dailyBar.low, bar.low);
      dailyBar.close = bar.close; // Last close of the day
      dailyBar.volume += bar.volume; // Accumulate volume
    }
  }

  // Convert map to array and sort by date
  return Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
};

/**
 * Convert Polygon daily bars to our DailyBar format
 * @param polygonBars Array of Polygon daily bars
 * @returns Array of DailyBar objects
 */
export const convertPolygonToDailyBars = (polygonBars: any[]): DailyBar[] => {
  return polygonBars
    .map(bar => ({
      date: new Date(bar.t).toISOString().split('T')[0], // Convert timestamp to YYYY-MM-DD
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
};

/**
 * Calculate the date N trading days ago (approximation)
 * For more accurate calculation, this should account for weekends and holidays
 * @param daysAgo Number of trading days to go back
 * @param fromDate Starting date (default: today)
 * @returns Date string in YYYY-MM-DD format
 */
export const calculateTradingDaysAgo = (daysAgo: number, fromDate?: Date): string => {
  const date = fromDate ? new Date(fromDate) : new Date();

  // Rough approximation: trading days ≈ calendar days * 5/7
  // Add some buffer to account for weekends and holidays
  const calendarDaysAgo = Math.ceil(daysAgo * 1.5);

  date.setDate(date.getDate() - calendarDaysAgo);

  return date.toISOString().split('T')[0];
};

/**
 * Standard SMA periods used in trading
 */
export const SMA_PERIODS = {
  SHORT: 5,
  MEDIUM: 20,
  LONG: 50,
  VERY_LONG: 200,
} as const;
