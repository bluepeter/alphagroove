import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { main } from './scout';

// Mock all dependencies
vi.mock('dotenv');
vi.mock('./utils/config');
vi.mock('./services/polygon-api.service');
vi.mock('./utils/date-helpers');
vi.mock('./utils/polygon-data-converter');
vi.mock('./utils/scout-chart-generator');
vi.mock('./screens/llm-confirmation.screen');

// Import mocked modules
import { loadConfig } from './utils/config';
import { PolygonApiService } from './services/polygon-api.service';
import { getPreviousTradingDay } from './utils/date-helpers';
import {
  convertPolygonData,
  filterTradingData,
  filterTradingHoursOnly,
} from './utils/polygon-data-converter';
import { generateScoutChart } from './utils/scout-chart-generator';
import { LlmConfirmationScreen } from './screens/llm-confirmation.screen';

const mockedLoadConfig = vi.mocked(loadConfig);
const mockedPolygonApiService = vi.mocked(PolygonApiService);
const mockedGetPreviousTradingDay = vi.mocked(getPreviousTradingDay);
const mockedConvertPolygonData = vi.mocked(convertPolygonData);
const mockedFilterTradingData = vi.mocked(filterTradingData);
const mockedFilterTradingHoursOnly = vi.mocked(filterTradingHoursOnly);
const mockedGenerateScoutChart = vi.mocked(generateScoutChart);
const mockedLlmConfirmationScreen = vi.mocked(LlmConfirmationScreen);

