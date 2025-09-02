import { calculateATRStopLoss } from './calculations';

export interface ExitPriceConfig {
  atrMultiplier?: number;
  percentFromEntry?: number;
  useLlmProposedPrice?: boolean;
}

export interface ExitPriceCalculationInput {
  entryPrice: number;
  atr?: number;
  isLong: boolean;
  config: ExitPriceConfig;
  llmProposedPrice?: number;
}

export interface ExitPriceResult {
  price?: number;
  source: 'llm' | 'atr' | 'percentage' | 'none';
  multiplierUsed?: number;
}

/**
 * Calculate exit price (stop loss or profit target) based on configuration
 * This centralizes the logic used by scout, backtest, and exit strategies
 */
export const calculateExitPrice = (
  input: ExitPriceCalculationInput,
  isStopLoss: boolean = true
): ExitPriceResult => {
  const { entryPrice, atr, isLong, config, llmProposedPrice } = input;

  // Priority 1: LLM proposed price (if enabled and available)
  if (
    config.useLlmProposedPrice &&
    typeof llmProposedPrice === 'number' &&
    !isNaN(llmProposedPrice)
  ) {
    return {
      price: llmProposedPrice,
      source: 'llm',
    };
  }

  // Priority 2: ATR-based calculation (if ATR and multiplier available)
  if (atr && config.atrMultiplier) {
    let price: number;

    if (isStopLoss) {
      // Stop loss calculation
      price = calculateATRStopLoss(entryPrice, atr, config.atrMultiplier, isLong);
    } else {
      // Profit target calculation
      const offset = atr * config.atrMultiplier;
      price = isLong ? entryPrice + offset : entryPrice - offset;
    }

    return {
      price,
      source: 'atr',
      multiplierUsed: config.atrMultiplier,
    };
  }

  // Priority 3: Percentage-based calculation (fallback)
  if (config.percentFromEntry) {
    const pct = config.percentFromEntry / 100;
    let price: number;

    if (isStopLoss) {
      // Stop loss: reduce position value
      price = isLong ? entryPrice * (1 - pct) : entryPrice * (1 + pct);
    } else {
      // Profit target: increase position value
      price = isLong ? entryPrice * (1 + pct) : entryPrice * (1 - pct);
    }

    return {
      price,
      source: 'percentage',
    };
  }

  // No valid configuration found
  return {
    source: 'none',
  };
};

/**
 * Calculate both stop loss and profit target prices
 */
export const calculateExitPrices = (
  entryPrice: number,
  atr: number | undefined,
  isLong: boolean,
  stopLossConfig?: ExitPriceConfig,
  profitTargetConfig?: ExitPriceConfig,
  llmStopLoss?: number,
  llmProfitTarget?: number
): {
  stopLoss: ExitPriceResult;
  profitTarget: ExitPriceResult;
} => {
  const stopLoss = stopLossConfig
    ? calculateExitPrice(
        {
          entryPrice,
          atr,
          isLong,
          config: stopLossConfig,
          llmProposedPrice: llmStopLoss,
        },
        true // isStopLoss = true
      )
    : { source: 'none' as const };

  const profitTarget = profitTargetConfig
    ? calculateExitPrice(
        {
          entryPrice,
          atr,
          isLong,
          config: profitTargetConfig,
          llmProposedPrice: llmProfitTarget,
        },
        false // isStopLoss = false
      )
    : { source: 'none' as const };

  return { stopLoss, profitTarget };
};
