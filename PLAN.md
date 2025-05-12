# Smarter Exit Strategy Plan

This document outlines the plan to develop and implement more sophisticated exit strategies for
trades within AlphaGroove, moving beyond the current fixed-time exit.

## Current Status

- **Phase 2 in Progress (INCREMENTAL STEP 1: COMPLETED - Implemented `maxHoldTime` via new
  `exitStrategies` config structure)**
- **Ready for Phase 2, INCREMENTAL STEP 2: Implement Advanced Exit Strategies & Bar-by-Bar Logic**

## Goals

1.  Improve overall strategy profitability and risk-adjusted returns.
2.  Implement more dynamic and market-adaptive exit conditions.
3.  Allow for better profit capture and more effective loss mitigation.
4.  Ensure exit logic is fair and realistic for both long and short trades, considering potential
    slippage.

## Phase 1: Analysis of Current Exit Mechanism (`fixed-time`)

**Objective:** Understand precisely how the current `fixed-time` exit determines the exit price and
if there are any implicit biases or unrealistic fill assumptions.

**Status: Completed** (Review done, findings below)

**Tasks & Findings:**

1.  **Review `fixed-time` Exit Pattern Code & SQL (`src/utils/query-builder.ts`): Done**

    - **`exit_timestamp` Calculation:**

      - Handled within `buildAnalysisQuery` for `Fixed Time Entry` and `QuickRise/QuickFall`
        (default fixed-time) patterns.
      - `holdMinutes` is derived from `options['fixed-time']['hold-minutes']`, defaulting to 10
        minutes.
      - **For `Fixed Time Entry` Pattern:**
        - `calculated_exit_timestamp` = `entry_time + INTERVAL '${holdMinutes} minutes'`.
        - Actual `exit_time` is the timestamp of the _first bar whose timestamp is >=
          `calculated_exit_timestamp`_ on the same `trade_date`.
      - **For `QuickRise/QuickFall` Patterns (and default fixed-time logic):**
        - Entry is assumed at `09:35`.
        - `exitTimeString` (HH:MM) is calculated by adding `holdMinutes` to `09:35`.
        - `exit_time` is the timestamp of the bar matching this exact `exitTimeString`. If no bar
          exists at this specific minute, no trade/exit is recorded for that instance.

    - **`exit_price` Selection:**

      - Consistently uses the `close` price of the identified exit bar for both `Fixed Time Entry`
        and `QuickRise/QuickFall` type exits.

    - **Long vs. Short Bias:**

      - The `return_pct` calculation correctly adjusts for `long`
        (`(exit_price - entry_price) / entry_price`) and `short`
        (`(entry_price - exit_price) / entry_price`) directions.
      - The underlying mechanism for determining the `exit_time` and selecting the `exit_price`
        (always the `close`) is identical for both long and short trades. No bias is observed in the
        selection of the exit bar/price itself based on trade direction.

    - **Slippage/Fill Assumption:**
      - The system assumes trades can always be exited at the `close` price of the determined exit
        bar.
      - There is no explicit modeling for slippage or the bid-ask spread. This implies an assumption
        of perfect fills at the bar's closing price.

2.  **Document Findings:** Summarized above.

## Phase 2: Design and Implement New Exit Strategies (Incremental Approach)

**Objective:** Introduce a flexible system for multiple, configurable exit strategies.

### INCREMENTAL STEP 1: Implement `maxHoldTime` Exit via New `exitStrategies` Config

**Status: COMPLETED**

#### Accomplishments

1.  **Defined New `exitStrategies` Configuration Structure:**

    - **Configuration schemas in `src/utils/config.ts`:**
      - Created `MaxHoldTimeConfigSchema` with a `minutes` property that defaults to 60 minutes.
      - Developed `ExitStrategiesConfigSchema` with an `enabled` array of strategy names and
        optional strategy-specific configuration objects.
      - Integrated these schemas into the main `ConfigSchema`, both at the root level and in the
        `default` section.
    - **Updated Configuration Examples:**
      - Modified `alphagroove.config.yaml` to use the new `exitStrategies` configuration format:
        ```yaml
        exitStrategies:
          enabled: ['maxHoldTime']
          maxHoldTime:
            minutes: 60
        ```
      - Ensured backward compatibility by maintaining reasonable defaults.

2.  **Modified Configuration Merging Logic:**

    - **Enhanced `mergeConfigWithCliOptions` in `src/utils/config.ts`:**
      - Implemented proper precedence order for configuration resolution: CLI options > root
        config > default config > schema defaults.
      - Added special handling for `exitStrategies.maxHoldTime.minutes` to ensure it's properly
        merged.
      - Fixed a bug in the date validation regex pattern (removed unnecessary escape characters).

3.  **Updated Pattern Factory for Exit Strategies:**

    - **Improved `getExitPattern` in `src/patterns/pattern-factory.ts`:**
      - Modified to accept an undefined pattern name and return a `DefaultExitStrategyPattern`.
      - Added logging for unknown exit pattern names instead of throwing errors.
      - Integrated with the new `exitStrategies` configuration approach.

