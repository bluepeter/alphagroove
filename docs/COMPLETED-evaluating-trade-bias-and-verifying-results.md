# Investigation Plan: Lookahead Bias and Results Verification

This document outlines the steps to investigate and verify the trading results of the AlphaGroove
system, with a specific focus on identifying any potential lookahead bias or other issues that might
be leading to unrealistically positive performance.

## Investigation Areas

### 1. LLM Chart Analysis and Data Leakage

- **Confirm Chart Content for LLM:**
  - [x] Verify that the chart image sent to the LLM for entry confirmation is the one truncated at
        the proposed entry time (e.g., `TICKER_PATTERN_DATE.png`) and NOT the `_complete.png`
        version.
    - **Finding (2023-07-26):** Confirmed. `src/index.ts` calls `generateChartForLLMDecision` which
      calls `generateEntryChart` from `src/utils/chart-generator.ts`. `generateEntryChart`
      explicitly generates two SVGs/PNGs: one for LLM (truncated, anonymized, e.g., `NAME.png`) and
      one complete (`NAME_complete.png`). It returns the path to the LLM version (`NAME.png`).
      `LlmConfirmationScreen` then receives this path, copies the file to a temporary random name,
      and uses that for LLM analysis. The logic in `generateSvgChart` (called by
      `generateEntryChart` with `showFullDayData: false`) correctly slices data up to and including
      the entry bar on the signal day, plus the prior day\'s data.
  - [ ] **Manual Verification Needed (Will not perform):** Manually inspect sample images sent to
        the LLM (e.g., the `TICKER_PATTERN_DATE.png` file, not the `_complete.png` one) to visually
        confirm they only contain data up to the entry signal timestamp on the signal day, plus the
        full prior day. Compare with the `_complete.png` version for the same signal.
- **Confirm Chart Anonymization:**
  - [x] Verify that the ticker symbol, date in the header, and X-axis date labels are correctly
        anonymized (e.g., "XXX", "Prior Day", "Signal Day") in the image sent to the LLM.
    - **Finding (2023-07-26):** Confirmed. `generateSvgChart` in `src/utils/chart-generator.ts`
      (called with `anonymize: true` for the LLM chart) correctly replaces the ticker, header date
      with "XXX", and X-axis date labels with "Prior Day" / "Signal Day".
  - [x] Check that the filename of the image sent to the LLM is randomized as stated in the README.
    - **Finding (2023-07-26):** Confirmed. `src/screens/llm-confirmation.screen.ts` (lines 50-54)
      copies the received chart (which is the anonymized `NAME.png`) to a temporary file with a
      cryptographically random name before sending it to the LLM service.
- **Review LLM Prompting:**
  - [x] Analyze the prompts sent to the LLM. Ensure they do not contain any information that would
        constitute lookahead bias (e.g., information about price action after the proposed entry
        time).
    - **Finding (2023-07-26):** Confirmed. `src/services/llm-api.service.ts` constructs the
      `fullPrompt` by combining `currentPrompt` and `commonPromptSuffixForJson` directly from the
      configuration. These are static strings in the provided examples. The image is handled as
      separate message content. No dynamic data injection into the text prompt was observed in the
      service.
  - [x] Confirm that the `commonPromptSuffixForJson` does not inadvertently leak future data.
    - **Finding (2023-07-26):** Confirmed. The `commonPromptSuffixForJson` is taken directly from
      the configuration (example: 'Respond in JSON: {"action": "<action>", "rationalization":
      "<one_sentence_rationale>"}') and is a static string. It does not appear to have any mechanism
      for data leakage.

### 2. Entry Decision Logic

