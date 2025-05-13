import chalk from 'chalk';

import {
  formatDate,
  formatTime,
  formatDollar,
  formatPercent,
  calculateTradePercentage,
  calculateWinningTrades,
  calculateWinRate,
  isWinningTrade,
  calculateMeanReturn,
  calculateMedianReturn,
  calculateStdDevReturn,
} from './calculations';

// We could use date-fns for more advanced date formatting in the future
// import { format } from 'date-fns';

export interface Trade {
  trade_date: string;
  entry_time: string;
  exit_time: string;
  market_open: number;
  entry_price: number;
  exit_price: number;
  rise_pct: number | null;
  return_pct: number;
  year?: number;
  total_trading_days?: number;
  all_trading_days?: number;
  median_return?: number; // This is a yearly aggregate from SQL
  std_dev_return?: number; // This is a yearly aggregate from SQL
  win_rate?: number; // This is a yearly aggregate from SQL
  avg_return?: number; // This is a yearly aggregate from SQL (avg_return from yearly_stats)
  match_count?: number;
  direction?: 'long' | 'short';
  chartPath?: string; // Path to the chart generated for LLM screening
  exit_reason?: string; // Reason for exit (stopLoss, profitTarget, trailingStop, maxHoldTime, endOfDay)
  initialStopLossPrice?: number; // New
  initialProfitTargetPrice?: number; // New
  tsActivationLevel?: number; // New - for trailing stop activation price/level
  tsTrailAmount?: number; // New - for trailing stop trail amount (could be $ or % if not ATR based)
  isStopLossAtrBased?: boolean; // New
  isProfitTargetAtrBased?: boolean; // New
  isTrailingStopAtrBased?: boolean; // New
}

// New Statistics Interfaces
export interface DirectionalTradeStats {
  trades: Trade[];
  winning_trades: number;
  total_return_sum: number;
  all_returns: number[];
  // Metrics to be calculated from all_returns and counts:
  // win_rate: number;
  // mean_return: number;
  // median_return: number;
  // std_dev_return: number;
}

export interface OverallTradeStats {
  long_stats: DirectionalTradeStats;
  short_stats: DirectionalTradeStats;
  total_trading_days: number;
  total_raw_matches: number; // From initial query, before LLM screening
  total_llm_confirmed_trades: number; // Trades that passed LLM screen (sum of long and short trades.length)
  grandTotalLlmCost: number;
}
// End New Statistics Interfaces

export const printHeader = (
  ticker: string,
  fromDate: string,
  toDate: string,
  entryPatternName: string,
  exitPatternName: string,
  direction: 'long' | 'short' | 'llm_decides'
) => {
  console.log(chalk.bold(`\n${ticker} Analysis (${fromDate} to ${toDate}):`));
  console.log(chalk.bold(`Entry Pattern: ${entryPatternName}`));
  console.log(chalk.bold(`Exit Pattern: ${exitPatternName}`));
  let directionDisplay = 'Unknown';
  if (direction === 'long') directionDisplay = 'Long ↗️';
  else if (direction === 'short') directionDisplay = 'Short ↘️';
  else if (direction === 'llm_decides') directionDisplay = 'LLM Decides 🧠';
  console.log(chalk.bold(`Direction Strategy: ${directionDisplay}`));
  console.log('');
  console.log(
    chalk.gray('═══════════════════════════════════════════════════════════════════════')
  );
  console.log('');
};

export const printYearHeader = (year: string) => {
  console.log(chalk.cyan(`\n${year} Trades:`));
};

