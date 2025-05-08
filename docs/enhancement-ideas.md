# AlphaGroove Enhancement Ideas

This document captures ideas for future enhancements to the AlphaGroove project.

## Quick-Fall Pattern and Direction Support

### 1. New Entry Pattern Options

#### (a) Quick-Fall Pattern

We have two approaches:

**Option 1: Create a Unified "Quick-Change" Pattern**

- Rename "quick-rise" to "quick-change" with a direction parameter
- Advantages: Unified codebase, single pattern with configurable direction
- Disadvantages: More complex configuration, might make SQL queries less readable

**Option 2: Create a Separate "Quick-Fall" Pattern**

- Keep "quick-rise" as is and add a new "quick-fall" pattern
- Advantages: Cleaner separation, simpler implementation, more explicit
- Disadvantages: Duplicated code, separate maintenance paths

Recommendation: Option 2 initially, with a carefully designed interface that shares code between the
implementations where appropriate. This provides clearer separation while we work out the details.

#### (b) Long/Short Direction Support

We need to:

1. Add a "direction" parameter to patterns
2. Update the pattern factory to handle direction
3. Modify the SQL queries and detection logic

Implementation approach:

- Enhance `PatternDefinition` interface with an optional `direction` property
- Add direction parameter to CLI (e.g., `--direction long|short`)
- Update output formatting to show direction
- Calculate returns appropriately based on direction (short positions would invert the return
  calculation)

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
