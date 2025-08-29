#!/usr/bin/env node

import dotenv from 'dotenv';
import axios from 'axios';
import chalk from 'chalk';
import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { loadConfig } from './utils/config';
import { Signal, Bar } from './patterns/types';

// Polygon.io API interfaces
interface PolygonBar {
  t: number; // timestamp in milliseconds
  o: number; // open price
  h: number; // high price
  l: number; // low price
  c: number; // close price
  v: number; // volume
}

interface PolygonResponse {
  ticker: string;
  queryCount: number;
  resultsCount: number;
  adjusted: boolean;
  results: PolygonBar[];
  status: string;
  request_id: string;
  next_url?: string;
}

// Initialize command line interface
const program = new Command();

program
  .name('scout')
  .description('AlphaGroove Entry Scout - Generate 2-day charts using Polygon API data')
  .option('--ticker <symbol>', 'Ticker symbol (overrides config)')
  .option('--date <YYYY-MM-DD>', 'Trade date (default: today)')
  .option('--time <HH:MM>', 'Entry time (default: current time)')
  .option('-v, --verbose', 'Show detailed information');

program.parse(process.argv);

/**
 * Fetch data from Polygon.io API for a date range
 */
const fetchPolygonData = async (
  ticker: string,
  fromDate: string,
  toDate: string,
  apiKey: string,
  timespan: string = 'minute',
  multiplier: number = 1
): Promise<PolygonBar[]> => {
  const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${fromDate}/${toDate}?adjusted=true&sort=asc&limit=50000&apikey=${apiKey}`;

  console.log(chalk.dim(`Fetching data from Polygon API...`));
  if (process.env.DEBUG) {
    console.log(chalk.gray(`URL: ${url.replace(apiKey, 'API_KEY_HIDDEN')}`));
  }

  try {
    const response = await axios.get<PolygonResponse>(url);

    if (response.data.status !== 'OK' && response.data.status !== 'DELAYED') {
      throw new Error(`Polygon API returned status: ${response.data.status}`);
    }

    if (response.data.status === 'DELAYED') {
      console.log(chalk.yellow('⚠️  Using delayed data from Polygon API'));
      console.log(chalk.dim(`API response includes ${response.data.results?.length || 0} bars`));

      // Show date range of actual data returned
      if (response.data.results && response.data.results.length > 0) {
        const firstBar = new Date(response.data.results[0].t);
        const lastBar = new Date(response.data.results[response.data.results.length - 1].t);
        console.log(
          chalk.dim(
            `Data spans: ${firstBar.toISOString().substring(0, 10)} to ${lastBar.toISOString().substring(0, 10)}`
          )
        );
      }
    }

    if (!response.data.results || response.data.results.length === 0) {
      throw new Error(
        `No data returned from Polygon API for ${ticker} from ${fromDate} to ${toDate}`
      );
    }

    console.log(chalk.dim(`Received ${response.data.results.length} bars from Polygon API`));
    return response.data.results;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errorMsg = `Polygon API error: ${error.response?.status} ${error.response?.statusText}`;
      console.error(chalk.red('Error fetching data from Polygon API:'), new Error(errorMsg));
      throw new Error(errorMsg);
    }
    console.error(chalk.red('Error fetching data from Polygon API:'), error);
    throw error;
  }
};

/**
 * Convert Polygon API data to our Bar format
 */
const convertPolygonData = (
  polygonBars: PolygonBar[]
): Array<{
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trade_date: string;
}> => {
  return polygonBars.map(bar => {
    const utcDate = new Date(bar.t);

    // Convert UTC to Eastern Time (EST/EDT)
    // Eastern Time is UTC-5 (EST) or UTC-4 (EDT)
    // Use toLocaleString to handle DST automatically
    const easternTime = utcDate.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    // Convert from "MM/DD/YYYY, HH:MM:SS" to "YYYY-MM-DD HH:MM:SS"
    const [datePart, timePart] = easternTime.split(', ');
    const [month, day, year] = datePart.split('/');
    const timestamp = `${year}-${month}-${day} ${timePart}`;
    const tradeDate = `${year}-${month}-${day}`;

    return {
      timestamp,
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v,
      trade_date: tradeDate,
    };
  });
};

/**
 * Get the previous trading day (skip weekends)
 */
const getPreviousTradingDay = (date: Date): string => {
  const prevDate = new Date(date);
  prevDate.setDate(prevDate.getDate() - 1);

  // Skip weekends - if it's Sunday (0) or Saturday (6), go back further
  while (prevDate.getDay() === 0 || prevDate.getDay() === 6) {
    prevDate.setDate(prevDate.getDate() - 1);
  }

  return prevDate.toISOString().substring(0, 10);
};

/**
 * Main function to generate chart using Polygon API data
 */
export const main = async (cmdOptions?: any) => {
  // Load environment variables from .env.local
  dotenv.config({ path: '.env.local' });

  try {
    const options = cmdOptions || program.opts();

    // Load config
    console.log(chalk.dim('Loading configuration...'));
    const rawConfig = loadConfig('alphagroove.config.yaml');

    // Get ticker from options or config
    const ticker = options.ticker || rawConfig.shared?.ticker || rawConfig.default?.ticker;
    if (!ticker || ticker.trim() === '') {
      console.error(
        chalk.red('Error: Ticker symbol is required. Set it in config or use --ticker option.')
      );
      process.exit(1);
    }

    // Get timeframe from config (convert to Polygon API format)
    const timeframe = rawConfig.shared?.timeframe || rawConfig.default?.timeframe || '1min';
    let multiplier = 1;
    let timespan = 'minute';

    if (timeframe === '1min') {
      multiplier = 1;
      timespan = 'minute';
    } else if (timeframe === '5min') {
      multiplier = 5;
      timespan = 'minute';
    } else if (timeframe === '15min') {
      multiplier = 15;
      timespan = 'minute';
    } else if (timeframe === '30min') {
      multiplier = 30;
      timespan = 'minute';
    } else if (timeframe === '1hour') {
      multiplier = 1;
      timespan = 'hour';
    } else if (timeframe === '1day') {
      multiplier = 1;
      timespan = 'day';
    } else {
      console.warn(chalk.yellow(`Warning: Unsupported timeframe ${timeframe}, defaulting to 1min`));
    }

    // Get Polygon API key
    const polygonConfig = rawConfig.scout?.polygon;
    if (!polygonConfig?.apiKeyEnvVar) {
      console.error(chalk.red('Error: Polygon API configuration not found.'));
      console.log(
        chalk.yellow('Make sure scout.polygon.apiKeyEnvVar is configured in your config file.')
      );
      process.exit(1);
    }

    const apiKey = process.env[polygonConfig.apiKeyEnvVar];
    if (!apiKey) {
      console.error(
        chalk.red(`Error: Environment variable ${polygonConfig.apiKeyEnvVar} not set.`)
      );
      console.log(
        chalk.yellow(
          `Please set your Polygon API key: export ${polygonConfig.apiKeyEnvVar}=your_api_key`
        )
      );
      process.exit(1);
    }

    // Get date and time
    const currentTime = new Date();
    const tradeDate = options.date || currentTime.toISOString().substring(0, 10);
    const entryTime =
      options.time ||
      `${currentTime.getHours().toString().padStart(2, '0')}:${currentTime.getMinutes().toString().padStart(2, '0')}`;

    // Calculate date range (current day + previous trading day)
    const tradeDateObj = new Date(tradeDate + 'T00:00:00');
    const previousTradingDay = getPreviousTradingDay(tradeDateObj);

    console.log(chalk.dim(`Trade date: ${tradeDate}`));
    console.log(chalk.dim(`Previous trading day: ${previousTradingDay}`));
    console.log(chalk.dim(`Entry time: ${entryTime}`));
    console.log(chalk.dim(`Timeframe: ${timeframe} (${multiplier} ${timespan})`));
    // Fetch data from Polygon API
    const polygonBars = await fetchPolygonData(
      ticker,
      previousTradingDay,
      tradeDate,
      apiKey,
      timespan,
      multiplier
    );

    // Convert to our format
    const bars = convertPolygonData(polygonBars);

    // Filter to trading hours (9:30 AM - 4:00 PM ET) and up to entry time
    const entryTimestamp = `${tradeDate} ${entryTime}:00`;

    const tradingHoursBars = bars.filter(bar => {
      // Parse timestamp directly (should already be in ET)
      const timeParts = bar.timestamp.split(' ')[1].split(':');
      const hour = parseInt(timeParts[0]);
      const minute = parseInt(timeParts[1]);
      const timeMinutes = hour * 60 + minute;

      // 9:30 AM = 570 minutes, 4:00 PM = 960 minutes (ET)
      const inTradingHours = timeMinutes >= 570 && timeMinutes <= 960;

      // Only show data up to entry time on trade date, or all data for previous day
      const isBeforeEntryTime =
        bar.trade_date < tradeDate ||
        (bar.trade_date === tradeDate && bar.timestamp <= entryTimestamp);

      return inTradingHours && isBeforeEntryTime;
    });

    if (tradingHoursBars.length === 0) {
      console.error(chalk.red('Error: No trading hours data found in the fetched data.'));
      process.exit(1);
    }

    console.log(chalk.dim(`Filtered to ${tradingHoursBars.length} bars during trading hours`));

    // Create entry signal for chart generation
    // Use the last available bar as the entry point since we only have previous day data
    const lastBar = tradingHoursBars[tradingHoursBars.length - 1];

    if (!lastBar) {
      console.error(chalk.red('Error: No trading hours data available.'));
      process.exit(1);
    }

    // Check if we have current day data
    const hasCurrentDayData = tradingHoursBars.some(bar => bar.trade_date === tradeDate);

    let entrySignal: Signal;
    if (hasCurrentDayData) {
      // Use actual entry time if we have current day data
      const entryBar =
        tradingHoursBars.find(bar => bar.timestamp.startsWith(`${tradeDate} ${entryTime}`)) ||
        lastBar;

      entrySignal = {
        timestamp: entryTimestamp,
        price: entryBar.close,
        type: 'entry',
      };
    } else {
      // No current day data - use last bar of previous day as entry point
      console.log(
        chalk.yellow(
          `⚠️  No data available for ${tradeDate}. Using last available data from ${lastBar.trade_date}.`
        )
      );

      entrySignal = {
        timestamp: lastBar.timestamp, // Use actual timestamp that exists in data
        price: lastBar.close,
        type: 'entry',
      };
    }

    // Generate chart using shared chart generation logic
    const patternName = 'scout';
    console.log(chalk.dim('Generating chart...'));

    try {
      const chartPath = await generateScoutChart({
        ticker,
        timeframe,
        entryPatternName: patternName,
        tradeDate,
        entryTimestamp: entrySignal.timestamp, // Use actual entry timestamp
        entrySignal,
        data: tradingHoursBars,
      });

      if (chartPath) {
        console.log(chalk.green(`\n✅ Chart generated successfully!`));
        console.log(chalk.bold(`Chart saved to: ${chartPath}`));

        // Also generate the complete chart
        const completeChartPath = chartPath.replace('.png', '_complete.png');
        console.log(chalk.dim(`Complete chart: ${completeChartPath}`));

        if (options.verbose) {
          console.log(chalk.dim(`\nChart details:`));
          console.log(chalk.dim(`- Ticker: ${ticker}`));
          console.log(chalk.dim(`- Date range: ${previousTradingDay} to ${tradeDate}`));
          console.log(chalk.dim(`- Entry time: ${entryTime}`));
          console.log(chalk.dim(`- Entry price: $${entrySignal.price.toFixed(2)}`));
          console.log(chalk.dim(`- Data points: ${tradingHoursBars.length}`));
          console.log(chalk.dim(`- Timeframe: ${timeframe}`));
        }
      } else {
        console.error(chalk.red('Error: Chart generation returned empty path'));
        process.exit(1);
      }
    } catch (chartError) {
      console.error(chalk.red('Error generating chart:'), chartError);
      process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red('Error in scout:'), error);
    process.exit(1);
  }
};

interface ScoutChartOptions {
  ticker: string;
  timeframe: string;
  entryPatternName: string;
  tradeDate: string;
  entryTimestamp: string;
  entrySignal: Signal;
  data: Bar[];
}

/**
 * Generate SVG chart specifically for scout with filtered trading hours data
 * This ensures we only show the data we've filtered, unlike the backtest chart generator
 */
const generateScoutSvgChart = (
  ticker: string,
  patternName: string,
  data: Bar[],
  entrySignal: Signal,
  showComplete: boolean
): string => {
  const width = 1200;
  const height = 800;
  const marginTop = 70;
  const marginRight = 50;
  const marginBottom = 150;
  const marginLeft = 70;
  const chartWidth = width - marginLeft - marginRight;
  const chartHeight = (height - marginTop - marginBottom) * 0.7;
  const volumeHeight = (height - marginTop - marginBottom) * 0.3;
  const volumeTop = marginTop + chartHeight + 20;

  // Use only the filtered data we were given
  const chartData = data;

  if (chartData.length === 0) {
    return '<svg><text>No data available</text></svg>';
  }

  // Calculate price and volume ranges
  const prices = chartData.flatMap(d => [d.open, d.high, d.low, d.close]);
  const volumes = chartData.map(d => d.volume);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const maxVolume = Math.max(...volumes);

  // Add some padding to price range
  const priceRange = maxPrice - minPrice;
  const paddedMinPrice = minPrice - priceRange * 0.1;
  const paddedMaxPrice = maxPrice + priceRange * 0.1;

  // Create scales
  const priceScale = (price: number) => {
    return (
      chartHeight - ((price - paddedMinPrice) / (paddedMaxPrice - paddedMinPrice)) * chartHeight
    );
  };

  const volumeScale = (volume: number) => {
    return (volume / maxVolume) * volumeHeight;
  };

  const timeScale = (index: number) => {
    return (index / (chartData.length - 1)) * chartWidth;
  };

  // Generate time labels - show actual times from our filtered data
  const timeLabels = [];
  const labelCount = 8;
  for (let i = 0; i < labelCount; i++) {
    const dataIndex = Math.floor((i / (labelCount - 1)) * (chartData.length - 1));
    const bar = chartData[dataIndex];
    const time = bar.timestamp.split(' ')[1].substring(0, 5); // HH:MM
    timeLabels.push({
      x: marginLeft + timeScale(dataIndex),
      label: time,
    });
  }

  // Create SVG
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;

  // Background
  svg += `<rect width="${width}" height="${height}" fill="white"/>`;

  // Title
  const currentPrice = entrySignal.price.toFixed(2);
  const entryTime = entrySignal.timestamp.split(' ')[1].substring(0, 5);
  const title = showComplete ? `${ticker} - scout` : `${ticker} - scout`;
  const subtitle = `Date: XXX, Time: ${entryTime}, Current Price: $${currentPrice}`;

  svg += `<text x="${width / 2}" y="30" text-anchor="middle" font-size="20" font-weight="bold">${title}</text>`;
  svg += `<text x="${width / 2}" y="50" text-anchor="middle" font-size="14">${subtitle}</text>`;

  // Price chart area
  svg += `<rect x="${marginLeft}" y="${marginTop}" width="${chartWidth}" height="${chartHeight}" fill="none" stroke="#ccc"/>`;

  // Candlesticks
  chartData.forEach((bar, i) => {
    const x = marginLeft + timeScale(i);
    const openY = marginTop + priceScale(bar.open);
    const closeY = marginTop + priceScale(bar.close);
    const highY = marginTop + priceScale(bar.high);
    const lowY = marginTop + priceScale(bar.low);

    const isGreen = bar.close >= bar.open;
    const color = isGreen ? '#4CAF50' : '#F44336';
    const candleWidth = Math.max(1, (chartWidth / chartData.length) * 0.8);

    // High-low line
    svg += `<line x1="${x}" y1="${highY}" x2="${x}" y2="${lowY}" stroke="${color}" stroke-width="1"/>`;

    // Body
    const bodyTop = Math.min(openY, closeY);
    const bodyHeight = Math.abs(closeY - openY);
    svg += `<rect x="${x - candleWidth / 2}" y="${bodyTop}" width="${candleWidth}" height="${Math.max(1, bodyHeight)}" fill="${color}" stroke="${color}"/>`;
  });

  // Entry signal marker
  const entryIndex = chartData.findIndex(bar => bar.timestamp === entrySignal.timestamp);
  if (entryIndex >= 0) {
    const entryX = marginLeft + timeScale(entryIndex);
    const entryY = marginTop + priceScale(entrySignal.price);
    svg += `<line x1="${entryX}" y1="${marginTop}" x2="${entryX}" y2="${marginTop + chartHeight}" stroke="blue" stroke-width="2"/>`;
    svg += `<circle cx="${entryX}" cy="${entryY}" r="5" fill="blue"/>`;
    svg += `<text x="${entryX + 10}" y="${entryY - 10}" font-size="12" fill="blue">Entry</text>`;
  }

  // Volume chart
  svg += `<rect x="${marginLeft}" y="${volumeTop}" width="${chartWidth}" height="${volumeHeight}" fill="none" stroke="#ccc"/>`;

  chartData.forEach((bar, i) => {
    const x = marginLeft + timeScale(i);
    const volumeBarHeight = volumeScale(bar.volume);
    const isGreen = bar.close >= bar.open;
    const color = isGreen ? '#81C784' : '#E57373';
    const barWidth = Math.max(1, (chartWidth / chartData.length) * 0.8);

    svg += `<rect x="${x - barWidth / 2}" y="${volumeTop + volumeHeight - volumeBarHeight}" width="${barWidth}" height="${volumeBarHeight}" fill="${color}"/>`;
  });

  // Price axis labels
  const priceLabels = 5;
  for (let i = 0; i < priceLabels; i++) {
    const price = paddedMinPrice + (paddedMaxPrice - paddedMinPrice) * (i / (priceLabels - 1));
    const y = marginTop + chartHeight - (i / (priceLabels - 1)) * chartHeight;
    svg += `<text x="${marginLeft - 10}" y="${y + 5}" text-anchor="end" font-size="12">$${price.toFixed(2)}</text>`;
    svg += `<line x1="${marginLeft}" y1="${y}" x2="${marginLeft + chartWidth}" y2="${y}" stroke="#eee" stroke-width="1"/>`;
  }

  // Time axis labels
  timeLabels.forEach(({ x, label }) => {
    svg += `<text x="${x}" y="${marginTop + chartHeight + 20}" text-anchor="middle" font-size="12">${label}</text>`;
    svg += `<line x1="${x}" y1="${marginTop}" x2="${x}" y2="${marginTop + chartHeight}" stroke="#eee" stroke-width="1"/>`;
  });

  // Axis labels
  svg += `<text x="${marginLeft + chartWidth / 2}" y="${height - 20}" text-anchor="middle" font-size="14">Time</text>`;
  svg += `<text x="20" y="${marginTop + chartHeight / 2}" text-anchor="middle" font-size="14" transform="rotate(-90 20 ${marginTop + chartHeight / 2})">Price ($)</text>`;
  svg += `<text x="20" y="${volumeTop + volumeHeight / 2}" text-anchor="middle" font-size="12" transform="rotate(-90 20 ${volumeTop + volumeHeight / 2})">Volume</text>`;

  // Signal day label
  if (chartData.length > 0) {
    svg += `<text x="${marginLeft + 10}" y="${marginTop + 20}" font-size="12" fill="gray">Signal Day</text>`;
  }

  svg += '</svg>';
  return svg;
};

/**
 * Generate chart using the same logic as backtest but with Polygon data
 * This replicates the chart generation from utils/chart-generator.ts
 */
const generateScoutChart = async (options: ScoutChartOptions): Promise<string> => {
  const { ticker, entryPatternName, tradeDate, entrySignal, data } = options;

  // Create timestamp-based filename for scout charts
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const patternDir = path.join('./charts', entryPatternName);
  fs.mkdirSync(patternDir, { recursive: true });

  const baseFileName = `${timestamp}_${ticker}_${tradeDate.replace(/-/g, '')}`;
  const svgOutputPathLlm = path.join(patternDir, `${baseFileName}_llm_temp.svg`);
  const svgOutputPathComplete = path.join(patternDir, `${baseFileName}_complete_temp.svg`);
  const pngOutputPath = path.join(patternDir, `${baseFileName}.png`);
  const completePngOutputPath = path.join(patternDir, `${baseFileName}_complete.png`);

  if (!data || data.length === 0) {
    console.warn(`No data provided for chart generation.`);
    return '';
  }

  // Use our own chart generation that respects the filtered data
  // This ensures we only show trading hours data without affecting backtest logic
  const svgLlm = generateScoutSvgChart(ticker, entryPatternName, data, entrySignal, false);
  fs.writeFileSync(svgOutputPathLlm, svgLlm, 'utf-8');

  const svgComplete = generateScoutSvgChart(ticker, entryPatternName, data, entrySignal, true);
  fs.writeFileSync(svgOutputPathComplete, svgComplete, 'utf-8');

  try {
    // Generate the original chart for LLM
    await sharp(svgOutputPathLlm, { density: 300 })
      .flatten({ background: '#FFFFFF' })
      .png()
      .toFile(pngOutputPath);

    // Generate the "complete" 2-day chart for analysis
    await sharp(svgOutputPathComplete, { density: 300 })
      .flatten({ background: '#FFFFFF' })
      .png()
      .toFile(completePngOutputPath);

    fs.unlinkSync(svgOutputPathLlm);
    fs.unlinkSync(svgOutputPathComplete);
    return pngOutputPath;
  } catch (err) {
    console.error(`Error generating PNG from SVG for ${baseFileName}:`, err);
    throw err;
  }
};

// Run only if executed directly (not when imported)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main();
}
