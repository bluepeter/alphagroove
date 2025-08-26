import { Bar } from '../../utils/calculations';
import {
  StopLossConfig,
  ProfitTargetConfig,
  TrailingStopConfig,
  EndOfDayConfig,
  MaxHoldTimeConfig,
  SlippageConfig,
} from '../../utils/config';
import { calculateATRStopLoss } from '../../utils/calculations';

/**
 * Interface representing an exit signal
 */
export interface ExitSignal {
  timestamp: string;
  price: number;
  type: 'exit';
  reason: string;
}

/**
 * Interface for exit strategies
 */
export interface ExitStrategy {
  name: string;
  evaluate: (
    entryPrice: number,
    entryTime: string,
    bars: Bar[],
    isLong: boolean,
    atr?: number,
    _testMode?: boolean,
    absoluteLevelOverride?: number
  ) => ExitSignal | null;
}

/**
 * Filter trading bars to include only regular market hours (9:30 AM to 4:00 PM)
 * @param bars The bars to filter
 * @returns Filtered bars during regular market hours
 */
const filterRegularMarketHours = (bars: Bar[]): Bar[] => {
  return bars.filter(bar => {
    const barTime = new Date(bar.timestamp);
    const hours = barTime.getHours();
    const minutes = barTime.getMinutes();

    // Convert to minutes since midnight for easier comparison
    const timeInMinutes = hours * 60 + minutes;

    // Market opens at 9:30 AM (570 minutes) and closes at 4:00 PM (960 minutes)
    return timeInMinutes >= 570 && timeInMinutes <= 960;
  });
};

/**
 * Stop Loss exit strategy
 */
export class StopLossStrategy implements ExitStrategy {
  name = 'stopLoss';
  private config: StopLossConfig;

  constructor(config: StopLossConfig) {
    this.config = config;
  }

  evaluate(
    entryPrice: number,
    entryTime: string,
    bars: Bar[],
    isLong: boolean,
    atr?: number,
    _testMode?: boolean,
    absoluteLevelOverride?: number
  ): ExitSignal | null {
    const allTradingBars = bars.filter(bar => bar.timestamp > entryTime);
    const tradingBars = _testMode ? allTradingBars : filterRegularMarketHours(allTradingBars);

    if (tradingBars.length === 0) return null;

    let stopLevel: number;
    if (this.config.useLlmProposedPrice && typeof absoluteLevelOverride === 'number') {
      stopLevel = absoluteLevelOverride;
    } else if (atr && this.config.atrMultiplier) {
      stopLevel = calculateATRStopLoss(entryPrice, atr, this.config.atrMultiplier, isLong);
    } else {
      const pctMultiplier = this.config.percentFromEntry / 100;
      stopLevel = isLong ? entryPrice * (1 - pctMultiplier) : entryPrice * (1 + pctMultiplier);
    }

    for (let i = 0; i < tradingBars.length; i++) {
      const bar = tradingBars[i];
      if (isLong) {
        if (bar.low <= stopLevel) {
          if (_testMode) {
            return {
              timestamp: bar.timestamp,
              price: stopLevel,
              type: 'exit',
              reason: 'stopLoss',
            };
          } else {
            const exitPrice = i < tradingBars.length - 1 ? tradingBars[i + 1].open : bar.close;
            return {
              timestamp: i < tradingBars.length - 1 ? tradingBars[i + 1].timestamp : bar.timestamp,
              price: exitPrice,
              type: 'exit',
              reason: 'stopLoss',
            };
          }
        }
      } else {
        if (bar.high >= stopLevel) {
          if (_testMode) {
            return {
              timestamp: bar.timestamp,
              price: stopLevel,
              type: 'exit',
              reason: 'stopLoss',
            };
          } else {
            const exitPrice = i < tradingBars.length - 1 ? tradingBars[i + 1].open : bar.close;
            return {
              timestamp: i < tradingBars.length - 1 ? tradingBars[i + 1].timestamp : bar.timestamp,
              price: exitPrice,
              type: 'exit',
              reason: 'stopLoss',
            };
          }
        }
      }
    }

    return null;
  }
}

/**
 * Profit Target exit strategy
 */
export class ProfitTargetStrategy implements ExitStrategy {
  name = 'profitTarget';
  private config: ProfitTargetConfig;

  constructor(config: ProfitTargetConfig) {
    this.config = config;
  }

