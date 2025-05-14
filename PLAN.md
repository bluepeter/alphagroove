# Investigation and Refinement Plan for Backtesting Accuracy

This plan outlines the steps to investigate and refine the backtesting process to ensure its
accuracy and transparency, particularly concerning trade execution and cost modeling.

## Current Understanding & Key Findings:

- **Entry Execution:** Signals are generated at `HH:MM:00`. The logged "Entry" price is the Open of
  this signal bar. The "Adj Entry" price (used for P&L) appears to be the Open price of the _next_
  1-minute bar (`HH:MM+1:00`).
- **Slippage Discrepancy:** The `slippage: model: 'fixed', value: 0.01` in `alphagroove.config.yaml`
  does not seem to be the primary factor determining "Adj Entry." The difference between "Entry" and
  "Adj Entry" is predominantly the market movement between the signal bar open and the next bar
  open. The `0.01` fixed slippage is applied inconsistently on top of the Next Bar Open (NBO), if at
  all.
- **Exit Execution:** Preliminary analysis suggests exits (stop loss, trailing stop, profit target)
  are likely executed within the bar where the condition is met, which is standard.
- **Win Rates:** The observed high win rates are more interpretable if they correctly account for
  the "cost of delay" from entering at the next bar's open and any additional slippage.
- **Commissions:** No explicit commission settings have been observed in `alphagroove.config.yaml`,
  suggesting they might not be currently modeled.

## Investigation and Refinement Steps

### Step 1: Entry Logic & Slippage Implementation

#### Observational Analysis of Entry Logic & Slippage (Completed)

- **Action:** Systematically analyze more trade examples (both long and short) from the logs.
- **Goal:** Characterize the behavior of "Adj Entry" price relative to market data and
  configuration.
- **Method:** Use `grep` on `tickers/SPY/1min.csv`. Compare logged "Entry", "Adj Entry" with market
  data (Open of signal bar, Open of next bar).
- **Initial Findings Summary:** Entries appear to execute at the Open of the bar following the
  signal bar (Next Bar Open - NBO), with a small, variable amount ($0.00-$0.02 in examples) is often
  added to the NBO, making the fill slightly worse. This addition doesn't consistently match the
  `slippage.value: 0.01` from the config as a simple `NBO +/- 0.01`.

#### Code Investigation for Current Entry Price & Slippage Logic (Completed)

- **Action:** Located and reviewed `src/index.ts`, `src/utils/mappers.ts`,
  `src/utils/query-builder.ts`, `src/patterns/entry/fixed-time-entry.ts`, and
  `src/patterns/exit/exit-strategy.ts`.
- **Goal:** Pinpoint the exact current logic for "Adj Entry" price calculation.
- **Actual Implemented Logic (Findings before latest change request):**
  1.  The initial `rawTradeData.entry_price` (from the `FixedTimeEntryPattern` SQL defined in
      `src/patterns/entry/fixed-time-entry.ts`) is the **CLOSE of the signal bar** (e.g., the
      13:00:00 bar).
  2.  The `rawTradeData.market_open` (logged as "Entry" in trade details via `printTradeDetails` in
      `src/utils/output.ts`) is the **OPEN of the signal bar** (from the same SQL query, aliased as
      `open_price_at_entry`).
  3.  The `entryPrice` used for P&L (and logged as "Adj Entry" in trade details) is calculated in
      `src/index.ts` (`processTradesLoop`) as:
      `applySlippage(Close_of_Signal_Bar, direction, configured_fixed_slippage_0.01, true)`.
  4.  This model, while internally consistent in the code, is deemed unrealistic by the user as it
      executes based on the close price of the bar the LLM is analyzing.

#### Implement Realistic Entry Execution Model (Next Bar Execution) (Completed)

- **Goal:** Modify the backtesting engine to:
  1.  Execute trades at the bar _following_ the signal bar (the "execution bar").
  2.  Use the **CLOSE of the execution bar** as the base price for P&L calculations before applying
      slippage.
  3.  Apply the configured fixed slippage (`0.01`) to this execution bar's Close.
  4.  Update logged "Entry Time" to reflect the execution bar's time.
  5.  Update logged contextual "Entry" price to be the **CLOSE of the execution bar** (Refined).
  6.  The logged "Adj Entry" price will be `Close_of_Execution_Bar +/- 0.01_slippage`.
