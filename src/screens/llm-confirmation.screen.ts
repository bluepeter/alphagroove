import { LlmApiService, type LLMResponse } from '../services/llm-api.service';
import { type Config as AppConfig } from '../utils/config';

import { type EnrichedSignal } from './types';
import { type EntryScreen, type EntryScreenContext, type LLMScreenConfig } from './types';

export class LlmConfirmationScreen implements EntryScreen {
  public readonly id = 'llm-confirmation';
  public readonly name = 'LLM Chart Confirmation Screen';

  public async shouldSignalProceed(
    signal: EnrichedSignal,
    chartPath: string,
    screenConfig: LLMScreenConfig,
    _appConfig: AppConfig, // appConfig might be used later for more complex logic
    _context?: EntryScreenContext // context might be used later
  ): Promise<boolean> {
    if (!screenConfig.enabled) {
      // If the screen is not enabled in the config, let the signal proceed by default
      // or handle as per desired logic (e.g., throw error if misconfigured)
      console.log(
        `[${this.id}] Screen not enabled. Signal for ${signal.ticker} on ${signal.trade_date} proceeds without LLM confirmation.`
      );
      return true;
    }

    const llmService = new LlmApiService(screenConfig);

    if (!llmService.isEnabled()) {
      console.warn(
        `[${this.id}] LLM service is not properly enabled (e.g., missing API key for ${signal.ticker} on ${signal.trade_date}). Signal proceeds without LLM confirmation.`
      );
      // Fallback behavior: if service can't run, decide if signal should be blocked or proceed.
      // For now, let it proceed but with a warning.
      return true;
    }

    const responses: LLMResponse[] = await llmService.getTradeDecisions(chartPath);

    let longVotes = 0;
    let shortVotes = 0;

    responses.forEach((response, index) => {
      const rationalizationLog = response.rationalization ? `"${response.rationalization}"` : '';
      console.log(
        `LLM ${index + 1}/${screenConfig.numCalls}: Action: ${response.action}, ${response.error ? 'Error:' + response.error + ',' : ''}${rationalizationLog}`
      );
      switch (response.action) {
        case 'long':
          longVotes++;
          break;
        case 'short':
          shortVotes++;
          break;
      }
    });

    if (longVotes >= screenConfig.agreementThreshold) {
      console.log(`LLM consensus to GO LONG. Signal proceeds.`);
      return true;
    }

    if (shortVotes >= screenConfig.agreementThreshold) {
      // For a short signal, proceeding means the system should indeed go short.
      // If the overall strategy implies this screen CONFIRMS the original signal's direction,
      // this logic is fine. If it can FLIP a signal, that's more complex.
      // Based on prompt, LLM decides long/short/nothing, not just confirm/deny entry pattern.
      console.log(`LLM consensus to GO SHORT. Signal proceeds.`);
      return true;
    }

    console.log(
      `LLM consensus NOT MET or advises DO NOTHING for ${signal.ticker} on ${signal.trade_date}. Signal is filtered out.`
    );
    return false; // Filter out the signal if threshold not met for long/short
  }
}