- **No Future Data in Entry Calculation:**
  - [x] Scrutinize the code responsible for identifying entry signals (e.g., `quick-rise`,
        `fixed-time-entry` patterns). Confirm that these calculations strictly use data available
        _up to and including_ the proposed entry bar.
    - **Finding (2023-07-26):**
      - **`quick-rise` (`src/patterns/entry/quick-rise.ts`):**
        - The SQL query (`createSqlQuery`) uses data from fixed times (09:30 open vs 09:35 high) to
          determine a signal. No future data relative to the 09:35 signal time is used.
        - The JS function `detectQuickRiseEntry` uses a rolling window of `maxBars` ending at the
          current bar `i`. It uses `bars[i].high` and `min(open)` from the window. No future data is
          used.
        - **Potential Issue Noted:** The `within-minutes` config (maps to `maxBars`) for
          `quick-rise` is intended to be configurable, but the SQL query hardcodes the check between
          09:30 and 09:35. The JS function respects `maxBars`. If SQL is primary for signal
          generation, the `within-minutes` config might not behave as expected beyond 5 minutes.
          This is a functionality concern, not a lookahead bias.
      - **`fixed-time-entry` (`src/patterns/entry/fixed-time-entry.ts`):**
        - The SQL query (`createSqlQuery`) selects bars where `bar_time` matches the configured
          `entryTime`. Only data from this specific bar is used. No future data leak.
        - The JS function `detectFixedTimeEntry` checks the last bar provided against `config.time`
          and uses its data. No future data leak.
  - [x] Ensure that no exit strategy calculations or parameters influence the entry decision.
    - **Finding (2023-07-26):** The reviewed entry pattern files (`quick-rise.ts`,
      `fixed-time-entry.ts`) do not show any inclusion of exit strategy calculations or parameters
      in their entry signal logic (either SQL or JS functions).