  evaluate(
    entryPrice: number,
    entryTime: string,
    bars: Bar[],
    isLong: boolean,
    atr?: number,
    _testMode?: boolean,
    absoluteLevelOverride?: number
  ): ExitSignal | null {
    const allTradingBars = bars.filter(bar => bar.timestamp > entryTime);
    const tradingBars = _testMode ? allTradingBars : filterRegularMarketHours(allTradingBars);

    if (tradingBars.length === 0) return null;

    let targetLevel: number;
    if (this.config.useLlmProposedPrice && typeof absoluteLevelOverride === 'number') {
      targetLevel = absoluteLevelOverride;
    } else if (atr && this.config.atrMultiplier) {
      const atrMultiple = atr * this.config.atrMultiplier;
      targetLevel = isLong ? entryPrice + atrMultiple : entryPrice - atrMultiple;
    } else {
      const pctMultiplier = this.config.percentFromEntry / 100;
      targetLevel = isLong ? entryPrice * (1 + pctMultiplier) : entryPrice * (1 - pctMultiplier);
    }

    for (let i = 0; i < tradingBars.length; i++) {
      const bar = tradingBars[i];
      if (isLong) {
        if (bar.high >= targetLevel) {
          if (_testMode) {
            return {
              timestamp: bar.timestamp,
              price: targetLevel,
              type: 'exit',
              reason: 'profitTarget',
            };
          } else {
            const exitPrice = i < tradingBars.length - 1 ? tradingBars[i + 1].open : bar.close;
            return {
              timestamp: i < tradingBars.length - 1 ? tradingBars[i + 1].timestamp : bar.timestamp,
              price: exitPrice,
              type: 'exit',
              reason: 'profitTarget',
            };
          }
        }
      } else {
        if (bar.low <= targetLevel) {
          if (_testMode) {
            return {
              timestamp: bar.timestamp,
              price: targetLevel,
              type: 'exit',
              reason: 'profitTarget',
            };
          } else {
            const exitPrice = i < tradingBars.length - 1 ? tradingBars[i + 1].open : bar.close;
            return {
              timestamp: i < tradingBars.length - 1 ? tradingBars[i + 1].timestamp : bar.timestamp,
              price: exitPrice,
              type: 'exit',
              reason: 'profitTarget',
            };
          }
        }
      }
    }

    return null;
  }
}

/**
 * Trailing Stop exit strategy
 */
export class TrailingStopStrategy implements ExitStrategy {
  name = 'trailingStop';
  private config: TrailingStopConfig;

  constructor(config: TrailingStopConfig) {
    this.config = config;
  }