export const printTradeDetails = (trade: Trade) => {
  const isShort = trade.direction === 'short';
  const emoji = isShort ? '↘️' : '↗️';

  const date = formatDate(trade.trade_date);
  const entryTime = formatTime(trade.entry_time);
  const exitTime = formatTime(trade.exit_time);
  const open = formatDollar(trade.market_open);
  const entry = formatDollar(trade.entry_price);
  const exit = formatDollar(trade.exit_price);

  let changeText = '';
  if (trade.rise_pct !== null) {
    const isFallPattern = trade.entry_price < trade.market_open && trade.rise_pct > 0;
    const changeValue = isFallPattern ? -trade.rise_pct : trade.rise_pct;
    changeText = `Change: ${formatPercent(changeValue)}`;
  }

  const returnPctStr = formatPercent(trade.return_pct);
  const isWin = isWinningTrade(trade.return_pct, isShort);
  const returnEmoji = isWin ? '✅' : '❌';

  const exitReasonText = trade.exit_reason ? `[${trade.exit_reason}]` : '';

  let exitParamsInfo = '';
  if (trade.initialStopLossPrice !== undefined) {
    const slType = trade.isStopLossAtrBased ? 'ATR SL' : 'SL';
    const slPct = formatPercent(
      (trade.initialStopLossPrice - trade.entry_price) / trade.entry_price
    );
    exitParamsInfo += ` ${slType}: ${formatDollar(trade.initialStopLossPrice)} (${slPct})`;
  }
  if (trade.initialProfitTargetPrice !== undefined) {
    const ptType = trade.isProfitTargetAtrBased ? 'ATR PT' : 'PT';
    const ptDiff = trade.initialProfitTargetPrice - trade.entry_price;
    const ptPct = formatPercent(ptDiff / trade.entry_price);
    exitParamsInfo += exitParamsInfo
      ? `; ${ptType}: $${Math.abs(ptDiff).toFixed(2)} (${ptPct})`
      : ` ${ptType}: $${Math.abs(ptDiff).toFixed(2)} (${ptPct})`;
  }
  if (trade.tsActivationLevel !== undefined) {
    // If activation level is exactly the entry price, this means immediate activation
    if (trade.tsActivationLevel === trade.entry_price) {
      exitParamsInfo += exitParamsInfo ? `; TS Act: Immediate` : ` TS Act: Immediate`;
    } else {
      const actPct = formatPercent(
        (trade.tsActivationLevel - trade.entry_price) / trade.entry_price
      );
      exitParamsInfo += exitParamsInfo
        ? `; TS Act: ${formatDollar(trade.tsActivationLevel)} (${actPct})`
        : ` TS Act: ${formatDollar(trade.tsActivationLevel)} (${actPct})`;
    }
  }
  if (trade.tsTrailAmount !== undefined) {
    // If ATR based, tsTrailAmount is a dollar amount. If percent based, it's a percentage (e.g., 0.5 for 0.5%).
    if (trade.isTrailingStopAtrBased) {
      // Convert ATR dollar amount to percentage of entry price for display
      const trailPct = (trade.tsTrailAmount / trade.entry_price) * 100;
      const trailDisplay = `${formatDollar(trade.tsTrailAmount)} (${formatPercent(trailPct / 100)})`;
      exitParamsInfo += exitParamsInfo
        ? `; ATR Trail: ${trailDisplay}`
        : ` ATR Trail: ${trailDisplay}`;
    } else {
      const trailDisplay = `${formatPercent(trade.tsTrailAmount / 100)}`;
      exitParamsInfo += exitParamsInfo ? `; Trail %: ${trailDisplay}` : ` Trail %: ${trailDisplay}`;
    }
  }
  if (exitParamsInfo) {
    exitParamsInfo = chalk.dim(` (${exitParamsInfo.trim()})`);
  }

  // For debugging purposes - add a validation of return calculation
  // This helps spot inconsistencies between the reported return and actual prices
  const calculatedReturn = isShort
    ? (trade.entry_price - trade.exit_price) / trade.entry_price
    : (trade.exit_price - trade.entry_price) / trade.entry_price;

  // If there's a significant difference between calculated and reported returns, log it
  // Only show warnings in production mode, not during tests
  const returnDiff = Math.abs(calculatedReturn - trade.return_pct);
  if (returnDiff > 0.0001 && process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
    console.log(
      `[Warning] Return calculation mismatch: Reported ${formatPercent(trade.return_pct)} vs Calculated ${formatPercent(calculatedReturn)} for ${trade.trade_date}`
    );
  }

  console.log(
    `${emoji} ${date} ⏰ ${entryTime} → ${exitTime} Open: ${open} Entry: ${entry} Exit: ${exit} ${changeText ? changeText + ' ' : ''}${returnEmoji} Return: ${isWin ? chalk.green(returnPctStr) : chalk.red(returnPctStr)} ${exitReasonText}${exitParamsInfo}`
  );
};

