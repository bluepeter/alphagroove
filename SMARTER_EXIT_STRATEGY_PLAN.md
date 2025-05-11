# Smarter Exit Strategy Plan

This document outlines the plan to develop and implement more sophisticated exit strategies for
trades within AlphaGroove, moving beyond the current fixed-time exit.

## Current Status

- **Phase 2 in Progress (Incremental Step 1: Implementing `maxHoldTime` via new config structure)**

## Goals

1.  Improve overall strategy profitability and risk-adjusted returns.
2.  Implement more dynamic and market-adaptive exit conditions.
3.  Allow for better profit capture and more effective loss mitigation.
4.  Ensure exit logic is fair and realistic for both long and short trades, considering potential
    slippage.

## Phase 1: Analysis of Current Exit Mechanism (`fixed-time`)

**Objective:** Understand precisely how the current `fixed-time` exit determines the exit price and
if there are any implicit biases or unrealistic fill assumptions.

**Status: Completed**

**Tasks & Findings:**

1.  **Review `fixed-time` Exit Pattern Code & SQL (`src/utils/query-builder.ts`):**

    - **`exit_timestamp` Calculation:**
      - For `Fixed Time Entry` pattern: `entry_time + INTERVAL '${holdMinutes} minutes'`.
      - For `QuickRise/QuickFall` (default fixed-time): An equivalent HH:MM string is calculated
        based on entry (assumed 09:35 for these patterns) + `holdMinutes`, and the exit bar is
        matched to this string.
    - **`exit_price` Selection:**
      - Consistently uses the `close` price of the selected exit bar for all patterns employing the
        fixed-time logic.
      - The exit bar is the _first bar whose timestamp is greater than or equal to_ the calculated
        target exit time (for `Fixed Time Entry`) or the bar matching the exact HH:MM string (for
        `QuickRise/QuickFall` type fixed exits).
    - **Long vs. Short Bias:** The core mechanism for calculating the target exit time and selecting
      the `close` price of the exit bar is **identical and neutral** for both long and short trades.
      The user's hypothesis that it might favor longs by picking the high of the exit bar is **not
      supported** by the SQL exit price selection logic.
    - **Slippage/Fill Assumption:** The system assumes trades can always be exited at the `close`
      price of the determined exit bar, with no explicit modeling for slippage or bid-ask spread.
      This is an area for future improvement for enhanced realism.

2.  **Document Findings:** Summarized above.

## Phase 2: Design and Implement New Exit Strategies (Incremental Approach)

**Objective:** Introduce a flexible system for multiple, configurable exit strategies.

**INCREMENTAL STEP 1: Implement `maxHoldTime` Exit via New `exitStrategies` Config**

**Current Task: Modify `src/utils/config.ts` to support the new `exitStrategies.maxHoldTime`
configuration.**

1.  **Define Initial `exitStrategies` Configuration (`alphagroove.config.yaml` &
    `src/utils/config.ts`):**

    - **Done (YAML):** `alphagroove.config.yaml` updated to remove old exit configs and add
      `exitStrategies: { enabled: ['maxHoldTime'], maxHoldTime: { minutes: N } }`.
    - **To Do (Zod in `src/utils/config.ts`):**
      - Define `MaxHoldTimeConfigSchema = z.object({ minutes: z.number().int().positive() });`.
      - Define
        `ExitStrategiesConfigSchema = z.object({ enabled: z.array(z.string()).default(['maxHoldTime']), maxHoldTime: MaxHoldTimeConfigSchema.optional().default({ minutes: 60 }) });`.
      - Integrate `ExitStrategiesConfigSchema` into the main `ConfigSchema` (as
        `exitStrategies: ExitStrategiesConfigSchema.optional().default({})`).
      - Remove old exit fields/schemas from `ConfigSchema`, `DEFAULT_CONFIG`,
        `createDefaultConfigFile`, `MergedConfig` type, and `mergeConfigWithCliOptions` function.
      - Update `DEFAULT_CONFIG` and `createDefaultConfigFile` to reflect this minimal
        `exitStrategies` setup (e.g., `maxHoldTime` enabled with a default like 60 minutes).
    - **Next after Zod:** Update `src/utils/config.test.ts`.

2.  **Adapt `src/utils/query-builder.ts` (`buildAnalysisQuery`):**

    - **To Do:** Modify `buildAnalysisQuery` to source `holdMinutes` from
      `options.exitStrategies?.maxHoldTime?.minutes` instead of the old
      `options['fixed-time']['hold-minutes']`.
    - The SQL logic for calculating the fixed-time exit can largely remain the same for this
      increment, as it's still a fixed-time exit, just configured differently.
    - The `_exitPatternDefinition` argument to `buildAnalysisQuery` becomes less relevant for exit
      logic but might still be passed if `getExitPattern` is called.

3.  **Adapt `src/index.ts` (`initializeAnalysis` & `runAnalysis`):**

    - **To Do:** Review if `getExitPattern` call in `initializeAnalysis` is still needed or how its
      result is used, given that `buildAnalysisQuery` will now directly use
      `mergedConfig.exitStrategies`.

