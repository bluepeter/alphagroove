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
    atr?: number
  ) => ExitSignal | null;
}

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
    atr?: number
  ): ExitSignal | null {
    // Skip entry bar
    const tradingBars = bars.filter(bar => bar.timestamp > entryTime);
    if (tradingBars.length === 0) return null;

    // Calculate stop loss level
    let stopLevel: number;
    if (atr && this.config.atrMultiplier) {
      // Use ATR-based stop if available
      stopLevel = calculateATRStopLoss(entryPrice, atr, this.config.atrMultiplier, isLong);
    } else {
      // Use percentage-based stop
      const pctMultiplier = this.config.percentFromEntry / 100;
      stopLevel = isLong ? entryPrice * (1 - pctMultiplier) : entryPrice * (1 + pctMultiplier);
    }

    // Check each bar for stop loss hit
    for (const bar of tradingBars) {
      if (isLong) {
        // For long trades, check if price went below stop level
        if (bar.low <= stopLevel) {
          return {
            timestamp: bar.timestamp,
            price: stopLevel,
            type: 'exit',
            reason: 'stopLoss',
          };
        }
      } else {
        // For short trades, check if price went above stop level
        if (bar.high >= stopLevel) {
          return {
            timestamp: bar.timestamp,
            price: stopLevel,
            type: 'exit',
            reason: 'stopLoss',
          };
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
    atr?: number
  ): ExitSignal | null {
    // Skip entry bar
    const tradingBars = bars.filter(bar => bar.timestamp > entryTime);
    if (tradingBars.length === 0) return null;

    // Calculate target level
    let targetLevel: number;
    if (atr && this.config.atrMultiplier) {
      // Use ATR-based target if available
      const atrMultiple = atr * this.config.atrMultiplier;
      targetLevel = isLong ? entryPrice + atrMultiple : entryPrice - atrMultiple;
    } else {
      // Use percentage-based target
      const pctMultiplier = this.config.percentFromEntry / 100;
      targetLevel = isLong ? entryPrice * (1 + pctMultiplier) : entryPrice * (1 - pctMultiplier);
    }

    // Check each bar for target hit
    for (const bar of tradingBars) {
      if (isLong) {
        // For long trades, check if price went above target level
        if (bar.high >= targetLevel) {
          return {
            timestamp: bar.timestamp,
            price: targetLevel,
            type: 'exit',
            reason: 'profitTarget',
          };
        }
      } else {
        // For short trades, check if price went below target level
        if (bar.low <= targetLevel) {
          return {
            timestamp: bar.timestamp,
            price: targetLevel,
            type: 'exit',
            reason: 'profitTarget',
          };
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
    _atr?: number
  ): ExitSignal | null {
    // Skip entry bar
    const tradingBars = bars.filter(bar => bar.timestamp > entryTime);
    if (tradingBars.length === 0) return null;

    // Calculate activation level - price needs to move this much in favorable direction before trailing
    const activationPct = this.config.activationPercent / 100;
    const activationLevel = isLong
      ? entryPrice * (1 + activationPct)
      : entryPrice * (1 - activationPct);

    const trailPct = this.config.trailPercent / 100;
    let trailingStopLevel = isLong ? entryPrice : entryPrice;
    let activated = false;

    // Track best price to calculate trailing stop
    let bestPrice = isLong ? entryPrice : entryPrice;

    // Check each bar for trailing stop conditions
    for (const bar of tradingBars) {
      if (isLong) {
        // For long trades
        // Check if activation level is reached
        if (!activated && bar.high >= activationLevel) {
          activated = true;
          bestPrice = bar.high;
          trailingStopLevel = bestPrice * (1 - trailPct);
        } else if (activated) {
          // Update best price and trailing stop if price goes higher
          if (bar.high > bestPrice) {
            bestPrice = bar.high;
            trailingStopLevel = bestPrice * (1 - trailPct);
          }

          // Check if price hits trailing stop
          if (bar.low <= trailingStopLevel) {
            return {
              timestamp: bar.timestamp,
              price: trailingStopLevel,
              type: 'exit',
              reason: 'trailingStop',
            };
          }
        }
      } else {
        // For short trades
        // Check if activation level is reached
        if (!activated && bar.low <= activationLevel) {
          activated = true;
          bestPrice = bar.low;
          trailingStopLevel = bestPrice * (1 + trailPct);
        } else if (activated) {
          // Update best price and trailing stop if price goes lower
          if (bar.low < bestPrice) {
            bestPrice = bar.low;
            trailingStopLevel = bestPrice * (1 + trailPct);
          }

          // Check if price hits trailing stop
          if (bar.high >= trailingStopLevel) {
            return {
              timestamp: bar.timestamp,
              price: trailingStopLevel,
              type: 'exit',
              reason: 'trailingStop',
            };
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
    entryPrice: number,
    entryTime: string,
    bars: Bar[],
    _isLong: boolean
  ): ExitSignal | null {
    // Skip entry bar
    const tradingBars = bars.filter(bar => bar.timestamp > entryTime);
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
    entryPrice: number,
    entryTime: string,
    bars: Bar[],
    _isLong: boolean
  ): ExitSignal | null {
    // Skip entry bar
    const tradingBars = bars.filter(bar => bar.timestamp > entryTime);
    if (tradingBars.length === 0) return null;

    // Get trade date from entry time
    const entryDate = entryTime.split(' ')[0]; // Extract YYYY-MM-DD
    const endTimeStr = `${entryDate} ${this.config.time}:00`;

    // Find last bar of the day or first bar after market close
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
    // Default to max hold time if no exit strategies are configured
    return [new MaxHoldTimeStrategy({ minutes: 60 })];
  }

  const { enabled, ...strategies } = config.exitStrategies;

  return enabled.map((strategyName: string) => {
    switch (strategyName) {
      case 'stopLoss':
        return strategies.stopLoss
          ? new StopLossStrategy(strategies.stopLoss)
          : new StopLossStrategy({ percentFromEntry: 1.0 });

      case 'profitTarget':
        return strategies.profitTarget
          ? new ProfitTargetStrategy(strategies.profitTarget)
          : new ProfitTargetStrategy({ percentFromEntry: 2.0 });

      case 'trailingStop':
        return strategies.trailingStop
          ? new TrailingStopStrategy(strategies.trailingStop)
          : new TrailingStopStrategy({ activationPercent: 1.0, trailPercent: 0.5 });

      case 'maxHoldTime':
        return strategies.maxHoldTime
          ? new MaxHoldTimeStrategy(strategies.maxHoldTime)
          : new MaxHoldTimeStrategy({ minutes: 60 });

      case 'endOfDay':
        return strategies.endOfDay
          ? new EndOfDayStrategy(strategies.endOfDay)
          : new EndOfDayStrategy({ time: '16:00' });

      default:
        console.warn(`Unknown exit strategy: ${strategyName}, defaulting to maxHoldTime`);
        return new MaxHoldTimeStrategy({ minutes: 60 });
    }
  });
};

/**
 * Apply slippage to the exit price
 * @param price Exit price
 * @param isLong Whether this is a long trade
 * @param config Slippage configuration
 * @returns Price adjusted for slippage
 */
export const applySlippage = (price: number, isLong: boolean, config?: SlippageConfig): number => {
  if (!config) return price;

  if (config.model === 'percent') {
    const slippageFactor = config.value / 100;
    // For long trades, slippage reduces exit price
    // For short trades, slippage increases exit price
    return isLong ? price * (1 - slippageFactor) : price * (1 + slippageFactor);
  } else {
    // Fixed amount slippage
    return isLong ? price - config.value : price + config.value;
  }
};
