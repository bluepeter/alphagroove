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
const mockedConvertPolygonData = vi.mocked(convertPolygonData);
const mockedFilterTradingData = vi.mocked(filterTradingData);
const mockedFilterTradingHoursOnly = vi.mocked(filterTradingHoursOnly);
const mockedGenerateScoutChart = vi.mocked(generateScoutChart);
const mockedLlmConfirmationScreen = vi.mocked(LlmConfirmationScreen);
const mockedGetPreviousTradingDay = vi.mocked(getPreviousTradingDay);

describe.skip('Scout Main Function', () => {
  let mockPolygonService: any;
  let mockLlmScreen: any;
  let consoleSpy: any;
  let consoleErrorSpy: any;
  let processExitSpy: any;

  beforeEach(() => {
    // Mock console methods
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    // Mock Date.now for consistent results
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-08-29T18:40:12.000Z'));

    // Setup default mocks
    mockedGetPreviousTradingDay.mockResolvedValue('2025-08-28');
    mockedLoadConfig.mockResolvedValue({
      shared: {
        ticker: 'SPY',
        llmConfirmationScreen: {
          enabled: true,
          llmApiKey: 'test-llm-key',
          numCalls: 2,
          agreementThreshold: 2,
          temperatures: [0.1, 1.0],
        },
      },
      scout: {
        polygon: {
          apiKeyEnvVar: 'POLYGON_API_KEY',
        },
      },
    } as any);

    // Setup mock Polygon service
    mockPolygonService = {
      fetchPolygonData: vi
        .fn()
        .mockResolvedValue([{ t: 1640995200000, o: 100, h: 105, l: 95, c: 102, v: 1000 }]),
    };
    mockedPolygonApiService.mockImplementation(() => mockPolygonService);

    // Setup successful data flow mocks
    mockedConvertPolygonData.mockReturnValue([
      {
        timestamp: '2025-08-29 10:30:00',
        open: 100,
        high: 105,
        low: 95,
        close: 102,
        volume: 1000,
        trade_date: '2025-08-29',
      },
      {
        timestamp: '2025-08-29 14:30:00',
        open: 102,
        high: 107,
        low: 100,
        close: 105,
        volume: 1200,
        trade_date: '2025-08-29',
      },
    ]);
    mockedFilterTradingData.mockReturnValue([
      {
        timestamp: '2025-08-29 14:30:00',
        open: 102,
        high: 107,
        low: 100,
        close: 105,
        volume: 1200,
        trade_date: '2025-08-29',
      },
    ]);
    mockedFilterTradingHoursOnly.mockReturnValue([
      {
        timestamp: '2025-08-29 10:30:00',
        open: 100,
        high: 105,
        low: 95,
        close: 102,
        volume: 1000,
        trade_date: '2025-08-29',
      },
      {
        timestamp: '2025-08-29 14:30:00',
        open: 102,
        high: 107,
        low: 100,
        close: 105,
        volume: 1200,
        trade_date: '2025-08-29',
      },
    ]);
    mockedGenerateScoutChart.mockResolvedValue('/path/to/chart.png');

    // Setup mock LLM screen
    mockLlmScreen = {
      shouldSignalProceed: vi.fn().mockResolvedValue({
        proceed: true,
        direction: 'long',
        rationale: 'Strong upward momentum',
        cost: 0.001234,
        averagedProposedStopLoss: 98.5,
        averagedProposedProfitTarget: 106.0,
        _debug: {
          responses: [
            {
              action: 'long',
              rationalization: 'Price breaking resistance',
              confidence: 8,
              proposedStopLoss: 98.5,
              proposedProfitTarget: 106.0,
              cost: 0.0006,
            },
          ],
        },
      }),
    };
    mockedLlmConfirmationScreen.mockImplementation(() => mockLlmScreen);

    // Mock environment variable
    process.env.POLYGON_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    vi.useRealTimers();
    delete process.env.POLYGON_API_KEY;
  });

  it('should execute full scout analysis successfully', async () => {
    const options = { verbose: false };

    await main(options);

    // Verify core functionality was called
    expect(mockedLoadConfig).toHaveBeenCalled();
    expect(mockedPolygonApiService).toHaveBeenCalledWith('test-api-key');
    expect(mockPolygonService.fetchPolygonData).toHaveBeenCalledWith(
      'SPY',
      '2025-08-28',
      expect.any(String)
    );
    expect(mockedConvertPolygonData).toHaveBeenCalled();
    expect(mockedFilterTradingHoursOnly).toHaveBeenCalled();
    expect(mockedGenerateScoutChart).toHaveBeenCalled();
    expect(mockLlmScreen.shouldSignalProceed).toHaveBeenCalled();

    // Verify no errors occurred
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('should handle missing ticker configuration', async () => {
    mockedLoadConfig.mockResolvedValue({
      shared: {},
      scout: { polygon: { apiKeyEnvVar: 'POLYGON_API_KEY' } },
    } as any);

    await main();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error in scout analysis:',
      expect.objectContaining({
        message: expect.stringContaining('Ticker is required'),
      })
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should handle missing Polygon API configuration', async () => {
    mockedLoadConfig.mockResolvedValue({
      shared: { ticker: 'SPY' },
    } as any);

    await main();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error in scout analysis:',
      expect.objectContaining({
        message: expect.stringContaining('Polygon API configuration is required'),
      })
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should handle missing API key environment variable', async () => {
    delete process.env.POLYGON_API_KEY;

    await main();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error in scout analysis:',
      expect.objectContaining({
        message: expect.stringContaining('Polygon API key not found'),
      })
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should handle Polygon API fetch errors', async () => {
    mockPolygonService.fetchPolygonData.mockRejectedValue(new Error('API request failed'));

    await main();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error in scout analysis:',
      expect.objectContaining({
        message: 'API request failed',
      })
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should handle chart generation failure', async () => {
    mockedGenerateScoutChart.mockRejectedValue(new Error('Chart generation failed'));

    await main();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error in scout analysis:',
      expect.objectContaining({
        message: 'Chart generation failed',
      })
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should handle LLM analysis errors gracefully', async () => {
    mockLlmScreen.shouldSignalProceed.mockRejectedValue(new Error('LLM API failed'));

    await main();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error in LLM analysis:'),
      expect.objectContaining({
        message: 'LLM API failed',
      })
    );
    // Should not exit on LLM error, just continue
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('should skip LLM analysis when no LLM configuration found', async () => {
    mockedLoadConfig.mockResolvedValue({
      shared: { ticker: 'SPY' },
      scout: { polygon: { apiKeyEnvVar: 'POLYGON_API_KEY' } },
    } as any);

    await main();

    expect(mockLlmScreen.shouldSignalProceed).not.toHaveBeenCalled();
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('should use command line options to override config', async () => {
    const options = {
      ticker: 'AAPL',
      date: '2024-01-05',
      time: '14:30',
    };

    await main(options);

    expect(mockPolygonService.fetchPolygonData).toHaveBeenCalledWith(
      'AAPL',
      expect.any(String),
      '2024-01-05'
    );
  });

  it('should handle no trading data for current time', async () => {
    // Mock convertPolygonData to return bars that are all after current time
    mockedConvertPolygonData.mockReturnValue([
      {
        timestamp: '2025-08-29 20:00:00', // After current time
        open: 100,
        high: 105,
        low: 95,
        close: 102,
        volume: 1000,
        trade_date: '2025-08-29',
      },
    ]);

    const options = {
      date: '2025-08-29',
      time: '12:30', // Before the 8:00 PM mock data
    };

    await main(options);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error in scout analysis:'),
      expect.objectContaining({
        message: expect.stringContaining('No trading data available for current time'),
      })
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });
});
