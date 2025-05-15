import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateEntryAtr, evaluateExitStrategies } from './trade-processing';
import * as dataLoader from './data-loader';
import * as calculations from './calculations';
import { type Bar } from './calculations';
import { type ExitStrategy, type ExitSignal } from '../patterns/exit/exit-strategy';

// Mock dependencies
vi.mock('./data-loader', () => ({
  getPriorDayTradingBars: vi.fn(),
}));

vi.mock('./calculations', async importOriginal => {
  const actual = await importOriginal<typeof import('./calculations')>();
  return {
    ...actual,
    calculateAverageTrueRangeForDay: vi.fn(),
  };
});

describe('Trade Processing Utilities', () => {
  const ticker = 'TEST';
  const timeframe = '1min';
  const tradeDate = '2023-01-10';
  const mockBars: Bar[] = [
    { timestamp: '2023-01-09 10:00:00', open: 100, high: 102, low: 99, close: 101, volume: 1000 },
    { timestamp: '2023-01-09 10:01:00', open: 101, high: 103, low: 100, close: 102, volume: 1200 },
  ];

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('calculateEntryAtr', () => {
    it('should calculate ATR if prior day bars are available and ATR calc succeeds', async () => {
      vi.mocked(dataLoader.getPriorDayTradingBars).mockResolvedValue(mockBars);
      vi.mocked(calculations.calculateAverageTrueRangeForDay).mockReturnValue(1.5);
      const atr = await calculateEntryAtr(ticker, timeframe, tradeDate);
      expect(atr).toBe(1.5);
      expect(dataLoader.getPriorDayTradingBars).toHaveBeenCalledWith(ticker, timeframe, tradeDate);
      expect(calculations.calculateAverageTrueRangeForDay).toHaveBeenCalledWith(mockBars);
    });

    it('should return undefined and warn if no prior day bars', async () => {
      vi.mocked(dataLoader.getPriorDayTradingBars).mockResolvedValue([]);
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const atr = await calculateEntryAtr(ticker, timeframe, tradeDate);
      expect(atr).toBeUndefined();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('No prior day bars found')
      );
      consoleWarnSpy.mockRestore();
    });

    it('should return undefined and warn if ATR calculation fails', async () => {
      vi.mocked(dataLoader.getPriorDayTradingBars).mockResolvedValue(mockBars);
      vi.mocked(calculations.calculateAverageTrueRangeForDay).mockReturnValue(undefined);
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const atr = await calculateEntryAtr(ticker, timeframe, tradeDate);
      expect(atr).toBeUndefined();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Could not calculate Average TR')
      );
      consoleWarnSpy.mockRestore();
    });
  });

  describe('evaluateExitStrategies', () => {
    const entryPrice = 100;
    const entryTimestamp = '2023-01-10 13:01:00';
    const tradeDirection = 'long';
    const entryAtrValue = 1.0;
    const tradingDayBars: Bar[] = [
      { timestamp: '2023-01-10 13:00:00', open: 99, high: 100, low: 98, close: 99.5, volume: 100 }, // Before entry
      {
        timestamp: '2023-01-10 13:01:00',
        open: 100,
        high: 101,
        low: 99.8,
        close: 100.5,
        volume: 200,
      }, // Entry bar
      {
        timestamp: '2023-01-10 13:02:00',
        open: 100.5,
        high: 101.5,
        low: 100.2,
        close: 101,
        volume: 150,
      },
      {
        timestamp: '2023-01-10 13:03:00',
        open: 101,
        high: 102,
        low: 100.8,
        close: 101.5,
        volume: 180,
      },
    ];

    const mockExitSignal: ExitSignal = {
      timestamp: '2023-01-10 13:02:00',
      price: 101,
      type: 'exit',
      reason: 'mockStrategy1Exit',
    };

    let mockStrategy1: ExitStrategy;
    let mockStrategy2: ExitStrategy;

    beforeEach(() => {
      mockStrategy1 = {
        name: 'testStrategy1',
        evaluate: vi.fn(),
      } as unknown as ExitStrategy;

      mockStrategy2 = {
        name: 'testStrategy2',
        evaluate: vi.fn(),
      } as unknown as ExitStrategy;
    });

    it('should return the signal from the first strategy that triggers', () => {
      vi.mocked(mockStrategy1.evaluate).mockReturnValue(mockExitSignal);
      vi.mocked(mockStrategy2.evaluate).mockReturnValue(null); // Should not be called

      const result = evaluateExitStrategies(
        entryPrice,
        entryTimestamp,
        tradingDayBars,
        tradeDirection,
        entryAtrValue,
        [mockStrategy1, mockStrategy2]
        // Default initialStopPrice, initialTargetPrice (undefined), defaultExitReason
      );
      expect(result).toEqual(mockExitSignal);
      expect(mockStrategy1.evaluate).toHaveBeenCalledTimes(1);
      expect(mockStrategy2.evaluate).not.toHaveBeenCalled();
    });

    it('should return signal from second strategy if first returns null', () => {
      vi.mocked(mockStrategy1.evaluate).mockReturnValue(null);
      const secondSignal = { ...mockExitSignal, reason: 'mockStrategy2Exit' };
      vi.mocked(mockStrategy2.evaluate).mockReturnValue(secondSignal);

      const result = evaluateExitStrategies(
        entryPrice,
        entryTimestamp,
        tradingDayBars,
        tradeDirection,
        entryAtrValue,
        [mockStrategy1, mockStrategy2]
        // Default initialStopPrice, initialTargetPrice (undefined), defaultExitReason
      );
      expect(result).toEqual(secondSignal);
      expect(mockStrategy1.evaluate).toHaveBeenCalledTimes(1);
      expect(mockStrategy2.evaluate).toHaveBeenCalledTimes(1);
    });

    it('should return default endOfDay exit if no strategy triggers and relevant bars exist', () => {
      vi.mocked(mockStrategy1.evaluate).mockReturnValue(null);
      vi.mocked(mockStrategy2.evaluate).mockReturnValue(null);

      const result = evaluateExitStrategies(
        entryPrice,
        entryTimestamp,
        tradingDayBars,
        tradeDirection,
        entryAtrValue,
        [mockStrategy1, mockStrategy2]
        // Default initialStopPrice, initialTargetPrice (undefined), defaultExitReason
      );
      expect(result).toEqual({
        timestamp: tradingDayBars[tradingDayBars.length - 1].timestamp,
        price: tradingDayBars[tradingDayBars.length - 1].close,
        type: 'exit',
        reason: 'endOfDay',
      });
    });

    it('should return default exit with custom reason if provided', () => {
      vi.mocked(mockStrategy1.evaluate).mockReturnValue(null);
      vi.mocked(mockStrategy2.evaluate).mockReturnValue(null);

      const result = evaluateExitStrategies(
        entryPrice,
        entryTimestamp,
        tradingDayBars,
        tradeDirection,
        entryAtrValue,
        [mockStrategy1, mockStrategy2],
        undefined, // initialStopPrice
        undefined, // initialTargetPrice
        'customDefault'
      );
      expect(result?.reason).toBe('customDefault');
      // Check that price and timestamp match the last relevant bar for default exit
      const relevantBars = tradingDayBars.filter(bar => bar.timestamp >= entryTimestamp);
      const lastBarToConsider = relevantBars[relevantBars.length - 1];
      expect(result?.price).toBe(lastBarToConsider.close);
      expect(result?.timestamp).toBe(lastBarToConsider.timestamp);
    });

    it('should return null if no strategy triggers and no relevant bars for default exit', () => {
      vi.mocked(mockStrategy1.evaluate).mockReturnValue(null);
      vi.mocked(mockStrategy2.evaluate).mockReturnValue(null);
      const preEntryBars: Bar[] = [tradingDayBars[0]]; // Only bar before entry

      const result = evaluateExitStrategies(
        entryPrice,
        entryTimestamp,
        preEntryBars,
        tradeDirection,
        entryAtrValue,
        [mockStrategy1, mockStrategy2]
        // Default initialStopPrice, initialTargetPrice (undefined)
      );
      expect(result).toBeNull();
    });

    it('should return null if tradingDayBars is empty', () => {
      const result = evaluateExitStrategies(
        entryPrice,
        entryTimestamp,
        [], // Empty bars
        tradeDirection,
        entryAtrValue,
        [mockStrategy1, mockStrategy2]
      );
      expect(result).toBeNull();
    });

    it('should pass correct parameters to strategy evaluate methods', () => {
      vi.mocked(mockStrategy1.evaluate).mockReturnValue(null);
      evaluateExitStrategies(
        entryPrice,
        entryTimestamp,
        tradingDayBars,
        tradeDirection, // 'long'
        entryAtrValue, // 1.0
        [mockStrategy1],
        undefined, // initialStopPrice (example, not used by mockStrategy1 by name)
        undefined // initialTargetPrice (example, not used by mockStrategy1 by name)
      );
      expect(mockStrategy1.evaluate).toHaveBeenCalledWith(
        entryPrice,
        entryTimestamp,
        tradingDayBars,
        true, // isLong derived from tradeDirection 'long'
        entryAtrValue, // atr value
        false, // _testMode (default from evaluateExitStrategies call)
        undefined // absoluteLevelOverride (as mockStrategy1.name is not 'stopLoss' or 'profitTarget')
      );
    });
  });
});
