# AlphaGroove Enhancement Ideas

This document captures ideas for future enhancements to the AlphaGroove project.

## Pattern Screening/Filtering

This concept adds an additional layer of intelligence to the pattern detection process:

### Architecture Changes

- Create a new "filter" or "screen" concept in the system
- Position it between pattern detection and trade execution
- Allow filters to be composed/chained

### Naming Convention

We could call these "screens" or "filters" and introduce them like:

- `EntryPattern -> EntryScreen -> Trade`
- `ExitPattern -> ExitScreen -> Close`

### Implementation Approach

1. Add a new directory structure: `src/screens/` with subdirectories for entry/exit screens
2. Create a screen interface with methods like `shouldEnter(signal, bars, context)`
3. Make screens configurable via CLI (e.g., `--entry-screen llm-sentiment`)
4. Allow screens to be chained (e.g., `--entry-screens "volume-filter,llm-sentiment"`)

### LLM-Specific Screen

This section details an advanced screen that uses a multimodal Large Language Model (LLM) to provide
a confirmation signal based on chart analysis. It acts as a sophisticated filter for entry patterns.

**Concept:**

- When a primary entry pattern (e.g., `quick-rise`) triggers, this screen provides a "second
  opinion" from an LLM.
- It sends a chart image of the current market situation to the LLM.
- The LLM is prompted to act as a day trader and decide whether to go long, short, or do nothing.
- The trade is only confirmed if a configurable majority of LLM responses agree on a direction.

**Workflow:**

1.  **Trigger:** Activates after a primary entry pattern generates a signal.
2.  **Chart Generation:** The system generates a chart image. As per current capabilities, this
    should include:
    - The current trading day up to the entry point.
    - The immediately preceding trading day.
    - Candlestick representation (OHLC).
    - Volume data.
3.  **LLM Interaction:**
    - The chart image (e.g., PNG) is sent to a configured multimodal LLM (e.g., Anthropic Claude 3.5
      Sonnet).
    - This is done `N` times (e.g., 3 times by default) in parallel, with each call potentially
      using a different (ideally increasing) temperature.
    - Each call uses a specific prompt from the `prompts` configuration, which is then appended with
      the `commonPromptSuffixForJson` (if defined) to ensure consistent JSON output instructions.
    - **Example of a final prompt sent to LLM (after combination):** "You are a cautious day
      trader... Based on the chart, what action (long, short, do_nothing) minimizes risk? Please
      respond in JSON format, like this: `{"action": "long"}` or `{"action": "short"}` or
      `{"action": "do_nothing"}`."
4.  **Response Aggregation & Decision Logic:**
    - The system collects all `N` JSON responses from the LLM.
    - It counts the occurrences of "long", "short", and "do_nothing" actions.
    - A trade is confirmed if at least `M` (e.g., 2 out of 3) responses agree on the same action
      (long or short).
    - If the agreement threshold `M` is not met for either long or short, the screen effectively
      filters out the original signal (i.e., "do nothing").

**Proposed Architecture & Implementation:**

- **New Service:** A dedicated service, e.g., `LlmConfirmationService` (likely within
  `src/services/` or as part of the `src/screens/` structure).
  - Handles communication with the LLM API (e.g., using an official SDK like `@anthropic-ai/sdk`).
  - Manages image encoding (e.g., to base64 for the API).
  - Formats the prompt by combining the specific prompt from the `prompts` array with the
    `commonPromptSuffixForJson` and the image.
  - Sends multiple requests in parallel with varying temperatures and corresponding final prompts.
  - Parses the JSON responses from the LLM.
  - Implements the aggregation and decision logic.
- **Integration:** This service is invoked as a screen after an entry pattern signal. The screen's
  `shouldEnter` method would return true only if the LLM confirmation meets the criteria.
- **Configuration (`alphagroove.config.yaml`):** A new section, possibly under `screens` or a
  dedicated `llmConfirmation` block:
  ```yaml
  llmConfirmationScreen: # Or a more generic screen name
    enabled: false
    # Provider could be 'anthropic', 'openai', etc. to allow flexibility
    llmProvider: 'anthropic'
    modelName: 'claude-3.5-sonnet-20240620' # Example: Latest powerful model like Claude 3.5 Sonnet
    # API key should be sourced from an environment variable for security
    apiKeyEnvVar: 'ANTHROPIC_API_KEY'
    numCalls: 3
    agreementThreshold: 2 # Min number of LLM agreements to proceed
    # Temperatures for each of the N calls. If not specified, could use a default ramp.
    temperatures: [0.2, 0.5, 0.8]
    # Prompt(s) to use. Can be a single string (used for all N calls)
    # or an array of strings (length must match numCalls).
    prompts:
      [
        'You are a cautious day trader focused on capital preservation. Based on the chart, what
        action (long, short, do_nothing) minimizes risk?',
        'You are an aggressive day trader looking for high probability setups. Based on the chart,
        what action (long, short, do_nothing) has the best risk/reward?',
        'You are a neutral market analyst. Objectively assess the chart. What is the most likely
        direction (long, short) or is it unclear (do_nothing)?',
      ]
    # Common suffix to ensure consistent JSON response formatting. Appended to each prompt above.
    commonPromptSuffixForJson:
      'Please respond in JSON format, like this: `{"action": "long"}` or `{"action": "short"}` or
      `{"action": "do_nothing"}`.'
    # Fallback if 'prompts' is a single string (commonPromptSuffixForJson would still be appended):
    # promptTemplate: >
    maxOutputTokens: 50 # Max tokens for the LLM's JSON response
    # Optional: timeout per API call
    timeoutMs: 30000
  ```

**Key Considerations:**

- **API Costs & Tracking:**
  - Multimodal LLM calls, especially multiple per signal, can be expensive. Monitor usage closely.
  - The system should track and report the estimated cost per trade decision that involves the LLM.
  - The overall summary output at the end of a run should include the total estimated cost incurred
    from LLM API calls.
- **Latency:** API calls (especially parallel ones) introduce latency. This screen is better suited
  for strategies where a few seconds to minutes of delay for confirmation is acceptable.
- **Prompt Engineering:** The effectiveness heavily relies on the prompt components (individual
  prompts + common suffix).
  - If using multiple prompts, each core prompt needs careful design.
  - The `commonPromptSuffixForJson` should clearly and consistently define the expected JSON output
    format.
  - Iterative refinement of all prompt parts will be necessary.
- **Model Selection:** Choice of LLM (and version) will impact performance, cost, and capabilities
  (e.g., image understanding quality).
- **Error Handling:** Robust error handling is needed for API failures, network issues, malformed
  LLM responses (e.g., non-JSON output), and timeouts. Consider fallback logic (e.g., if a call
  fails, how does it affect the agreement threshold?).
- **API Key Management:** API keys must be stored and accessed securely (e.g., via environment
  variables, not committed to the repository).
- **Chart Context:** Ensure the generated charts provide clear and sufficient visual information for
  the LLM to make a reasonable assessment.
- **Testability:** Mock the LLM API responses for unit and integration tests to avoid actual API
  calls during testing and ensure predictable behavior.
- **Determinism (or lack thereof):** Using varying temperatures aims for diverse insights but also
  means responses for the same chart might differ across runs. The aggregation logic (agreement
  threshold) is key to managing this.

This would fit nicely in the pipeline after pattern detection but before trade execution, allowing
the system to first identify potential trades using technical patterns, then apply more
sophisticated screening.
