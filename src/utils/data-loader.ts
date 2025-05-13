import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { Bar } from './calculations';

export const fetchTradesFromQuery = (query: string): Array<Record<string, string | number>> => {
  const tempFile = join(process.cwd(), 'temp_query.sql');
  try {
    writeFileSync(tempFile, query, 'utf-8');
    const result = execSync(`duckdb -csv -header < ${tempFile}`, {
      encoding: 'utf-8',
      maxBuffer: 100 * 1024 * 1024, // 100MB buffer
    });

    const [headerLine, ...lines] = result.trim().split('\n');
    if (!headerLine && lines.length === 0) {
      // Handle case where result is empty or only a newline character
      return [];
    }
    if (!headerLine && lines.length > 0 && lines.every(l => l.trim() === '')) {
      // Handle case where result is only newlines
      return [];
    }
    if (!headerLine) {
      // If there's no header but there are lines, it's unexpected data or an error state.
      // For robustness, we could throw an error or log a warning.
      // For now, returning empty array to prevent crash, assuming malformed/empty CSV.
      console.warn('[data-loader] Query returned data without a header line.');
      return [];
    }

    const columns = headerLine.split(',');

    return lines
      .filter(line => line.trim() !== '') // Ensure empty lines are skipped
      .map(line => {
        const values = line.split(',');
        return columns.reduce(
          (obj, col, i) => {
            const value = values[i];
            // Attempt to convert to number if possible, otherwise keep as string
            // Ensure that empty strings or strings that are not numbers are kept as strings
            obj[col.trim()] =
              value && value.trim() !== '' && !isNaN(Number(value)) ? Number(value) : value;
            return obj;
          },
          {} as Record<string, string | number>
        );
      });
  } finally {
    if (existsSync(tempFile)) {
      unlinkSync(tempFile);
    }
  }
};

/**
 * Fetch all bars for a specific trading day after entry time
 * @param ticker Stock ticker symbol
 * @param timeframe Bar timeframe (e.g., '1min')
 * @param tradeDate Trading date (YYYY-MM-DD)
 * @param entryTime Entry time (HH:MM:SS)
 * @returns Array of bars for the trading day after entry time
 */
export const fetchBarsForTradingDay = (
  ticker: string,
  timeframe: string,
  tradeDate: string,
  entryTime: string
): Bar[] => {
  const query = `
    WITH raw_data AS (
      SELECT 
        column0::TIMESTAMP as timestamp,
        column1::DOUBLE as open,
        column2::DOUBLE as high,
        column3::DOUBLE as low,
        column4::DOUBLE as close,
        column5::BIGINT as volume
      FROM read_csv_auto('tickers/${ticker}/${timeframe}.csv', header=false)
      WHERE column0 >= '${tradeDate} 00:00:00' 
        AND column0 <= '${tradeDate} 23:59:59'
    )
    SELECT 
      timestamp,
      open,
      high,
      low,
      close,
      volume
    FROM raw_data
    WHERE timestamp >= TIMESTAMP '${tradeDate} ${entryTime}'
    ORDER BY timestamp ASC
  `;

  const rawBars = fetchTradesFromQuery(query);

  return rawBars.map(bar => ({
    timestamp: bar.timestamp as string,
    open: bar.open as number,
    high: bar.high as number,
    low: bar.low as number,
    close: bar.close as number,
    volume: bar.volume as number | undefined,
  }));
};

/**
 * Fetch bars before entry for ATR calculation
 * @param ticker Stock ticker symbol
 * @param timeframe Bar timeframe (e.g., '1min')
 * @param tradeDate Trading date (YYYY-MM-DD)
 * @param entryTime Entry time (HH:MM:SS)
 * @param periods Number of bars needed for ATR calculation
 * @returns Array of bars for ATR calculation
 */
