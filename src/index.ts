#!/usr/bin/env node

import { execSync } from 'child_process';

import { Command } from 'commander';

import { quickRisePattern } from './patterns/entry/quick-rise.js';
import { fixedTimeExitPattern } from './patterns/exit/fixed-time.js';

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

interface ReadSpyOptions {
  from: string;
  to: string;
}

const program = new Command();

program
  .name('alphagroove')
  .description(
    'A command-line research and strategy toolkit for exploring intraday trading patterns'
  )
  .version('0.1.0');

program
  .command('read-spy')
  .description('Read SPY data with date filtering')
  .requiredOption('--from <date>', 'Start date (YYYY-MM-DD)')
  .requiredOption('--to <date>', 'End date (YYYY-MM-DD)')
  .action(async (options: ReadSpyOptions) => {
    try {
      // First, get the statistics and pattern matches from DuckDB
      const query = `
        WITH raw_data AS (
          SELECT 
            column0::TIMESTAMP as timestamp,
            column1::DOUBLE as open,
            column2::DOUBLE as high,
            column3::DOUBLE as low,
            column4::DOUBLE as close,
            column5::BIGINT as volume,
            strftime(column0, '%Y-%m-%d') as trade_date,
            strftime(column0, '%Y') as year
          FROM read_csv_auto('tickers/SPY/SPY_full_1min_adjsplit.csv', header=false)
          WHERE column0 >= '${options.from} 00:00:00'
            AND column0 <= '${options.to} 23:59:59'
        ),
        daily_stats AS (
          SELECT 
            trade_date,
            year,
            COUNT(*) as bar_count,
            MIN(low) as day_low,
            MAX(high) as day_high,
            SUM(volume) as day_volume,
            MIN(timestamp) as day_start,
            MAX(timestamp) as day_end
          FROM raw_data
          WHERE strftime(timestamp, '%H:%M') BETWEEN '09:30' AND '16:00'  -- Only count regular market hours
          GROUP BY trade_date, year
        ),
        yearly_stats AS (
          SELECT 
            year,
            SUM(bar_count) as total_bars,  -- Sum the daily bar counts
            COUNT(DISTINCT trade_date) as trading_days,
            MIN(day_low) as min_price,
            MAX(day_high) as max_price,
            SUM(day_volume) as total_volume,
            MIN(day_start) as first_bar,
            MAX(day_end) as last_bar
          FROM daily_stats
          GROUP BY year
        ),
        market_open_prices AS (
          SELECT 
            trade_date,
            year,
            open as market_open,
            timestamp as market_open_time
          FROM raw_data
          WHERE strftime(timestamp, '%H:%M') = '09:30'
        ),
        five_min_prices AS (
          SELECT 
            m.trade_date,
            m.year,
            m.market_open,
            r.high as five_min_high,
            r.timestamp as entry_time
          FROM market_open_prices m
          JOIN raw_data r ON m.trade_date = r.trade_date
          WHERE strftime(r.timestamp, '%H:%M') = '09:35'
        ),
        exit_prices AS (
          SELECT 
            f.trade_date,
            f.year,
            f.market_open,
            f.five_min_high,
            f.entry_time,
            r.close as exit_price,
            r.timestamp as exit_time
          FROM five_min_prices f
          JOIN raw_data r ON f.trade_date = r.trade_date
          WHERE strftime(r.timestamp, '%H:%M') = '09:45'  -- Get exactly 9:45am bar
        ),
        entry_triggers AS (
          SELECT 
            trade_date,
            year,
            COUNT(*) as trigger_count
          FROM (
            SELECT 
              trade_date,
              year,
              FIRST_VALUE(open) OVER (PARTITION BY trade_date ORDER BY timestamp) as market_open,
              MAX(high) OVER (
                PARTITION BY trade_date 
                ORDER BY timestamp 
                ROWS BETWEEN CURRENT ROW AND 4 FOLLOWING
              ) as five_min_high
            FROM raw_data
            WHERE strftime(timestamp, '%H:%M') = '09:30'
          ) t
          WHERE (five_min_high - market_open) / market_open >= 0.003  -- 0.3% rise
          GROUP BY trade_date, year
        ),
        trigger_stats AS (
          SELECT 
            year,
            COUNT(*) as days_with_triggers
          FROM entry_triggers
          GROUP BY year
        ),
        pattern_matches AS (
          ${quickRisePattern.sql}
        )
        SELECT 
          y.year,
          y.total_bars,
          y.trading_days,
          y.min_price,
          y.max_price,
          y.total_volume,
          y.first_bar,
          y.last_bar,
          COALESCE(t.days_with_triggers, 0) as days_with_triggers,
          COALESCE(p.match_count, 0) as match_count,
          COALESCE(p.total_returns, 0) as total_returns,
          p.min_rise_pct,
          p.max_rise_pct,
          p.avg_rise_pct,
          p.min_return,
          p.max_return,
          p.avg_return,
          p.min_entry,
          p.max_entry,
          p.min_exit,
          p.max_exit
        FROM yearly_stats y
        LEFT JOIN trigger_stats t ON y.year = t.year
        LEFT JOIN pattern_matches p ON y.year = p.year
        ORDER BY y.year;
      `;

      const result = execSync(`duckdb -json -c "${query}"`, {
        encoding: 'utf-8',
        maxBuffer: 100 * 1024 * 1024,
      });
      const yearlyStats = JSON.parse(result);

      // Process and display results by year
      console.log(
        `\n${colors.bright}${emojis.chart} SPY Analysis (${options.from} to ${options.to}):${colors.reset}`
      );
      console.log(
        `${colors.cyan}${emojis.info} Entry Pattern: ${quickRisePattern.name}${colors.reset}`
      );
      console.log(
        `${colors.cyan}${emojis.info} Exit Pattern: ${fixedTimeExitPattern.name}${colors.reset}`
      );

      let totalStats = {
        total_bars: 0,
        trading_days: 0,
        min_price: Infinity,
        max_price: -Infinity,
        total_volume: 0,
        total_matches: 0,
        total_returns: 0,
        total_return_sum: 0,
      };

      for (const stats of yearlyStats) {
        // Update total statistics
        totalStats.total_bars += stats.total_bars;
        totalStats.trading_days += stats.trading_days;
        totalStats.min_price = Math.min(totalStats.min_price, stats.min_price);
        totalStats.max_price = Math.max(totalStats.max_price, stats.max_price);
        totalStats.total_volume += stats.total_volume;
        totalStats.total_matches += stats.match_count;
        if (stats.match_count > 0) {
          totalStats.total_return_sum += stats.avg_return * stats.match_count;
        }

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
      }

      // Display overall statistics
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

      // Note about detailed matches
      console.log(
        `\n${colors.yellow}${emojis.info} Note: Run with a shorter date range to see detailed pattern matches.${colors.reset}`
      );
    } catch (error) {
      console.error(`${colors.red}${emojis.failure} Error:${colors.reset}`, error);
      process.exit(1);
    }
  });

program.parse();
