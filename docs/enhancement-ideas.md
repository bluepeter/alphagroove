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

For an LLM-based filter specifically:

1. It could analyze recent price action, news, sentiment
2. Cache results to avoid repeated API calls
3. Provide configurable prompts
4. Return a confidence score along with the decision

This would fit nicely in the pipeline after pattern detection but before trade execution, allowing
the system to first identify potential trades using technical patterns, then apply more
sophisticated screening.
