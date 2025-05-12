# Smarter Exit Strategy Plan

This document outlines the plan to develop and implement more sophisticated exit strategies for
trades within AlphaGroove, moving beyond the current fixed-time exit.

## Current Status

- **Phase 2: COMPLETED - Implemented Advanced Exit Strategies & Bar-by-Bar Logic**
- **All planned exit strategy work has been successfully implemented**

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

### INCREMENTAL STEP 2: Implement Advanced Exit Strategies & Bar-by-Bar Logic

**Status: COMPLETED**

#### Accomplishments

1.  **Defined Full `exitStrategies` Configuration:**

    - **Added Zod schemas in `src/utils/config.ts`:**
      - Created `StopLossConfigSchema` with `percentFromEntry` and optional `atrMultiplier`
        properties
      - Created `ProfitTargetConfigSchema` with `percentFromEntry` and optional `atrMultiplier`
        properties
      - Created `TrailingStopConfigSchema` with `activationPercent` and `trailPercent` properties
      - Created `EndOfDayConfigSchema` with a `time` property in HH:MM format
      - Created `SlippageConfigSchema` with `model` (percent or fixed) and `value` properties
    - **Expanded `ExitStrategiesConfigSchema`** to include all these new strategy configurations
    - **Updated configuration examples** in README and `alphagroove.config.yaml` with full examples
    - **Added comprehensive configuration validation** to ensure proper values for all exit
      strategies

2.  **Implemented Technical Indicators and Calculation Functions:**

    - **Added ATR (Average True Range) calculation** in `src/utils/calculations.ts`
    - **Created helper functions** for calculating stop losses based on ATR or percentage
    - **Added unit tests** for all new calculation functions

3.  **Created Data Loading Functions for Bar-by-Bar Processing:**

    - **Implemented `fetchBarsForTradingDay`** in `src/utils/data-loader.ts` to retrieve all bars
      for a trading day after entry
    - **Implemented `fetchBarsForATR`** to retrieve historical bars needed for ATR calculation
    - **Added SQL queries** using DuckDB to fetch the required bar data from CSV files

4.  **Developed Exit Strategy Framework:**

    - **Created `src/patterns/exit/exit-strategy.ts`** with common interfaces and base classes
    - **Implemented individual strategy classes:**
      - `StopLossStrategy` (percentage or ATR-based)
      - `ProfitTargetStrategy` (percentage or ATR-based)
      - `TrailingStopStrategy` with activation threshold
      - `MaxHoldTimeStrategy` for time-based exits
      - `EndOfDayStrategy` for market close exits
    - **Added `applySlippage` function** to model realistic trading costs
    - **Implemented factory function** `createExitStrategies` to instantiate strategies from config

5.  **Refactored Core Application Logic:**

    - **Simplified `buildAnalysisQuery` in `src/utils/query-builder.ts`** to focus only on entry
      signals
    - **Updated `processTradesLoop` in `src/index.ts`** to:
      - Fetch bars for each trading day after an entry signal
      - Calculate ATR if needed
      - Evaluate each enabled exit strategy in priority order
      - Apply the first triggered exit condition
      - Calculate trade returns with proper slippage modeling
    - **Updated data flow** to separate entry detection from exit evaluation

6.  **Comprehensive Testing:**
    - **Added unit tests** for all exit strategy classes
    - **Created integration tests** for the overall exit framework
    - **Fixed compatibility issues** with existing tests
    - **Ensured backward compatibility** with previous fixed-time exit behavior

## Phase 3: Testing & Refinement

**Status: COMPLETED**

All testing and refinement tasks have been successfully completed:

1.  **Unit Tests:**

    - Added tests for ATR calculation
    - Created tests for each exit strategy type
    - Implemented tests for slippage modeling
    - Verified proper exit price determination

2.  **Integration Tests:**

    - Tested combinations of different exit strategies
    - Verified correct exit triggering based on strategy priority
    - Confirmed accurate return calculations

3.  **System-Wide Testing:**

    - Updated all existing tests to work with the new exit strategy framework
    - Ensured backward compatibility with older code and configurations
    - Fixed edge cases and error handling

4.  **Code Quality:**
    - Ran `pnpm test` and verified all tests pass
    - Applied `pnpm lint:fix` to ensure code quality standards
    - Added documentation in README.md for all new exit strategy options

## Conclusion

The implementation of advanced exit strategies has been successfully completed. AlphaGroove now
supports a flexible, modular system for dynamic trade exits with the following capabilities:

1. **Multiple Exit Strategy Types:**

   - Stop Loss (percentage or ATR-based)
   - Profit Target (percentage or ATR-based)
   - Trailing Stop with activation threshold
   - Maximum Hold Time
   - End of Day exit
   - Slippage modeling

2. **Configuration Flexibility:**

   - Strategies can be enabled/disabled and prioritized via configuration
   - Each strategy has customizable parameters
   - Configuration via YAML file or command-line options

3. **Bar-by-Bar Processing:**

   - Realistic evaluation of price action after entry
   - Dynamic application of exit conditions
   - Support for indicator-based exits (ATR)

4. **Improved Realism:**
   - Slippage modeling for more realistic returns
   - Support for ATR-based stops/targets that adapt to market volatility
   - Priority-based exit evaluation

This implementation completes all planned exit strategy work and significantly enhances
AlphaGroove's backtesting capabilities.
