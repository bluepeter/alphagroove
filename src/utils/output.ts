import chalk from 'chalk';

import {
  formatDate,
  formatTime,
  formatDollar,
  formatPercent,
  calculateTradePercentage,
  calculateAvgRise,
  calculateWinningTrades,
  calculateWinRate,
  isWinningTrade,
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
  rise_pct: number;
  return_pct: number;
  year?: number;
  total_trading_days?: number;
  all_trading_days?: number;
  median_return?: number;
  std_dev_return?: number;
  win_rate?: number;
  total_matches?: number;
  match_count?: number;
  direction?: 'long' | 'short';
}

export interface TotalStats {
  total_trading_days: number;
  total_matches: number;
  total_return_sum: number;
  median_return: number;
  std_dev_return: number;
  win_rate: number;
  winning_trades: number;
}

export const printHeader = (
  ticker: string,
  fromDate: string,
  toDate: string,
  entryPatternName: string,
  exitPatternName: string,
  direction: 'long' | 'short' = 'long'
) => {
  console.log(chalk.bold(`\n${ticker} Analysis (${fromDate} to ${toDate}):`));
  console.log(chalk.bold(`Entry Pattern: ${entryPatternName}`));
  console.log(chalk.bold(`Exit Pattern: ${exitPatternName}`));
  console.log(chalk.bold(`Direction: ${direction === 'long' ? 'Long ↗️' : 'Short ↘️'}`));
  console.log('');
  console.log(
    chalk.gray('═══════════════════════════════════════════════════════════════════════')
  );
  console.log('');
};

export const printYearHeader = (year: string) => {
  console.log(chalk.cyan(`\n${year} Trades:`));
};

export const printTradeDetails = (trade: Trade, direction: 'long' | 'short' = 'long') => {
  const isShort = direction === 'short';
  const emoji = isShort ? '↘️' : '↗️';

  // Get the base trade info
  const date = formatDate(trade.trade_date);
  const entryTime = formatTime(trade.entry_time);
  const exitTime = formatTime(trade.exit_time);
  const open = formatDollar(trade.market_open);
  const entry = formatDollar(trade.entry_price);
  const exit = formatDollar(trade.exit_price);

  // For both directions, we're detecting a rise pattern
  const riseText = formatPercent(trade.rise_pct);

  // Return is calculated differently based on direction
  const returnPct = formatPercent(trade.return_pct);
  const isWin = isWinningTrade(trade.return_pct, isShort);
  const returnColor = isWin ? chalk.green : chalk.red;
  const returnEmoji = isWin ? '✅' : '❌';

  // Print the formatted output
  console.log(
    `${emoji} ${date} ⏰ ${entryTime} → ${exitTime} Open: ${open} Entry: ${entry} Exit: ${exit} Rise: ${riseText} ${returnEmoji} Return: ${returnColor(returnPct)}`
  );
};

export const printYearSummary = (year: number, trades: Trade[]) => {
  const totalTrades = trades.length;
  const tradingDays = trades[0]?.total_trading_days || 252;
  const tradePercentage = calculateTradePercentage(totalTrades, tradingDays);

  const rises = trades.map(t => t.rise_pct);
  const avgRise = calculateAvgRise(rises);

  const returns = trades.map(t => t.return_pct);
  const minReturn = returns.length > 0 ? Math.min(...returns) : 0;
  const maxReturn = returns.length > 0 ? Math.max(...returns) : 0;

  // For short positions, we invert the success criteria
  const isShort = trades[0]?.direction === 'short';
  const winningTrades = calculateWinningTrades(trades, isShort);
  const winRate = calculateWinRate(winningTrades, totalTrades);

  const meanReturn = trades[0]?.median_return || 0;
  const stdDevReturn = trades[0]?.std_dev_return || 0;

  // Format values with color
  const meanColor = meanReturn >= 0 ? chalk.green : chalk.red;
  const winRateColor = winRate >= 50 ? chalk.green : chalk.red;
  const returnRangeColor = maxReturn >= 0 ? (minReturn >= 0 ? chalk.green : chalk.gray) : chalk.red;

  console.log('');
  console.log(
    chalk.cyan(
      `📊 ${year} Summary: ${totalTrades} trades (${tradePercentage}% of days) | ` +
        `Avg Rise: ${(avgRise * 100).toFixed(2)}% | Return Range: ${returnRangeColor(`${(minReturn * 100).toFixed(2)}% to ${(maxReturn * 100).toFixed(2)}%`)} | ` +
        `Mean: ${meanColor(`${meanReturn.toFixed(4)}%`)} | StdDev: ${stdDevReturn.toFixed(4)}% | Win Rate: ${winRateColor(`${winRate.toFixed(1)}%`)}`
    )
  );
  console.log('');
};

export const printOverallSummary = (stats: {
  total_trading_days: number;
  total_matches: number;
  total_return_sum: number;
  median_return: number;
  std_dev_return: number;
  win_rate: number;
  direction?: 'long' | 'short';
}) => {
  const {
    total_trading_days,
    total_matches,
    total_return_sum,
    median_return,
    std_dev_return,
    win_rate,
    direction,
  } = stats;
  const avgMatches = (total_matches / total_trading_days) * 100;
  const isShort = direction === 'short';

  // Format values with color
  const avgReturnColor = total_return_sum >= 0 ? chalk.green : chalk.red;
  const medianReturnColor = median_return >= 0 ? chalk.green : chalk.red;
  const winRateColor = win_rate >= 0.5 ? chalk.green : chalk.red;

  console.log('');
  console.log(
    chalk.bold(
      `📈 Overall: ${total_matches} trades (${avgMatches.toFixed(1)}% of days) | ` +
        `Avg Return: ${avgReturnColor(`${(total_return_sum * 100).toFixed(4)}%`)} | Median: ${medianReturnColor(`${median_return.toFixed(4)}%`)} | ` +
        `StdDev: ${std_dev_return.toFixed(4)}% | Win Rate: ${winRateColor(`${(win_rate * 100).toFixed(1)}%`)} | ` +
        `Direction: ${isShort ? 'Short ↘️' : 'Long ↗️'}`
    )
  );
  console.log('');
};

export const printFooter = () => {
  console.log('\n');
  console.log(
    chalk.gray('═══════════════════════════════════════════════════════════════════════')
  );
  console.log(chalk.gray('Thanks for using AlphaGroove! ♥'));
};
