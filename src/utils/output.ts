// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

// Emojis
const emojis = {
  chart: '📊',
  calendar: '📅',
  money: '💰',
  arrow: '➡️',
  warning: '⚠️',
  info: 'ℹ️',
  success: '✅',
  failure: '❌',
};

export const printHeader = (
  entryPatternName: string,
  exitPatternName: string,
  fromDate: string,
  toDate: string
) => {
  console.log(
    `\n${colors.bright}${emojis.chart} SPY Analysis (${fromDate} to ${toDate}):${colors.reset}`
  );
  console.log(`${colors.cyan}${emojis.info} Entry Pattern: ${entryPatternName}${colors.reset}`);
  console.log(`${colors.cyan}${emojis.info} Exit Pattern: ${exitPatternName}${colors.reset}`);
};

export const printYearlySummary = (stats: any) => {
  console.log(`\n${colors.bright}${emojis.calendar} ${stats.year} Summary:${colors.reset}`);
  console.log(`${colors.dim}Trading days: ${stats.trading_days}${colors.reset}`);

  if (stats.match_count > 0) {
    console.log(`\n${colors.bright}${emojis.money} Pattern Statistics:${colors.reset}`);
    console.log(
      `${colors.cyan}Trades executed: ${stats.match_count} (${((stats.match_count / stats.trading_days) * 100).toFixed(1)}% of days)${colors.reset}`
    );
    console.log(
      `${colors.green}Rise %: ${stats.min_rise_pct.toFixed(2)}% to ${stats.max_rise_pct.toFixed(2)}% (avg: ${stats.avg_rise_pct.toFixed(2)}%)${colors.reset}`
    );

    const avgReturn = stats.avg_return;
    const returnColor = avgReturn >= 0 ? colors.green : colors.red;
    const returnEmoji = avgReturn >= 0 ? emojis.success : emojis.failure;

    console.log(
      `${returnColor}${returnEmoji} Returns: ${stats.min_return.toFixed(2)}% to ${stats.max_return.toFixed(2)}% (avg: ${stats.avg_return.toFixed(2)}%)${colors.reset}`
    );
  } else {
    console.log(`\n${colors.yellow}${emojis.warning} No trades executed${colors.reset}`);
  }
};

export const printOverallSummary = (totalStats: any) => {
  console.log(`\n${colors.bright}${emojis.chart} Overall Summary:${colors.reset}`);
  console.log(`${colors.dim}Trading days: ${totalStats.trading_days}${colors.reset}`);
  console.log(
    `${colors.bright}Total trades executed: ${totalStats.total_matches} (${((totalStats.total_matches / totalStats.trading_days) * 100).toFixed(1)}% of days)${colors.reset}`
  );
  if (totalStats.total_matches > 0) {
    const overallAvgReturn = totalStats.total_return_sum / totalStats.total_matches;
    const overallColor = overallAvgReturn >= 0 ? colors.green : colors.red;
    const overallEmoji = overallAvgReturn >= 0 ? emojis.success : emojis.failure;
    console.log(
      `${overallColor}${overallEmoji} Overall average return: ${overallAvgReturn.toFixed(2)}%${colors.reset}`
    );
  }
};

export const printFooter = () => {
  console.log(
    `\n${colors.yellow}${emojis.info} Note: Run with a shorter date range to see detailed pattern matches.${colors.reset}`
  );
};
