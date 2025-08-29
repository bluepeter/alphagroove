import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';

// Mock axios
vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    isAxiosError: vi.fn(),
  },
}));

// Mock dependencies
vi.mock('fs', () => ({
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(true),
    unlinkSync: vi.fn(),
  },
}));

vi.mock('path', () => ({
  default: {
    join: vi.fn((...args) => args.join('/')),
  },
}));

vi.mock('./utils/chart-generator', () => ({
  generateSvgChart: vi.fn().mockReturnValue('<svg>mock chart</svg>'),
}));

vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    flatten: vi.fn().mockReturnThis(),
    png: vi.fn().mockReturnThis(),
    toFile: vi.fn().mockResolvedValue({}),
  })),
}));

const mockConfig = {
  shared: {
    ticker: 'SPY',
    timeframe: '1min',
  },
  scout: {
    polygon: {
      apiKeyEnvVar: 'POLYGON_API_KEY',
    },
  },
};

vi.mock('./utils/config', () => ({
  loadConfig: vi.fn(() => mockConfig),
}));

describe('Entry Scout Tool', () => {
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalProcessExit = process.exit;
  const originalEnv = process.env;
  const mockedAxios = vi.mocked(axios);

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();

    // Mock console to avoid cluttering test output
    console.log = vi.fn();
    console.error = vi.fn();

    // Mock process.exit to avoid exiting tests
    process.exit = vi.fn() as any;

    // Mock environment variables
    process.env = {
      ...originalEnv,
      POLYGON_API_KEY: 'test-api-key',
    };

    // Reset axios mock - these are now properly mocked functions
    vi.mocked(mockedAxios.get).mockClear();
    vi.mocked(mockedAxios.isAxiosError).mockReturnValue(false);
  });

  afterEach(() => {
    // Restore original functions
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    process.exit = originalProcessExit;
    process.env = originalEnv;
  });

  it('should exit with error when ticker is not configured', async () => {
    const configWithoutTicker = {
      shared: {
        ticker: '', // Empty ticker should trigger error
        timeframe: '1min',
      },
      scout: {
        polygon: {
          apiKeyEnvVar: 'POLYGON_API_KEY',
        },
      },
    };

    vi.mocked(await import('./utils/config')).loadConfig.mockReturnValueOnce(
      configWithoutTicker as any
    );

    const { main } = await import('./scout');
    await main({});

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Error: Ticker symbol is required')
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('should exit with error when Polygon API configuration is missing', async () => {
    const configWithoutPolygon = {
      shared: {
        ticker: 'SPY',
        timeframe: '1min',
      },
      scout: {},
    };

    vi.mocked(await import('./utils/config')).loadConfig.mockReturnValueOnce(configWithoutPolygon);

    const { main } = await import('./scout');
    await main({});

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Error: Polygon API configuration not found')
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('should exit with error when API key environment variable is not set', async () => {
    delete process.env.POLYGON_API_KEY;

    // Mock axios to reject with undefined response to simulate missing API key
    vi.mocked(mockedAxios.get).mockRejectedValueOnce(new Error('Request failed'));

    const { main } = await import('./scout');
    await main({});

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Error fetching data from Polygon API:'),
      expect.any(Error)
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('should handle Polygon API errors gracefully', async () => {
    vi.mocked(mockedAxios.get).mockRejectedValueOnce({
      response: { status: 401, statusText: 'Unauthorized' },
    });
    vi.mocked(mockedAxios.isAxiosError).mockReturnValue(true);

    const { main } = await import('./scout');
    await main({});

    // Should call console.error twice - once for the API error and once for the general scout error
    expect(console.error).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('Error fetching data from Polygon API:'),
      expect.any(Error)
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('should handle empty API response', async () => {
    vi.mocked(mockedAxios.get).mockResolvedValueOnce({
      data: {
        status: 'OK',
        results: [],
      },
    });

    const { main } = await import('./scout');
    await main({});

    // Should call console.error twice - once for the API error and once for the general scout error
    expect(console.error).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('Error fetching data from Polygon API:'),
      expect.any(Error)
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('should successfully generate chart with valid data', async () => {
    const mockPolygonData = {
      status: 'OK',
      results: [
        // Previous day data (full trading day)
        {
          t: new Date('2025-01-14T14:30:00Z').getTime(), // 9:30 AM ET previous day
          o: 587.0,
          h: 587.5,
          l: 586.75,
          c: 587.25,
          v: 1000000,
        },
        // Current day data (up to entry time)
        {
          t: new Date('2025-01-15T14:30:00Z').getTime(), // 9:30 AM ET (14:30 UTC)
          o: 587.5,
          h: 588.0,
          l: 587.25,
          c: 587.75,
          v: 1000000,
        },
      ],
    };

    vi.mocked(mockedAxios.get).mockResolvedValueOnce({
      data: mockPolygonData,
    });

    const { main } = await import('./scout');
    await main({ date: '2025-01-15', time: '09:30' });

    // Should not exit with error
    expect(process.exit).not.toHaveBeenCalledWith(1);

    // Should show success message
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('✅ Chart generated successfully!')
    );
  });

  it('should use default values when options are not provided', async () => {
    const mockPolygonData = {
      status: 'OK',
      results: [
        {
          t: new Date('2025-01-15T14:30:00Z').getTime(), // Trading hours data
          o: 587.5,
          h: 588.0,
          l: 587.25,
          c: 587.75,
          v: 1000000,
        },
      ],
    };

    vi.mocked(mockedAxios.get).mockResolvedValueOnce({
      data: mockPolygonData,
    });

    const { main } = await import('./scout');
    await main({});

    // Should use today's date and current time by default
    expect(vi.mocked(mockedAxios.get)).toHaveBeenCalledWith(
      expect.stringContaining('SPY/range/1/minute/')
    );
  });

  it('should handle different timeframes correctly', async () => {
    const configWith5Min = {
      shared: {
        ticker: 'SPY',
        timeframe: '5min',
      },
      scout: {
        polygon: {
          apiKeyEnvVar: 'POLYGON_API_KEY',
        },
      },
    };

    vi.mocked(await import('./utils/config')).loadConfig.mockReturnValueOnce(configWith5Min);

    const mockPolygonData = {
      status: 'OK',
      results: [
        {
          t: new Date('2025-01-15T14:30:00Z').getTime(), // Trading hours data
          o: 587.5,
          h: 588.0,
          l: 587.25,
          c: 587.75,
          v: 1000000,
        },
      ],
    };

    vi.mocked(mockedAxios.get).mockResolvedValueOnce({
      data: mockPolygonData,
    });

    const { main } = await import('./scout');
    await main({});

    // Should use 5-minute multiplier
    expect(vi.mocked(mockedAxios.get)).toHaveBeenCalledWith(
      expect.stringContaining('/range/5/minute/')
    );
  });

  it('should filter data to trading hours', async () => {
    const mockPolygonData = {
      status: 'OK',
      results: [
        // Previous day - trading hours
        {
          t: new Date('2025-01-14T14:30:00Z').getTime(), // 9:30 AM ET previous day
          o: 587.0,
          h: 587.5,
          l: 586.75,
          c: 587.25,
          v: 1000000,
        },
        // Current day - before market hours
        {
          t: new Date('2025-01-15T08:00:00Z').getTime(),
          o: 587.5,
          h: 588.0,
          l: 587.25,
          c: 587.75,
          v: 1000000,
        },
        // Current day - during trading hours
        {
          t: new Date('2025-01-15T14:30:00Z').getTime(), // 9:30 AM ET
          o: 587.75,
          h: 588.25,
          l: 587.5,
          c: 588.0,
          v: 1200000,
        },
        // Current day - after market hours
        {
          t: new Date('2025-01-15T22:00:00Z').getTime(),
          o: 588.0,
          h: 588.5,
          l: 587.75,
          c: 588.25,
          v: 800000,
        },
      ],
    };

    vi.mocked(mockedAxios.get).mockResolvedValueOnce({
      data: mockPolygonData,
    });

    const { main } = await import('./scout');
    await main({ date: '2025-01-15', time: '09:30' });

    // Should not exit with error (has trading hours data)
    expect(process.exit).not.toHaveBeenCalledWith(1);
  });

  it('should handle verbose output correctly', async () => {
    const mockPolygonData = {
      status: 'OK',
      results: [
        // Previous day data
        {
          t: new Date('2025-01-14T14:30:00Z').getTime(),
          o: 587.0,
          h: 587.5,
          l: 586.75,
          c: 587.25,
          v: 1000000,
        },
        // Current day data
        {
          t: new Date('2025-01-15T14:30:00Z').getTime(),
          o: 587.5,
          h: 588.0,
          l: 587.25,
          c: 587.75,
          v: 1000000,
        },
      ],
    };

    vi.mocked(mockedAxios.get).mockResolvedValueOnce({
      data: mockPolygonData,
    });

    const { main } = await import('./scout');
    await main({ verbose: true, date: '2025-01-15', time: '09:30' });

    // Should show verbose output (configuration loading, trade date, etc.)
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Trade date: 2025-01-15'));
  });

  it('should override ticker from command line options', async () => {
    const mockPolygonData = {
      status: 'OK',
      results: [
        {
          t: new Date('2025-01-15T14:30:00Z').getTime(), // Trading hours data
          o: 400.5,
          h: 401.0,
          l: 400.25,
          c: 400.75,
          v: 1000000,
        },
      ],
    };

    vi.mocked(mockedAxios.get).mockResolvedValueOnce({
      data: mockPolygonData,
    });

    const { main } = await import('./scout');
    await main({ ticker: 'QQQ' });

    // Should use QQQ instead of SPY from config
    expect(vi.mocked(mockedAxios.get)).toHaveBeenCalledWith(expect.stringContaining('QQQ/range/'));
  });
});
