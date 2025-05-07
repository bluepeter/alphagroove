// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  underscore: '\x1b[4m',
  blink: '\x1b[5m',
  reverse: '\x1b[7m',
  hidden: '\x1b[8m',
  fg: {
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
  },
  bg: {
    black: '\x1b[40m',
    red: '\x1b[41m',
    green: '\x1b[42m',
    yellow: '\x1b[43m',
    blue: '\x1b[44m',
    magenta: '\x1b[45m',
    cyan: '\x1b[46m',
    white: '\x1b[47m',
  },
};

// Emojis for visual indicators
const emojis = {
  success: '✅',
  warning: '⚠️',
  error: '❌',
  info: 'ℹ️',
  chart: '📊',
  money: '💰',
  calendar: '📅',
  clock: '⏰',
};

export const printHeader = (
  entryPattern: string,
  exitPattern: string,
  fromDate: string,
  toDate: string
): void => {
  console.log('\n' + '='.repeat(80));
  console.log(
    `${colors.bright}${colors.fg.cyan}${emojis.chart} SPY Analysis (${fromDate} to ${toDate})${colors.reset}`
  );
  console.log(`${colors.dim}Entry Pattern: ${entryPattern}${colors.reset}`);
  console.log(`${colors.dim}Exit Pattern: ${exitPattern}${colors.reset}`);
  console.log('='.repeat(80) + '\n');
};

export const printYearHeader = (year: string): void => {
  console.log('\n' + '-'.repeat(80));
  console.log(`${colors.bright}${colors.fg.cyan}${emojis.calendar} ${year}${colors.reset}`);
  console.log('-'.repeat(80) + '\n');
};

export const printTradeDetails = (trade: {
  trade_date: string;
  entry_time: string;
  exit_time: string;
  market_open: number;
  entry_price: number;
  exit_price: number;
  rise_pct: number;
  return_pct: number;
}): void => {
  const returnColor = trade.return_pct >= 0 ? colors.fg.green : colors.fg.red;
  const returnEmoji = trade.return_pct >= 0 ? emojis.success : emojis.error;

  console.log(
    `${colors.dim}${emojis.calendar} ${trade.trade_date}${colors.reset} ` +
      `${colors.dim}${emojis.clock} ${trade.entry_time.split(' ')[1]} → ${trade.exit_time.split(' ')[1]}${colors.reset} ` +
      `${colors.dim}Open: $${trade.market_open.toFixed(2)}${colors.reset} ` +
      `${colors.dim}Entry: $${trade.entry_price.toFixed(2)}${colors.reset} ` +
      `${colors.dim}Exit: $${trade.exit_price.toFixed(2)}${colors.reset} ` +
      `${colors.dim}Rise: ${trade.rise_pct.toFixed(2)}%${colors.reset} ` +
      `${returnColor}${returnEmoji} Return: ${trade.return_pct.toFixed(2)}%${colors.reset}`
  );
};

export const printYearSummary = (stats: {
  year: string;
  trading_days: number;
  match_count: number;
  min_rise_pct: number;
  max_rise_pct: number;
  avg_rise_pct: number;
  min_return: number;
  max_return: number;
  avg_return: number;
}): void => {
  const returnColor = stats.avg_return >= 0 ? colors.fg.green : colors.fg.red;
  const returnEmoji = stats.avg_return >= 0 ? emojis.success : emojis.error;

  console.log('\n' + '-'.repeat(80));
  console.log(
    `${colors.bright}${colors.fg.cyan}${emojis.chart} ${stats.year} Summary${colors.reset}`
  );
  console.log(`${colors.dim}Trading Days: ${stats.trading_days}${colors.reset}`);
  console.log(
    `${colors.dim}Trades: ${stats.match_count} (${(
      (stats.match_count / stats.trading_days) *
      100
    ).toFixed(1)}% of days)${colors.reset}`
  );
  console.log(
    `${colors.dim}Rise Range: ${stats.min_rise_pct.toFixed(2)}% to ${stats.max_rise_pct.toFixed(2)}% (avg: ${stats.avg_rise_pct.toFixed(2)}%)${colors.reset}`
  );
  console.log(
    `${colors.dim}Return Range: ${stats.min_return.toFixed(2)}% to ${stats.max_return.toFixed(2)}%${colors.reset}`
  );
  console.log(
    `${returnColor}${returnEmoji} Average Return: ${stats.avg_return.toFixed(2)}%${colors.reset}`
  );
  console.log('-'.repeat(80) + '\n');
};

export const printOverallSummary = (stats: {
  trading_days: number;
  total_matches: number;
  total_return_sum: number;
}): void => {
  const avgReturn = stats.total_matches > 0 ? stats.total_return_sum / stats.total_matches : 0;
  const returnColor = avgReturn >= 0 ? colors.fg.green : colors.fg.red;
  const returnEmoji = avgReturn >= 0 ? emojis.success : emojis.error;

  console.log('\n' + '='.repeat(80));
  console.log(`${colors.bright}${colors.fg.cyan}${emojis.chart} Overall Summary${colors.reset}`);
  console.log(`${colors.dim}Total Trading Days: ${stats.trading_days}${colors.reset}`);
  console.log(
    `${colors.dim}Total Trades: ${stats.total_matches} (${(
      (stats.total_matches / stats.trading_days) *
      100
    ).toFixed(1)}% of days)${colors.reset}`
  );
  console.log(
    `${returnColor}${returnEmoji} Average Return: ${avgReturn.toFixed(2)}%${colors.reset}`
  );
  console.log('='.repeat(80) + '\n');
};

export const printFooter = (): void => {
  console.log(`${colors.dim}${emojis.info} Analysis complete.${colors.reset}\n`);
};