  evaluate(
    entryPrice: number,
    entryTime: string,
    bars: Bar[],
    isLong: boolean,
    atr?: number,
    _testMode?: boolean,
    _absoluteLevelOverride?: number
  ): ExitSignal | null {
    const allTradingBars = bars.filter(bar => bar.timestamp > entryTime);
    const tradingBars = _testMode ? allTradingBars : filterRegularMarketHours(allTradingBars);

    if (tradingBars.length === 0) return null;

    let activationLevel: number;
    let immediateActivation = false;

    if (atr && this.config.activationAtrMultiplier !== undefined) {
      if (this.config.activationAtrMultiplier === 0) {
        activationLevel = entryPrice; // Set to entry price for clarity
        immediateActivation = true; // Mark for immediate activation
      } else {
        const activationOffset = atr * this.config.activationAtrMultiplier;
        activationLevel = isLong ? entryPrice + activationOffset : entryPrice - activationOffset;
      }
    } else if (this.config.activationPercent !== undefined) {
      const activationPct = this.config.activationPercent / 100;
      activationLevel = isLong
        ? entryPrice * (1 + activationPct)
        : entryPrice * (1 - activationPct);

      // Also handle the case where activationPercent=0 from config
      if (activationPct === 0) {
        immediateActivation = true;
      }
    } else {
      // Default fallback - immediate activation
      activationLevel = entryPrice;
      immediateActivation = true;
    }

    let trailAmountAbs: number | null = null;
    if (atr && this.config.trailAtrMultiplier !== undefined) {
      trailAmountAbs = atr * this.config.trailAtrMultiplier;
    }

    let trailPct: number | null = null;
    if (this.config.trailPercent !== undefined) {
      trailPct = this.config.trailPercent / 100;
    } else if (trailAmountAbs === null) {
      throw new Error(
        'Either trailPercent or trailAtrMultiplier must be configured for trailing stop strategy'
      );
    }
    let trailingStopLevel = isLong ? entryPrice : entryPrice;
    // Start activated if immediateActivation is true
    let activated = immediateActivation;
    let bestPrice = isLong ? entryPrice : entryPrice;

    for (let i = 0; i < tradingBars.length; i++) {
      const bar = tradingBars[i];
      if (isLong) {
        // Only check for activation if not already activated
        if (!activated && bar.high >= activationLevel) {
          activated = true;
        }
        if (activated) {
          if (bar.high > bestPrice) {
            bestPrice = bar.high;
          }
          trailingStopLevel =
            trailAmountAbs !== null ? bestPrice - trailAmountAbs : bestPrice * (1 - trailPct!);
          if (bar.low <= trailingStopLevel) {
            if (_testMode) {
              return {
                timestamp: bar.timestamp,
                price: trailingStopLevel,
                type: 'exit',
                reason: 'trailingStop',
              };
            } else {
              const exitPrice = i < tradingBars.length - 1 ? tradingBars[i + 1].open : bar.close;
              return {
                timestamp:
                  i < tradingBars.length - 1 ? tradingBars[i + 1].timestamp : bar.timestamp,
                price: exitPrice,
                type: 'exit',
                reason: 'trailingStop',
              };
            }
          }
        }
      } else {
        // Only check for activation if not already activated
        if (!activated && bar.low <= activationLevel) {
          activated = true;
        }
        if (activated) {
          if (bar.low < bestPrice) {
            bestPrice = bar.low;
          }
          trailingStopLevel =
            trailAmountAbs !== null ? bestPrice + trailAmountAbs : bestPrice * (1 + trailPct!);
          if (bar.high >= trailingStopLevel) {
            if (_testMode) {
              return {
                timestamp: bar.timestamp,
                price: trailingStopLevel,
                type: 'exit',
                reason: 'trailingStop',
              };
            } else {
              const exitPrice = i < tradingBars.length - 1 ? tradingBars[i + 1].open : bar.close;
              return {
                timestamp:
                  i < tradingBars.length - 1 ? tradingBars[i + 1].timestamp : bar.timestamp,
                price: exitPrice,
                type: 'exit',
                reason: 'trailingStop',
              };
            }
          }
        }
      }
    }

    return null;
  }
}

/**
 * Maximum Hold Time exit strategy
 */
export class MaxHoldTimeStrategy implements ExitStrategy {
  name = 'maxHoldTime';
  private config: MaxHoldTimeConfig;

  constructor(config: MaxHoldTimeConfig) {
    this.config = config;
  }

  evaluate(
    _entryPrice: number,
    entryTime: string,
    bars: Bar[],
    _isLong: boolean,
    _atr?: number,
    _testMode?: boolean,
    _absoluteLevelOverride?: number
  ): ExitSignal | null {
    // Skip entry bar and filter for regular market hours
    const allTradingBars = bars.filter(bar => bar.timestamp > entryTime);
    const tradingBars = _testMode ? allTradingBars : filterRegularMarketHours(allTradingBars);

    if (tradingBars.length === 0) return null;

    // Parse entry timestamp
    const entryDate = new Date(entryTime);
    const maxExitTime = new Date(entryDate.getTime() + this.config.minutes * 60 * 1000);

    // Find first bar after max hold time
    for (const bar of tradingBars) {
      const barTime = new Date(bar.timestamp);
      if (barTime >= maxExitTime) {
        return {
          timestamp: bar.timestamp,
          price: bar.close,
          type: 'exit',
          reason: 'maxHoldTime',
        };
      }
    }

    // If we reached end of day without hitting max hold time (e.g., early close)
    // We'll return null and let another strategy (like EndOfDay) handle it
    return null;
  }
}

/**
 * End of Day exit strategy
 */
export class EndOfDayStrategy implements ExitStrategy {
  name = 'endOfDay';
  private config: EndOfDayConfig;

  constructor(config: EndOfDayConfig) {
    this.config = config;
  }