// Helper function for printing directional summary (used by year and overall)
const printDirectionalSummary = (
  statsTitle: string, // e.g., "Long Trades", "Short Trades", "2023 Long Trades"
  trades: Trade[],
  totalTradingDaysInPeriod: number // For calculating trade percentage
) => {
  if (trades.length === 0) {
    // console.log(chalk.gray(`No ${statsTitle.toLowerCase()} to summarize.`));
    return; // Do not print anything if no trades for this direction
  }

  const totalTrades = trades.length;
  // Use totalTradingDaysInPeriod passed to the function for consistency
  const tradePercentage = calculateTradePercentage(totalTrades, totalTradingDaysInPeriod);

  const returns = trades.map(t => t.return_pct);
  const minReturn = Math.min(...returns);
  const maxReturn = Math.max(...returns);

  // All trades in this bucket have the same direction, take from first trade.
  const isShort = trades[0].direction === 'short';
  const winningTrades = calculateWinningTrades(trades, isShort);
  const winRateValue = calculateWinRate(winningTrades, totalTrades);

  const meanReturn = calculateMeanReturn(returns);
  const medianReturn = calculateMedianReturn(returns);
  const stdDevReturn = calculateStdDevReturn(returns, meanReturn);

  const meanColor = meanReturn >= 0 ? chalk.green : chalk.red;
  const medianColor = medianReturn >= 0 ? chalk.green : chalk.red;
  const winRateColor = winRateValue >= 50 ? chalk.green : chalk.red;
  const returnRangeColor = maxReturn >= 0 ? (minReturn >= 0 ? chalk.green : chalk.gray) : chalk.red;

  let summaryString = `📊 ${statsTitle}: ${totalTrades} trades (${tradePercentage}% of days) | `;
  summaryString += `Return Range: ${returnRangeColor(
    `${formatPercent(minReturn)} to ${formatPercent(maxReturn)}`
  )} | `;
  summaryString += `Mean: ${meanColor(formatPercent(meanReturn))} | Median: ${medianColor(formatPercent(medianReturn))} | StdDev: ${chalk.gray(formatPercent(stdDevReturn))} | Win Rate: ${winRateColor(
    `${winRateValue.toFixed(1)}%`
  )}`;

  console.log(chalk.cyan(summaryString));
};

// New helper function to calculate portfolio growth
export const calculatePortfolioGrowth = (returns: number[], initialCapital: number = 10000) => {
  let compoundedCapital = initialCapital;
  for (const returnPct of returns) {
    // Assume returnPct is already a decimal e.g., 0.0042 for 0.42%
    compoundedCapital *= 1 + returnPct;
  }

  const compoundedGrowthPct = (compoundedCapital / initialCapital - 1) * 100;
  const totalDollarReturn = initialCapital * (compoundedGrowthPct / 100);

  return {
    initialCapital,
    finalCapital: compoundedCapital,
    totalDollarReturn,
    percentageGrowth: compoundedGrowthPct,
  };
};

