# Plan for LLM-Derived Exit Strategy Pricing

This document outlines the plan to integrate LLM-proposed stop loss and profit target prices into
AlphaGroove's exit strategy configuration.

## 1. Configuration Changes (`alphagroove.config.yaml`)

We will introduce new boolean options within the `stopLoss` and `profitTarget` sections of the
`exitStrategies` configuration. These options will signal that the system should use prices derived
from LLM responses, potentially overriding other settings like `percentFromEntry` or
`atrMultiplier`.

### Stop Loss Configuration

```yaml
exitStrategies:
  stopLoss:
    percentFromEntry: 1.0
    atrMultiplier: 1.5
    useLlmProposedPrice: false # New option
    # ... other stop loss options
```

- **`useLlmProposedPrice`**: (boolean, default: `false`)
  - If `true`, and the LLM confirmation screen is enabled and provides a valid stop loss price, this
    price will be used.
  - This would override `percentFromEntry` and `atrMultiplier` for calculating the stop loss level.

### Profit Target Configuration

```yaml
exitStrategies:
  profitTarget:
    percentFromEntry: 2.0
    atrMultiplier: 3.0
    useLlmProposedPrice: false # New option
    # ... other profit target options
```

- **`useLlmProposedPrice`**: (boolean, default: `false`)
  - If `true`, and the LLM confirmation screen is enabled and provides a valid profit target price,
    this price will be used.
  - This would override `percentFromEntry` and `atrMultiplier` for calculating the profit target
    level.

## 2. LLM Response Structure and Price Extraction

The LLM will need to be prompted to return proposed stop loss and profit target prices as part of
its JSON response.

Example LLM JSON response structure:

```json
{
  "action": "long", // or "short", "do_nothing"
  "rationalization": "Price shows bullish momentum with potential for further upside.",
  "proposedStopLoss": 585.5, // Optional: LLM's suggested stop loss price
  "proposedProfitTarget": 592.0 // Optional: LLM's suggested profit target price
}
```

- The system will look for `proposedStopLoss` and `proposedProfitTarget` keys in the LLM responses.
- If multiple LLM calls are made (`numCalls > 1`), the system will average the valid, numeric prices
  proposed by the LLMs for `stopLoss` and `profitTarget` respectively.
  - Only responses that align with the consensus trade `action` (or the pre-set direction if not
    `llm_decides`) should be considered for their proposed prices.
  - If an LLM does not provide a price or provides an invalid one, it will be excluded from the
    averaging for that specific level.

## 3. Core Logic Modifications

The exit strategy processing logic will need to be updated:

- **Check Configuration**: Before calculating stop loss or profit target levels, check if the
  respective `useLlmProposedPrice` flag is `true` in the configuration.
- **Access LLM Data**: If the flag is `true`, the system must retrieve the (averaged)
  `proposedStopLoss` or `proposedProfitTarget` from the LLM consensus data associated with the trade
  signal.
  - This implies that the LLM processing step must store these averaged proposed prices alongside
    the consensus action and rationalization.
- **Apply LLM Price**:
  - If a valid LLM-derived price is available, use it directly as the stop loss or profit target
    level.
  - If `useLlmProposedPrice` is `true` but no valid price is obtained from the LLM (e.g., LLMs
    didn't provide it, or consensus was not to trade), the system should fall back to the standard
    calculation methods (`percentFromEntry`, `atrMultiplier`) or potentially not set a stop/target
    if those are also not configured. This fallback behavior needs careful consideration. A clear
    warning should be logged if fallback occurs when an LLM price was expected.
- **Priority**: The `useLlmProposedPrice` option takes precedence over `percentFromEntry` and
  `atrMultiplier` when set to `true` and a valid LLM price is available.

## 4. README Documentation Updates

The `README.md` file will be updated to:

- Document the new `useLlmProposedPrice` options for `stopLoss` and `profitTarget`.
- Explain how these options work, including the averaging of prices from multiple LLM calls.
- Clarify the interaction with existing configuration settings (e.g., overrides).
- Update the example `alphagroove.config.yaml` snippet to include these new options.
- Describe the expected JSON fields (`proposedStopLoss`, `proposedProfitTarget`) in the LLM
  response.

## 5. Testing

- Unit tests will be added for the price averaging logic.
- Integration tests will be updated/added to verify that:
  - LLM-derived prices are correctly used when configured.
  - The system correctly falls back to other methods if LLM prices are unavailable or the option is
    disabled.
  - The interaction with `llm_decides` direction and pre-set directions is handled correctly for
    price proposals.

## Implementation Steps

1.  **Modify `README.md`**: Add documentation for the new configuration options and LLM response
    structure. (COMPLETED)
2.  **(IN PROGRESS)** Update LLM interaction service to parse and average `proposedStopLoss` and
    `proposedProfitTarget` from LLM responses. (COMPLETED - `LlmApiService` already handled parsing;
    averaging added to `LlmConfirmationScreen`)
3.  **(IN PROGRESS)** Modify exit strategy calculation logic to incorporate `useLlmProposedPrice`
    and use the derived LLM prices. (COMPLETED - Logic added to `src/index.ts` in
    `processTradesLoop`)
4.  **(IN PROGRESS)** Add/Update tests. (COMPLETED - Added tests for averaging in
    `llm-confirmation.screen.test.ts` and new focused tests for `processTradesLoop` LLM price usage
    in `index.process_trades_llm_exit.test.ts`. Existing tests updated where necessary.)
5.  **(Future - CLI/Config)** Update `alphagroove.config.yaml` example and any default config
    generation. (COMPLETED - Zod schemas, `DEFAULT_CONFIG`, `createDefaultConfigFile`, and example
    prompt in `config.ts` updated. `README.md` examples updated.)
6.  Final review and testing. (Considered done for this iteration, pending test environment
    stability)

For the current request, focus will be on Step 1: Updating `README.md` and this `PLAN.md`.
