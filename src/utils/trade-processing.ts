import { getPriorDayTradingBars } from './data-loader';
import { calculateAverageTrueRangeForDay, type Bar } from './calculations';
import { type ExitStrategy, type ExitSignal } from '../patterns/exit/exit-strategy';

/**
 * Calculates the Average True Range (ATR) for the day prior to the given trade date.
 * This is used to set dynamic exit parameters like ATR-based stop losses or profit targets.
 * @param ticker The stock ticker symbol.
 * @param timeframe The chart timeframe (e.g., '1min').
 * @param tradeDate The date of the trade signal (YYYY-MM-DD).
 * @returns A promise that resolves to the ATR value for the prior day, or undefined if it cannot be calculated.
 */
export async function calculateEntryAtr(
  ticker: string,
  timeframe: string,
  tradeDate: string
): Promise<number | undefined> {
  let entryAtrValue: number | undefined;
  const priorDayBars = await getPriorDayTradingBars(ticker, timeframe, tradeDate);

  if (priorDayBars.length > 0) {
    entryAtrValue = calculateAverageTrueRangeForDay(priorDayBars);
    if (entryAtrValue === undefined) {
      console.warn(
        `[ATR Calc] Could not calculate Average TR for prior day to ${tradeDate} for ${ticker}. ATR-based exits might use percentages if configured.`
      );
    }
  } else {
    console.warn(
      `[ATR Calc] No prior day bars found for ${tradeDate} for ${ticker} to calculate ATR. ATR-based exits might use percentages if configured.`
    );
  }
  return entryAtrValue;
}

/**
 * Evaluates all configured exit strategies bar-by-bar to find the first exit signal.
 * If no strategy triggers, it defaults to an end-of-day exit using the last available bar.
 * @param entryPrice The adjusted entry price of the trade.
 * @param entryTimestamp The actual execution timestamp of the trade.
 * @param tradingDayBars All bars available for the trading day, starting from the signal bar.
 * @param tradeDirection The direction of the trade ('long' or 'short').
 * @param entryAtrValue The ATR value calculated at entry, if available.
 * @param exitStrategies An array of configured exit strategy instances.
 * @param defaultExitReason The reason to log if no strategy triggers an exit explicitly.
 * @returns An ExitSignal object if an exit is triggered, or null if no bars are available for evaluation.
 */
export function evaluateExitStrategies(
  entryPrice: number,
  entryTimestamp: string,
  tradingDayBars: Bar[],
  tradeDirection: 'long' | 'short',
  entryAtrValue: number | undefined,
  exitStrategies: ExitStrategy[],
  defaultExitReason: string = 'endOfDay'
): ExitSignal | null {
  let exitSignal: ExitSignal | null = null;

  // Exit strategies internally filter bars with timestamp > entryTimestamp for their evaluation
  for (const strategy of exitStrategies) {
    const signal = strategy.evaluate(
      entryPrice,
      entryTimestamp,
      tradingDayBars, // Pass all available bars; strategy filters appropriately
      tradeDirection === 'long',
      entryAtrValue
    );

    if (signal) {
      exitSignal = signal;
      break; // First exit signal triggered wins
    }
  }

  // If no exit strategy was triggered by the end of available bars for the day,
  // and there were bars to evaluate, use the last bar's close for exit.
  if (!exitSignal && tradingDayBars.length > 0) {
    // Find the last bar that is on or after the entryTimestamp to ensure it's a valid exit point post-entry.
    const relevantBars = tradingDayBars.filter(bar => bar.timestamp >= entryTimestamp);
    if (relevantBars.length > 0) {
      const lastBarToConsider = relevantBars[relevantBars.length - 1];
      exitSignal = {
        timestamp: lastBarToConsider.timestamp,
        price: lastBarToConsider.close,
        type: 'exit',
        reason: defaultExitReason,
      };
    }
  }

  // If still no exitSignal (e.g., tradingDayBars was empty or only contained pre-entry bars),
  // this will return null, and processTradesLoop should handle it (e.g., skip trade).
  return exitSignal;
}
