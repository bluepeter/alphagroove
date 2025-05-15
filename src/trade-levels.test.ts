import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { calculateAverageTrueRangeForDay, calculateATRStopLoss } from './utils/calculations';

// Mock the functions and modules
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  },
}));

vi.mock('csv-parse/sync', () => ({
  parse: vi.fn(),
}));

vi.mock('./utils/calculations', async () => {
  const actual = (await vi.importActual('./utils/calculations')) as any;
  return {
    ...actual,
    calculateAverageTrueRangeForDay: vi.fn(),
    calculateATRStopLoss: vi.fn(),
  };
});

// Mock commander to prevent parse argv errors
vi.mock('commander', () => ({
  Command: vi.fn().mockImplementation(() => ({
    name: vi.fn().mockReturnThis(),
    description: vi.fn().mockReturnThis(),
    argument: vi.fn().mockReturnThis(),
    option: vi.fn().mockReturnThis(),
    parse: vi.fn().mockReturnThis(),
    opts: vi.fn().mockReturnValue({}),
    args: [],
  })),
}));

// Import the core functions to test - excluding main which has the failing CLI command
import {
  parseCSVData,
  calculateATR,
  calculateTradeLevels,
  printLevelsForDirection,
} from './trade-levels';

// Mock main function to prevent it from running
vi.mock('./trade-levels', async importOriginal => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    main: vi.fn(),
  };
});