4.  **Testing for this Increment:**
    - **To Do:** Update `src/utils/config.test.ts` to verify loading of the new
      `exitStrategies.maxHoldTime`.
    - **To Do:** Ensure existing tests that rely on fixed-time exits still pass after
      `query-builder.ts` is adapted (they should, as the exit _behavior_ isn't changing yet, only
      its configuration source).
    - **To Do:** Run `pnpm test` and `pnpm lint:fix`.

---

**INCREMENTAL STEP 2 & BEYOND: Implement Advanced Exit Strategies & Bar-by-Bar Logic**

**(The following tasks will be undertaken after Increment 1 is complete and stable)**

1.  **Define Full `exitStrategies` Configuration (YAML & Zod in `src/utils/config.ts`):**

    - **To Do:** Add Zod schemas for `StopLossConfigSchema`, `ProfitTargetConfigSchema`,
      `TrailingStopConfigSchema`, `EndOfDayConfigSchema`.
    - **To Do:** Expand `ExitStrategiesConfigSchema` to include these new optional strategy
      configurations.
    - **To Do:** Update `DEFAULT_CONFIG` and `createDefaultConfigFile` with examples/defaults for
      these new strategies (likely disabled by default initially, except perhaps `endOfDay`).
    - **To Do:** Update `src/utils/config.test.ts` to cover these new configurations.

2.  **Implement Calculation of Indicators (e.g., ATR in `src/utils/calculations.ts`):**

    - **To Do:** Add function to calculate ATR based on a series of `Bar` data.

3.  **Refactor `processTradesLoop` for Bar-by-Bar Exit Logic (`src/index.ts`):**

    - **To Do:** This is a major refactoring.
    - After an entry, fetch subsequent bars for the day.
    - For each bar, calculate indicators (ATR).
    - Check enabled exit strategies (from `mergedConfig.exitStrategies.enabled` array, in order):
      - Stop-Loss check (breach of `entryPrice - (ATR * multiplier)` or similar).
      - Profit-Target check.
      - Trailing Stop check.
      - `maxHoldTime` check (based on bar timestamps vs entry timestamp).
      - `endOfDay` check (based on bar timestamp).
    - The first condition met triggers an exit.
    - Determine `exit_price` based on rules (e.g., close of triggering bar, or open of next for
      gaps) and apply slippage.
    - Calculate `return_pct` in JS using this dynamic `exit_price`.

4.  **Update Data Fetching for Exits (`src/index.ts` or `src/utils/data-loader.ts`):**

    - **To Do:** Implement logic to fetch all bars for a given `trade_date` after `entry_time` as
      needed by `processTradesLoop`.

5.  **Refactor `buildAnalysisQuery` (`src/utils/query-builder.ts`):**

    - **To Do:** Significantly simplify. It will primarily become an _entry signal generator_.
    - It should provide `entry_price`, `entry_time`, `trade_date`, `year`, `rawTradeData.direction`
      (SQL base direction).
    - It will **no longer** calculate `exit_price`, `exit_time`, or `return_pct` if all exits are
      dynamic.
    - The `_exitPatternDefinition` argument and `getExitPattern` will likely be removed entirely
      from this flow.

6.  **Update `mapRawDataToTrade` and `Trade` interface (`src/utils/mappers.ts`,
    `src/utils/output.ts`):**
    - **To Do:** `Trade` will still store `exit_price`, `exit_time`, determined by the new
      bar-by-bar logic.
    - The `rawTradeData` passed to `mapRawDataToTrade` will not have an exit price/time from SQL.

## Phase 3: Testing & Refinement (for full feature set)

1.  **Unit Tests:**
    - Test ATR calculation.
    - Test individual exit condition triggers (e.g., stop-loss hit, profit target met).
    - Test exit price determination logic with and without slippage.
2.  **Integration Tests for `processTradesLoop`:**
    - Test scenarios with different combinations of exit strategies.
    - Verify correct exit triggering and `return_pct` calculation.
3.  **Backtest against historical data:**
    - Compare performance of new exit strategies vs. old fixed-time exit.
    - Analyze impact on win rate, average win/loss, risk/reward ratios.
4.  **Run `pnpm test` and `pnpm lint:fix`**.

## Considerations & Open Questions (for full feature set)

- **Order of Exit Condition Checks:** The `exitStrategies.enabled` array will define this order.
- **Slippage Model for New Exits:** To be implemented. Start with simple options (percentage/fixed
  points per exit) configurable under `exitStrategies.slippage`.
- **Complexity of Bar-by-Bar Processing:** This will significantly change `processTradesLoop` from
  processing pre-calculated trades to a more active simulation loop.
- **Data Requirements for Indicators:** Ensure enough historical bar data is available to calculate
  indicators like ATR correctly at the point of entry.
- **Performance:** Bar-by-bar processing in JS will be slower than pre-calculated SQL exits. For
  very large datasets or many years, this might become a concern, but for typical research runs, it
  should be acceptable.

This plan provides a roadmap. Details will be refined as each phase is approached.
