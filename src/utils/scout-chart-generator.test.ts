import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { generateScoutChart, type ScoutChartOptions } from './scout-chart-generator';
import { generateSvgChart } from './chart-generator';

// Mock dependencies
vi.mock('fs');
vi.mock('path');
vi.mock('sharp');
vi.mock('./chart-generator');

const mockedFs = vi.mocked(fs);
const mockedPath = vi.mocked(path);
const mockedSharp = vi.mocked(sharp);
const mockedGenerateSvgChart = vi.mocked(generateSvgChart);

describe('Scout Chart Generator', () => {
  const mockBars = [
    {
      timestamp: '2024-01-03 10:00:00',
      open: 100,
      high: 105,
      low: 95,
      close: 102,
      volume: 1000,
      trade_date: '2024-01-03',
    },
    {
      timestamp: '2024-01-03 10:01:00',
      open: 102,
      high: 108,
      low: 100,
      close: 106,
      volume: 2000,
      trade_date: '2024-01-03',
    },
  ];

  const mockSignal = {
    timestamp: '2024-01-03 10:00:00',
    price: 103.0,
    type: 'entry' as const,
    trade_date: '2024-01-03',
  };

  describe('generateScoutChart', () => {
    let mockSharpInstance: any;

    beforeEach(() => {
      vi.clearAllMocks();

      // Mock sharp chain
      mockSharpInstance = {
        flatten: vi.fn().mockReturnThis(),
        png: vi.fn().mockReturnThis(),
        toFile: vi.fn().mockResolvedValue(undefined),
      };
      mockedSharp.mockReturnValue(mockSharpInstance);

      // Mock fs operations
      mockedFs.mkdirSync.mockReturnValue(undefined);
      mockedFs.writeFileSync.mockReturnValue(undefined);
      mockedFs.unlinkSync.mockReturnValue(undefined);

      // Mock path operations
      mockedPath.join.mockImplementation((...args) => args.join('/'));

      // Mock chart generation
      mockedGenerateSvgChart.mockReturnValue('<svg>Mock SVG</svg>');

      // Mock Date.now for consistent timestamps
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-03T15:30:45.123Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const chartOptions: ScoutChartOptions = {
      ticker: 'SPY',
      entryPatternName: 'scout',
      tradeDate: '2024-01-03',
      entrySignal: mockSignal,
      data: mockBars,
      allData: mockBars,
    };

    it('should create chart directory', async () => {
      await generateScoutChart(chartOptions);

      expect(mockedFs.mkdirSync).toHaveBeenCalledWith('./charts/scout', { recursive: true });
    });

    it('should generate both LLM and complete SVG files using existing chart generator', async () => {
      await generateScoutChart(chartOptions);

      // Should call the existing chart generator twice
      expect(mockedGenerateSvgChart).toHaveBeenCalledTimes(2);

      // LLM chart: filtered data, anonymized
      expect(mockedGenerateSvgChart).toHaveBeenCalledWith(
        'SPY',
        'scout',
        mockBars, // filtered data
        mockSignal,
        false, // showFullDayData = false
        true // anonymize = true
      );

      // Complete chart: all data, not anonymized
      expect(mockedGenerateSvgChart).toHaveBeenCalledWith(
        'SPY',
        'scout',
        mockBars, // all data
        mockSignal,
        true, // showFullDayData = true
        false // anonymize = false
      );

      expect(mockedFs.writeFileSync).toHaveBeenCalledTimes(2);
    });

    it('should convert SVG to PNG using sharp', async () => {
      await generateScoutChart(chartOptions);

      expect(mockedSharp).toHaveBeenCalledTimes(2);
      expect(mockSharpInstance.flatten).toHaveBeenCalledTimes(2);
      expect(mockSharpInstance.png).toHaveBeenCalledTimes(2);
      expect(mockSharpInstance.toFile).toHaveBeenCalledTimes(2);
    });

    it('should clean up temporary SVG files', async () => {
      await generateScoutChart(chartOptions);

      expect(mockedFs.unlinkSync).toHaveBeenCalledTimes(2);
      expect(mockedFs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('_masked_temp.svg'));
      expect(mockedFs.unlinkSync).toHaveBeenCalledWith(
        expect.stringContaining('_complete_temp.svg')
      );
    });

    it('should return path to main PNG file', async () => {
      const result = await generateScoutChart(chartOptions);

      expect(result).toContain('.png');
      expect(result).not.toContain('_complete');
      expect(result).toContain('SPY');
      expect(result).toContain('20240103');
    });

    it('should handle empty data gracefully', async () => {
      const emptyOptions = { ...chartOptions, allData: [] };

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await generateScoutChart(emptyOptions);

      expect(result).toBe('');
      expect(consoleSpy).toHaveBeenCalledWith('No data provided for chart generation.');

      consoleSpy.mockRestore();
    });

    it('should handle sharp conversion errors', async () => {
      mockSharpInstance.toFile.mockRejectedValue(new Error('Sharp conversion failed'));

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(generateScoutChart(chartOptions)).rejects.toThrow('Sharp conversion failed');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error generating PNG from SVG'),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it('should generate timestamp-based filenames', async () => {
      const result = await generateScoutChart(chartOptions);

      // Should contain timestamp in ISO format with dashes instead of colons
      expect(result).toContain('2024-01-03T15-30-45');
    });

    it('should include ticker and trade date in filename', async () => {
      const result = await generateScoutChart(chartOptions);

      expect(result).toContain('SPY');
      expect(result).toContain('20240103');
    });
  });
});
