import chalk from 'chalk';
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

// Helper formatting functions
const formatDate = (dateString: string): string => {
  return dateString;
};

const formatTime = (timeString: string): string => {
  return timeString.split(' ')[1];
};

const formatDollar = (value: number): string => {
  return `$${value.toFixed(2)}`;
};

const formatPercent = (value: number): string => {
  return `${(value * 100).toFixed(2)}%`;
};

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
  const isWin = isShort ? trade.return_pct > 0 : trade.return_pct >= 0;
  const returnColor = isWin ? chalk.green : chalk.red;
  const returnEmoji = isWin ? '✅' : '❌';

  // Print the formatted output
  console.log(
    `${emoji} 📅 ${date} ⏰ ${entryTime} → ${exitTime} Open: ${open} Entry: ${entry} Exit: ${exit} Rise: ${riseText} ${returnEmoji} Return: ${returnColor(returnPct)}`
  );
};

export const printYearSummary = (year: number, trades: Trade[]) => {
  const totalTrades = trades.length;
  const tradingDays = trades[0]?.total_trading_days || 252;
  const tradePercentage = ((totalTrades / tradingDays) * 100).toFixed(1);

  const rises = trades.map(t => t.rise_pct);
  const minRise = Math.min(...rises);
  const maxRise = Math.max(...rises);
  const avgRise = rises.reduce((a, b) => a + b, 0) / rises.length;

  const returns = trades.map(t => t.return_pct);
  const minReturn = Math.min(...returns);
  const maxReturn = Math.max(...returns);

  // For short positions, we invert the success criteria
  const isShort = trades[0]?.direction === 'short';
  const winningTrades = isShort
    ? trades.filter(t => t.return_pct > 0).length
    : trades.filter(t => t.return_pct >= 0).length;
  const winRate = (winningTrades / totalTrades) * 100;

  const meanReturn = trades[0]?.median_return || 0;
  const medianReturn = trades[0]?.median_return || 0;
  const stdDevReturn = trades[0]?.std_dev_return || 0;

  console.log('\n--------------------------------------------------------------------------------');
  console.log(`📊 ${year} Summary`);
  console.log(
    `Trading Days: ${tradingDays} | Trades: ${totalTrades} (${tradePercentage}% of days)`
  );
  console.log(
    `Rise: ${(minRise * 100).toFixed(2)}% to ${(maxRise * 100).toFixed(2)}% (avg: ${(avgRise * 100).toFixed(2)}%) | Return: ${(
      minReturn * 100
    ).toFixed(2)}% to ${(maxReturn * 100).toFixed(2)}%`
  );
  console.log('✅ Performance Stats:');
  console.log(
    `  Mean: ${meanReturn.toFixed(4)}% | Median: ${medianReturn.toFixed(4)}% | StdDev: ${stdDevReturn.toFixed(4)}%`
  );
  console.log(`  Win Rate: ${winRate.toFixed(1)}%`);
  console.log('--------------------------------------------------------------------------------');
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

  console.log('\n');
  console.log(chalk.bold(`📈 Overall Statistics (${isShort ? 'Short ↘️' : 'Long ↗️'}):`));
  console.log(
    `Total Trading Days: ${total_trading_days} | Total Trades: ${total_matches} (${avgMatches.toFixed(
      1
    )}% of days)`
  );
  console.log(
    `Average Return: ${total_return_sum.toFixed(4)}% | Median Return: ${median_return.toFixed(
      4
    )}% | StdDev: ${std_dev_return.toFixed(4)}%`
  );
  console.log(`Win Rate: ${(win_rate * 100).toFixed(1)}%`);
};

export const printFooter = () => {
  console.log('\n');
  console.log(
    chalk.gray('═══════════════════════════════════════════════════════════════════════')
  );
  console.log(chalk.gray('Thanks for using AlphaGroove! ♥'));
};
