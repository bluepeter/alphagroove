import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { Bar, Signal } from '../patterns/types';

export interface ScoutChartOptions {
  ticker: string;
  entryPatternName: string;
  tradeDate: string;
  entrySignal: Signal;
  data: Bar[];
}

/**
 * Generate SVG chart specifically for scout (filtered data only)
 * This ensures we only show the data we've filtered, unlike the backtest chart generator
 */
export const generateScoutSvgChart = (
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

  // No entry marker - we haven't decided to enter yet!

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
export const generateScoutChart = async (options: ScoutChartOptions): Promise<string> => {
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
