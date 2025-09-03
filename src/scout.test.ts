import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { main } from './scout';
import { loadConfig } from './utils/config';
import { PolygonApiService } from './services/polygon-api.service';
import {
  convertPolygonData,
  filterTradingData,
  filterTradingHoursOnly,
} from './utils/polygon-data-converter';
import { generateScoutChart } from './utils/scout-chart-generator';
import { LlmConfirmationScreen } from './screens/llm-confirmation.screen';
import { getPreviousTradingDay } from './utils/date-helpers';

// Mock all dependencies
vi.mock('./utils/config');
vi.mock('./services/polygon-api.service');
vi.mock('./utils/polygon-data-converter');
vi.mock('./utils/scout-chart-generator');
vi.mock('./screens/llm-confirmation.screen');
vi.mock('./utils/date-helpers');

const mockedLoadConfig = vi.mocked(loadConfig);
const mockedPolygonApiService = vi.mocked(PolygonApiService);
const _mockedConvertPolygonData = vi.mocked(convertPolygonData);
const _mockedFilterTradingData = vi.mocked(filterTradingData);
const _mockedFilterTradingHoursOnly = vi.mocked(filterTradingHoursOnly);
const _mockedGenerateScoutChart = vi.mocked(generateScoutChart);
const _mockedLlmConfirmationScreen = vi.mocked(LlmConfirmationScreen);
const mockedGetPreviousTradingDay = vi.mocked(getPreviousTradingDay);

