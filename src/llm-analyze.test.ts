import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
// import path from 'path'; // Removed as unused, or use _path if needed for side effects only
// import { LlmConfirmationScreen } from '../src/screens/llm-confirmation.screen'; // Removed as unused
// import { loadConfig } from '../src/utils/config'; // Removed as unused

// Mock dependencies
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
  },
}));

vi.mock('path', () => ({
  basename: vi.fn().mockReturnValue('test-file.png'),
  dirname: vi.fn().mockReturnValue('/test-dir'),
  extname: vi.fn().mockReturnValue('.png'),
  join: vi.fn().mockReturnValue('/test-dir/output.png'),
}));

const mockFullConfig = {
  default: {
    ticker: 'SPY',
    timeframe: '1min',
    direction: 'long' as 'long',
  },
  patterns: {
    entry: {},
    exit: {},
  },
  llmConfirmationScreen: {
    enabled: true,
    modelName: 'test-model',
    numCalls: 3,
    agreementThreshold: 2,
  },
};

vi.mock('./utils/config', () => ({
  loadConfig: vi.fn(() => mockFullConfig),
}));

vi.mock('./screens/llm-confirmation.screen', () => {
  return {
    LlmConfirmationScreen: vi.fn().mockImplementation(() => ({
      id: 'llm-confirmation',
      name: 'LLM Chart Confirmation Screen',
      shouldSignalProceed: vi.fn().mockResolvedValue({
        proceed: true,
        direction: 'long',
        cost: 0.05,
        rationale: 'Strong bullish pattern',
        _debug: {
          responses: [
            { action: 'long', rationalization: 'Uptrend', cost: 0.02 },
            { action: 'long', rationalization: 'Support level', cost: 0.02 },
            { action: 'short', rationalization: 'Overextended', cost: 0.01 },
          ],
        },
      }),
    })),
  };
});

describe('LLM Analyze Tool', () => {
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalProcessExit = process.exit;

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();

    // Mock console.log to avoid cluttering test output
    console.log = vi.fn();
    console.error = vi.fn();

    // Mock process.exit to avoid exiting tests
    process.exit = vi.fn() as any;
  });

  afterEach(() => {
    // Restore original functions
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    process.exit = originalProcessExit;
  });

  it('should exit with error when image file does not exist', async () => {
    // Mock file not existing
    (fs.existsSync as any).mockReturnValueOnce(false);

    // Import the main function
    const { main } = await import('./llm-analyze');
    await main('non-existent-file.png', { direction: 'long' });

    // Check that we exited with error
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Error: Image file not found')
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('should exit with error when LLM configuration is not enabled', async () => {
    // Override the mock to return a config without llm enabled
    const configWithoutLLM = {
      default: {
        ticker: 'SPY',
        timeframe: '1min',
        direction: 'long' as 'long',
      },
      patterns: {
        entry: {},
        exit: {},
      },
    };
    vi.mocked(await import('./utils/config')).loadConfig.mockReturnValueOnce(configWithoutLLM);

    // Import the main function
    const { main } = await import('./llm-analyze');
    await main('test-file.png', { direction: 'long' });

    // Check that we exited with error
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Error: LLM configuration not found in config file')
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('should display LLM analysis results correctly', async () => {
    // Import the main function
    const { main } = await import('./llm-analyze');

    // Just call the function and verify it doesn't throw
    await expect(main('test-file.png', { direction: 'long' })).resolves.not.toThrow();

    // Check that console.log was called at least once
    expect(console.log).toHaveBeenCalled();
  });
});