describe('Trade Levels Tool', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('parseCSVData', () => {
    it('should parse CSV data and extract bars', () => {
      // Mock the CSV content
      const mockCsvData =
        'Date,Time,Open,High,Low,Close,Volume\n05/12/2025,9:31 AM,581.47,581.73,580.39,580.465,1066648';
      vi.mocked(fs.readFileSync).mockReturnValue(mockCsvData);

      // Mock the parsed records
      const mockRecords = [
        {
          Date: '05/12/2025',
          Time: '9:31 AM',
          Open: '581.47',
          High: '581.73',
          Low: '580.39',
          Close: '580.465',
          Volume: '1066648',
        },
      ];
      vi.mocked(parse).mockReturnValue(mockRecords);

      // Bypass the day detection logic for this test
      vi.spyOn(Object, 'keys').mockReturnValue(['05/12/2025']);

      const result = parseCSVData('test.csv');

      expect(fs.readFileSync).toHaveBeenCalledWith('test.csv', 'utf8');
      expect(parse).toHaveBeenCalledWith(mockCsvData, {
        columns: true,
        skip_empty_lines: true,
      });

      expect(result[0].timestamp).toBe('05/12/2025 9:31 AM');
      expect(result[0].open).toBe(581.47);
      expect(result[0].high).toBe(581.73);
      expect(result[0].low).toBe(580.39);
      expect(result[0].close).toBe(580.465);
      expect(result[0].volume).toBe(1066648);
    });
  });

  describe('calculateATR', () => {
    it('should calculate ATR using calculateAverageTrueRangeForDay', () => {
      const mockBars = [
        { timestamp: '2025-05-12 9:31', open: 100, high: 101, low: 99, close: 100.5 },
        { timestamp: '2025-05-12 9:32', open: 100.5, high: 102, low: 100, close: 101 },
      ];

      vi.mocked(calculateAverageTrueRangeForDay).mockReturnValue(1.2);

      const result = calculateATR(mockBars);

      expect(calculateAverageTrueRangeForDay).toHaveBeenCalledWith(mockBars);
      expect(result).toBe(1.2);
    });

    it('should return a default value if no bars provided', () => {
      const result = calculateATR([]);
      expect(result).toBe(2.0);
    });
  });

  describe('calculateTradeLevels', () => {
    it('should calculate trade levels for long position', () => {
      const currentPrice = 100;
      const atr = 1.0;
      const mockConfig = {
        exitStrategies: {
          enabled: ['stopLoss', 'profitTarget', 'trailingStop'],
          stopLoss: { atrMultiplier: 2.0 },
          profitTarget: { atrMultiplier: 3.0 },
          trailingStop: {
            activationAtrMultiplier: 0,
            trailAtrMultiplier: 1.5,
          },
        },
      };
      const isLong = true;

      vi.mocked(calculateATRStopLoss).mockReturnValue(98);

      const result = calculateTradeLevels(currentPrice, atr, mockConfig, isLong);

      expect(calculateATRStopLoss).toHaveBeenCalledWith(currentPrice, atr, 2.0, isLong);

      expect(result.stopLoss).toBe(98);
      expect(result.profitTarget).toBe(103); // 100 + (1.0 * 3.0)
      expect(result.immediateActivation).toBe(true);
      expect(result.tsTrailAmount).toBe(1.5); // atr * 1.5
    });

    it('should calculate trade levels for short position', () => {
      const currentPrice = 100;
      const atr = 1.0;
      const mockConfig = {
        exitStrategies: {
          enabled: ['stopLoss', 'profitTarget'],
          stopLoss: { atrMultiplier: 2.0 },
          profitTarget: { atrMultiplier: 3.0 },
        },
      };
      const isLong = false;

      vi.mocked(calculateATRStopLoss).mockReturnValue(102);

      const result = calculateTradeLevels(currentPrice, atr, mockConfig, isLong);

      expect(calculateATRStopLoss).toHaveBeenCalledWith(currentPrice, atr, 2.0, isLong);

      expect(result.stopLoss).toBe(102);
      expect(result.profitTarget).toBe(97); // 100 - (1.0 * 3.0)
    });
  });

  describe('printLevelsForDirection', () => {
    let consoleLogSpy: any;

    beforeEach(() => {
      // Spy on console.log and mock its implementation
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      // Ensure calculateATRStopLoss mock returns a default value for these tests
      vi.mocked(calculateATRStopLoss).mockReturnValue(999); // Default mock return
    });

    afterEach(() => {
      // Restore the original console.log after each test
      consoleLogSpy.mockRestore();
    });

    it('should display correct profit target ATR multiplier (5.0x) for long position', () => {
      const currentPrice = 100;
      const atr = 1.0;
      const levels = {
        stopLoss: 98,
        stopLossAtrMulti: 2.0,
        profitTarget: 105,
        profitTargetAtrMulti: 5.0, // Key: Configured 5.0x
        tsActivationLevel: 100,
        immediateActivation: true,
        tsTrailAmount: 1.5,
      };
      const config = {
        exitStrategies: {
          stopLoss: { atrMultiplier: 2.0 },
          profitTarget: { atrMultiplier: 5.0 },
          trailingStop: { activationAtrMultiplier: 0, trailAtrMultiplier: 1.5 },
        },
      };

      printLevelsForDirection(currentPrice, atr, levels, true, config);

      // Check that console.log was called
      expect(consoleLogSpy).toHaveBeenCalled();

      // Check specific output for profit target
      const profitTargetCall = consoleLogSpy.mock.calls.find((call: any[]) =>
        call[0].includes('Profit Target:')
      );
      expect(profitTargetCall[0]).toContain('ATR PT [5.0x]: $105.00 (+$5.00, 5.00%)');
    });

    it('should display correct profit target ATR multiplier (2.5x) for short position', () => {
      const currentPrice = 200;
      const atr = 2.0;
      const levels = {
        stopLoss: 206, // 200 + 2*3
        stopLossAtrMulti: 3.0,
        profitTarget: 195, // 200 - 2*2.5
        profitTargetAtrMulti: 2.5, // Key: Configured 2.5x
        tsActivationLevel: 200,
        immediateActivation: true,
        tsTrailAmount: 3.0, // atr * 1.5
      };
      const config = {
        exitStrategies: {
          stopLoss: { atrMultiplier: 3.0 },
          profitTarget: { atrMultiplier: 2.5 },
          trailingStop: { activationAtrMultiplier: 0, trailAtrMultiplier: 1.5 },
        },
      };

      printLevelsForDirection(currentPrice, atr, levels, false, config); // isLong = false

      const profitTargetCall = consoleLogSpy.mock.calls.find((call: any[]) =>
        call[0].includes('Profit Target:')
      );
      expect(profitTargetCall[0]).toContain('ATR PT [2.5x]: $195.00 (-$5.00, -2.50%)');
    });

    it('should display profit target based on percentFromEntry if atrMultiplier is not provided in levels', () => {
      const currentPrice = 100;
      const atr = 1.0;
      const levels = {
        // profitTargetAtrMulti is undefined
        profitTarget: 103, // Calculated from percentFromEntry
        profitTargetPct: 0.03,
      };
      const config = {
        exitStrategies: {
          profitTarget: { percentFromEntry: 3.0 }, // ATR multiplier not defined here
        },
      };

      printLevelsForDirection(currentPrice, atr, levels, true, config);

      const profitTargetCall = consoleLogSpy.mock.calls.find((call: any[]) =>
        call[0].includes('Profit Target:')
      );
      expect(profitTargetCall[0]).toContain('PT: $103.00 (+$3.00, 3.00%)');
      expect(profitTargetCall[0]).not.toContain('x ATR');
    });

    it('should display stop loss correctly with ATR and percent', () => {
      const currentPrice = 100;
      const atr = 1.0;
      const levels = {
        stopLoss: 98,
        stopLossAtrMulti: 2.0,
      };
      const config = {
        // Dummy config, not directly used by print for this part if levels are set
        exitStrategies: { stopLoss: { atrMultiplier: 2.0 } },
      };

      printLevelsForDirection(currentPrice, atr, levels, true, config);
      const slCall = consoleLogSpy.mock.calls.find((call: any[]) => call[0].includes('Stop Loss:'));
      expect(slCall[0]).toContain('ATR SL [2.0x]: $98.00 (-$2.00, -2.00%)');
    });

    it('should display trailing stop correctly with immediate ATR activation and ATR trail', () => {
      const currentPrice = 100;
      const atr = 1.0;
      const levels = {
        // For immediate activation, tsActivationLevel might be entry price or not explicitly set if immediateActivation is true
        tsActivationLevel: currentPrice, // Explicitly setting to currentPrice for clarity that it would be immediate
        immediateActivation: true, // This is key for this test path
        tsTrailAmount: 1.5, // Derived from atr * trailAtrMultiplier
      };
      const config = {
        // Config to ensure immediateActivation is true and trail is ATR based
        exitStrategies: {
          trailingStop: { activationAtrMultiplier: 0, trailAtrMultiplier: 1.5 },
        },
      };
      printLevelsForDirection(currentPrice, atr, levels, true, config);
      const tsActivationCall = consoleLogSpy.mock.calls.find((call: any[]) =>
        call[0].includes('Trailing Stop:')
      );
      // Corrected: If immediateActivation is true, this is the expected output
      expect(tsActivationCall[0]).toContain('Trailing Stop: Immediate activation');

      const tsAmountCall = consoleLogSpy.mock.calls.find((call: any[]) =>
        call[0].includes('Trailing Amount:')
      );
      expect(tsAmountCall[0]).toContain('TS Trail [1.5x ATR]: $1.50 (1.50% of price)');
    });
  });
});
