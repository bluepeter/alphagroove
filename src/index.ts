#!/usr/bin/env node

import { execSync } from 'child_process';

import { Command } from 'commander';

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
      // Construct DuckDB query
      const query = `
        WITH raw_data AS (
          SELECT 
            column0::VARCHAR as timestamp_str,
            column1::DOUBLE as open,
            column2::DOUBLE as high,
            column3::DOUBLE as low,
            column4::DOUBLE as close,
            column5::BIGINT as volume
          FROM read_csv_auto('tickers/SPY/SPY_full_1min_adjsplit.csv', header=false)
        )
        SELECT 
          strptime(timestamp_str, '%Y-%m-%d %H:%M:%S') AS timestamp,
          open, high, low, close, volume
        FROM raw_data
        WHERE timestamp_str >= '${options.from} 00:00:00'
          AND timestamp_str <= '${options.to} 23:59:59'
        ORDER BY timestamp_str;
      `;

      // Run query using DuckDB CLI
      const result = execSync(`duckdb -json -c "${query}"`, { encoding: 'utf-8' });
      const data = JSON.parse(result) as Array<{
        timestamp: string;
        open: number;
        high: number;
        low: number;
        close: number;
        volume: number;
      }>;

      // Print summary
      console.log(`\nSPY Data Summary (${options.from} to ${options.to}):`);
      console.log(`Total bars: ${data.length}`);
      if (data.length > 0) {
        console.log(`First bar: ${data[0].timestamp}`);
        console.log(`Last bar: ${data[data.length - 1].timestamp}`);
        console.log(
          `Price range: $${Math.min(...data.map(r => r.low)).toFixed(2)} - $${Math.max(...data.map(r => r.high)).toFixed(2)}`
        );
      }
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

program.parse();