export const printYearSummary = (
  year: number,
  longTrades: Trade[],
  shortTrades: Trade[],
  llmCostForYear?: number
) => {
  const yearSpecificTradingDays =
    longTrades[0]?.total_trading_days || shortTrades[0]?.total_trading_days || 252;

  console.log('');

  if (longTrades.length > 0) {
    printDirectionalSummary(`${year} Long Trades ↗️`, longTrades, yearSpecificTradingDays);
  }
  if (shortTrades.length > 0) {
    printDirectionalSummary(`${year} Short Trades ↘️`, shortTrades, yearSpecificTradingDays);
  }

  const combinedYearTrades = [...longTrades, ...shortTrades];
  if (combinedYearTrades.length > 0) {
    const combinedReturns = combinedYearTrades.map(t => t.return_pct);
    const combinedWinningTrades = combinedYearTrades.filter(t => t.return_pct > 0).length;
    const combinedWinRateValue = calculateWinRate(combinedWinningTrades, combinedYearTrades.length);
    const combinedMeanReturn = calculateMeanReturn(combinedReturns);
    const combinedMedianReturn = calculateMedianReturn(combinedReturns);
    const combinedStdDevReturn = calculateStdDevReturn(combinedReturns, combinedMeanReturn);
    const combinedMinReturn = Math.min(...combinedReturns);
    const combinedMaxReturn = Math.max(...combinedReturns);
    const combinedTradePercentage = calculateTradePercentage(
      combinedYearTrades.length,
      yearSpecificTradingDays
    );

    const meanColor = combinedMeanReturn >= 0 ? chalk.green : chalk.red;
    const medianColor = combinedMedianReturn >= 0 ? chalk.green : chalk.red;
    const winRateColor = combinedWinRateValue >= 50 ? chalk.green : chalk.red;
    const returnRangeColor =
      combinedMaxReturn >= 0 ? (combinedMinReturn >= 0 ? chalk.green : chalk.gray) : chalk.red;

    let summaryString = `📊 ${year} Combined: ${combinedYearTrades.length} trades (${combinedTradePercentage}% of days) | `;
    summaryString += `Return Range: ${returnRangeColor(
      `${formatPercent(combinedMinReturn)} to ${formatPercent(combinedMaxReturn)}`
    )} | `;
    summaryString += `Mean: ${meanColor(formatPercent(combinedMeanReturn))} | Median: ${medianColor(formatPercent(combinedMedianReturn))} | StdDev: ${chalk.gray(formatPercent(combinedStdDevReturn))} | Win Rate: ${winRateColor(
      `${combinedWinRateValue.toFixed(1)}%`
    )}`;
    console.log(chalk.cyan(summaryString));

    const sortedCombinedTrades = [...combinedYearTrades].sort(
      (a, b) =>
        new Date(a.trade_date + ' ' + a.entry_time).getTime() -
        new Date(b.trade_date + ' ' + b.entry_time).getTime()
    );
    const sortedCombinedReturns = sortedCombinedTrades.map(t => t.return_pct);
    const combinedPortfolioGrowth = calculatePortfolioGrowth(sortedCombinedReturns);

    console.log(
      chalk.cyan(
        `  Compounded Growth ($10k Start): $${combinedPortfolioGrowth.totalDollarReturn.toFixed(2)} (${formatPercent(combinedPortfolioGrowth.percentageGrowth / 100)})` // DIVIDE BY 100 HERE
      )
    );
  } else {
    console.log(chalk.gray(`No trades for ${year} to summarize.`));
  }

  if (typeof llmCostForYear === 'number' && llmCostForYear > 0) {
    console.log(chalk.cyan(`  ${year} LLM Cost: $${llmCostForYear.toFixed(4)}`));
  }
  console.log('');
};