export const fetchBarsForATR = (
  ticker: string,
  timeframe: string,
  tradeDate: string,
  entryTime: string,
  periods: number = 14
): Bar[] => {
  const query = `
    WITH raw_data AS (
      SELECT 
        column0::TIMESTAMP as timestamp,
        column1::DOUBLE as open,
        column2::DOUBLE as high,
        column3::DOUBLE as low,
        column4::DOUBLE as close,
        column5::BIGINT as volume
      FROM read_csv_auto('tickers/${ticker}/${timeframe}.csv', header=false)
    )
    SELECT 
      timestamp,
      open,
      high,
      low,
      close,
      volume
    FROM raw_data
    WHERE timestamp <= TIMESTAMP '${tradeDate} ${entryTime}'
    ORDER BY timestamp DESC
    LIMIT ${periods + 1}
  `;

  const rawBars = fetchTradesFromQuery(query);

  // Sort bars in ascending order for calculation
  return rawBars
    .map(bar => ({
      timestamp: bar.timestamp as string,
      open: bar.open as number,
      high: bar.high as number,
      low: bar.low as number,
      close: bar.close as number,
      volume: bar.volume as number | undefined,
    }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
};

/**
 * Fetches all 1-minute bars for the full trading day immediately preceding a given signal date.
 * @param ticker The stock ticker symbol.
 * @param timeframe The data timeframe (should be '1min' or adaptable).
 * @param signalDate The reference date for the signal (YYYY-MM-DD).
 * @returns A promise that resolves to an array of Bar objects for the prior trading day, or an empty array.
 */
export const getPriorDayTradingBars = async (
  ticker: string,
  timeframe: string, // Typically '1min' for this use case
  signalDate: string // YYYY-MM-DD format
): Promise<Bar[]> => {
  const tempFile = join(process.cwd(), 'temp_prior_day_query.sql');
  const dataFilePath = `tickers/${ticker}/${timeframe}.csv`;

  // Query to find the most recent trading day strictly before the signalDate
  const priorDayQuery = `
    WITH AllAvailableTradingDays AS (
      SELECT DISTINCT strftime(column0::TIMESTAMP, '%Y-%m-%d') AS trade_date_str
      FROM read_csv_auto('${dataFilePath}', header=false)
      WHERE strftime(column0::TIMESTAMP, '%Y-%m-%d') < '${signalDate}'
    )
    SELECT trade_date_str
    FROM AllAvailableTradingDays
    ORDER BY trade_date_str DESC
    LIMIT 1;
  `;

  let priorTradingDateStr = '';
  try {
    writeFileSync(tempFile, priorDayQuery, 'utf-8');
    const result = execSync(`duckdb -csv < ${tempFile}`, {
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024,
    });
    const lines = result.trim().split('\n');
    priorTradingDateStr = lines.length > 0 ? lines[lines.length - 1].trim() : '';
    if (priorTradingDateStr === 'trade_date_str') {
      // Handle case where only header might be left if no data rows
      priorTradingDateStr = '';
    }
  } catch (error) {
    console.error(`Error fetching prior trading day for ${signalDate} for ${ticker}:`, error);
    if (existsSync(tempFile)) unlinkSync(tempFile);
    return [];
  }

  if (!priorTradingDateStr) {
    console.warn(`No prior trading day string found before ${signalDate} for ${ticker}.`);
    if (existsSync(tempFile)) unlinkSync(tempFile);
    return [];
  }

  // Query to fetch all bars for that determined prior trading day during market hours
  const barsQuery = `
    SELECT 
      column0::TIMESTAMP as timestamp,
      column1::DOUBLE as open,
      column2::DOUBLE as high,
      column3::DOUBLE as low,
      column4::DOUBLE as close,
      column5::BIGINT as volume,
      strftime(column0::TIMESTAMP, '%Y-%m-%d') as trade_date 
    FROM read_csv_auto('${dataFilePath}', header=false)
    WHERE strftime(column0::TIMESTAMP, '%Y-%m-%d') = '${priorTradingDateStr}'
      AND strftime(column0::TIMESTAMP, '%H:%M') BETWEEN '09:30' AND '16:00'
    ORDER BY timestamp ASC;
  `;

  try {
    writeFileSync(tempFile, barsQuery, 'utf-8');
    const result = execSync(`duckdb -csv -header < ${tempFile}`, {
      encoding: 'utf-8',
      maxBuffer: 100 * 1024 * 1024, // 100MB buffer
    });
    const [headerLine, ...lines] = result.trim().split('\n');
    if (!headerLine || lines.length === 0) {
      return [];
    }
    const columns = headerLine.split(',');
    return lines
      .filter(line => line.trim() !== '')
      .map(line => {
        const values = line.split(',');
        const row = columns.reduce(
          (obj, col, i) => {
            const value = values[i];
            obj[col.trim()] =
              value && value.trim() !== '' && !isNaN(Number(value)) ? Number(value) : value;
            return obj;
          },
          {} as Record<string, string | number>
        );
        return {
          timestamp: row.timestamp as string,
          open: row.open as number,
          high: row.high as number,
          low: row.low as number,
          close: row.close as number,
          volume: row.volume as number | undefined,
          trade_date: row.trade_date as string,
        };
      });
  } catch (error) {
    console.error(`Error fetching bars for prior day ${priorTradingDateStr} for ${ticker}:`, error);
    return [];
  } finally {
    if (existsSync(tempFile)) {
      unlinkSync(tempFile);
    }
  }
};