describe('Scout Main Function', () => {
  let consoleSpy: any;
  let consoleErrorSpy: any;
  let processExitSpy: any;

  beforeEach(() => {
    // Mock console methods
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    // Reset all mocks
    vi.clearAllMocks();
    // Set up environment variable for tests that need it
    process.env.POLYGON_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    delete process.env.POLYGON_API_KEY;
  });

  it('should handle missing ticker configuration', async () => {
    mockedLoadConfig.mockResolvedValue({
      shared: {},
      scout: { polygon: { apiKeyEnvVar: 'POLYGON_API_KEY' } },
    } as any);

    try {
      await main({ date: '2025-08-29', time: '10:40' });
    } catch {
      // Expected to throw
    }

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error in scout analysis:',
      expect.objectContaining({
        message: 'Ticker not configured. Please set shared.ticker in alphagroove.config.yaml',
      })
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should handle missing Polygon API configuration', async () => {
    mockedLoadConfig.mockResolvedValue({
      shared: { ticker: 'SPY' },
    } as any);

    try {
      await main({ date: '2025-08-29', time: '10:40' });
    } catch {
      // Expected to throw
    }

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error in scout analysis:',
      expect.objectContaining({
        message:
          'Polygon API key environment variable not configured. Please set scout.polygon.apiKeyEnvVar in alphagroove.config.yaml',
      })
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should handle missing API key environment variable', async () => {
    delete process.env.POLYGON_API_KEY;

    mockedLoadConfig.mockResolvedValue({
      shared: { ticker: 'SPY' },
      scout: { polygon: { apiKeyEnvVar: 'POLYGON_API_KEY' } },
    } as any);

    // Mock the constructor to throw the right error
    mockedPolygonApiService.mockImplementation(() => {
      throw new Error('Environment variable POLYGON_API_KEY not set');
    });

    try {
      await main({ date: '2025-08-29', time: '10:40' });
    } catch {
      // Expected to throw
    }

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error in scout analysis:',
      expect.objectContaining({
        message: 'Environment variable POLYGON_API_KEY not set',
      })
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should execute full scout analysis successfully', async () => {
    // Setup proper mocking for successful flow
    mockedLoadConfig.mockResolvedValue({
      shared: {
        ticker: 'SPY',
        llmConfirmationScreen: {
          llmProvider: 'anthropic',
          modelName: 'claude-sonnet-4-20250514',
          apiKeyEnvVar: 'ANTHROPIC_API_KEY',
        },
      },
      scout: { polygon: { apiKeyEnvVar: 'POLYGON_API_KEY' } },
    } as any);

    // Mock successful data flow
    const mockPolygonInstance = {
      fetchPolygonData: vi.fn().mockResolvedValue([]),
      fetchDailyBars: vi.fn().mockResolvedValue([]),
    };
    mockedPolygonApiService.mockImplementation(() => mockPolygonInstance as any);

    vi.mocked(convertPolygonData).mockReturnValue([]);
    vi.mocked(filterTradingData).mockReturnValue([]);
    vi.mocked(filterTradingHoursOnly).mockReturnValue([]);
    vi.mocked(generateScoutChart).mockResolvedValue('/path/to/chart.png');
    mockedGetPreviousTradingDay.mockResolvedValue('2025-08-28');

    // Mock LLM screen
    const mockLlmInstance = {
      shouldSignalProceed: vi.fn().mockResolvedValue({
        proceed: false,
        cost: 0.01,
        rationale: 'Test rationale',
      }),
    };
    vi.mocked(LlmConfirmationScreen).mockImplementation(() => mockLlmInstance as any);

    await main({ date: '2025-08-29', time: '10:40' });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('AlphaGroove Entry Scout'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Ticker: SPY'));
  });

  it('should handle Polygon API fetch errors', async () => {
    mockedLoadConfig.mockResolvedValue({
      shared: { ticker: 'SPY' },
      scout: { polygon: { apiKeyEnvVar: 'POLYGON_API_KEY' } },
    } as any);

    const mockPolygonInstance = {
      fetchPolygonData: vi.fn().mockRejectedValue(new Error('API Error')),
      fetchDailyBars: vi.fn().mockResolvedValue([]),
    };
    mockedPolygonApiService.mockImplementation(() => mockPolygonInstance as any);

    await main({ date: '2025-08-29', time: '10:40' });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error in scout analysis:',
      expect.objectContaining({ message: 'API Error' })
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should use command line options to override config', async () => {
    mockedLoadConfig.mockResolvedValue({
      shared: { ticker: 'SPY' },
      scout: { polygon: { apiKeyEnvVar: 'POLYGON_API_KEY' } },
    } as any);

    const mockPolygonInstance = {
      fetchPolygonData: vi.fn().mockResolvedValue([]),
      fetchDailyBars: vi.fn().mockResolvedValue([]),
    };
    mockedPolygonApiService.mockImplementation(() => mockPolygonInstance as any);

    const mockData = [
      {
        timestamp: '2025-08-29 10:40:00',
        open: 100,
        high: 101,
        low: 99,
        close: 100,
        volume: 1000,
        trade_date: '2025-08-29',
      },
    ];
    vi.mocked(convertPolygonData).mockReturnValue(mockData);
    vi.mocked(filterTradingData).mockReturnValue(mockData);
    vi.mocked(filterTradingHoursOnly).mockReturnValue(mockData);
    vi.mocked(generateScoutChart).mockResolvedValue('/path/to/chart.png');
    mockedGetPreviousTradingDay.mockResolvedValue('2025-08-28');

    await main({ ticker: 'AAPL', date: '2025-08-29', time: '10:40' });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Ticker: AAPL'));
  });

  it('should handle no trading data for current time', async () => {
    mockedLoadConfig.mockResolvedValue({
      shared: { ticker: 'SPY' },
      scout: { polygon: { apiKeyEnvVar: 'POLYGON_API_KEY' } },
    } as any);

    const mockPolygonInstance = {
      fetchPolygonData: vi.fn().mockResolvedValue([]),
      fetchDailyBars: vi.fn().mockResolvedValue([]),
    };
    mockedPolygonApiService.mockImplementation(() => mockPolygonInstance as any);

    vi.mocked(convertPolygonData).mockReturnValue([]);
    vi.mocked(filterTradingData).mockReturnValue([]); // No data for current time
    vi.mocked(filterTradingHoursOnly).mockReturnValue([]);
    mockedGetPreviousTradingDay.mockResolvedValue('2025-08-28');

    await main({ date: '2025-08-29', time: '10:40' });

    expect(consoleErrorSpy).toHaveBeenCalledWith('Error in scout analysis:', expect.any(Error));
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });
});
