import { Bar, Signal } from '../patterns/types';
import { calculateVWAPResult, filterCurrentDayBars } from './vwap-calculator';
import { parseTimestampAsET } from './polygon-data-converter';
import { isTradingHours } from './date-helpers';
import {
  calculateSMAResult,
  aggregateIntradayToDaily,
  SMA_PERIODS,
  DailyBar,
} from './sma-calculator';

/**
 * Parse timestamp correctly for both CSV (already in ET) and Polygon (UTC) data
 * This function ensures both backtest (CSV) and scout (Polygon) use the same logic
 */
const parseTimestampForChart = (timestamp: string): number => {
  // Check if this looks like CSV data (simple YYYY-MM-DD HH:mm:ss format)
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(timestamp)) {
    // CSV data is already in Eastern Time - parse it as such
    const [datePart, timePart] = timestamp.split(' ');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hours, minutes, seconds = 0] = timePart.split(':').map(Number);

    // Create the timestamp as if it were UTC, then we'll adjust for ET
    const utcTime = Date.UTC(year, month - 1, day, hours, minutes, seconds);

    // Since CSV data is in ET, we need to add the ET offset to get the correct UTC timestamp
    // that represents this ET time. ET is UTC-5 (EST) or UTC-4 (EDT)
    // For simplicity, we'll determine if it's EST or EDT based on the date
    const date = new Date(year, month - 1, day);
    const isDST = isDaylightSavingTime(date);
    const etOffsetHours = isDST ? 4 : 5; // EDT = UTC-4, EST = UTC-5

    return utcTime + etOffsetHours * 60 * 60 * 1000;
  }

  // Otherwise, assume it's Polygon data that needs UTC->ET conversion
  return parseTimestampAsET(timestamp);
};

/**
 * Simple daylight saving time check for US Eastern Time
 */
const isDaylightSavingTime = (date: Date): boolean => {
  const year = date.getFullYear();

  // DST starts second Sunday in March, ends first Sunday in November
  const march = new Date(year, 2, 1); // March 1
  const november = new Date(year, 10, 1); // November 1

  // Find second Sunday in March
  const dstStart = new Date(year, 2, 8 + ((7 - march.getDay()) % 7));
  // Find first Sunday in November
  const dstEnd = new Date(year, 10, 1 + ((7 - november.getDay()) % 7));

  return date >= dstStart && date < dstEnd;
};

export interface MarketDataContext {
  previousClose?: number;
  currentOpen?: number;
  currentHigh?: number;
  currentLow?: number;
  currentPrice: number;
  vwap?: number;
  vwapPosition?: 'above' | 'below' | 'at';
  vwapDifference?: number;
  vwapDifferencePercent?: number;
  sma20?: number;
  smaPosition?: 'above' | 'below' | 'at';
  smaDifference?: number;
  smaDifferencePercent?: number;
}

/**
 * Calculate market data context for chart headers and metrics
 */
export const calculateMarketDataContext = (
  allData: Bar[],
  entryDate: string
): MarketDataContext => {
  // Get current day data (trading hours only)
  const currentDayBars = allData.filter(bar => {
    const barTimestamp = parseTimestampForChart(bar.timestamp);
    const barDate = new Date(barTimestamp).toISOString().split('T')[0];
    return barDate === entryDate && isTradingHours(barTimestamp);
  });

  // Get previous day data (trading hours only)
  const previousDayBars = allData.filter(bar => {
    const barTimestamp = parseTimestampForChart(bar.timestamp);
    const barDate = new Date(barTimestamp).toISOString().split('T')[0];
    return barDate < entryDate && isTradingHours(barTimestamp);
  });

  // Calculate previous day close (last trading bar of previous day)
  const previousClose =
    previousDayBars.length > 0 ? previousDayBars[previousDayBars.length - 1].close : undefined;

  // Calculate current day OHLC (trading hours only)
  let currentOpen: number | undefined;
  let currentHigh: number | undefined;
  let currentLow: number | undefined;

  if (currentDayBars.length > 0) {
    // Sort by timestamp to ensure we get the first trading bar (9:30 AM)
    const sortedCurrentDayBars = currentDayBars.sort(
      (a, b) => parseTimestampForChart(a.timestamp) - parseTimestampForChart(b.timestamp)
    );

    currentOpen = sortedCurrentDayBars[0].open; // First trading bar of the day
    currentHigh = Math.max(...currentDayBars.map(bar => bar.high));
    currentLow = Math.min(...currentDayBars.map(bar => bar.low));
  }

  return {
    previousClose,
    currentOpen,
    currentHigh,
    currentLow,
    currentPrice: 0, // Will be set from entrySignal.price
    vwap: undefined, // Will be calculated separately with current day data
    vwapPosition: undefined,
    vwapDifference: undefined,
    vwapDifferencePercent: undefined,
  };
};

