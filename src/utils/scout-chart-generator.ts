import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { Bar, Signal } from '../patterns/types';
import { generateSvgChart } from './chart-generator';
import type { DailyBar } from './sma-calculator';

export interface ScoutChartOptions {
  ticker: string;
  entryPatternName: string;
  tradeDate: string;
  entrySignal: Signal;
  data: Bar[];
  allData: Bar[];
  dailyBars?: DailyBar[];
  suppressSma?: boolean;
  suppressVwap?: boolean;
}

export type LlmDecision = 'long' | 'short' | 'do_nothing';

/**
 * Add LLM decision result overlay to an existing chart
 */
export const addLlmResultOverlay = async (
  originalChartPath: string,
  decision: LlmDecision
): Promise<string> => {
  const resultChartPath = originalChartPath.replace('_masked.png', '_masked_result.png');

  // Define colors and text for each decision
  const decisionConfig = {
    long: { text: 'LONG', color: '#22C55E' }, // Green
    short: { text: 'SHORT', color: '#EF4444' }, // Red
    do_nothing: { text: 'DO NOTHING', color: '#F59E0B' }, // Orange/Yellow
  };

  const config = decisionConfig[decision];
  const overlayText = config.text;

  try {
    // Get image dimensions to calculate positioning
    const { width, height } = await sharp(originalChartPath).metadata();

    if (!width || !height) {
      throw new Error('Could not determine image dimensions');
    }

    // Create text overlay SVG with smaller font size positioned below chart
    const fontSize = Math.min(width, height) * 0.1; // 10% of the smaller dimension (reduced from 15%)
    const textSvg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="4" dy="4" stdDeviation="8" flood-color="rgba(0,0,0,0.5)"/>
          </filter>
        </defs>
        <text 
          x="${width / 2}" 
          y="${height - fontSize * 0.3}" 
          text-anchor="middle" 
          font-family="Arial Black, Arial, sans-serif" 
          font-size="${fontSize}" 
          font-weight="900"
          fill="${config.color}"
          filter="url(#shadow)"
          stroke="white"
          stroke-width="2"
        >${overlayText}</text>
      </svg>
    `;

    // Overlay the text on the original chart
    await sharp(originalChartPath)
      .composite([
        {
          input: Buffer.from(textSvg),
          blend: 'over',
        },
      ])
      .png()
      .toFile(resultChartPath);

    return resultChartPath;
  } catch (error) {
    console.error(`Error adding LLM result overlay:`, error);
    throw error;
  }
};

/**
 * Generate chart using the same logic as backtest but with Polygon data
 * This reuses the existing chart generation from utils/chart-generator.ts
 */
export const generateScoutChart = async (options: ScoutChartOptions): Promise<string> => {
  const {
    ticker,
    entryPatternName,
    tradeDate,
    entrySignal,
    data,
    allData,
    dailyBars,
    suppressSma = false,
    suppressVwap = false,
  } = options;

  // Create timestamp-based filename for scout charts
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const patternDir = path.join('./charts', entryPatternName);
  fs.mkdirSync(patternDir, { recursive: true });

  const baseFileName = `${timestamp}_${ticker}_${tradeDate.replace(/-/g, '')}`;
  const svgOutputPathLlm = path.join(patternDir, `${baseFileName}_masked_temp.svg`);
  const svgOutputPathComplete = path.join(patternDir, `${baseFileName}_complete_temp.svg`);
  const pngOutputPath = path.join(patternDir, `${baseFileName}_masked.png`);
  const completePngOutputPath = path.join(patternDir, `${baseFileName}_complete.png`);

  if (!allData || allData.length === 0) {
    console.warn(`No data provided for chart generation.`);
    return '';
  }

  // Use the existing chart generation logic from backtest
  // For LLM chart: use filtered data (up to entry time) with anonymization
  const svgLlm = generateSvgChart(
    ticker,
    entryPatternName,
    data,
    entrySignal,
    false,
    true,
    dailyBars,
    suppressSma,
    suppressVwap
  );
  fs.writeFileSync(svgOutputPathLlm, svgLlm, 'utf-8');

  // For complete chart: use all trading hours data without anonymization
  const svgComplete = generateSvgChart(
    ticker,
    entryPatternName,
    allData,
    entrySignal,
    true,
    false,
    dailyBars,
    suppressSma,
    suppressVwap
  );
  fs.writeFileSync(svgOutputPathComplete, svgComplete, 'utf-8');

  try {
    // Generate the LLM chart (anonymized, filtered to entry time)
    await sharp(svgOutputPathLlm, { density: 300 })
      .flatten({ background: '#FFFFFF' })
      .png()
      .toFile(pngOutputPath);

    // Generate the complete chart (full info, full 2 days)
    await sharp(svgOutputPathComplete, { density: 300 })
      .flatten({ background: '#FFFFFF' })
      .png()
      .toFile(completePngOutputPath);

    // Duplicate charts as latest versions for easy access
    const latestMaskedPath = path.join(patternDir, 'latest_masked.png');
    const latestCompletePath = path.join(patternDir, 'latest_complete.png');

    fs.copyFileSync(pngOutputPath, latestMaskedPath);
    fs.copyFileSync(completePngOutputPath, latestCompletePath);

    fs.unlinkSync(svgOutputPathLlm);
    fs.unlinkSync(svgOutputPathComplete);
    return pngOutputPath; // Return the masked chart path (for LLM)
  } catch (err) {
    console.error(`Error generating PNG from SVG for ${baseFileName}:`, err);
    throw err;
  }
};