- **Action Plan (Refined based on latest request):**
  1.  **Modify `processTradesLoop` in `src/index.ts` (Completed):**
      - After identifying the signal bar (e.g., from `rawTradeData`), fetch/identify the _next_ bar
        as the "execution bar" using `tradingDayBars`. Add error handling if no next bar is
        available (log warning, skip trade).
      - Define `actualExecutionTimestamp = executionBar.timestamp`.
      - Define `executionBarOpenPrice = executionBar.open`.
      - Define `executionBarClosePrice = executionBar.close`.
      - Calculate
        `finalEntryPriceForPAndL = applySlippage(executionBarClosePrice, actualTradeDirection === 'long', mergedConfig.exitStrategies?.slippage, true)`.
  2.  **Update Data Passed to `mapRawDataToTrade` (in `src/index.ts`) (Completed):**
      - The `entry_time` field in the object passed to `mapRawDataToTrade` should be
        `actualExecutionTimestamp`.
      - The `market_open` field (for the "Entry" log display) should be `executionBarClosePrice`
        (changed from `executionBarOpenPrice`).
      - The `entry_price` field (for the "Adj Entry" log display and P&L) should be
        `finalEntryPriceForPAndL`.
  3.  **Ensure Exit Logic Compatibility (Verified as part of implementation):** Confirmed that when
      `strategy.evaluate` is called for exit strategies, it receives `finalEntryPriceForPAndL` as
      its `entryPrice` argument and `actualExecutionTimestamp` as its `entryTime` argument.
- **Verification (Completed):** Confirmed with log examples that the new entry logic (Entry Time =
  Exec Bar Timestamp; Logged "Entry" = Exec Bar Close; Logged "Adj Entry" = Exec Bar Close +/- 0.01)
  and P&L calculations are correct.

#### Enhance/Create Tests for New Entry & Slippage Logic (Attempted - Unsuccessful / Deferred)

- **Action:** Attempts to write new specific unit/integration tests for the "Next Bar Execution"
  model were made. However, these attempts were unsuccessful due to complexities and insufficiencies
  in the proposed mocking strategies within the existing Vitest setup, leading to new test failures
  rather than validation. The new tests were therefore rejected/reverted.
- **Goal:** Ensure robustness of the new entry model. (Further dedicated tests for this specific
  logic are TBD and will require a revised testing approach).
- **Method:** Currently relies on the manual verification performed after the code changes and the
  integrity of the overall existing test suite (which passes with the new entry logic).

### Step 2: Analyze Exit Execution in Detail

- **Action:** Systematically analyze trade examples focusing on exit conditions (`profitTarget`,
  `trailingStop`, `maxHoldTime`, `endOfDay`).
- **Goal:** Confirm that exits are filled within the bar the condition is triggered, and at a price
  consistent with the bar's OHLC and the exit logic. Check if there's any systematic delay or
  unexpected slippage on exits.
- **Method:** Use `grep` for relevant bars. For each trade, identify the bar where the exit
  condition (e.g., price reaching ATR profit target, or trailing stop being hit) would have been
  met. Compare this with the logged "Adj Exit" price and exit time.

### Step 3: Clarify Commission Handling

- **Action:** Review `alphagroove.config.yaml` again for any overlooked commission settings. If
  none, make a definitive statement about their apparent absence in the current backtest (pending
  potential code review findings).
- **Goal:** Determine if and how trading commissions are modeled.

### Step 4: Standardize Logging (Propose Changes)

- **Action:** Based on findings from prior steps, propose changes to the trade logging format.
- **Goal:** Ensure logs accurately reflect the actual execution timing and prices, including how
  slippage and commissions (if any) are incorporated into "Adj Entry" and "Adj Exit".
- **Proposal Example (Refined):**
  - `Signal Time`: `YYYY-MM-DD HH:MM:SS` (e.g., 13:00:00)
  - `Execution Time`: `YYYY-MM-DD HH:MM:SS` (e.g., 13:01:00 for entry)
  - `Signal Bar Open (Contextual)`: Open of signal bar.
  - `Execution Bar Close (Contextual "Entry" in logs & P&L Base)`: Close of execution bar.
  - `Slippage Applied Value`: The actual slippage amount applied (e.g., $0.01) (Potentially new log
    field if desired, or just part of Adj. Fill calc).
  - `Adjusted Fill Price (P&L Entry, "Adj Entry" in logs)`: `ExecutionBarClose +/- Slippage`.

### Step 5: Update Documentation (`tickers/README.md` and/or other relevant docs)

- **Action:** Draft updates to documentation.
- **Goal:** Clearly explain:
  - The trade entry mechanism (signal generation vs. execution, e.g., "entry at next bar close +
    slippage").
  - How slippage is _actually_ modeled and applied.
  - How commissions are modeled (or if they are omitted).
  - The exit mechanism (e.g., "exits trigger and fill intra-bar").

### Step 6: Final Review and Recommendations

- **Action:** Summarize all findings and their impact on interpreting the backtest results
  (especially the high win rates).
- **Goal:** Provide a clear picture of the backtesting model's realism and suggest any further
  refinements if needed.
