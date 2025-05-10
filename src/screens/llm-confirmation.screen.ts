import { LlmApiService, type LLMResponse } from '../services/llm-api.service';
import { type Config as AppConfig } from '../utils/config';

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
    let totalCost = 0;

    if (!screenConfig.enabled) {
      console.log(
        `[${this.id}] Screen not enabled. Signal for ${signal.ticker} on ${signal.trade_date} proceeds without LLM confirmation.`
      );
      return { proceed: true, cost: totalCost };
    }

    const llmService = new LlmApiService(screenConfig);

    if (!llmService.isEnabled()) {
      console.warn(
        `[${this.id}] LLM service is not properly enabled (e.g., missing API key for ${signal.ticker} on ${signal.trade_date}). Signal proceeds without LLM confirmation.`
      );
      return { proceed: true, cost: totalCost };
    }

    const responses: LLMResponse[] = await llmService.getTradeDecisions(chartPath);

    let longVotes = 0;
    let shortVotes = 0;

    responses.forEach((response, index) => {
      const rationalizationText = response.rationalization || '';
      const truncatedRationalization =
        rationalizationText.length > 150
          ? `${rationalizationText.substring(0, 150)}...`
          : rationalizationText;
      const rationalizationLog = response.rationalization ? `\"${truncatedRationalization}\"` : '';
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

      console.log(
        `   LLM ${index + 1}: ${actionEmoji} — ${response.error ? 'Error:' + response.error + ' — ' : ''}${rationalizationLog}${costString}`
      );
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

    if (configuredDirection === 'long' && longVotes >= screenConfig.agreementThreshold) {
      console.log(
        `  LLM consensus to GO LONG, matching configured direction. Signal proceeds.${totalCostString}`
      );
      return { proceed: true, cost: totalCost };
    }

    if (configuredDirection === 'short' && shortVotes >= screenConfig.agreementThreshold) {
      console.log(
        `  LLM consensus to GO SHORT, matching configured direction. Signal proceeds.${totalCostString}`
      );
      return { proceed: true, cost: totalCost };
    }

    console.log(
      `  LLM consensus (${longVotes} long, ${shortVotes} short) does not meet threshold for configured direction '${configuredDirection}' for ${signal.ticker} on ${signal.trade_date}. Signal is filtered out.${totalCostString}`
    );
    return { proceed: false, cost: totalCost };
  }
}