4.  **Refactored Query Builder for Exit Time Calculation:**

    - **Enhanced `buildAnalysisQuery` in `src/utils/query-builder.ts`:**
      - Updated to extract hold minutes from `exitStrategies.maxHoldTime.minutes`.
      - Added default handling and warnings for misconfigured or missing maxHoldTime settings.
      - Maintained the two separate SQL paths for Fixed Time Entry and Quick Rise/Fall patterns.
      - Added better handling of trade direction in SQL generation.

5.  **Updated Main Application Logic:**

    - **Modified `index.ts`:**
      - Updated `initializeAnalysis` to pass undefined to `getExitPattern`, which returns the
        DefaultExitStrategyPattern.
      - Updated header printing to show the exit strategy name based on enabled strategies in the
        configuration.
      - Added fallback for missing exit strategy configuration.

6.  **Comprehensive Testing:**
    - **Updated and added tests:**
      - Added tests for the new configuration structure in `src/utils/config.test.ts`.
      - Updated tests for query building in `src/utils/query-builder.test.ts`.
      - Fixed pattern factory tests to match the new behavior in
        `src/patterns/pattern-factory.test.ts`.
      - Ran all 150 tests to ensure system-wide compatibility with the changes.

#### Lessons Learned

1. **Configuration Flexibility:**

   - Using a Zod schema-based approach for configuration validation provides strong type safety, but
     requires careful handling of default values.
   - Storing available exit strategies in an `enabled` array provides a clean way to select which
     strategies to apply.
   - Multi-level configuration merging (root vs default section) requires clear precedence rules.

2. **Pattern Factory Design:**

   - The pattern factory works well for entry patterns where implementations differ significantly.
   - For exit strategies, a more flexible approach with a default fallback pattern helps maintain
     backward compatibility.
   - Logging warnings instead of throwing errors for unknown patterns improves resilience.

3. **Query Building Complexity:**

   - The SQL generation logic for different entry patterns needs careful maintenance to ensure
     consistency.
   - The same exit logic (adding minutes to an entry time) is duplicated in two places, suggesting
     potential for further refactoring.

4. **Testing Importance:**

   - Small changes to configuration structures can have wide-ranging impacts across the system.
   - Having comprehensive tests that exercise the full application flow was essential for catching
     integration issues.
   - The pattern factory tests required adjustments to accommodate the new behavior of not checking
     SQL string equality.

5. **Future-Proofing:**
   - The new configuration structure is designed to be extensible for future exit strategies.
   - Using an array of strategy names in `enabled` will allow for future support of multiple exit
     conditions and prioritization.

### INCREMENTAL STEP 2 & BEYOND: Implement Advanced Exit Strategies & Bar-by-Bar Logic

**(The following tasks will be undertaken next)**

1.  **Define Full `exitStrategies` Configuration (YAML & Zod in `src/utils/config.ts`):**

    - **To Do:** Add Zod schemas for `StopLossConfigSchema`, `ProfitTargetConfigSchema`,
      `TrailingStopConfigSchema`, `EndOfDayConfigSchema`.
    - **To Do:** Expand `ExitStrategiesConfigSchema` to include these new optional strategy
      configurations.
    - **To Do:** Update `DEFAULT_CONFIG` and `createDefaultConfigFile` with examples/defaults for
      these new strategies (likely disabled by default initially, except perhaps `endOfDay`).
    - **To Do:** Update `src/utils/config.test.ts` to cover these new configurations.
    - **Planned Structure:**
      ```yaml
      exitStrategies:
        enabled: ['stopLoss', 'profitTarget', 'trailingStop', 'maxHoldTime', 'endOfDay']
        stopLoss:
          percentFromEntry: 1.0 # Or atrMultiplier: 1.5
        profitTarget:
          percentFromEntry: 2.0 # Or atrMultiplier: 3.0
        trailingStop:
          activationPercent: 1.0
          trailPercent: 0.5
        maxHoldTime:
          minutes: 60
        endOfDay:
          time: '16:00' # Close positions by this time
        slippage:
          model: 'percent' # or 'fixed'
          value: 0.05 # 0.05% slippage or $0.05 depending on model
      ```

2.  **Implement Calculation of Indicators (e.g., ATR in `src/utils/calculations.ts`):**

    - **To Do:** Add function to calculate ATR based on a series of `Bar` data.
    - **To Do:** Add unit tests for indicator calculations.

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
- **Trade Execution Realism:** Consider adding constraints on when trades can be exited (e.g.,
  market hours only, not on weekends/holidays) to improve realism.
- **Configuration Validation:** Add more sophisticated validation for the exitStrategies
  configuration to prevent incompatible combinations of settings.

This plan provides a roadmap. Details will be refined as each phase is approached.
