import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import {
  generateScoutSvgChart,
  generateScoutChart,
  type ScoutChartOptions,
} from './scout-chart-generator';
import { Bar, Signal } from '../patterns/types';

// Mock dependencies
vi.mock('fs');
vi.mock('path');
vi.mock('sharp');

const mockedFs = vi.mocked(fs);
const mockedPath = vi.mocked(path);
const mockedSharp = vi.mocked(sharp);

describe('Scout Chart Generator', () => {
  const mockBars: Bar[] = [
    {
      timestamp: '2024-01-02 14:30:00',
      open: 100,
      high: 102,
      low: 98,
      close: 101,
      volume: 1000,
      trade_date: '2024-01-02',
    },
    {
      timestamp: '2024-01-02 14:31:00',
      open: 101,
      high: 103,
      low: 99,
      close: 102,
      volume: 1500,
      trade_date: '2024-01-02',
    },
    {
      timestamp: '2024-01-03 14:30:00',
      open: 102,
      high: 104,
      low: 100,
      close: 103,
      volume: 2000,
      trade_date: '2024-01-03',
    },
  ];

  const mockSignal: Signal = {
    timestamp: '2024-01-03 14:30:00',
    price: 103,
    type: 'entry',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock path.join to return predictable paths
    mockedPath.join.mockImplementation((...parts) => parts.join('/'));

    // Mock fs.mkdirSync
    mockedFs.mkdirSync.mockImplementation(() => undefined);

    // Mock fs.writeFileSync
    mockedFs.writeFileSync.mockImplementation(() => undefined);

    // Mock fs.unlinkSync
    mockedFs.unlinkSync.mockImplementation(() => undefined);
  });

  describe('generateScoutSvgChart', () => {
    it('should generate SVG chart with proper structure', () => {
      const result = generateScoutSvgChart('SPY', 'scout', mockBars, mockSignal, false);

      expect(result).toContain('<svg');
      expect(result).toContain('</svg>');
      expect(result).toContain('SPY - scout');
      expect(result).toContain('$103.00');
    });

    it('should handle empty data gracefully', () => {
      const result = generateScoutSvgChart('SPY', 'scout', [], mockSignal, false);

      expect(result).toBe('<svg><text>No data available</text></svg>');
    });

    it('should include candlestick elements for each bar', () => {
      const result = generateScoutSvgChart('SPY', 'scout', mockBars, mockSignal, false);

      // Should contain line elements for high-low lines
      const lineMatches = result.match(/<line/g);
      expect(lineMatches).toBeTruthy();
      expect(lineMatches!.length).toBeGreaterThan(0);

      // Should contain rect elements for candlestick bodies and volume bars
      const rectMatches = result.match(/<rect/g);
      expect(rectMatches).toBeTruthy();
      expect(rectMatches!.length).toBeGreaterThan(0);
    });

    it('should use different colors for up and down candles', () => {
      const result = generateScoutSvgChart('SPY', 'scout', mockBars, mockSignal, false);

      // Should contain both green and red colors (or at least one of them)
      expect(result).toMatch(/#4CAF50|#F44336/);
    });

    it('should include time labels from bar timestamps', () => {
      const result = generateScoutSvgChart('SPY', 'scout', mockBars, mockSignal, false);

      // Should contain time labels (HH:MM format)
      expect(result).toMatch(/14:3\d/); // Should match times like 14:30, 14:31
    });

    it('should include price axis labels', () => {
      const result = generateScoutSvgChart('SPY', 'scout', mockBars, mockSignal, false);

      // Should contain dollar signs for price labels
      expect(result).toContain('$');
    });

    it('should handle showComplete parameter', () => {
      const resultIncomplete = generateScoutSvgChart('SPY', 'scout', mockBars, mockSignal, false);
      const resultComplete = generateScoutSvgChart('SPY', 'scout', mockBars, mockSignal, true);

      // Both should contain the same basic structure
      expect(resultIncomplete).toContain('<svg');
      expect(resultComplete).toContain('<svg');
      expect(resultIncomplete).toContain('SPY - scout');
      expect(resultComplete).toContain('SPY - scout');
    });

    it('should include volume chart section', () => {
      const result = generateScoutSvgChart('SPY', 'scout', mockBars, mockSignal, false);

      // Should contain volume-related elements
      expect(result).toContain('Volume');
    });
  });

  describe('generateScoutChart', () => {
    let mockSharpInstance: any;

    beforeEach(() => {
      // Mock sharp chain
      mockSharpInstance = {
        flatten: vi.fn().mockReturnThis(),
        png: vi.fn().mockReturnThis(),
        toFile: vi.fn().mockResolvedValue(undefined),
      };
      mockedSharp.mockReturnValue(mockSharpInstance);

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
    };

    it('should create chart directory', async () => {
      await generateScoutChart(chartOptions);

      expect(mockedFs.mkdirSync).toHaveBeenCalledWith('./charts/scout', { recursive: true });
    });

    it('should generate both LLM and complete SVG files', async () => {
      await generateScoutChart(chartOptions);

      expect(mockedFs.writeFileSync).toHaveBeenCalledTimes(2);

      const calls = mockedFs.writeFileSync.mock.calls;
      expect(calls[0][0]).toContain('_llm_temp.svg');
      expect(calls[1][0]).toContain('_complete_temp.svg');
    });

    it('should convert SVG to PNG using sharp', async () => {
      await generateScoutChart(chartOptions);

      expect(mockedSharp).toHaveBeenCalledTimes(2);
      expect(mockSharpInstance.flatten).toHaveBeenCalledWith({ background: '#FFFFFF' });
      expect(mockSharpInstance.png).toHaveBeenCalled();
      expect(mockSharpInstance.toFile).toHaveBeenCalledTimes(2);
    });

    it('should clean up temporary SVG files', async () => {
      await generateScoutChart(chartOptions);

      expect(mockedFs.unlinkSync).toHaveBeenCalledTimes(2);

      const calls = mockedFs.unlinkSync.mock.calls;
      expect(calls[0][0]).toContain('_llm_temp.svg');
      expect(calls[1][0]).toContain('_complete_temp.svg');
    });

    it('should return path to main PNG file', async () => {
      const result = await generateScoutChart(chartOptions);

      expect(result).toContain('.png');
      expect(result).not.toContain('_complete.png');
      expect(result).toContain('SPY');
      expect(result).toContain('20240103');
    });

    it('should handle empty data gracefully', async () => {
      const emptyOptions = { ...chartOptions, data: [] };

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
      expect(result).toMatch(/2024-01-03T15-30-45/);
    });

    it('should include ticker and trade date in filename', async () => {
      const result = await generateScoutChart(chartOptions);

      expect(result).toContain('SPY');
      expect(result).toContain('20240103'); // Trade date without dashes
    });
  });
});
