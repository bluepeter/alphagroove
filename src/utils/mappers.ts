import { type Trade } from './output.js';

export const mapRawDataToTrade = (
  rawTradeData: Record<string, any>,
  actualTradeDirection: 'long' | 'short',
  chartPath?: string
): Trade => {
  return {
    trade_date: rawTradeData.trade_date as string,
    entry_time: rawTradeData.entry_time as string,
    exit_time: rawTradeData.exit_time as string,
    executionPriceBase: rawTradeData.executionPriceBase as number,
    entry_price: rawTradeData.entry_price as number,
    exit_price: rawTradeData.exit_price as number,
    rise_pct:
      rawTradeData.rise_pct === undefined ||
      rawTradeData.rise_pct === null ||
      Number.isNaN(Number(rawTradeData.rise_pct))
        ? null
        : Number(rawTradeData.rise_pct),
    return_pct: rawTradeData.return_pct as number,
    year: parseInt(rawTradeData.year as string, 10),
    total_trading_days: rawTradeData.total_trading_days as number,
    // These fields are part of the Trade interface and present in the original mapping logic
    median_return: rawTradeData.median_return as number,
    std_dev_return: rawTradeData.std_dev_return as number,
    win_rate: rawTradeData.win_rate as number,
    // Optional fields from Trade interface that are in rawTradeData from query
    match_count: rawTradeData.match_count as number,
    all_trading_days: rawTradeData.all_trading_days as number,
    direction: actualTradeDirection,
    chartPath,
    avg_return: rawTradeData.avg_return as number | undefined,
    exit_reason: rawTradeData.exit_reason as string | undefined,
    initialStopLossPrice: rawTradeData.initialStopLossPrice as number | undefined,
    initialProfitTargetPrice: rawTradeData.initialProfitTargetPrice as number | undefined,
    tsActivationLevel: rawTradeData.tsActivationLevel as number | undefined,
    tsTrailAmount: rawTradeData.tsTrailAmount as number | undefined,
    isStopLossAtrBased: rawTradeData.isStopLossAtrBased as boolean | undefined,
    isProfitTargetAtrBased: rawTradeData.isProfitTargetAtrBased as boolean | undefined,
    isTrailingStopAtrBased: rawTradeData.isTrailingStopAtrBased as boolean | undefined,
    stopLossAtrMultiplierUsed: rawTradeData.stopLossAtrMultiplierUsed as number | undefined,
    profitTargetAtrMultiplierUsed: rawTradeData.profitTargetAtrMultiplierUsed as number | undefined,
    entryAtrValue: rawTradeData.entryAtrValue as number | undefined,
    tsActivationAtrMultiplierUsed: rawTradeData.tsActivationAtrMultiplierUsed as number | undefined,
    tsTrailAtrMultiplierUsed: rawTradeData.tsTrailAtrMultiplierUsed as number | undefined,
  };
};
