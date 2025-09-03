import { Bar, Signal } from '../patterns/types';
import { calculateMarketDataContext } from './chart-generator';
import { calculateVWAPResult, filterCurrentDayBars } from './vwap-calculator';
import {
  calculateSMAResult,
  aggregateIntradayToDaily,
  SMA_PERIODS,
  DailyBar,
} from './sma-calculator';

export interface MarketMetrics {
  marketDataLine1: string; // Prev Close | Today Open | Gap
  marketDataLine2: string; // Today H/L | Current
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

  // Format market data lines
  const marketDataLine1 = `Prev Close: ${marketData.previousClose ? '$' + marketData.previousClose.toFixed(2) : 'N/A'} | Today Open: ${marketData.currentOpen ? '$' + marketData.currentOpen.toFixed(2) : 'N/A'} | ${gapInfo || 'Gap: N/A'}`;

  const marketDataLine2 = `Today H/L: ${marketData.currentHigh ? '$' + marketData.currentHigh.toFixed(2) : 'N/A'}/${marketData.currentLow ? '$' + marketData.currentLow.toFixed(2) : 'N/A'} | Current: $${marketData.currentPrice.toFixed(2)} @ ${entryTime}`;

  // Format VWAP information (only if not suppressed)
  let vwapInfo = '';
  if (!suppressVwap) {
    if (marketData.vwap) {
      const vwapDiff = marketData.vwapDifference || 0;
      const absDiff = Math.abs(vwapDiff);
      const position =
        marketData.vwapPosition === 'at' ? 'AT' : marketData.vwapPosition?.toUpperCase();
      vwapInfo = `Current price of $${marketData.currentPrice.toFixed(2)} is $${absDiff.toFixed(2)} ${position} VWAP of $${marketData.vwap.toFixed(2)}.`;
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
      smaInfo = `Current price of $${marketData.currentPrice.toFixed(2)} is $${absDiff.toFixed(2)} ${position} SMA of $${marketData.sma20.toFixed(2)}.`;
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

  const lines = [metrics.marketDataLine1, metrics.marketDataLine2];

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