describe('Scout Main Function', () => {
  let mockPolygonService: any;
  let mockLlmScreen: any;
  let consoleSpy: any;
  let consoleErrorSpy: any;
  let processExitSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup console spies
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    // Mock environment variables
    process.env.POLYGON_API_KEY = 'test-api-key';

    // Setup mock config
    mockedLoadConfig.mockResolvedValue({
      shared: {
        ticker: 'SPY',
        llmConfirmationScreen: {
          llmProvider: 'anthropic',
          modelName: 'claude-sonnet-4',
          apiKeyEnvVar: 'ANTHROPIC_API_KEY',
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

    // Setup other mocks
    mockedGetPreviousTradingDay.mockReturnValue('2024-01-02');
    mockedConvertPolygonData.mockReturnValue([
      {
        timestamp: '2024-01-03 14:30:00',
        open: 100,
        high: 105,
        low: 95,
        close: 102,
        volume: 1000,
        trade_date: '2024-01-03',
      },
    ]);
    mockedFilterTradingData.mockReturnValue([
      {
        timestamp: '2024-01-03 14:30:00',
        open: 100,
        high: 105,
        low: 95,
        close: 102,
        volume: 1000,
        trade_date: '2024-01-03',
      },
    ]);
    mockedFilterTradingHoursOnly.mockReturnValue([
      {
        timestamp: '2024-01-03 14:30:00',
        open: 100,
        high: 105,
        low: 95,
        close: 102,
        volume: 1000,
        trade_date: '2024-01-03',
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
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it('should execute full scout analysis successfully', async () => {
    const options = { verbose: false };

    await main(options);

    expect(mockedLoadConfig).toHaveBeenCalled();
    expect(mockedPolygonApiService).toHaveBeenCalledWith('test-api-key');
    expect(mockPolygonService.fetchPolygonData).toHaveBeenCalledWith(
      'SPY',
      '2024-01-02',
      expect.any(String)
    );
    expect(mockedConvertPolygonData).toHaveBeenCalled();
    expect(mockedFilterTradingData).toHaveBeenCalled();
    expect(mockedGenerateScoutChart).toHaveBeenCalled();
    expect(mockLlmScreen.shouldSignalProceed).toHaveBeenCalled();
  });

  it('should handle missing ticker configuration', async () => {
    mockedLoadConfig.mockResolvedValue({
      shared: {},
      scout: { polygon: { apiKeyEnvVar: 'POLYGON_API_KEY' } },
    } as any);

    await main();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error in scout analysis:'),
      expect.objectContaining({
        message: expect.stringContaining('Ticker not configured'),
      })
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should handle missing Polygon API configuration', async () => {
    mockedLoadConfig.mockResolvedValue({
      shared: { ticker: 'SPY' },
      scout: {},
    } as any);

    await main();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error in scout analysis:'),
      expect.objectContaining({
        message: expect.stringContaining('Polygon API key environment variable not configured'),
      })
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should handle missing API key environment variable', async () => {
    delete process.env.POLYGON_API_KEY;

    await main();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error in scout analysis:'),
      expect.objectContaining({
        message: expect.stringContaining('Environment variable POLYGON_API_KEY not set'),
      })
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should handle Polygon API fetch errors', async () => {
    mockPolygonService.fetchPolygonData.mockRejectedValue(new Error('API request failed'));

    await main();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error in scout analysis:'),
      expect.objectContaining({
        message: 'API request failed',
      })
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should handle chart generation failure', async () => {
    mockedGenerateScoutChart.mockResolvedValue('');

    await main();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to generate chart')
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
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Chart generated successfully, but LLM analysis failed.')
    );
  });

  it('should skip LLM analysis when no LLM configuration found', async () => {
    mockedLoadConfig.mockResolvedValue({
      shared: { ticker: 'SPY' },
      scout: { polygon: { apiKeyEnvVar: 'POLYGON_API_KEY' } },
    } as any);

    await main();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('No LLM configuration found. Skipping LLM analysis.')
    );
    expect(mockLlmScreen.shouldSignalProceed).not.toHaveBeenCalled();
  });

  it('should display LLM decision for long trade', async () => {
    await main();

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('🤖 LLM Analysis Results:'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('✅ ENTER TRADE'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('LONG 🔼'));
  });

  it('should display trading instructions when trade is recommended', async () => {
    await main();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('📋 Manual Trading Instructions:')
    );
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Entry Price: $102.00'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Stop Loss: $98.50'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Profit Target: $106.00'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Risk/Reward Ratio:'));
  });

  it('should display LLM rationale when available', async () => {
    await main();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('🧠 LLM Rationale: Strong upward momentum')
    );
  });

  it('should display individual LLM responses in verbose mode', async () => {
    await main({ verbose: true });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('📝 Individual LLM Responses:')
    );
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('LLM 1: 🔼 LONG'));
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Reasoning: Price breaking resistance')
    );
  });

  it('should display LLM cost information', async () => {
    await main();

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Total LLM Cost: $0.001234'));
  });

  it('should handle no-trade LLM decision', async () => {
    mockLlmScreen.shouldSignalProceed.mockResolvedValue({
      proceed: false,
      direction: null,
      rationale: 'Uncertain market conditions',
      cost: 0.001234,
    });

    await main();

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('❌ DO NOT ENTER'));
    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('📋 Manual Trading Instructions:')
    );
  });

  it('should use command line options to override config', async () => {
    const options = {
      ticker: 'QQQ',
      date: '2024-01-05',
      time: '10:30',
    };

    await main(options);

    expect(mockPolygonService.fetchPolygonData).toHaveBeenCalledWith(
      'QQQ',
      expect.any(String),
      '2024-01-05'
    );
  });

  it('should handle no trading data for current time', async () => {
    // Mock convertPolygonData to return bars that are all after current time
    // This will cause createEntrySignal to fail
    mockedConvertPolygonData.mockReturnValue([
      {
        timestamp: '2024-01-03 16:30:00', // After current time
        open: 100,
        high: 105,
        low: 95,
        close: 102,
        volume: 1000,
        trade_date: '2024-01-03',
      },
    ]);

    // Use a specific time that's before the mock data timestamp
    const options = {
      date: '2024-01-03',
      time: '14:30', // 2:30 PM, before the 4:30 PM mock data
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