  evaluate(
    _entryPrice: number,
    entryTime: string,
    bars: Bar[],
    _isLong: boolean,
    _atr?: number,
    _testMode?: boolean,
    _absoluteLevelOverride?: number
  ): ExitSignal | null {
    // Skip entry bar - DON'T filter by market hours for EndOfDay
    const tradingBars = bars.filter(bar => bar.timestamp > entryTime);
    if (tradingBars.length === 0) return null;

    // Get trade date from entry time
    const entryDate = entryTime.split(' ')[0]; // Extract YYYY-MM-DD
    const endTimeStr = `${entryDate} ${this.config.time}:00`;

    // Find the last bar of the day or first bar after market close
    let lastBar = tradingBars[tradingBars.length - 1];

    for (const bar of tradingBars) {
      if (bar.timestamp >= endTimeStr) {
        return {
          timestamp: bar.timestamp,
          price: bar.close,
          type: 'exit',
          reason: 'endOfDay',
        };
      }
    }

    // If we didn't find a bar after end time but have bars for the day,
    // use the last available bar
    if (new Date(lastBar.timestamp).toDateString() === new Date(entryTime).toDateString()) {
      return {
        timestamp: lastBar.timestamp,
        price: lastBar.close,
        type: 'exit',
        reason: 'endOfDay',
      };
    }

    return null;
  }
}

/**
 * Factory function to create exit strategies from config
 */
export const createExitStrategies = (config: any): ExitStrategy[] => {
  if (!config.exitStrategies || !config.exitStrategies.enabled) {
    throw new Error(
      'Exit strategies must be configured - no defaults provided to avoid hidden behavior'
    );
  }

  const { enabled, maxHoldTime, endOfDay, strategyOptions } = config.exitStrategies;
  const strategies: ExitStrategy[] = [];

  // Add price-based strategies first (from enabled array) - they should get priority
  enabled.forEach((strategyName: string) => {
    switch (strategyName) {
      case 'stopLoss':
        if (!strategyOptions?.stopLoss) {
          throw new Error('stopLoss strategy enabled but no configuration provided');
        }
        strategies.push(new StopLossStrategy(strategyOptions.stopLoss));
        break;

      case 'profitTarget':
        if (!strategyOptions?.profitTarget) {
          throw new Error('profitTarget strategy enabled but no configuration provided');
        }
        strategies.push(new ProfitTargetStrategy(strategyOptions.profitTarget));
        break;

      case 'trailingStop':
        if (!strategyOptions?.trailingStop) {
          throw new Error('trailingStop strategy enabled but no configuration provided');
        }
        strategies.push(new TrailingStopStrategy(strategyOptions.trailingStop));
        break;

      case 'endOfDay':
        // Skip - endOfDay is handled above automatically when configured
        break;

      case 'maxHoldTime':
        // Skip - maxHoldTime is handled above automatically when configured
        break;

      default:
        throw new Error(`Unknown exit strategy: ${strategyName}`);
    }
  });

  // Add time-based constraints AFTER price-based strategies (they act as fallbacks/limits)
  // maxHoldTime is automatically added when configured (doesn't need to be in enabled array)
  if (maxHoldTime) {
    strategies.push(new MaxHoldTimeStrategy(maxHoldTime));
  }

  // endOfDay is automatically added when configured (doesn't need to be in enabled array)
  if (endOfDay) {
    strategies.push(new EndOfDayStrategy(endOfDay));
  }

  return strategies;
};

/**
 * Apply slippage to price
 * @param price The price to apply slippage to
 * @param isLong Whether this is a long trade
 * @param config Slippage configuration
 * @param isEntry Whether this is an entry price (true) or exit price (false)
 * @returns Price adjusted for slippage
 */
export const applySlippage = (
  price: number,
  isLong: boolean,
  config?: SlippageConfig,
  isEntry: boolean = false
): number => {
  if (!config) return price;

  if (config.model === 'percent') {
    const slippageFactor = config.value / 100;

    // Slippage direction depends on whether it's entry or exit
    if (isEntry) {
      // For entry:
      // - Long trades: slippage INCREASES entry price (worse for buyer)
      // - Short trades: slippage DECREASES entry price (worse for seller)
      return isLong ? price * (1 + slippageFactor) : price * (1 - slippageFactor);
    } else {
      // For exit:
      // - Long trades: slippage DECREASES exit price (worse for seller)
      // - Short trades: slippage INCREASES exit price (worse for buyer)
      return isLong ? price * (1 - slippageFactor) : price * (1 + slippageFactor);
    }
  } else {
    // Fixed amount slippage
    if (isEntry) {
      // For entry:
      return isLong ? price + config.value : price - config.value;
    } else {
      // For exit:
      return isLong ? price - config.value : price + config.value;
    }
  }
};
