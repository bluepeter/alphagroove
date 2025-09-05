import fs from 'fs';
import path from 'path';
import { addLlmResultOverlay, type LlmDecision } from './scout-chart-generator';
import { type Signal, type Bar } from '../patterns/types';

export interface LlmResultData {
  ticker: string;
  tradeDate: string;
  entrySignal: Signal;
  decision: LlmDecision;
  proceed: boolean;
  direction?: 'long' | 'short';
  cost?: number;
  rationale?: string;
  averagedProposedStopLoss?: number;
  averagedProposedProfitTarget?: number;
  _debug?: {
    responses?: Array<any>;
    rawData?: any;
  };
}

export interface BacktestOutputData extends LlmResultData {
  executionPrice?: number;
  atrValue?: number;
  stopLossPrice?: number;
  profitTargetPrice?: number;
}

/**
 * Process LLM result by creating overlay chart and output files
 * Used by both scout and backtest functionality
 */
export const processLlmResult = async (
  chartPath: string,
  resultData: LlmResultData,
  outputDir: string,
  isScout: boolean = false
): Promise<{
  resultChartPath?: string;
  outputFilePath?: string;
  latestOutputPath?: string;
}> => {
  const results: {
    resultChartPath?: string;
    outputFilePath?: string;
    latestOutputPath?: string;
  } = {};

  try {
    // Create result chart with LLM decision overlay
    const resultChartPath = await addLlmResultOverlay(chartPath, resultData.decision);
    results.resultChartPath = resultChartPath;

    // Create output content
    const outputContent = generateOutputContent(resultData, isScout);

    // Save output files
    const { timestampedPath, latestPath } = await saveOutputFiles(
      outputContent,
      resultData,
      outputDir,
      isScout,
      chartPath
    );

    results.outputFilePath = timestampedPath;
    results.latestOutputPath = latestPath;

    // For scout, also create latest_masked_result.png
    if (isScout) {
      const latestResultPath = path.join(outputDir, 'latest_masked_result.png');
      fs.copyFileSync(resultChartPath, latestResultPath);
    }

    return results;
  } catch (error) {
    console.error('Error processing LLM result:', error);
    return results;
  }
};

/**
 * Generate output content for text files
 */
const generateOutputContent = (resultData: LlmResultData, isScout: boolean): string => {
  const lines: string[] = [];

  // Header
  lines.push(isScout ? '🔍 AlphaGroove Entry Scout' : '📊 AlphaGroove Backtest Analysis');
  lines.push(`Ticker: ${resultData.ticker}`);
  lines.push(`Trade Date: ${resultData.tradeDate}`);
  lines.push(
    `Entry Signal: ${resultData.entrySignal.timestamp} @ $${resultData.entrySignal.price.toFixed(2)}`
  );
  lines.push('');

  // LLM Analysis Results
  lines.push('🤖 LLM Analysis Results:');
  lines.push(`Decision: ${resultData.proceed ? '✅ ENTER TRADE' : '❌ DO NOT ENTER'}`);

  if (resultData.direction) {
    const directionEmoji = resultData.direction === 'long' ? '🔼' : '🔽';
    lines.push(`Direction: ${resultData.direction.toUpperCase()} ${directionEmoji}`);
  }

  if (resultData.cost !== undefined) {
    lines.push(`LLM Cost: $${resultData.cost.toFixed(6)}`);
  }

  if (resultData.rationale) {
    lines.push('');
    lines.push('🧠 LLM Rationale:');
    lines.push(resultData.rationale);
  }

  // Individual LLM Responses
  if (resultData._debug?.responses) {
    lines.push('');
    lines.push('📝 Individual LLM Responses:');
    resultData._debug.responses.forEach((response: any, index: number) => {
      const actionEmoji =
        response.action === 'long' ? '🔼' : response.action === 'short' ? '🔽' : '⏸️';
      lines.push(
        `LLM ${index + 1}: ${actionEmoji} ${response.action?.toUpperCase() || 'NO ACTION'}`
      );
      if (response.rationalization) {
        lines.push(`   Reasoning: ${response.rationalization}`);
      }
      if (response.proposedStopLoss) {
        lines.push(`   Proposed Stop: $${response.proposedStopLoss}`);
      }
      if (response.proposedProfitTarget) {
        lines.push(`   Proposed Target: $${response.proposedProfitTarget}`);
      }
      if (response.cost) {
        lines.push(`   Cost: $${response.cost.toFixed(6)}`);
      }
      lines.push('');
    });
  }

  // Trading levels (if available)
  if (resultData.proceed && resultData.direction) {
    lines.push('');
    lines.push('📈 Trading Levels:');
    lines.push(`Entry Price: $${resultData.entrySignal.price.toFixed(2)}`);

    if (resultData.averagedProposedStopLoss) {
      lines.push(`Stop Loss: $${resultData.averagedProposedStopLoss.toFixed(2)}`);
    }

    if (resultData.averagedProposedProfitTarget) {
      lines.push(`Profit Target: $${resultData.averagedProposedProfitTarget.toFixed(2)}`);
    }
  }

  // Backtest-specific information
  if (!isScout && 'executionPrice' in resultData) {
    const backtestData = resultData as BacktestOutputData;
    lines.push('');
    lines.push('⚙️ Backtest Details:');

    if (backtestData.executionPrice) {
      lines.push(`Execution Price: $${backtestData.executionPrice.toFixed(2)}`);
    }

    if (backtestData.atrValue) {
      lines.push(`ATR Value: ${backtestData.atrValue.toFixed(4)}`);
    }

    if (backtestData.stopLossPrice) {
      lines.push(`Final Stop Loss: $${backtestData.stopLossPrice.toFixed(2)}`);
    }

    if (backtestData.profitTargetPrice) {
      lines.push(`Final Profit Target: $${backtestData.profitTargetPrice.toFixed(2)}`);
    }
  }

  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);

  return lines.join('\n');
};

