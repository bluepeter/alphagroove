# Dynamic Volatility-Adjusted Exit Parameters Plan

**Status: COMPLETED**

## 1. Objective

Dynamically set Stop Loss, Profit Target, and Trailing Stop parameters at the time of trade entry.
These parameters will be based on the prior trading day's volatility. The goal is to provide
concrete dollar amounts or percentages from the entry price, making them easy to use for manual
order entry in trading platforms like Fidelity.

## 2. Volatility Calculation (Using Prior Day's Data)

**Implemented:** This calculation is performed once per trade, at the time of entry.

- **Chosen Measure:** Average True Range (ATR) of the prior full trading day.
  - **True Range (TR) for each bar:**
    `max(High - Low, abs(High - PreviousClose), abs(Low - PreviousClose))`
  - **Prior Day ATR:** Calculated as the simple average of all True Range values from all 1-minute
    bars of the prior full trading day (using the new `calculateAverageTrueRangeForDay` function).
- **Data Fetching:** The `getPriorDayTradingBars` function was added to `src/utils/data-loader.ts`
  to fetch all 1-minute bars for the specific prior trading day.

## 3. New/Updated Configuration Parameters

**Implemented:** Added to `alphagroove.config.yaml` under the `exitStrategies` section for each
relevant strategy. The system will prioritize ATR-based calculations if `atrPeriodForEntry` (a new
global setting) and the relevant `...AtrMultiplier` for a strategy are configured, and a valid ATR
can be computed. Otherwise, it will fall back to existing percentage-based or fixed-time
configurations.

- **Global ATR Setting (e.g., under `exitStrategies` or a new top-level `volatilitySettings`
  block):**
  - `atrPeriodForEntry: number` (e.g., 14): The lookback period (in bars from the prior day) to
    calculate the ATR used at entry. Optional.
- **Stop Loss (`exitStrategies.stopLoss`):**
  - `atrMultiplier: number` (optional, uses ATR at entry).
  - `percentFromEntry: number` (existing, used as a fallback).
- **Profit Target (`exitStrategies.profitTarget`):**
  - `atrMultiplier: number` (optional, uses ATR at entry).
  - `percentFromEntry: number` (existing, used as a fallback).
- **Trailing Stop (`exitStrategies.trailingStop`):**
  - `activationAtrMultiplier: number` (optional, for activation offset based on ATR).
  - `trailAtrMultiplier: number` (optional, for trail amount based on ATR).
  - `activationPercent: number` (existing, used as a fallback).
  - `trailPercent: number` (existing, used as a fallback).

## 4. Determining Exit Parameters at Trade Entry

**Implemented:** When an entry signal occurs:

1.  `getPriorDayTradingBars` fetches bars for the prior trading day.
2.  `calculateAverageTrueRangeForDay` (from `src/utils/calculations.ts`) computes `entryAtrValue`
    using these bars. The `atrPeriodForEntry` config is not used for this.
3.  Stop Loss, Profit Target, and Trailing Stop activation/trail amounts are calculated using
    `entryAtrValue` and their respective ATR multipliers if configured and `entryAtrValue` is valid.
    Otherwise, they fall back to percentage-based calculations.
4.  These determined parameters are used by the exit strategies.

## 5. Output for Manual Trading

**Implemented:** The system's output for each trade (e.g., in detailed logs or results files) will
include:

- The calculated Stop Loss Price (and if ATR-based).
- The calculated Profit Target Price (and if ATR-based).
- For Trailing Stops: calculated activation level and trail amount (indicating if ATR-based or
  percent-based).
- Display these as percentages of the entry price for user reference and clarity on the risk/reward
  profile.

## 6. Code Modification Summary

- **`src/utils/config.ts`:** **COMPLETED**
  - Removed `atrPeriodForEntry` from `ExitStrategiesConfigSchema`.
  - Added `activationAtrMultiplier` and `trailAtrMultiplier` to `TrailingStopConfigSchema`.
  - Updated `DEFAULT_CONFIG`, `createDefaultConfigFile`, and `mergeConfigWithCliOptions`.
- **`src/utils/calculations.ts`:** **COMPLETED**
  - Added `calculateAverageTrueRangeForDay` function. The existing `calculateATR` (which takes a
    period) remains but is not used for _this specific_ prior-day ATR calculation for entry
    parameters.
- **`src/utils/data-loader.ts`:** **COMPLETED**
  - Added `getPriorDayTradingBars` function.
- **`src/patterns/exit/exit-strategy.ts`:** **COMPLETED**
  - `StopLossStrategy`, `ProfitTargetStrategy`, `TrailingStopStrategy` `evaluate` methods updated to
    prioritize ATR-based calculations using the passed `atr` (entry ATR) value and fall back to
    percentages.
- **`src/index.ts` (`processTradesLoop`):** **COMPLETED**
  - Fetches prior day bars, calls `calculateAverageTrueRangeForDay` to get `entryAtrValue` (does not
    use `atrPeriodForEntry` config for this).
  - Passes `entryAtrValue` to each `strategy.evaluate()` call.
  - Calculates and stores initial dynamic/fallback exit parameters for logging.
  - Passes these stored parameters to `mapRawDataToTrade`.
- **`src/utils/mappers.ts` (`mapRawDataToTrade`):** **COMPLETED**
  - Updated to accept and store the new dynamic exit parameter fields.
- **`src/utils/output.ts` (`Trade` interface and `printTradeDetails`):** **COMPLETED**
  - `Trade` interface updated with new optional fields.
  - `printTradeDetails` updated to display the dynamic exit parameters.

## 7. Error Handling & Fallbacks

**Implemented:**

- If prior day data is insufficient, `calculateAverageTrueRangeForDay` returns `undefined`.
- Exit strategies check for a valid `atr` value and configured multipliers before using ATR-based
  logic, otherwise defaulting to percentage-based methods.
- Warnings are logged in `src/index.ts` if ATR calculation fails or prior day bars are missing when
  ATR-based exits are attempted.

This plan prioritizes using an ATR calculated as the simple average of all TRs from the prior day's
1-minute bars. The `atrPeriodForEntry` configuration was removed as it is not used by this method.
