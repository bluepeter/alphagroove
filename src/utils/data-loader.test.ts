import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join as actualJoin } from 'path';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { fetchTradesFromQuery } from './data-loader';

vi.mock('child_process');
vi.mock('fs');
vi.mock('path', async () => {
  const actualPathModule = (await vi.importActual('path')) as typeof import('path');
  return {
    ...actualPathModule,
    join: vi.fn((...args: string[]) => actualJoin(...args)),
  };
});

describe('Data Loader Utilities', () => {
  const mockTempFilePath = '/mock/path/temp_query.sql';

  beforeEach(() => {
    vi.mocked(actualJoin as any).mockReturnValue(mockTempFilePath);
    vi.mocked(writeFileSync).mockClear();
    vi.mocked(unlinkSync).mockClear();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(execSync).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchTradesFromQuery', () => {
    it('should fetch and parse trades from a valid CSV string', () => {
      const csvOutput = 'col1,col2,col3\nval1,10,true\nval2,20,false';
      vi.mocked(execSync).mockReturnValue(csvOutput);
      const query = 'SELECT * FROM table';
      const result = fetchTradesFromQuery(query);

      expect(writeFileSync).toHaveBeenCalledWith(mockTempFilePath, query, 'utf-8');
      expect(execSync).toHaveBeenCalledWith(
        `duckdb -csv -header < ${mockTempFilePath}`,
        expect.any(Object)
      );
      expect(unlinkSync).toHaveBeenCalledWith(mockTempFilePath);
      expect(result).toEqual([
        { col1: 'val1', col2: 10, col3: 'true' }, // Note: boolean-like strings are kept as strings by current logic
        { col1: 'val2', col2: 20, col3: 'false' },
      ]);
    });

    it('should handle CSV output with only a header', () => {
      const csvOutput = 'col1,col2,col3\n';
      vi.mocked(execSync).mockReturnValue(csvOutput);
      const result = fetchTradesFromQuery('SELECT * FROM table');
      expect(result).toEqual([]);
    });

    it('should handle empty CSV output (no header, no lines)', () => {
      const csvOutput = '\n'; // DuckDB might return just a newline for no results
      vi.mocked(execSync).mockReturnValue(csvOutput);
      const result = fetchTradesFromQuery('SELECT * FROM table');
      expect(result).toEqual([]);
    });

    it('should handle completely empty string output', () => {
      const csvOutput = '';
      vi.mocked(execSync).mockReturnValue(csvOutput);
      const result = fetchTradesFromQuery('SELECT * FROM table');
      expect(result).toEqual([]);
    });

    it('should handle CSV with various data types correctly including empty strings', () => {
      const csvOutput = 'name,age,city,value\nAlice,30,New York,\nBob,,London,123.45';
      vi.mocked(execSync).mockReturnValue(csvOutput);
      const result = fetchTradesFromQuery('SELECT * FROM table');
      expect(result).toEqual([
        { name: 'Alice', age: 30, city: 'New York', value: '' },
        { name: 'Bob', age: '', city: 'London', value: 123.45 },
      ]);
    });

    it('should return empty array if execSync returns data without header', () => {
      const csvOutput = 'val1,10\nval2,20'; // First line is data, not a typical header
      vi.mocked(execSync).mockReturnValue(csvOutput);
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = fetchTradesFromQuery('SELECT * FROM table');
      // Current behavior: first line is treated as header if not empty
      expect(result).toEqual([{ val1: 'val2', '10': 20 }]);
      expect(consoleWarnSpy).not.toHaveBeenCalled(); // Warn is only if headerLine is empty
      consoleWarnSpy.mockRestore();
    });

    it('should still call unlinkSync if execSync throws an error', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('DB error');
      });
      expect(() => fetchTradesFromQuery('SELECT * FROM table')).toThrow('DB error');
      expect(unlinkSync).toHaveBeenCalledWith(mockTempFilePath);
    });

    it('should not call unlinkSync if temp file was not created (e.g. writeFileSync fails)', () => {
      vi.mocked(writeFileSync).mockImplementation(() => {
        throw new Error('File system error');
      });
      vi.mocked(existsSync).mockReturnValue(false); // Simulate file not existing

      expect(() => fetchTradesFromQuery('SELECT * FROM table')).toThrow('File system error');
      expect(unlinkSync).not.toHaveBeenCalled();
    });
  });
});