- **`llm_decides` Direction Logic:**
  - [x] If `default.direction` is `llm_decides`, verify the process:
    - [x] The LLM makes a decision (long/short/do*nothing) based \_only* on the anonymized,
          truncated chart.
      - **Finding (2023-07-26):** Verified in Section 1. The chart sent to the LLM is the correct
        truncated and anonymized version.
    - [x] The `return_pct` is correctly calculated based on the LLM's chosen direction.
      - **Finding (2023-07-26):** The system calculates `return_pct` in JavaScript
        (`src/index.ts -> processTradesLoop`) _after_ the `actualTradeDirection` (which includes the
        LLM's decision) is finalized. The formula
        `actualTradeDirection === 'long' ? (exitPrice - entryPrice) / entryPrice : (entryPrice - exitPrice) / entryPrice;`
        is used, which is standard and correct for the determined direction.
      - The SQL query (`src/utils/query-builder.ts`) does **not** pre-calculate a `return_pct`. It
        determines entry candidates and entry prices, assuming a `sqlQueryBaseDirection` (e.g.,
        'long' if `llm_decides`). The actual P/L is calculated fresh in JS.
      - The README statement "If the LLM chooses the opposite direction, this `return_pct` is
        automatically inverted by the system" appears to be inaccurate as there's no initial
        `return_pct` from SQL to invert. The calculation is direct based on the final
        `actualTradeDirection`. This is a documentation clarification, not a lookahead bias.

### 3. Exit Strategy Logic and Execution

- **Data Used for Exit Calculations:**
  - [x] Confirm that all exit strategy calculations (Stop Loss, Profit Target, Trailing Stop, Max
        Hold Time, End of Day) use price data _after_ the trade entry.
    - **Finding (2023-07-26):** Confirmed. The main `evaluateExitStrategies` function in
      `src/utils/trade-processing.ts` passes all bars for the signal day to individual strategy
      `evaluate` methods.
    - Each strategy implementation in `src/patterns/exit/exit-strategy.ts` (e.g.,
      `StopLossStrategy`, `ProfitTargetStrategy`, `TrailingStopStrategy`, `MaxHoldTimeStrategy`,
      `EndOfDayStrategy`) starts by filtering these bars:
      `bars.filter(bar => bar.timestamp > entryTime)`.
    - They then loop through these filtered bars (which are strictly after the entry time) to check
      their conditions. Calculations within the loop use data from the current bar being iterated or
      state derived from previous post-entry bars (e.g., for trailing stop).
    - The common exit logic (if not in `_testMode`) of exiting at `tradingBars[i + 1].open` (the
      next bar's open after a signal on `tradingBars[i]`) is a valid simulation technique and uses
      data from a bar that is indeed in the future relative to the bar triggering the condition.
- **ATR Calculation for Exits:**
  - [x] Specifically verify that ATR used for dynamic exit levels (`atrMultiplier`,
        `activationAtrMultiplier`, `trailAtrMultiplier`) is calculated based on the _prior trading
        day's_ data and is available at the time of entry, not recalculated with future data.
    - **Finding (2023-07-26):** Confirmed.
      - In `src/index.ts -> processTradesLoop`, `entryAtrValue` is determined by calling
        `calculateEntryAtr(..., tradeDate)` before evaluating exits.
      - `calculateEntryAtr` (in `src/utils/trade-processing.ts`) calls
        `getPriorDayTradingBars(..., tradeDate)`.
      - `getPriorDayTradingBars` (in `src/utils/data-loader.ts`) executes SQL to find the actual
        trading day string strictly before `tradeDate`, then fetches all 1-minute bars for that
        _prior_ day.
      - `calculateEntryAtr` then calls `calculateAverageTrueRangeForDay` (in
        `src/utils/calculations.ts`) with these prior day bars. This function computes the simple
        average of True Range values for all bars of that prior day.
      - This `entryAtrValue` is then passed to the exit strategies. The ATR value is fixed at the
        time of entry and based solely on the prior day's complete data.
- **Order of Exit Strategy Evaluation:**
  - [x] Confirm that the `enabled` array in `exitStrategies` dictates the priority and that the
        first triggered condition correctly executes the exit.
    - **Finding (2023-07-26):** Confirmed.
      - `createExitStrategies` (in `src/patterns/exit/exit-strategy.ts`) iterates through the
        `config.exitStrategies.enabled` array (from `alphagroove.config.yaml`) using `.map()`. This
        creates an array of `ExitStrategy` instances in the order specified in the configuration.
      - `evaluateExitStrategies` (in `src/utils/trade-processing.ts`) iterates through this ordered
        array of strategies. If a strategy's `evaluate()` method returns a non-null `ExitSignal`,
        the loop breaks, and that signal is used.
      - This correctly implements the behavior where the first strategy in the `enabled` list that
        triggers an exit will be the one executed.

### 4. Data Handling and Integrity

- **Price Data:**
  - [ ] **Manual Verification Needed (Will not perform):** Inspect a sample source CSV data file
        (e.g., `tickers/SPY/1min.csv`) to confirm:
    - Column order matches assumptions (Col0: Timestamp, Col1: Open, etc.).
    - `column0` contains a full timestamp string parseable by DuckDB.
    - Timestamps are accurate, in chronological order without gaps or duplicates that could affect
      bar indexing or TR calculations.
    - Data aligns with market hours where expected.
  - [x] Ensure timestamps are accurate and that there are no off-by-one errors in how bars are
        selected or indexed for calculations (entry, ATR, exits).
    - **Finding (2023-07-26):**
      - **Entry/Execution:** `src/index.ts -> processTradesLoop` identifies a `signalBar` where the
        entry condition is met and then sets the `executionBar` to `signalBarIndex + 1`. The entry
        price for P&L is based on `executionBar.close`. This is a standard approach to simulate
        entry on the bar following a signal.
      - **Exit:** Exit strategies in `src/patterns/exit/exit-strategy.ts` that trigger on
        `tradingBars[i]` (which is post-entry) generally use `tradingBars[i + 1].open` or
        `tradingBars[i].close` (if last bar) for exit. This is also a standard simulation for
        exiting on the bar after an exit condition is met.
      - **Chart Generation:** `generateSvgChart` uses `.slice(0, entryIndexInAllData + 1)` to
        include the entry bar itself in the LLM chart, consistent with showing data "up to the entry
        signal".
      - **General Timestamp Handling:** Code generally uses direct timestamp comparisons or SQL
        `strftime` for filtering, which seems robust. Absolute accuracy of raw timestamps in CSVs
        requires manual data inspection.
      - While the logic for bar progression (signal -> execution -> exit) seems correct and avoids
        obvious off-by-one errors in indexing, subtle issues related to raw data quality (e.g.
        missing bars, incorrect timestamps in CSV) cannot be ruled out without data validation by
        manual inspection.
- **Adjusted Entry/Exit Prices:**
  - [x] Investigate the calculation of "Adj Entry" and "Adj Exit" prices. Understand what
        adjustments are being made (e.g., slippage model).
    - **Finding (2023-07-26):** "Adj Entry" (`finalEntryPriceForPAndL` in `src/index.ts`) is
      calculated by applying slippage to the `executionBar.close` (the bar after the signal bar).
      "Adj Exit" (`exitPrice` in `src/index.ts`) is calculated by applying slippage to the
      `exitSignal.price` (typically the open of the bar after an exit condition is met, or the close
      of the bar if it's the last bar of the day or a timed exit).
  - [x] Ensure the slippage model (`exitStrategies.slippage`) is applied realistically and doesn't
        assume perfect execution or favorable fills based on future knowledge.
    - **Finding (2023-07-26):** The `applySlippage` function (in
      `src/patterns/exit/exit-strategy.ts`) correctly implements 'percent' or 'fixed' slippage based
      on the configuration.
    - It consistently adjusts the price to be worse for the trader (higher entry price for longs,
      lower for shorts; lower exit price for longs, higher for shorts).
    - This is a standard and realistic way to model slippage and is applied to already determined
      prices without using future data in the slippage calculation itself.

### 5. Code Review for Hidden Lookahead Bias

- **Comprehensive Data Flow Analysis:**
  - [x] Trace the flow of data from initial data loading, through pattern identification, LLM
        screening (if enabled), entry execution, and finally exit processing.
    - **Finding (2023-07-26):** The main data flow in `src/index.ts -> processTradesLoop` was
      reviewed:
      1.  Entry signals are identified from SQL using data up to the signal time.
      2.  `allBarsForDayOfSignal` is fetched starting from the signal timestamp for the signal day.
      3.  The `executionBar` is the bar after the `signalBar` from this array.
      4.  LLM charts are generated based on data up to `signalBar.timestamp`.
      5.  ATR for exits uses data from the day _prior_ to the signal day.
      6.  Exit strategies receive `allBarsForDayOfSignal` but internally filter it to use bars
          strictly _after_ the `actualExecutionTimestamp`.
    - This sequence correctly maintains temporal order and does not appear to introduce lookahead
      bias in the orchestration of components.
  - [x] Look for any instances where data from a future bar (relative to the current decision point)
        might be accessed or used. This includes array indexing, loops, and conditional logic not
        already covered.
    - **Finding (2023-07-26):** Detailed checks in previous sections on entry patterns, exit
      strategies, ATR calculation, and chart generation have confirmed that direct access to future
      bars for decision-making is avoided. Array indexing (e.g., `signalBarIndex + 1` for execution,
      `tradingBars[i+1]` for exit price simulation) is consistent with moving to the next available
      bar, not an arbitrary future bar.
- **Function Signatures and Data Structures:**
  - [x] Review function signatures to ensure they don't inadvertently pass future data.
    - **Finding (2023-07-26):** Functions generally receive specific data elements (e.g.,
      `entryPrice`, `entryTimestamp`) or arrays of `Bar` objects that are either pre-filtered (like
      `allBarsForDayOfSignal` starting at signal time) or filtered again locally by the function
      (like exit strategies filtering for post-execution bars). No signatures were found that seem
      to pass inappropriately broad future data.
  - [x] Examine data structures to see if they hold future information that could be accessed
        prematurely.
    - **Finding (2023-07-26):** The primary data structure is the `Bar` object, which is
      self-contained for its timestamp. Arrays of `Bar` objects are handled with appropriate
      filtering as noted above. No complex data structures holding easily accessible future data
      were identified.

### 6. Reproducibility and Test Cases

- **Isolate Specific Trades:**
  - [ ] **Manual Task (Will not perform):** Pick a few seemingly "too good to be true" winning
        trades from the output.
  - [ ] **Manual Task (Will not perform):** Manually walk through the decision-making process for
        these trades, bar by bar, using the documented logic and historical data.
  - [ ] **Manual Task (Will not perform):** Verify that the chart sent to the LLM for these trades
        was correctly truncated and anonymized.
  - [ ] **Manual Task (Will not perform):** Verify the exact exit conditions and calculations.
- **"What If" Scenarios:**
  - [ ] **Manual Task (Will not perform):** Consider creating test scenarios with slight
        modifications to data to see if outcomes change as expected (e.g., if a profit target was
        narrowly hit, what if the high of a bar was one tick lower?).

## Documentation and Reporting

- [x] Document all findings, including code snippets, data samples, and specific examples. (This
      document serves as the primary log).
- [ ] If issues are found, propose specific code changes or fixes. (Two minor issues noted below).
- [x] Conclude with an assessment of whether lookahead bias is present and to what extent it might
      be affecting the results. (Assessment: No direct lookahead bias found in code; recommendations
      made for functionality/docs).

## Summary of Findings & Next Steps

**Overall Assessment on Lookahead Bias:** Based on the code review, no direct lookahead biases that
would use future price data for decision-making (entry, exit, LLM screening, ATR calculation) were
identified. The system appears to correctly handle temporal data separation for the aspects
reviewed.

**Potential Issues / Clarifications (Requiring Action):**

1.  **Functionality Concern (`quick-rise` pattern):**

    - The `within-minutes` config for the `quick-rise` entry pattern (which maps to `maxBars`) is
      described as configurable in the README. However, the SQL query generated by `createSqlQuery`
      in `src/patterns/entry/quick-rise.ts` hardcodes the check to be between 09:30 and 09:35 (a
      5-minute window), regardless of the `within-minutes` setting.
    - The JavaScript version (`detectQuickRiseEntry`) _does_ respect `maxBars`.
    - **Impact:** If the SQL query is the primary method for discovering signals in a backtest
      (which is likely), the `within-minutes` setting will not function as expected beyond a
      5-minute window. This could lead to signals not being generated as per user configuration.
    - **Recommendation:** Modify the SQL generation in `createSqlQuery` for `quick-rise` to
      dynamically use the `maxBars` (or `within-minutes`) value to set the end time of the check
      window (e.g., by adjusting the `\'09:35\'` literal).

2.  **Documentation Inaccuracy (README):**
    - The `README.md` (under `llm_decides` section) states: "The initial SQL query for fetching
      trade data will assume a base direction (e.g., \'long\') for calculating `return_pct`. If the
      LLM chooses the opposite direction, this `return_pct` is automatically inverted by the
      system..."
    - **Finding:** The SQL query does _not_ pre-calculate a `return_pct`. The `return_pct` is
      calculated fresh in JavaScript (`src/index.ts -> processTradesLoop`) _after_ the final
      `actualTradeDirection` (which includes the LLM\'s decision) is determined.
    - **Recommendation:** Update the README.md to accurately describe that `return_pct` is
      calculated in JavaScript based on the final trade direction, and there is no initial
      `return_pct` from SQL that gets inverted.

**Manual Verification Steps (Marked as Will Not Perform for this exercise):**

- **LLM Chart Inspection (Section 1).**
- **Price Data CSV Inspection (Section 4).**
- **Reproducibility and Test Cases (Section 6).**

**Final Conclusion (Based on Code Review Only):** The AlphaGroove backtesting engine appears to be
largely free of common lookahead biases in its core logic for the aspects reviewed. The high
performance observed is more likely attributable to other factors (strategy, parameters, market
conditions, data quality) rather than fundamental flaws in temporal data handling within the
backtester\'s code. The two actionable issues identified are related to configuration functionality
and documentation clarity, not lookahead bias.
