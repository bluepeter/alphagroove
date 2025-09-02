import { Bar } from '../patterns/types';

/**
 * VWAP (Volume Weighted Average Price) calculation result
 */
export interface VWAPResult {
  vwap: number;
  priceVsVwap: number;
  priceVsVwapPercent: number;
  position: 'above' | 'below' | 'at';
  distance: 'near' | 'far';
}

/**
 * VWAP point for charting
 */
export interface VWAPPoint {
  timestamp: string;
  vwap: number;
  x?: number; // Chart x-coordinate (set during chart generation)
  y?: number; // Chart y-coordinate (set during chart generation)
}

/**
 * Calculate VWAP for a single point in time using all bars up to that point
 * @param bars Array of bars from market open up to the calculation point
 * @returns VWAP value or undefined if no valid data
 */
export const calculateVWAP = (bars: Bar[]): number | undefined => {
  if (bars.length === 0) {
    return undefined;
  }

  let totalPriceVolume = 0;
  let totalVolume = 0;

  for (const bar of bars) {
    if (!bar.volume || bar.volume <= 0) {
      continue; // Skip bars with no volume
    }

    // Typical price: (High + Low + Close) / 3
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    const priceVolume = typicalPrice * bar.volume;

    totalPriceVolume += priceVolume;
    totalVolume += bar.volume;
  }

  return totalVolume > 0 ? totalPriceVolume / totalVolume : undefined;
};

/**
 * Calculate VWAP line points for charting
 * Each point represents VWAP calculated from market open to that timestamp
 * @param currentDayBars Array of bars for the current trading day (sorted by timestamp)
 * @returns Array of VWAP points for chart visualization
 */
export const calculateVWAPLine = (currentDayBars: Bar[]): VWAPPoint[] => {
  const vwapPoints: VWAPPoint[] = [];

  if (currentDayBars.length === 0) {
    return vwapPoints;
  }

  // Calculate cumulative VWAP for each point in time
  for (let i = 0; i < currentDayBars.length; i++) {
    // Use bars from start of day up to current index (inclusive)
    const barsUpToThisPoint = currentDayBars.slice(0, i + 1);
    const vwap = calculateVWAP(barsUpToThisPoint);

    if (vwap !== undefined) {
      vwapPoints.push({
        timestamp: currentDayBars[i].timestamp,
        vwap: vwap,
      });
    }
  }

  return vwapPoints;
};

/**
 * Calculate VWAP result with context for display
 * @param currentDayBars Array of bars for the current trading day
 * @param currentPrice Current price for comparison
 * @returns VWAP result with position and distance context
 */
export const calculateVWAPResult = (
  currentDayBars: Bar[],
  currentPrice: number
): VWAPResult | undefined => {
  const vwap = calculateVWAP(currentDayBars);

  if (vwap === undefined) {
    return undefined;
  }

  const priceVsVwap = currentPrice - vwap;
  const priceVsVwapPercent = (priceVsVwap / vwap) * 100;

  // Determine position
  let position: 'above' | 'below' | 'at';
  if (Math.abs(priceVsVwap) < 0.01) {
    // Within 1 cent
    position = 'at';
  } else if (priceVsVwap > 0) {
    position = 'above';
  } else {
    position = 'below';
  }

  // Determine distance (near = within 0.1% of VWAP)
  const distance = Math.abs(priceVsVwapPercent) <= 0.1 ? 'near' : 'far';

  return {
    vwap,
    priceVsVwap,
    priceVsVwapPercent,
    position,
    distance,
  };
};

/**
 * Filter bars to current trading day only
 * @param allBars All available bars
 * @param targetDate Target date in YYYY-MM-DD format
 * @returns Bars filtered to the target trading day only
 */
export const filterCurrentDayBars = (allBars: Bar[], targetDate: string): Bar[] => {
  return allBars.filter(bar => {
    // Extract date from timestamp (handles both 'YYYY-MM-DD HH:mm:ss' and other formats)
    const barDate = bar.timestamp.split(' ')[0];
    return barDate === targetDate;
  });
};
