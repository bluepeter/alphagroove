import chalk from 'chalk';
import { LlmApiService, type LLMResponse } from '../services/llm-api.service';
import { type Config as AppConfig } from '../utils/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

import { type EnrichedSignal, type ScreenDecision } from './types';
import { type EntryScreen, type EntryScreenContext, type LLMScreenConfig } from './types';

export class LlmConfirmationScreen implements EntryScreen {
  public readonly id = 'llm-confirmation';
  public readonly name = 'LLM Chart Confirmation Screen';

  public async shouldSignalProceed(
    signal: EnrichedSignal,
    chartPath: string,
    screenConfig: LLMScreenConfig,
    appConfig: AppConfig,
    _context?: EntryScreenContext
  ): Promise<ScreenDecision> {
    const llmConfig = appConfig.llmConfirmationScreen;
    if (!llmConfig || !llmConfig.enabled) {
      // If LLM screen is not enabled in the main config, return proceed:true by default
      return { proceed: true, cost: 0 };
    }

    const llmService = new LlmApiService(llmConfig);
    let totalCost = 0;
    const debug = false;
    let tempChartPath: string | undefined;

    // Initialize decision here with a default
    let decision: ScreenDecision = { proceed: false, cost: 0 };

    if (!screenConfig.enabled) {
      console.log(
        `[${this.id}] Screen not enabled. Signal for ${signal.ticker} on ${signal.trade_date} proceeds without LLM confirmation.`
      );
      return { proceed: true, cost: totalCost };
    }

    if (!llmService.isEnabled()) {
      console.warn(
        `[${this.id}] LLM service is not properly enabled (e.g., missing API key for ${signal.ticker} on ${signal.trade_date}). Signal proceeds without LLM confirmation.`
      );
      return { proceed: true, cost: totalCost };
    }

    try {
      // Create a temporary copy of the chart with a random name
      const originalChartPath = chartPath; // chartPath is the visually anonymized one
      const chartDir = path.dirname(originalChartPath);
      const chartExt = path.extname(originalChartPath);
      const randomFileName = `${crypto.randomBytes(16).toString('hex')}${chartExt}`;
      tempChartPath = path.join(chartDir, randomFileName);

      await fs.copyFile(originalChartPath, tempChartPath);

      const responses: LLMResponse[] = await llmService.getTradeDecisions(tempChartPath);

      let longVotes = 0;
      let shortVotes = 0;

      responses.forEach((response, index) => {
        const rationalizationText = response.rationalization || '';
        const truncatedRationalization =
          rationalizationText.length > 150
            ? `${rationalizationText.substring(0, 150)}...`
            : rationalizationText;
        const rationalizationLog = response.rationalization
          ? `\"${truncatedRationalization}\"`
          : '';
        const costString =
          typeof response.cost === 'number' ? ` (Cost: $${response.cost.toFixed(6)})` : '';

        let actionEmoji = '';
        switch (response.action) {
          case 'long':
            actionEmoji = '🔼';
            break;
          case 'short':
            actionEmoji = '🔽';
            break;
          case 'do_nothing':
            actionEmoji = '⏸️';
            break;
        }

        if (debug) {
          console.log(
            chalk.dim(
              `   LLM ${index + 1}: ${actionEmoji} — ${response.error ? 'Error:' + response.error + ' — ' : ''}${rationalizationLog}${costString}`
            )
          );
        }
        switch (response.action) {
          case 'long':
            longVotes++;
            break;
          case 'short':
            shortVotes++;
            break;
        }
        if (typeof response.cost === 'number') {
          totalCost += response.cost;
        }
      });

      const configuredDirection = appConfig.default.direction;
      const totalCostString = ` (Total Cost: $${totalCost.toFixed(6)})`;

      let logMessage = '';

      if (configuredDirection === 'llm_decides') {
        const meetsLongThreshold = longVotes >= screenConfig.agreementThreshold;
        const meetsShortThreshold = shortVotes >= screenConfig.agreementThreshold;

        if (meetsLongThreshold && longVotes > shortVotes) {
          decision = { proceed: true, direction: 'long', cost: totalCost };
          // logMessage = `  LLM consensus to GO LONG (${longVotes} long vs ${shortVotes} short). Signal proceeds as LONG.`;
        } else if (meetsShortThreshold && shortVotes > longVotes) {
          decision = { proceed: true, direction: 'short', cost: totalCost };
          // logMessage = `  LLM consensus to GO SHORT (${shortVotes} short vs ${longVotes} long). Signal proceeds as SHORT.`;
        } else {
          let detailReason = `LLM consensus (${longVotes} long, ${shortVotes} short) not decisive for 'llm_decides' strategy (threshold: ${screenConfig.agreementThreshold}).`;
          if (meetsLongThreshold && meetsShortThreshold && longVotes === shortVotes) {
            detailReason = `LLM consensus TIED (${longVotes} long, ${shortVotes} short) with both meeting threshold. No trade under 'llm_decides'.`;
          } else if (meetsLongThreshold && !(longVotes > shortVotes)) {
            detailReason = `LLM met LONG threshold but did not decisively win vs SHORT votes (${longVotes} long, ${shortVotes} short). No trade under 'llm_decides'.`;
          } else if (meetsShortThreshold && !(shortVotes > longVotes)) {
            detailReason = `LLM met SHORT threshold but did not decisively win vs LONG votes (${longVotes} long, ${shortVotes} short). No trade under 'llm_decides'.`;
          } else if (!meetsLongThreshold && !meetsShortThreshold) {
            detailReason = `LLM consensus (${longVotes} long, ${shortVotes} short) does not meet threshold (${screenConfig.agreementThreshold}) for either direction.`;
          }
          logMessage = `${detailReason} Signal is filtered out.`;
          decision = { proceed: false, cost: totalCost };
        }
      } else {
        if (configuredDirection === 'long' && longVotes >= screenConfig.agreementThreshold) {
          decision = { proceed: true, cost: totalCost, direction: 'long' };
          logMessage = `  LLM consensus to GO LONG, matching configured direction. Signal proceeds.`;
        } else if (
          configuredDirection === 'short' &&
          shortVotes >= screenConfig.agreementThreshold
        ) {
          decision = { proceed: true, cost: totalCost, direction: 'short' };
          logMessage = `  LLM consensus to GO SHORT, matching configured direction. Signal proceeds.`;
        } else {
          logMessage = `  LLM consensus (${longVotes} long, ${shortVotes} short) does not meet threshold for configured direction '${configuredDirection}' for ${signal.ticker} on ${signal.trade_date}. Signal is filtered out.`;
        }
      }
      if (debug) {
        console.log(chalk.dim(logMessage + totalCostString));
      }
    } catch (error: any) {
      console.error('Error during LLM screening process:', error.message);
      // Ensure decision reflects failure, potentially with cost if any was incurred before error
      decision = { proceed: false, rationale: error.message, cost: totalCost };
    } finally {
      // Clean up the temporary chart file
      if (tempChartPath) {
        try {
          await fs.unlink(tempChartPath);
        } catch (cleanupError: any) {
          console.warn(
            `Failed to delete temporary chart file ${tempChartPath}:`,
            cleanupError.message
          );
        }
      }
    }
    return decision;
  }
}