export const printOverallSummary = (stats: OverallTradeStats) => {
  const {
    long_stats,
    short_stats,
    total_trading_days,
    total_raw_matches,
    total_llm_confirmed_trades,
    grandTotalLlmCost,
  } = stats;

  console.log('');
  console.log(chalk.bold('📈 Overall Performance Summary:'));

  const avgRawMatchesPct =
    total_trading_days > 0 ? (total_raw_matches / total_trading_days) * 100 : 0;
  console.log(
    chalk.gray(
      `  Initial signals (pre-LLM): ${total_raw_matches} (${avgRawMatchesPct.toFixed(1)}% of trading days)`
    )
  );

  const llmConfirmationRate =
    total_raw_matches > 0 ? (total_llm_confirmed_trades / total_raw_matches) * 100 : 0;
  console.log(
    chalk.gray(
      `  LLM Confirmed Trades: ${total_llm_confirmed_trades} (${llmConfirmationRate.toFixed(1)}% of initial signals)`
    )
  );

  if (long_stats.trades.length > 0) {
    printDirectionalSummary('Overall Long Trades ↗️', long_stats.trades, total_trading_days);
  }
  if (short_stats.trades.length > 0) {
    printDirectionalSummary('Overall Short Trades ↘️', short_stats.trades, total_trading_days);
  }

  const combinedOverallTrades = [...long_stats.trades, ...short_stats.trades];
  if (combinedOverallTrades.length > 0) {
    const combinedReturns = combinedOverallTrades.map(t => t.return_pct);
    const combinedWinningTrades = combinedOverallTrades.filter(t => t.return_pct > 0).length;
    const combinedWinRateValue = calculateWinRate(
      combinedWinningTrades,
      combinedOverallTrades.length
    );
    const combinedMeanReturn = calculateMeanReturn(combinedReturns);
    const combinedMedianReturn = calculateMedianReturn(combinedReturns);
    const combinedStdDevReturn = calculateStdDevReturn(combinedReturns, combinedMeanReturn);
    const combinedMinReturn = Math.min(...combinedReturns);
    const combinedMaxReturn = Math.max(...combinedReturns);
    const combinedTradePercentage = calculateTradePercentage(
      combinedOverallTrades.length,
      total_trading_days
    );

    const meanColor = combinedMeanReturn >= 0 ? chalk.green : chalk.red;
    const medianColor = combinedMedianReturn >= 0 ? chalk.green : chalk.red;
    const winRateColor = combinedWinRateValue >= 50 ? chalk.green : chalk.red;
    const returnRangeColor =
      combinedMaxReturn >= 0 ? (combinedMinReturn >= 0 ? chalk.green : chalk.gray) : chalk.red;

    let summaryString = `📊 Overall Combined: ${combinedOverallTrades.length} trades (${combinedTradePercentage}% of days) | `;
    summaryString += `Return Range: ${returnRangeColor(
      `${formatPercent(combinedMinReturn)} to ${formatPercent(combinedMaxReturn)}`
    )} | `;
    summaryString += `Mean: ${meanColor(formatPercent(combinedMeanReturn))} | Median: ${medianColor(formatPercent(combinedMedianReturn))} | StdDev: ${chalk.gray(formatPercent(combinedStdDevReturn))} | Win Rate: ${winRateColor(
      `${combinedWinRateValue.toFixed(1)}%`
    )}`;
    console.log(chalk.bold(summaryString));

    const sortedCombinedTrades = [...combinedOverallTrades].sort(
      (a, b) =>
        new Date(a.trade_date + ' ' + a.entry_time).getTime() -
        new Date(b.trade_date + ' ' + b.entry_time).getTime()
    );
    const sortedCombinedReturns = sortedCombinedTrades.map(t => t.return_pct);
    const combinedPortfolioGrowth = calculatePortfolioGrowth(sortedCombinedReturns);

    console.log(
      chalk.bold(
        `  Compounded Growth ($10k Start): $${combinedPortfolioGrowth.totalDollarReturn.toFixed(2)} (${formatPercent(combinedPortfolioGrowth.percentageGrowth / 100)})` // DIVIDE BY 100 HERE
      )
    );
  } else if (total_llm_confirmed_trades === 0) {
    console.log(chalk.gray('  No LLM-confirmed trades to summarize for overall performance.'));
  }

  if (typeof grandTotalLlmCost === 'number' && grandTotalLlmCost > 0) {
    console.log(chalk.bold(`  Total LLM Cost: $${grandTotalLlmCost.toFixed(4)}`));
  }
  console.log('');
};

export const printFooter = () => {
  console.log('\n');
  console.log(
    chalk.gray('═══════════════════════════════════════════════════════════════════════')
  );
  console.log(chalk.gray('Thanks for using AlphaGroove! ♥'));
};
