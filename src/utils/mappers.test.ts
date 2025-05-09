import { describe, it, expect } from 'vitest';

import { mapRawDataToTrade } from './mappers';
import { type Trade } from './output'; // Assuming Trade is correctly exported from output.js

describe('Mapper Utilities', () => {
  describe('mapRawDataToTrade', () => {
    const baseRawData = {
      trade_date: '2023-01-01',
      entry_time: '2023-01-01 09:30:00',
      exit_time: '2023-01-01 09:40:00',
      market_open: 100,
      entry_price: 101,
      exit_price: 102,
      rise_pct: 1,
      return_pct: 0.99,
      year: '2023',
      total_trading_days: 252,
      median_return: 0.1,
      std_dev_return: 0.05,
      win_rate: 0.6,
      match_count: 10,
      all_trading_days: 252,
    };

    it('should map raw data to a Trade object for a long trade', () => {
      const expectedTrade: Trade = {
        trade_date: '2023-01-01',
        entry_time: '2023-01-01 09:30:00',
        exit_time: '2023-01-01 09:40:00',
        market_open: 100,
        entry_price: 101,
        exit_price: 102,
        rise_pct: 1,
        return_pct: 0.99,
        year: 2023,
        total_trading_days: 252,
        median_return: 0.1,
        std_dev_return: 0.05,
        win_rate: 0.6,
        match_count: 10,
        all_trading_days: 252,
        direction: 'long',
      };
      const result = mapRawDataToTrade(baseRawData, 'long');
      expect(result).toEqual(expectedTrade);
    });

    it('should map raw data to a Trade object for a short trade', () => {
      const result = mapRawDataToTrade(baseRawData, 'short');
      expect(result.direction).toBe('short');
      expect(result.year).toBe(2023); // Ensure year is parsed
    });

    it('should correctly parse year to number', () => {
      const rawData = { ...baseRawData, year: '2024' };
      const result = mapRawDataToTrade(rawData, 'long');
      expect(result.year).toBe(2024);
      expect(typeof result.year).toBe('number');
    });

    it('should handle missing optional fields from raw data if mapper implies defaults (it currently does not, relies on casting)', () => {
      const partialRawData = {
        trade_date: '2023-01-02',
        entry_time: '2023-01-02 10:30:00',
        exit_time: '2023-01-02 10:40:00',
        market_open: 200,
        entry_price: 201,
        exit_price: 202,
        rise_pct: 0.5,
        return_pct: 0.49,
        year: '2023',
        // Missing: total_trading_days, median_return, std_dev_return, win_rate, match_count, all_trading_days
      };
      const result = mapRawDataToTrade(partialRawData, 'long');
      expect(result.trade_date).toBe('2023-01-02');
      expect(result.direction).toBe('long');
      // For fields that are directly cast (e.g., `as number`), they will be `undefined` if missing in rawTradeData
      // The Trade interface should mark these as optional (e.g., `median_return?: number`) if they can be missing.
      // Based on current `mapRawDataToTrade`, these would become undefined if not present.
      expect(result.median_return).toBeUndefined();
      expect(result.match_count).toBeUndefined();
      // Check a few required ones are still there
      expect(result.year).toBe(2023);
    });

    it('should NOT retain fields not explicitly in Trade interface mapping', () => {
      const extraRawData = { ...baseRawData, extra_field: 'testValue', another_numeric: 123 };
      const result = mapRawDataToTrade(extraRawData, 'long') as any;
      expect(result.extra_field).toBeUndefined();
      expect(result.another_numeric).toBeUndefined();
      // Check a known field is still present
      expect(result.trade_date).toBe(baseRawData.trade_date);
    });
  });
});
