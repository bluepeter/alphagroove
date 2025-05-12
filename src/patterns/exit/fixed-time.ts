import { PatternDefinition } from '../types.js';
import { Bar, Signal } from '../types';

export interface FixedTimeExitConfig {
  barsAfterEntry: number;
}

export function detectFixedTimeExit(
  bars: Bar[],
  entry: Signal,
  config: FixedTimeExitConfig
): Signal | null {
  const entryIndex = bars.findIndex(bar => bar.timestamp === entry.timestamp);
  if (entryIndex === -1) {
    return null;
  }

  const exitIndex = entryIndex + config.barsAfterEntry;
  if (exitIndex >= bars.length) {
    return null;
  }

  return {
    timestamp: bars[exitIndex].timestamp,
    price: bars[exitIndex].close,
    type: 'exit',
  };
}

/**
 * Creates the SQL query for the fixed time exit pattern
 */
export function createSqlQuery(_config: FixedTimeExitConfig): string {
  // Note: Currently not using config in the SQL, but kept for future extensibility
  return `
    SELECT 
      year,
      COUNT(*) as match_count,
      SUM(CASE WHEN exit_price IS NOT NULL 
        THEN ((exit_price - open) / open * 100) END) as total_returns
    FROM price_changes
    WHERE exit_price IS NOT NULL
      AND exit_time IS NOT NULL
    GROUP BY year
  `;
}

export const fixedTimeExitPattern: PatternDefinition & {
  config: FixedTimeExitConfig;
  updateConfig: (newConfig: Partial<FixedTimeExitConfig>) => PatternDefinition;
} = {
  name: 'Fixed Time Exit',
  description: 'Exits after a configurable number of minutes after entry',
  // Will be set from config system
  config: {
    barsAfterEntry: 0,
  },
  sql: '',
  updateConfig(newConfig: Partial<FixedTimeExitConfig>) {
    const updatedConfig = { ...this.config, ...newConfig };
    return {
      ...this,
      config: updatedConfig,
      description: `Exits exactly ${updatedConfig.barsAfterEntry} minutes after entry`,
      sql: createSqlQuery(updatedConfig),
    };
  },
};
