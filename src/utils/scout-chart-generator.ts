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

    fs.unlinkSync(svgOutputPathLlm);
    fs.unlinkSync(svgOutputPathComplete);
    return pngOutputPath; // Return the masked chart path (for LLM)
  } catch (err) {
    console.error(`Error generating PNG from SVG for ${baseFileName}:`, err);
    throw err;
  }
};
