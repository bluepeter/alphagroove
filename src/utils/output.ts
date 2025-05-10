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

export interface TotalStats {
  total_trading_days: number;
  total_matches: number;
  total_return_sum: number; // This is used for Overall Avg Return calculation (sum of individual trade.return_pct)
  median_return: number; // This is calculated median of all individual trade.return_pct
  std_dev_return: number; // This is calculated std_dev of all individual trade.return_pct
  win_rate: number; // This is calculated win_rate of all individual trades
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
  const returnColor = isWin ? chalk.green : chalk.red;
  const returnEmoji = isWin ? '✅' : '❌';

  console.log(
    `${emoji} ${date} ⏰ ${entryTime} → ${exitTime} Open: ${open} Entry: ${entry} Exit: ${exit} ${changeText ? changeText + ' ' : ''}${returnEmoji} Return: ${returnColor(returnPctStr)}`
  );
};

export const printYearSummary = (year: number, trades: Trade[], llmCost?: number) => {
  const totalTrades = trades.length;
  const tradingDays = trades[0]?.total_trading_days || 252;
  const tradePercentage = calculateTradePercentage(totalTrades, tradingDays);

  const rises = trades.map(t => t.rise_pct).filter(r => r !== null) as number[];
  const avgRise = calculateAvgRise(rises);

  const returns = trades.map(t => t.return_pct);
  const minReturn = returns.length > 0 ? Math.min(...returns) : 0;
  const maxReturn = returns.length > 0 ? Math.max(...returns) : 0;

  const isShort = trades[0]?.direction === 'short';
  const winningTrades = calculateWinningTrades(trades, isShort);
  const winRateValue = calculateWinRate(winningTrades, totalTrades);

  // yearly_stats from SQL provides avg_return, median_return, std_dev_return, win_rate for that year's trades
  // These are already percentages from SQL (e.g., AVG(t.return_pct * 100))
  const meanReturnPct = trades[0]?.avg_return || 0; // Use avg_return from SQL (already a percentage)
  const medianReturnPct = trades[0]?.median_return || 0; // Use median_return from SQL (already a percentage)
  const stdDevReturnPct = trades[0]?.std_dev_return || 0;

  const meanColor = meanReturnPct >= 0 ? chalk.green : chalk.red;
  const medianColor = medianReturnPct >= 0 ? chalk.green : chalk.red;
  const winRateColor = winRateValue >= 50 ? chalk.green : chalk.red;
  const returnRangeColor =
    maxReturn * 100 >= 0 ? (minReturn * 100 >= 0 ? chalk.green : chalk.gray) : chalk.red;

  const llmCostString =
    typeof llmCost === 'number' && llmCost > 0 ? ` | LLM Cost: $${llmCost.toFixed(4)}` : '';

  console.log('');
  console.log(
    chalk.cyan(
      `📊 ${year} Summary: ${totalTrades} trades (${tradePercentage}% of days) | ` +
        `Avg Rise: ${(avgRise * 100).toFixed(2)}% | Return Range: ${returnRangeColor(
          `${(minReturn * 100).toFixed(2)}% to ${(maxReturn * 100).toFixed(2)}%`
        )} | ` +
        `Mean: ${meanColor(`${meanReturnPct.toFixed(4)}%`)} | Median: ${medianColor(`${medianReturnPct.toFixed(4)}%`)} | StdDev: ${stdDevReturnPct.toFixed(4)}% | Win Rate: ${winRateColor(
          `${winRateValue.toFixed(1)}%`
        )}${llmCostString}`
    )
  );
  console.log('');
};

export const printOverallSummary = (stats: {
  total_trading_days: number;
  total_matches: number;
  total_return_sum: number; // Sum of fractional returns for calculating overall average
  median_return: number; // Calculated median of fractional returns
  std_dev_return: number; // Calculated std_dev of fractional returns
  win_rate: number; // Calculated overall win_rate (fraction)
  direction?: 'long' | 'short';
  llmCost?: number;
}) => {
  const {
    total_trading_days,
    total_matches,
    total_return_sum, // This is now the sum of fractional returns
    median_return, // This is fractional median
    std_dev_return, // This is fractional std dev
    win_rate, // This is fractional win rate
    direction,
    llmCost,
  } = stats;

  const avgMatchesPct = total_trading_days > 0 ? (total_matches / total_trading_days) * 100 : 0;
  const isShort = direction === 'short';

  // Calculate overall average return from the sum and total matches
  const overallAvgReturn = total_matches > 0 ? total_return_sum / total_matches : 0;

  const avgReturnColor = overallAvgReturn >= 0 ? chalk.green : chalk.red;
  const medianReturnColor = median_return >= 0 ? chalk.green : chalk.red;
  const winRateColor = win_rate * 100 >= 50 ? chalk.green : chalk.red;

  const llmCostString =
    typeof llmCost === 'number' && llmCost > 0 ? ` | Total LLM Cost: $${llmCost.toFixed(4)}` : '';

  console.log('');
  console.log(
    chalk.bold(
      `📈 Overall: ${total_matches} trades (${avgMatchesPct.toFixed(1)}% of days) | ` +
        `Avg Return: ${avgReturnColor(`${(overallAvgReturn * 100).toFixed(4)}%`)} | Median: ${medianReturnColor(
          `${(median_return * 100).toFixed(4)}%`
        )} | ` +
        `StdDev: ${chalk.gray(`${(std_dev_return * 100).toFixed(4)}%`)} | Win Rate: ${winRateColor(
          (win_rate * 100).toFixed(1) + '%'
        )} | ` +
        `Direction: ${isShort ? 'Short ↘️' : 'Long ↗️'}${llmCostString}`
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
