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
  const original = (await importOriginal()) as any;
  return {
    ...original, // Keep original functions like type Bar, but mock specific ones below
    calculateAverageTrueRangeForDay: vi.fn(),
  };
});

describe('Trade Processing Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {}); // Suppress console warnings during tests
  });

  describe('calculateEntryAtr', () => {
    const ticker = 'SPY';
    const timeframe = '1min';
    const tradeDate = '2023-01-10';
    const mockBars: Bar[] = [{ timestamp: 't1', open: 1, high: 2, low: 0, close: 1.5 }];

    it('should calculate ATR if prior day bars are available and ATR calc succeeds', async () => {
      vi.mocked(dataLoader.getPriorDayTradingBars).mockResolvedValue(mockBars);
      vi.mocked(calculations.calculateAverageTrueRangeForDay).mockReturnValue(1.23);

      const atr = await calculateEntryAtr(ticker, timeframe, tradeDate);

      expect(dataLoader.getPriorDayTradingBars).toHaveBeenCalledWith(ticker, timeframe, tradeDate);
      expect(calculations.calculateAverageTrueRangeForDay).toHaveBeenCalledWith(mockBars);
      expect(atr).toBe(1.23);
      expect(console.warn).not.toHaveBeenCalled();
    });

    it('should return undefined and warn if no prior day bars', async () => {
      vi.mocked(dataLoader.getPriorDayTradingBars).mockResolvedValue([]);
      const atr = await calculateEntryAtr(ticker, timeframe, tradeDate);
      expect(atr).toBeUndefined();
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('No prior day bars found'));
    });

    it('should return undefined and warn if ATR calculation fails', async () => {
      vi.mocked(dataLoader.getPriorDayTradingBars).mockResolvedValue(mockBars);
      vi.mocked(calculations.calculateAverageTrueRangeForDay).mockReturnValue(undefined);
      const atr = await calculateEntryAtr(ticker, timeframe, tradeDate);
      expect(atr).toBeUndefined();
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Could not calculate Average TR')
      );
    });
  });

  describe('evaluateExitStrategies', () => {
    const entryPrice = 100;
    const entryTimestamp = '2023-01-10 13:01:00';
    const tradingDayBars: Bar[] = [
      { timestamp: '2023-01-10 13:00:00', open: 99, high: 100, low: 98, close: 99.5 }, // Before entry
      { timestamp: '2023-01-10 13:01:00', open: 100, high: 101, low: 99, close: 100.5 }, // Entry bar
      { timestamp: '2023-01-10 13:02:00', open: 100.5, high: 102, low: 100, close: 101.5 },
      { timestamp: '2023-01-10 13:03:00', open: 101.5, high: 103, low: 101, close: 102.5 }, // Last bar for default exit
    ];
    const tradeDirection = 'long';
    const entryAtrValue = 1.0;

    const mockStrategy1: ExitStrategy = { name: 's1', evaluate: vi.fn() };
    const mockStrategy2: ExitStrategy = { name: 's2', evaluate: vi.fn() };

    it('should return the signal from the first strategy that triggers', () => {
      const exitSignal1: ExitSignal = {
        timestamp: 't1',
        price: 102,
        type: 'exit',
        reason: 's1_exit',
      };
      vi.mocked(mockStrategy1.evaluate).mockReturnValue(exitSignal1);
      vi.mocked(mockStrategy2.evaluate).mockReturnValue(null);

      const result = evaluateExitStrategies(
        entryPrice,
        entryTimestamp,
        tradingDayBars,
        tradeDirection,
        entryAtrValue,
        [mockStrategy1, mockStrategy2]
      );
      expect(result).toBe(exitSignal1);
      expect(mockStrategy1.evaluate).toHaveBeenCalledTimes(1);
      expect(mockStrategy2.evaluate).not.toHaveBeenCalled(); // Should short-circuit
    });

    it('should return signal from second strategy if first returns null', () => {
      const exitSignal2: ExitSignal = {
        timestamp: 't2',
        price: 103,
        type: 'exit',
        reason: 's2_exit',
      };
      vi.mocked(mockStrategy1.evaluate).mockReturnValue(null);
      vi.mocked(mockStrategy2.evaluate).mockReturnValue(exitSignal2);

      const result = evaluateExitStrategies(
        entryPrice,
        entryTimestamp,
        tradingDayBars,
        tradeDirection,
        entryAtrValue,
        [mockStrategy1, mockStrategy2]
      );
      expect(result).toBe(exitSignal2);
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
      );
      expect(result).toEqual({
        timestamp: '2023-01-10 13:03:00', // Last bar in tradingDayBars >= entryTimestamp
        price: 102.5, // Close of that last bar
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
        'customDefault'
      );
      expect(result?.reason).toBe('customDefault');
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
      );
      expect(result).toBeNull();
    });

    it('should return null if tradingDayBars is empty', () => {
      vi.mocked(mockStrategy1.evaluate).mockReturnValue(null);
      vi.mocked(mockStrategy2.evaluate).mockReturnValue(null);

      const result = evaluateExitStrategies(
        entryPrice,
        entryTimestamp,
        [],
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
        tradeDirection,
        entryAtrValue,
        [mockStrategy1]
      );
      expect(mockStrategy1.evaluate).toHaveBeenCalledWith(
        entryPrice,
        entryTimestamp,
        tradingDayBars,
        true, // isLong for tradeDirection 'long'
        entryAtrValue
      );
    });
  });
});
