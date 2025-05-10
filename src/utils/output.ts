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

  console.log(
    `${emoji} ${date} ⏰ ${entryTime} → ${exitTime} Open: ${open} Entry: ${entry} Exit: ${exit} ${changeText ? changeText + ' ' : ''}${returnEmoji} Return: ${isWin ? chalk.green(returnPctStr) : chalk.red(returnPctStr)}`
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

export const printYearSummary = (
  year: number,
  longTrades: Trade[],
  shortTrades: Trade[],
  llmCostForYear?: number
) => {
  // Estimate yearSpecificTradingDays. This is an approximation.
  // A more accurate value would be the distinct trading days within that year from the dataset.
  // For simplicity, use the total_trading_days from the first trade if available, or default to 252.
  const yearSpecificTradingDays =
    longTrades[0]?.total_trading_days || shortTrades[0]?.total_trading_days || 252;

  console.log(''); // Add a space before year summary section

  if (longTrades.length > 0) {
    printDirectionalSummary(`${year} Long Trades ↗️`, longTrades, yearSpecificTradingDays);
  }
  if (shortTrades.length > 0) {
    printDirectionalSummary(`${year} Short Trades ↘️`, shortTrades, yearSpecificTradingDays);
  }

  if (longTrades.length === 0 && shortTrades.length === 0) {
    console.log(chalk.gray(`No trades for ${year} to summarize.`));
  }

  if (typeof llmCostForYear === 'number' && llmCostForYear > 0) {
    console.log(chalk.cyan(`  ${year} LLM Cost: $${llmCostForYear.toFixed(4)}`));
  }
  console.log(''); // Add a space after year summary section
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

  if (total_llm_confirmed_trades === 0) {
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