/**
 * Save output to timestamped and latest files
 */
const saveOutputFiles = async (
  content: string,
  resultData: LlmResultData,
  outputDir: string,
  isScout: boolean,
  chartPath?: string
): Promise<{ timestampedPath: string; latestPath?: string }> => {
  const actionText = resultData.decision.toUpperCase().replace('_', '_');

  let timestampedFilename: string;

  if (isScout) {
    // Scout: use timestamp prefix
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    timestampedFilename = `${timestamp}_${resultData.ticker}_${resultData.tradeDate.replace(/-/g, '')}_action_${actionText}.txt`;
  } else {
    // Backtest: use same prefix as chart files
    if (chartPath) {
      const chartBasename = path.basename(chartPath, '.png');
      const chartPrefix = chartBasename.replace('_masked', '');
      timestampedFilename = `${chartPrefix}_action_${actionText}.txt`;
    } else {
      // Fallback if no chart path provided
      timestampedFilename = `${resultData.ticker}_${resultData.tradeDate.replace(/-/g, '')}_action_${actionText}.txt`;
    }
  }

  const timestampedPath = path.join(outputDir, timestampedFilename);
  fs.writeFileSync(timestampedPath, content, 'utf-8');

  // Create latest action file (only for scout, not for backtest)
  let latestPath: string | undefined;
  if (isScout) {
    const latestFilename = 'latest_action.txt';
    latestPath = path.join(outputDir, latestFilename);
    fs.writeFileSync(latestPath, content, 'utf-8');
  }

  return { timestampedPath, latestPath };
};

/**
 * Generate output summary for scout (backward compatibility)
 */
export const generateScoutOutputSummary = async (
  ticker: string,
  tradeDate: string,
  entrySignal: Signal,
  llmDecision: any,
  _rawConfig: any,
  _allBars: Bar[],
  _dailyBars?: any[]
): Promise<string> => {
  const resultData: LlmResultData = {
    ticker,
    tradeDate,
    entrySignal,
    decision:
      llmDecision.proceed && llmDecision.direction
        ? (llmDecision.direction as LlmDecision)
        : 'do_nothing',
    proceed: llmDecision.proceed,
    direction: llmDecision.direction,
    cost: llmDecision.cost,
    rationale: llmDecision.rationale,
    averagedProposedStopLoss: llmDecision.averagedProposedStopLoss,
    averagedProposedProfitTarget: llmDecision.averagedProposedProfitTarget,
  };

  return generateOutputContent(resultData, true);
};

/**
 * Save output files for scout (backward compatibility)
 */
export const saveScoutOutputFiles = (
  output: string,
  decision: LlmDecision,
  ticker: string,
  tradeDate: string,
  chartDir: string
): void => {
  try {
    // Create timestamp-based filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const actionText = decision.toUpperCase().replace('_', '_');

    // Create timestamped output file
    const timestampedFilename = `${timestamp}_${ticker}_${tradeDate.replace(/-/g, '')}_action_${actionText}.txt`;
    const timestampedPath = path.join(chartDir, timestampedFilename);
    fs.writeFileSync(timestampedPath, output, 'utf-8');

    // Create latest action file (single file, gets overwritten each time)
    const latestFilename = 'latest_action.txt';
    const latestPath = path.join(chartDir, latestFilename);
    fs.writeFileSync(latestPath, output, 'utf-8');

    console.log(`Output saved: ${timestampedPath}`);
    console.log(`Latest output: ${latestPath}`);
  } catch (error) {
    console.error('Error saving output files:', error);
  }
};
