import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import {
  processLlmResult,
  generateScoutOutputSummary,
  saveScoutOutputFiles,
  type LlmResultData,
  type BacktestOutputData,
} from './llm-result-processor';
import { addLlmResultOverlay } from './scout-chart-generator';

// Mock dependencies
vi.mock('fs');
vi.mock('./scout-chart-generator');

const mockedFs = vi.mocked(fs);
const mockedAddLlmResultOverlay = vi.mocked(addLlmResultOverlay);

describe('LLM Result Processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAddLlmResultOverlay.mockResolvedValue('test_result_chart.png');
  });

  const mockLlmResultData: LlmResultData = {
    ticker: 'SPY',
    tradeDate: '2025-01-08',
    entrySignal: {
      timestamp: '2025-01-08 14:30:00',
      price: 642.5,
      type: 'entry',
    },
    decision: 'long',
    proceed: true,
    direction: 'long',
    cost: 0.01,
    rationale: 'Strong bullish momentum',
    averagedProposedStopLoss: 635.0,
    averagedProposedProfitTarget: 650.0,
  };

  const mockBacktestData: BacktestOutputData = {
    ...mockLlmResultData,
    executionPrice: 642.75,
    atrValue: 2.5,
    stopLossPrice: 634.5,
    profitTargetPrice: 651.25,
  };

  describe('processLlmResult', () => {
    it('should process scout results correctly', async () => {
      const result = await processLlmResult(
        'charts/scout/test_chart.png',
        mockLlmResultData,
        'charts/scout',
        true // isScout
      );

      expect(mockedAddLlmResultOverlay).toHaveBeenCalledWith('charts/scout/test_chart.png', 'long');
      expect(mockedFs.writeFileSync).toHaveBeenCalledTimes(2); // timestamped and latest files
      expect(mockedFs.copyFileSync).toHaveBeenCalledWith(
        'test_result_chart.png',
        'charts/scout/latest_masked_result.png'
      );

      expect(result.resultChartPath).toBe('test_result_chart.png');
      expect(result.outputFilePath).toContain('_action_LONG.txt');
      expect(result.latestOutputPath).toContain('latest_action.txt');
    });

    it('should process backtest results correctly', async () => {
      const result = await processLlmResult(
        'charts/test-entry/test_chart.png',
        mockBacktestData,
        'charts/test-entry',
        false // isScout = false
      );

      expect(mockedAddLlmResultOverlay).toHaveBeenCalledWith(
        'charts/test-entry/test_chart.png',
        'long'
      );
      expect(mockedFs.writeFileSync).toHaveBeenCalledTimes(1); // Only timestamped file for backtest
      expect(mockedFs.copyFileSync).not.toHaveBeenCalled(); // No latest_masked_result.png for backtest

      expect(result.resultChartPath).toBe('test_result_chart.png');
      expect(result.outputFilePath).toContain('_action_LONG.txt');
      expect(result.latestOutputPath).toBeUndefined(); // No latest files for backtest
    });

    it('should handle DO_NOTHING decision', async () => {
      const doNothingData: LlmResultData = {
        ...mockLlmResultData,
        decision: 'do_nothing',
        proceed: false,
        direction: undefined,
      };

      const result = await processLlmResult(
        'charts/scout/test_chart.png',
        doNothingData,
        'charts/scout',
        true
      );

      expect(mockedAddLlmResultOverlay).toHaveBeenCalledWith(
        'charts/scout/test_chart.png',
        'do_nothing'
      );
      expect(result.outputFilePath).toContain('_action_DO_NOTHING.txt');
    });

    it('should handle SHORT decision', async () => {
      const shortData: LlmResultData = {
        ...mockLlmResultData,
        decision: 'short',
        direction: 'short',
      };

      const result = await processLlmResult(
        'charts/scout/test_chart.png',
        shortData,
        'charts/scout',
        true
      );

      expect(mockedAddLlmResultOverlay).toHaveBeenCalledWith(
        'charts/scout/test_chart.png',
        'short'
      );
      expect(result.outputFilePath).toContain('_action_SHORT.txt');
    });

    it('should handle errors gracefully', async () => {
      mockedAddLlmResultOverlay.mockRejectedValue(new Error('Chart overlay failed'));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await processLlmResult(
        'charts/scout/test_chart.png',
        mockLlmResultData,
        'charts/scout',
        true
      );

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error processing LLM result:',
        expect.any(Error)
      );
      expect(result.resultChartPath).toBeUndefined();
      expect(result.outputFilePath).toBeUndefined();

      consoleErrorSpy.mockRestore();
    });

    it('should generate correct output content for scout', async () => {
      await processLlmResult(
        'charts/scout/test_chart.png',
        mockLlmResultData,
        'charts/scout',
        true
      );

      const writeCall = mockedFs.writeFileSync.mock.calls.find(
        call => typeof call[1] === 'string' && call[1].includes('AlphaGroove Entry Scout')
      );
      expect(writeCall).toBeTruthy();

      const content = writeCall![1] as string;
      expect(content).toContain('🔍 AlphaGroove Entry Scout');
      expect(content).toContain('Ticker: SPY');
      expect(content).toContain('✅ ENTER TRADE');
      expect(content).toContain('LONG 🔼');
      expect(content).toContain('Strong bullish momentum');
    });

    it('should generate correct output content for backtest', async () => {
      await processLlmResult(
        'charts/test-entry/test_chart.png',
        mockBacktestData,
        'charts/test-entry',
        false
      );

      const writeCall = mockedFs.writeFileSync.mock.calls.find(
        call => typeof call[1] === 'string' && call[1].includes('AlphaGroove Backtest Analysis')
      );
      expect(writeCall).toBeTruthy();

      const content = writeCall![1] as string;
      expect(content).toContain('📊 AlphaGroove Backtest Analysis');
      expect(content).toContain('⚙️ Backtest Details:');
      expect(content).toContain('Execution Price: $642.75');
      expect(content).toContain('ATR Value: 2.5000');
      expect(content).toContain('Final Stop Loss: $634.50');
      expect(content).toContain('Final Profit Target: $651.25');
    });
  });

  describe('generateScoutOutputSummary', () => {
    it('should generate correct scout summary', async () => {
      const llmDecision = {
        proceed: true,
        direction: 'long',
        cost: 0.01,
        rationale: 'Test rationale',
        averagedProposedStopLoss: 635.0,
        averagedProposedProfitTarget: 650.0,
      };

      const summary = await generateScoutOutputSummary(
        'SPY',
        '2025-01-08',
        mockLlmResultData.entrySignal,
        llmDecision,
        {},
        [],
        undefined
      );

      expect(summary).toContain('🔍 AlphaGroove Entry Scout');
      expect(summary).toContain('✅ ENTER TRADE');
      expect(summary).toContain('LONG 🔼');
      expect(summary).toContain('Test rationale');
    });
  });

  describe('saveScoutOutputFiles', () => {
    it('should save scout output files correctly', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      saveScoutOutputFiles('Test output content', 'long', 'SPY', '2025-01-08', 'charts/scout');

      expect(mockedFs.writeFileSync).toHaveBeenCalledTimes(2);

      // Check timestamped file
      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/charts\/scout\/.*_SPY_20250108_action_LONG\.txt$/),
        'Test output content',
        'utf-8'
      );

      // Check latest file
      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        'charts/scout/latest_action.txt',
        'Test output content',
        'utf-8'
      );

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Output saved:'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Latest output:'));

      consoleSpy.mockRestore();
    });

    it('should handle file writing errors gracefully', () => {
      mockedFs.writeFileSync.mockImplementation(() => {
        throw new Error('File write failed');
      });
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      saveScoutOutputFiles('Test output content', 'long', 'SPY', '2025-01-08', 'charts/scout');

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error saving output files:', expect.any(Error));

      consoleErrorSpy.mockRestore();
    });
  });
});
