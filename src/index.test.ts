import { Command } from 'commander';
import { vi, describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { type Config as AppConfig } from './utils/config.js';
import { LlmConfirmationScreen as _ActualLlmConfirmationScreen } from './screens/llm-confirmation.screen.js';

const mockQueryValue = 'DRY_RUN_SQL_QUERY_FROM_INDEX_TEST'; // Define it once globally for the test file

describe('AlphaGroove CLI', () => {
  it('should have required command line options', () => {
    const program = new Command();

    // Add the same options as in index.ts
    program
      .requiredOption('--from <date>', 'Start date (YYYY-MM-DD)')
      .requiredOption('--to <date>', 'End date (YYYY-MM-DD)')
      .option(
        '--entry-pattern <pattern>',
        'Entry pattern to use (default: quick-rise)',
        'quick-rise'
      )
      .option('--exit-pattern <pattern>', 'Exit pattern to use (default: fixed-time)', 'fixed-time')
      .option('--ticker <symbol>', 'Ticker to analyze (default: SPY)', 'SPY')
      .option('--timeframe <period>', 'Data resolution (default: 1min)', '1min');

    // Test that options are properly configured
    expect(program.options).toHaveLength(6);
    expect(program.options[0].required).toBe(true);
    expect(program.options[1].required).toBe(true);
  });

  it('should use default values for optional parameters', () => {
    const program = new Command();

    program
      .requiredOption('--from <date>', 'Start date (YYYY-MM-DD)')
      .requiredOption('--to <date>', 'End date (YYYY-MM-DD)')
      .option(
        '--entry-pattern <pattern>',
        'Entry pattern to use (default: quick-rise)',
        'quick-rise'
      )
      .option('--exit-pattern <pattern>', 'Exit pattern to use (default: fixed-time)', 'fixed-time')
      .option('--ticker <symbol>', 'Ticker to analyze (default: SPY)', 'SPY')
      .option('--timeframe <period>', 'Data resolution (default: 1min)', '1min');

    // Parse with only required options
    program.parse(['node', 'index.js', '--from', '2025-05-02', '--to', '2025-05-05']);

    // Check default values
    expect(program.opts().entryPattern).toBe('quick-rise');
    expect(program.opts().exitPattern).toBe('fixed-time');
    expect(program.opts().ticker).toBe('SPY');
    expect(program.opts().timeframe).toBe('1min');
  });
});

// Mock external dependencies
vi.mock('./utils/config.js', async () => {
  const actual = await vi.importActual('./utils/config.js');
  return {
    ...actual,
    loadConfig: vi.fn(() => ({})),
    mergeConfigWithCliOptions: vi.fn((_baseConfig: any, _cliOpts: any) => ({
      ..._baseConfig,
      ..._cliOpts,
      ticker: 'TEST',
      from: '2023-01-01',
      to: '2023-01-02',
      entryPattern: 'test-entry',
      exitPattern: 'test-exit',
      timeframe: '1min',
      llmConfirmationScreen: { enabled: false },
      generateCharts: false,
    })),
  };
});

vi.mock('./utils/data-loader.js', () => ({
  fetchTradesFromQuery: vi.fn(() => []),
}));

vi.mock('./utils/query-builder.js', () => ({
  buildAnalysisQuery: vi.fn(() => mockQueryValue),
}));

vi.mock('./patterns/pattern-factory.js', async () => {
  const actual = await vi.importActual('./patterns/pattern-factory.js');
  return {
    ...actual,
    getEntryPattern: vi.fn(() => ({
      name: 'test-entry',
      direction: 'long',
      apply: vi.fn(),
    })),
    getExitPattern: vi.fn(() => ({ name: 'test-exit', apply: vi.fn() })),
  };
});

vi.mock('./screens/llm-confirmation.screen.js', () => ({
  LlmConfirmationScreen: vi.fn().mockImplementation(() => ({
    shouldSignalProceed: vi.fn(() => Promise.resolve({ proceed: true, cost: 0 })),
  })),
}));

vi.mock('./utils/output.js', async () => {
  const actual = await vi.importActual('./utils/output.js');
  return {
    ...actual,
    printHeader: vi.fn(),
    printTradeDetails: vi.fn(),
    printYearSummary: vi.fn(),
    printOverallSummary: vi.fn(),
    printFooter: vi.fn(),
  };
});

vi.mock('./utils/mappers.js', () => ({
  mapRawDataToTrade: vi.fn(data => ({ ...data, mapped: true }) as any),
}));

vi.mock('./utils/chart-generator.js', () => ({
  generateEntryChart: vi.fn(() => Promise.resolve('path/to/chart.png')),
  generateEntryCharts: vi.fn(() => Promise.resolve([])),
}));

vi.mock('./utils/calculations.js', () => ({
  calculateMeanReturn: vi.fn(() => 0.1),
  calculateMedianReturn: vi.fn(() => 0.05),
  calculateStdDevReturn: vi.fn(() => 0.02),
}));

// Import the modules that are being mocked to access their mocked functions
import { getEntryPattern, getExitPattern } from './patterns/pattern-factory.js';
import { LlmConfirmationScreen } from './screens/llm-confirmation.screen.js';
import {
  calculateMeanReturn,
  calculateMedianReturn,
  calculateStdDevReturn,
} from './utils/calculations.js';
import {
  generateEntryChart as _generateEntryChart,
  generateEntryCharts,
} from './utils/chart-generator.js';
import { loadConfig, mergeConfigWithCliOptions } from './utils/config.js';
import { fetchTradesFromQuery } from './utils/data-loader.js';
import { mapRawDataToTrade } from './utils/mappers.js';
import {
  printHeader,
  printTradeDetails,
  printYearSummary,
  printOverallSummary,
  printFooter,
} from './utils/output.js';
import { buildAnalysisQuery } from './utils/query-builder.js';

let mainModule: any;

beforeAll(async () => {
  mainModule = await import('./index.js');
});

describe('runAnalysis refactored components', () => {
  let mockCliOptions: any;
  let mockRawConfig: any;
  let mockMergedConfigValue: any;
  let mockEntryPatternValue: any;
  let mockExitPatternValue: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCliOptions = { config: 'path/to/config.yaml' };
    mockRawConfig = { someBaseOpt: 'value' };
    mockMergedConfigValue = {
      ticker: 'TEST',
      from: '2023-01-01',
      to: '2023-01-02',
      entryPattern: 'test-entry',
      exitPattern: 'test-exit',
      timeframe: '1min',
      llmConfirmationScreen: { enabled: false },
      generateCharts: false,
      someBaseOpt: 'value',
      config: 'path/to/config.yaml',
    };
    mockEntryPatternValue = { name: 'test-entry', direction: 'long', apply: vi.fn() };
    mockExitPatternValue = { name: 'test-exit', apply: vi.fn() };

    vi.mocked(loadConfig).mockReturnValue(mockRawConfig);
    vi.mocked(mergeConfigWithCliOptions).mockReturnValue(mockMergedConfigValue);
    vi.mocked(getEntryPattern).mockReturnValue(mockEntryPatternValue);
    vi.mocked(getExitPattern).mockReturnValue(mockExitPatternValue);
    vi.mocked(fetchTradesFromQuery).mockReturnValue([]);
    vi.mocked(buildAnalysisQuery).mockReturnValue(mockQueryValue);
  });

  describe('initializeAnalysis', () => {
    it('should load config, get patterns, and build query', () => {
      const result = mainModule.initializeAnalysis(mockCliOptions);
      expect(loadConfig).toHaveBeenCalledWith(mockCliOptions.config);
      expect(mergeConfigWithCliOptions).toHaveBeenCalledWith(mockRawConfig, mockCliOptions);
      expect(getEntryPattern).toHaveBeenCalledWith(
        mockMergedConfigValue.entryPattern,
        mockMergedConfigValue
      );
      expect(getExitPattern).toHaveBeenCalledWith(
        mockMergedConfigValue.exitPattern,
        mockMergedConfigValue
      );
      expect(buildAnalysisQuery).toHaveBeenCalledWith(
        mockMergedConfigValue,
        mockEntryPatternValue,
        mockExitPatternValue
      );
      expect(result.query).toBe(mockQueryValue);
      expect(result.entryPattern.name).toBe('test-entry');
      expect(result.exitPattern.name).toBe('test-exit');
      expect(result.rawConfig).toEqual(mockRawConfig);
      expect(result.mergedConfig).toEqual(mockMergedConfigValue);
    });

    it('should enable LLM screen if configured', () => {
      const llmEnabledConfig = {
        ...mockMergedConfigValue,
        llmConfirmationScreen: { enabled: true },
      };
      vi.mocked(mergeConfigWithCliOptions).mockReturnValue(llmEnabledConfig);
      const { llmScreenInstance, screenSpecificLLMConfig } =
        mainModule.initializeAnalysis(mockCliOptions);
      expect(llmScreenInstance).not.toBeNull();
      expect(LlmConfirmationScreen).toHaveBeenCalled();
      expect(screenSpecificLLMConfig.enabled).toBe(true);
    });
  });

  describe('handleLlmTradeScreeningInternal', () => {
    const mockSignal = {
      ticker: 'TEST',
      trade_date: '2023-01-01',
      price: 100,
      timestamp: '09:30',
      type: 'entry',
      direction: 'long' as 'long' | 'short',
    };
    const mockChartName = 'test-chart';
    const _mockLocalRawConfig = {};
    const getMockAppConfig = (): AppConfig => ({
      default: { direction: 'long', ticker: 'SPY', timeframe: '1min' },
      patterns: { entry: {}, exit: {} },
    });

    it('should return { proceed: true, cost: 0 } if LLM screen is not enabled or instance is null', async () => {
      const resultNullInstance = await mainModule.handleLlmTradeScreeningInternal(
        mockSignal,
        mockChartName,
        null,
        { enabled: true },
        mockMergedConfigValue,
        getMockAppConfig()
      );
      expect(resultNullInstance).toEqual({ proceed: true, cost: 0 });

      const resultDisabled = await mainModule.handleLlmTradeScreeningInternal(
        mockSignal,
        mockChartName,
        new (LlmConfirmationScreen as any)(),
        { enabled: false },
        mockMergedConfigValue,
        getMockAppConfig()
      );
      expect(resultDisabled).toEqual({ proceed: true, cost: 0 });
    });

    it('should call LLM screen if enabled and return its decision with cost', async () => {
      const localMockLlmInstance = new (LlmConfirmationScreen as any)();
      const expectedChartPath = 'path/to/chart.png';
      const mockScreenCost = 0.005;

      vi.mocked(localMockLlmInstance.shouldSignalProceed).mockResolvedValueOnce({
        proceed: false,
        cost: mockScreenCost,
      });

      const resultFalse = await mainModule.handleLlmTradeScreeningInternal(
        mockSignal,
        mockChartName,
        localMockLlmInstance,
        { enabled: true },
        mockMergedConfigValue,
        getMockAppConfig()
      );
      expect(localMockLlmInstance.shouldSignalProceed).toHaveBeenCalledWith(
        mockSignal,
        expectedChartPath,
        { enabled: true },
        getMockAppConfig()
      );
      expect(resultFalse).toEqual({ proceed: false, cost: mockScreenCost });

      const secondMockCost = mockScreenCost + 0.001;
      vi.mocked(localMockLlmInstance.shouldSignalProceed).mockResolvedValueOnce({
        proceed: true,
        cost: secondMockCost,
      });

      const resultTrue = await mainModule.handleLlmTradeScreeningInternal(
        mockSignal,
        mockChartName,
        localMockLlmInstance,
        { enabled: true },
        mockMergedConfigValue,
        getMockAppConfig()
      );
      expect(resultTrue).toEqual({
        proceed: true,
        chartPath: expectedChartPath,
        cost: secondMockCost,
      });
      expect(localMockLlmInstance.shouldSignalProceed).toHaveBeenCalledTimes(2);
    });
  });

  describe('handleYearlyUpdatesInternal', () => {
    let statsContext: any;
    const fullTradeObject = {
      trade_date: '2022-12-31',
      entry_price: 1,
      entry_time: 't',
      exit_price: 1,
      exit_time: 't',
      return_pct: 0,
      direction: 'long' as 'long' | 'short',
      year: '2022',
      ticker: 'T',
    };

    beforeEach(() => {
      statsContext = {
        currentYear: '2022',
        yearTrades: [fullTradeObject],
        seenYears: new Set(['2022']),
        totalStats: {
          total_matches: 10,
          winning_trades: 5,
          total_return_sum: 0,
          median_return: 0,
          std_dev_return: 0,
          win_rate: 0,
          total_trading_days: 0,
        },
      };
    });

    it('should print year summary and reset yearTrades if year changes', () => {
      const tradeData = { year: '2023', match_count: 5 };
      mainModule.handleYearlyUpdatesInternal(tradeData, statsContext);
      expect(printYearSummary).toHaveBeenCalledWith(2022, [fullTradeObject]);
      expect(statsContext.currentYear).toBe('2023');
      expect(statsContext.yearTrades).toEqual([]);
      expect(statsContext.seenYears.has('2023')).toBe(true);
      expect(statsContext.totalStats.total_matches).toBe(15);
    });

    it('should not print summary if year does not change', () => {
      const tradeData = { year: '2022', match_count: 5 };
      mainModule.handleYearlyUpdatesInternal(tradeData, statsContext);
      expect(printYearSummary).not.toHaveBeenCalled();
    });
  });

  describe('processTradesLoop', () => {
    it('should process trades, and correctly call mappers and output functions', async () => {
      const mockTradesFromQueryData = [
        {
          entry_time: '09:30',
          trade_date: '2023-01-01',
          entry_price: 100,
          return_pct: 0.5,
          year: '2023',
          match_count: 1,
        },
        {
          entry_time: '10:00',
          trade_date: '2023-01-01',
          entry_price: 101,
          return_pct: -0.2,
          year: '2023',
          match_count: 1,
        },
      ];
      vi.mocked(fetchTradesFromQuery).mockReturnValue(mockTradesFromQueryData as any);

      vi.mocked(mapRawDataToTrade)
        .mockImplementationOnce(
          (rd: any) =>
            ({ ...rd, mapped_call: 1, direction: mockEntryPatternValue.direction }) as any
        )
        .mockImplementationOnce(
          (rd: any) =>
            ({ ...rd, mapped_call: 2, direction: mockEntryPatternValue.direction }) as any
        );

      const totalStats = {
        total_matches: 0,
        winning_trades: 0,
        total_return_sum: 0,
        median_return: 0,
        std_dev_return: 0,
        win_rate: 0,
        total_trading_days: 0,
      };
      const allReturns: any[] = [];
      const currentMergedConfig = {
        ...mockMergedConfigValue,
        llmConfirmationScreen: { enabled: false },
      };

      const { confirmedTrades, yearTrades, currentYear } = await mainModule.processTradesLoop(
        mockTradesFromQueryData,
        currentMergedConfig,
        mockEntryPatternValue,
        null,
        currentMergedConfig.llmConfirmationScreen,
        mockRawConfig,
        totalStats,
        allReturns
      );

      expect(confirmedTrades.length).toBe(mockTradesFromQueryData.length);
      expect(mapRawDataToTrade).toHaveBeenCalledTimes(mockTradesFromQueryData.length);
      expect(printTradeDetails).toHaveBeenCalledTimes(mockTradesFromQueryData.length);
      expect(printTradeDetails).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ mapped_call: 1 }),
        mockEntryPatternValue.direction
      );
      expect(printTradeDetails).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ mapped_call: 2 }),
        mockEntryPatternValue.direction
      );

      expect(totalStats.winning_trades).toBe(1);
      expect(allReturns).toEqual([0.5, -0.2]);

      expect(printYearSummary).toHaveBeenCalled();
      expect(yearTrades.length).toBeGreaterThan(0);
      expect(currentYear).toBe(mockTradesFromQueryData[0].year.toString());
    });
  });

  describe('finalizeAnalysis', () => {
    it('should calculate final stats and print summary', async () => {
      const totalStats = {
        total_matches: 2,
        winning_trades: 1,
        total_return_sum: 0.3,
        median_return: 0,
        std_dev_return: 0,
        win_rate: 0,
        total_trading_days: 10,
      };
      const allReturns = [0.5, -0.2];
      const confirmedTrades = [{}, {}] as any[];
      mockMergedConfigValue.generateCharts = true;

      await mainModule.finalizeAnalysis(
        totalStats,
        allReturns,
        mockEntryPatternValue,
        mockMergedConfigValue,
        confirmedTrades
      );

      expect(calculateMeanReturn).toHaveBeenCalledWith(allReturns);
      expect(calculateMedianReturn).toHaveBeenCalledWith(allReturns);
      expect(calculateStdDevReturn).toHaveBeenCalled();
      expect(printOverallSummary).toHaveBeenCalled();
      expect(generateEntryCharts).toHaveBeenCalled();
      expect(printFooter).toHaveBeenCalled();
    });
  });

  describe('runAnalysis full flow', () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      vi.mocked(loadConfig).mockClear();
      vi.mocked(mergeConfigWithCliOptions).mockClear();
      vi.mocked(getEntryPattern).mockClear();
      vi.mocked(getExitPattern).mockClear();
      vi.mocked(buildAnalysisQuery).mockClear();
      vi.mocked(fetchTradesFromQuery).mockClear();
      vi.mocked(printHeader).mockClear();
      vi.mocked(mapRawDataToTrade).mockClear();
      vi.mocked(printTradeDetails).mockClear();
      vi.mocked(printYearSummary).mockClear();
      vi.mocked(calculateMeanReturn).mockClear();
      vi.mocked(printOverallSummary).mockClear();
      vi.mocked(printFooter).mockClear();
      consoleLogSpy = vi.spyOn(console, 'log');
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    it('should execute the full analysis flow without LLM and without charts', async () => {
      mockCliOptions.dryRun = false;
      vi.mocked(loadConfig).mockReturnValue(mockRawConfig);
      vi.mocked(mergeConfigWithCliOptions).mockReturnValue(mockMergedConfigValue);
      vi.mocked(getEntryPattern).mockReturnValue(mockEntryPatternValue);
      vi.mocked(getExitPattern).mockReturnValue(mockExitPatternValue);
      vi.mocked(buildAnalysisQuery).mockReturnValue(mockQueryValue);

      const mockTradesData = [
        {
          all_trading_days: 20,
          entry_time: '09:35',
          trade_date: '2023-01-01',
          entry_price: 100,
          return_pct: 1.0,
          year: '2023',
          match_count: 1,
        },
        {
          all_trading_days: 20,
          entry_time: '10:30',
          trade_date: '2023-01-01',
          entry_price: 102,
          return_pct: -0.5,
          year: '2023',
          match_count: 1,
        },
      ];
      vi.mocked(fetchTradesFromQuery).mockReturnValue(mockTradesData as any);
      vi.mocked(mapRawDataToTrade)
        .mockImplementationOnce(
          (rd: any) => ({ ...rd, mapped: true, direction: mockEntryPatternValue.direction }) as any
        )
        .mockImplementationOnce(
          (rd: any) => ({ ...rd, mapped: true, direction: mockEntryPatternValue.direction }) as any
        );

      vi.mocked(calculateMeanReturn).mockReturnValue(0.25);
      vi.mocked(calculateMedianReturn).mockReturnValue(0.25);
      vi.mocked(calculateStdDevReturn).mockReturnValue(0.1);

      await mainModule.runAnalysis(mockCliOptions);

      expect(loadConfig).toHaveBeenCalledWith(mockCliOptions.config);
      expect(mergeConfigWithCliOptions).toHaveBeenCalledWith(mockRawConfig, mockCliOptions);
      expect(buildAnalysisQuery).toHaveBeenCalledWith(
        mockMergedConfigValue,
        mockEntryPatternValue,
        mockExitPatternValue
      );
      expect(fetchTradesFromQuery).toHaveBeenCalledWith(mockQueryValue);
      expect(printHeader).toHaveBeenCalledWith(
        mockMergedConfigValue.ticker,
        mockMergedConfigValue.from,
        mockMergedConfigValue.to,
        mockEntryPatternValue.name,
        mockExitPatternValue.name,
        mockEntryPatternValue.direction
      );
      expect(mapRawDataToTrade).toHaveBeenCalledTimes(mockTradesData.length);
      expect(printTradeDetails).toHaveBeenCalledTimes(mockTradesData.length);
      expect(printYearSummary).toHaveBeenCalled();
      expect(calculateMeanReturn).toHaveBeenCalled();
      expect(printOverallSummary).toHaveBeenCalled();
      expect(printFooter).toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        '\nDry run requested. Exiting without executing query.'
      );
    });

    it('should handle dry run correctly', async () => {
      mockCliOptions.dryRun = true;
      const dryRunQuery = 'DRY RUN SQL QUERY';
      vi.mocked(loadConfig).mockReturnValue(mockRawConfig);
      vi.mocked(mergeConfigWithCliOptions).mockReturnValue({
        ...mockMergedConfigValue,
        debug: true,
      });
      vi.mocked(getEntryPattern).mockReturnValue(mockEntryPatternValue);
      vi.mocked(getExitPattern).mockReturnValue(mockExitPatternValue);
      vi.mocked(buildAnalysisQuery).mockReturnValue(dryRunQuery);

      await mainModule.runAnalysis(mockCliOptions);

      expect(buildAnalysisQuery).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(`\nDEBUG - SQL Query:\n${dryRunQuery}`);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '\nDry run requested. Exiting without executing query.'
      );
      expect(fetchTradesFromQuery).not.toHaveBeenCalled();
      expect(printFooter).toHaveBeenCalledTimes(1);
      expect(printHeader).not.toHaveBeenCalled();
      expect(mapRawDataToTrade).not.toHaveBeenCalled();
      expect(printOverallSummary).not.toHaveBeenCalled();
    });
  });
});
