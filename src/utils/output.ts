import chalk from 'chalk';

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
}

export const printHeader = (
  ticker: string,
  from: string,
  to: string,
  entryPattern: string,
  exitPattern: string
) => {
  console.log(
    `
================================================================================
📊 ${ticker} Analysis (${from} to ${to})
Entry Pattern: ${entryPattern}
Exit Pattern: ${exitPattern}
================================================================================
`
  );
};

export const printYearHeader = (year: string) => {
  console.log(
    `
--------------------------------------------------------------------------------
📅 ${year}
--------------------------------------------------------------------------------
`
  );
};

export const printTradeDetails = (trade: Trade) => {
  const returnPct = trade.return_pct * 100;
  const risePct = trade.rise_pct * 100;
  const emoji = returnPct >= 0 ? '✅' : '❌';
  const returnColor = returnPct >= 0 ? chalk.green : chalk.red;

  console.log(
    `📅 ${trade.trade_date} ⏰ ${trade.entry_time.split(' ')[1]} → ${
      trade.exit_time.split(' ')[1]
    } Open: $${trade.market_open.toFixed(2)} Entry: $${trade.entry_price.toFixed(2)} Exit: $${trade.exit_price.toFixed(
      2
    )} Rise: ${risePct.toFixed(2)}% ${emoji} Return: ${returnColor(`${returnPct.toFixed(2)}%`)}`
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

  const winningTrades = trades.filter(t => t.return_pct > 0).length;
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
    `Move: ${minRise.toFixed(2)}% to ${maxRise.toFixed(2)}% (avg: ${avgRise.toFixed(2)}%) | Return: ${minReturn.toFixed(
      2
    )}% to ${maxReturn.toFixed(2)}%`
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
  median_return: number;
  std_dev_return: number;
  win_rate: number;
  total_return_sum: number;
}) => {
  console.log('\n================================================================================');
  console.log('📊 Overall Summary');
  console.log(
    `Trading Days: ${stats.total_trading_days} | Trades: ${stats.total_matches} (${(
      (stats.total_matches / stats.total_trading_days) *
      100
    ).toFixed(1)}% of days)`
  );
  console.log('✅ Performance Stats:');
  console.log(
    `  Mean: ${stats.median_return.toFixed(4)}% | Median: ${stats.median_return.toFixed(4)}% | StdDev: ${stats.std_dev_return.toFixed(4)}%`
  );
  console.log(`  Win Rate: ${(stats.win_rate * 100).toFixed(1)}%`);
  console.log('================================================================================\n');
  console.log('ℹ️ Analysis complete.\n');
};

export const printFooter = () => {
  console.log('ℹ️ Analysis complete.');
};