export interface MarketMetrics {
  marketDataLine1: string; // Prior Day Close | Signal Day Open | Gap
  marketDataLine2: string; // Signal Day H/L | Signal Day Current
  priorDaySummary: string; // PRIOR DAY SUMMARY line
  signalDayPerformance: string; // SIGNAL DAY PERFORMANCE line
  vwapInfo: string; // VWAP information
  smaInfo: string; // SMA information
  vwapVsSmaInfo: string; // VWAP vs SMA comparison
  // Raw values for chart generation
  vwap?: number;
  sma20?: number;
}

/**
 * Generate market metrics text that can be used in both charts and LLM prompts.
 * This ensures consistency between what the LLM sees in the chart and in the prompt.
 */
export const generateMarketMetrics = (
  allDataInput: Bar[],
  entrySignal: Signal,
  dailyBars?: DailyBar[],
  suppressSma?: boolean,
  suppressVwap?: boolean
): MarketMetrics => {
  const entryDate = new Date(entrySignal.timestamp).toISOString().split('T')[0];
  const entryTime = new Date(entrySignal.timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  // Calculate remaining time in trading day
  const calculateRemainingTime = (signalTimestamp: string): string => {
    const signalDate = new Date(signalTimestamp);

    // Market close is 4:00 PM ET (16:00)
    const marketCloseDate = new Date(signalDate);
    marketCloseDate.setHours(16, 0, 0, 0);

    const remainingMs = marketCloseDate.getTime() - signalDate.getTime();

    if (remainingMs <= 0) {
      return 'Market Closed';
    }

    const remainingMinutes = Math.floor(remainingMs / (1000 * 60));
    const hours = Math.floor(remainingMinutes / 60);
    const minutes = remainingMinutes % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m remaining`;
    } else {
      return `${minutes}m remaining`;
    }
  };

  const remainingTime = calculateRemainingTime(entrySignal.timestamp);

  // Calculate market data context
  const marketData = calculateMarketDataContext(allDataInput, entryDate);
  marketData.currentPrice = entrySignal.price;

  // Calculate VWAP for current day (only if not suppressed)
  if (!suppressVwap) {
    const currentDayBars = filterCurrentDayBars(allDataInput, entryDate);
    const vwapResult = calculateVWAPResult(currentDayBars, marketData.currentPrice);
    if (vwapResult) {
      marketData.vwap = vwapResult.vwap;
      marketData.vwapPosition = vwapResult.position;
      marketData.vwapDifference = vwapResult.priceVsVwap;
      marketData.vwapDifferencePercent = vwapResult.priceVsVwapPercent;
    }
  }

  // Calculate 20-day SMA (only if not suppressed)
  if (!suppressSma) {
    let smaData: DailyBar[] = [];
    if (dailyBars && dailyBars.length > 0) {
      // Use provided daily bars (from Polygon for scout)
      smaData = dailyBars;
    } else {
      // Aggregate intraday data to daily bars (for backtest with CSV data)
      smaData = aggregateIntradayToDaily(allDataInput);
    }

    const smaResult = calculateSMAResult(smaData, SMA_PERIODS.MEDIUM, marketData.currentPrice);
    if (smaResult) {
      marketData.sma20 = smaResult.sma;
      marketData.smaPosition = smaResult.position;
      marketData.smaDifference = smaResult.priceVsSma;
      marketData.smaDifferencePercent = smaResult.priceVsSmaPercent;
    }
  }

  // Enhanced gap information with clear directional language
  let gapInfo = '';
  if (marketData.previousClose && marketData.currentOpen) {
    const gapAmount = marketData.currentOpen - marketData.previousClose;
    const gapPercent = ((Math.abs(gapAmount) / marketData.previousClose) * 100).toFixed(2);

    if (gapAmount > 0) {
      gapInfo = `GAP UP: +$${gapAmount.toFixed(2)} (+${gapPercent}%)`;
    } else if (gapAmount < 0) {
      gapInfo = `GAP DOWN: $${gapAmount.toFixed(2)} (-${gapPercent}%)`;
    } else {
      gapInfo = `NO GAP: $0.00 (0.00%)`;
    }
  }

  // Format market data lines with explicit day references
  const marketDataLine1 = `Prior Day Close: ${marketData.previousClose ? '$' + marketData.previousClose.toFixed(2) : 'N/A'} | Signal Day Open: ${marketData.currentOpen ? '$' + marketData.currentOpen.toFixed(2) : 'N/A'} | ${gapInfo || 'Gap: N/A'}`;

  const marketDataLine2 = `Signal Day H/L: ${marketData.currentHigh ? '$' + marketData.currentHigh.toFixed(2) : 'N/A'}/${marketData.currentLow ? '$' + marketData.currentLow.toFixed(2) : 'N/A'} | Signal Day Current: $${marketData.currentPrice.toFixed(2)} @ ${entryTime} | ${remainingTime}`;

  // Add day summary lines with actual data ranges
  // Get prior day data using the same logic as calculateMarketDataContext
  const priorDayData = allDataInput.filter(bar => {
    const barTimestamp = parseTimestampForChart(bar.timestamp);
    const barDate = new Date(barTimestamp).toISOString().split('T')[0];
    return barDate < entryDate && isTradingHours(barTimestamp);
  });

  let priorDaySummary = 'PRIOR DAY SUMMARY: N/A';
  if (priorDayData.length > 0) {
    // Sort by timestamp to ensure we get the correct close (last bar of prior day)
    const sortedPriorDayBars = priorDayData.sort(
      (a, b) => parseTimestampForChart(a.timestamp) - parseTimestampForChart(b.timestamp)
    );

    const priorLow = Math.min(...priorDayData.map(b => b.low));
    const priorHigh = Math.max(...priorDayData.map(b => b.high));
    const priorClose = sortedPriorDayBars[sortedPriorDayBars.length - 1].close; // Last bar close
    priorDaySummary = `PRIOR DAY SUMMARY: $${priorClose.toFixed(2)} close, $${priorLow.toFixed(2)} low, $${priorHigh.toFixed(2)} high`;
  }

  const signalDayPerformance = `SIGNAL DAY PERFORMANCE: ${marketData.currentOpen ? '$' + marketData.currentOpen.toFixed(2) + ' open' : 'N/A open'} → $${marketData.currentPrice.toFixed(2)} current${marketData.currentOpen ? ' (+$' + (marketData.currentPrice - marketData.currentOpen).toFixed(2) + ' from open)' : ''}`;

  // Format VWAP information (only if not suppressed)
  let vwapInfo = '';
  if (!suppressVwap) {
    if (marketData.vwap) {
      const vwapDiff = marketData.vwapDifference || 0;
      const absDiff = Math.abs(vwapDiff);
      const position =
        marketData.vwapPosition === 'at' ? 'AT' : marketData.vwapPosition?.toUpperCase();
      vwapInfo = `Signal Day price of $${marketData.currentPrice.toFixed(2)} is $${absDiff.toFixed(2)} ${position} VWAP of $${marketData.vwap.toFixed(2)}.`;
    } else {
      vwapInfo = 'VWAP data is not available.';
    }
  }

  // Format SMA information (only if not suppressed)
  let smaInfo = '';
  if (!suppressSma) {
    if (marketData.sma20) {
      const smaDiff = marketData.smaDifference || 0;
      const absDiff = Math.abs(smaDiff);
      const position =
        marketData.smaPosition === 'at' ? 'AT' : marketData.smaPosition?.toUpperCase();
      smaInfo = `Signal Day price of $${marketData.currentPrice.toFixed(2)} is $${absDiff.toFixed(2)} ${position} SMA of $${marketData.sma20.toFixed(2)}.`;
    } else {
      smaInfo = '20-Day SMA data is not available.';
    }
  }

  // Format VWAP vs SMA comparison (only if neither VWAP nor SMA are suppressed)
  let vwapVsSmaInfo = '';
  if (!suppressSma && !suppressVwap && marketData.vwap && marketData.sma20) {
    const vwapVsSmaDiff = marketData.vwap - marketData.sma20;
    const position = vwapVsSmaDiff > 0 ? 'ABOVE' : vwapVsSmaDiff < 0 ? 'BELOW' : 'AT';
    vwapVsSmaInfo = `VWAP of $${marketData.vwap.toFixed(2)} is $${Math.abs(vwapVsSmaDiff).toFixed(2)} ${position} SMA of $${marketData.sma20.toFixed(2)}.`;
  }

  return {
    marketDataLine1,
    marketDataLine2,
    priorDaySummary,
    signalDayPerformance,
    vwapInfo,
    smaInfo,
    vwapVsSmaInfo,
    // Raw values for chart generation
    vwap: marketData.vwap,
    sma20: marketData.sma20,
  };
};

/**
 * Generate market metrics text for LLM prompt (excludes ticker and date info)
 */
export const generateMarketMetricsForPrompt = (
  allDataInput: Bar[],
  entrySignal: Signal,
  dailyBars?: DailyBar[],
  suppressSma?: boolean,
  suppressVwap?: boolean
): string => {
  const metrics = generateMarketMetrics(
    allDataInput,
    entrySignal,
    dailyBars,
    suppressSma,
    suppressVwap
  );

  const lines = [
    metrics.marketDataLine1,
    metrics.marketDataLine2,
    metrics.priorDaySummary,
    metrics.signalDayPerformance,
  ];

  // Only add VWAP info if not suppressed
  if (!suppressVwap && metrics.vwapInfo) {
    lines.push(metrics.vwapInfo);
  }

  // Only add SMA info if not suppressed
  if (!suppressSma && metrics.smaInfo) {
    lines.push(metrics.smaInfo);
  }

  // Only add VWAP vs SMA comparison if neither VWAP nor SMA are suppressed
  if (!suppressSma && !suppressVwap && metrics.vwapVsSmaInfo) {
    lines.push(metrics.vwapVsSmaInfo);
  }

  return lines.join('\n');
};
