## Project Overview

AlphaGroove is a comprehensive trading strategy development and execution toolkit that bridges the
gap between backtesting and live trading. The system consists of two complementary components
designed for hands-on quant researchers who prefer scripting over spreadsheets, precision over black
boxes, and intelligent analysis over curve-fitting.

### Dual-System Architecture

**1. Strategy Backtesting Engine (`pnpm dev:start`)**

- Historical analysis of intraday trading patterns using high-resolution datasets (1-minute SPY
  bars)
- Built with DuckDB and Node.js for rapid querying and filtering of market behavior
- LLM-powered trade analysis with automated chart generation for pattern recognition
- Statistical analysis with comprehensive metrics (mean/median returns, win rates, distribution
  analysis)
- Modular pattern architecture with consistent CLI interface

**2. Entry Scout (`pnpm scout`)**

- Live market analysis using the same LLM configuration and exit strategies validated in backtesting
- Real-time data integration with Polygon.io API for current market conditions
- Generates actionable trade signals with specific entry/exit levels for immediate execution
- Produces the same high-quality chart analysis used in backtesting for current market conditions

### Workflow Integration

The typical AlphaGroove workflow involves:

1. **Research Phase**: Use the backtesting engine to analyze historical data, optimize LLM settings,
   and validate exit strategies
2. **Validation Phase**: Refine entry patterns, exit parameters, and LLM prompts based on
   statistical results
3. **Execution Phase**: Deploy the validated configuration with the entry scout for live market
   analysis
4. **Implementation**: Use generated signals and calculated stop loss/profit target levels in your
   brokerage platform

**Key Features:**

- **LLM-Powered Trade Analysis**: Uses Large Language Models to analyze chart patterns and make
  trading decisions, providing intelligent filtering beyond simple technical indicators
- **Automated Chart Generation**: Creates high-quality candlestick charts for every trade signal
  (both historical and real-time)
- **Modular Pattern Architecture**: Each strategy condition is encapsulated in code with consistent
  CLI interface
- **Statistical Analysis**: Comprehensive metrics including mean/median returns, win rates, and
  distribution analysis
- **Real-Time Integration**: Seamless transition from backtesting to live trading with identical
  analysis methods

## Advanced Exit Strategies

AlphaGroove supports dynamic exit strategies that analyze price action bar-by-bar. The following
exit strategies are available:

### Stop Loss

Exits the trade when price moves against your position by a specified amount.

**Configuration options:**

- `percentFromEntry`: Exit when price moves against your position by this percentage (e.g., 1.0
  means 1%)
- `atrMultiplier`: Alternative to percentFromEntry; exit when price moves against your position by
  this multiple of ATR (Average True Range)
- `useLlmProposedPrice`: (boolean, default: `false`) If `true` and the LLM Confirmation Screen is
  enabled and returns a valid proposed stop loss price (from the `proposedStopLoss` field in its
  JSON response, averaged across calls), this price will be used. This overrides `percentFromEntry`
  and `atrMultiplier` if a valid LLM price is available.

### Profit Target

Exits the trade when price moves in your favor by a specified amount.

**Configuration options:**

- `percentFromEntry`: Exit when price moves in your favor by this percentage (e.g., 2.0 means 2%)
- `atrMultiplier`: Alternative to percentFromEntry; exit when price moves in your favor by this
  multiple of ATR
- `useLlmProposedPrice`: (boolean, default: `false`) If `true` and the LLM Confirmation Screen is
  enabled and returns a valid proposed profit target price (from the `proposedProfitTarget` field in
  its JSON response, averaged across calls), this price will be used. This overrides
  `percentFromEntry` and `atrMultiplier` if a valid LLM price is available.

### Trailing Stop

Implements a trailing stop that activates after price moves a certain amount in your favor, then
follows the price by a specified percentage.

**Configuration options:**

- `activationPercent`: The trailing stop activates after price moves this percent in your favor
  (e.g., 1.0 means 1%)
- `trailPercent`: Once activated, the stop trails the best price by this percentage (e.g., 0.5 means
  0.5%)

### Max Hold Time

Exits the trade after holding for a specified number of minutes, regardless of price action.

**Configuration options:**

- `minutes`: Number of minutes to hold the position before exiting (e.g., 60 for a 1-hour trade)

### End of Day

Exits the trade at a specific time of day, useful for avoiding overnight exposure.

**Configuration options:**

- `time`: Time of day to exit in HH:MM format (e.g., '16:00' for 4:00 PM)

### Time-Based vs Price-Based Strategies

**Time-based constraints** (`maxHoldTime` and `endOfDay`) are fundamentally different from
price-based strategies:

- **Automatically active**: When configured, they're always used - no need to include them in the
  `enabled` array
- **Act as overlays**: They provide time limits/constraints on top of other strategies
- **Base-level configuration**: Configured directly under `exit:` (not in `strategyOptions`)

**Price-based strategies** (`stopLoss`, `profitTarget`, `trailingStop`) compete with each other:

- **Must be enabled**: Require explicit inclusion in the `enabled` array
- **Configured under `strategyOptions`**: All settings go in the nested `strategyOptions` section
- **First one wins**: The first strategy to trigger ends the trade

### Slippage Model

Models realistic trading costs by applying slippage to both entry and exit prices.

**Configuration options:**

- `model`: Type of slippage model to use, either 'percent' or 'fixed'
- `value`: For percent model, the percentage of slippage (e.g., 0.05 for 0.05%); for fixed model,
  the absolute amount

### Dynamic Volatility Adjustment (ATR-Based)

To make exit parameters more adaptive to market conditions, Stop Loss, Profit Target, and Trailing
Stop strategies can optionally use the Average True Range (ATR) calculated from the prior trading
day to set their levels. The ATR used is the simple average of all 1-minute True Range values from
the entire prior trading day. This is configured per-strategy:

- **`exit.strategyOptions.stopLoss.atrMultiplier`**: (Optional, e.g., `1.5`) If set and the prior
  day's ATR (`entryAtrValue`) can be calculated, the stop loss will be
  `entryPrice - (ATR * atrMultiplier)` for longs, or `entryPrice + (ATR * atrMultiplier)` for
  shorts.
- **`exit.strategyOptions.profitTarget.atrMultiplier`**: (Optional, e.g., `3.0`) If set and
  `entryAtrValue` is available, the profit target will be `entryPrice + (ATR * atrMultiplier)` for
  longs, or `entryPrice - (ATR * atrMultiplier)` for shorts.
- **`exit.strategyOptions.trailingStop.activationAtrMultiplier`**: (Optional, e.g., `1.0`) If set
  and `entryAtrValue` is available, the trailing stop activates after price moves
  `ATR * activationAtrMultiplier` in your favor.
- **`exit.strategyOptions.trailingStop.trailAtrMultiplier`**: (Optional, e.g., `0.75`) If set and
  `entryAtrValue` is available, the stop will trail by `ATR * trailAtrMultiplier` from the peak
  price (for longs) or trough price (for shorts).

If ATR-based multipliers are not configured for a strategy, or if the prior day's ATR cannot be
calculated (e.g., insufficient data), the strategies will fall back to their `percentFromEntry`,
`activationPercent`, and `trailPercent` settings respectively. The trade output will indicate if
ATR-based parameters were used and their calculated dollar and percentage values.

These strategies can be combined in order of priority, and the first triggered condition will
execute the exit. The `enabled` array in the configuration defines which strategies are active and
their order of evaluation.

### Configuration Example

```yaml
exit:
  enabled:
    - stopLoss
    - profitTarget
    - trailingStop
  # Time-based constraints are configured at base level and automatically active
  maxHoldTime:
    minutes: 60
  endOfDay:
    time: '16:00' # exit by 4:00 PM
  # Price-based strategies under strategyOptions
  strategyOptions:
    stopLoss:
      percentFromEntry: 1.0
      # or use ATR-based stop loss with:
      # atrMultiplier: 1.5
      useLlmProposedPrice: false # Set to true to use LLM-derived stop loss
    profitTarget:
      percentFromEntry: 2.0
      # or use ATR-based target with:
      # atrMultiplier: 3.0
      useLlmProposedPrice: false # Set to true to use LLM-derived profit target
    trailingStop:
      activationPercent: 1.0 # activates after 1% favorable move
      trailPercent: 0.5 # trails by 0.5%

# Execution configuration (applies to both entry and exit)
execution:
  slippage:
    model: 'percent' # or 'fixed'
    value: 0.05 # 0.05% slippage
```

## Prerequisites

### Required: DuckDB Installation

AlphaGroove requires DuckDB to be installed on your system. This is a mandatory step before running
the application.

```bash
# Install DuckDB using Homebrew
brew install duckdb

# Verify the installation
duckdb --version
```

If you don't have Homebrew installed, you can install it from [brew.sh](https://brew.sh).

### Node.js Setup & Dependencies

The project requires Node.js 18 or later. We recommend using `pnpm` as the package manager.

```bash
# Install dependencies
pnpm install
```

This command will install all necessary Node.js packages, including `sharp` which is used for
generating PNG chart images. `sharp` includes native C++ components; `pnpm` typically handles its
compilation and any system dependencies. However, if you encounter issues during `sharp`
installation related to `libvips` or similar missing libraries, you may need to install `libvips`
manually using your system's package manager (e.g., `brew install vips` on macOS, or
`sudo apt-get install libvips-dev` on Debian/Ubuntu) and then try `pnpm install` again.

Note: The project uses a `pnpm-workspace.yaml` file to configure build behavior. This file tells
pnpm to ignore build scripts for DuckDB since we're using the Homebrew-installed version instead of
the Node.js package.

## Quick Start

1. First, ensure DuckDB is installed (see Prerequisites above)
2. Install project dependencies:
   ```bash
   pnpm install
   ```
3. **Required:** Create a configuration file named `alphagroove.config.yaml` in the project root
   directory (see Configuration section below)

4. Run the backtesting application:

   ```bash
   # Run with development mode (recommended)
   pnpm dev:start

   # Or run with specific parameters
   pnpm dev:start --from 2020-01-01 --to 2025-05-02 --entry-pattern quickRise

   # Use random time entry pattern with custom time window
   pnpm dev:start --entry-pattern randomTimeEntry \
     --randomTimeEntry.startTime 09:30 \
     --randomTimeEntry.endTime 15:30

   # Use fixed time entry with debug output
   pnpm dev:start --entry-pattern fixedTimeEntry \
     --fixedTimeEntry.entryTime 13:00 \
     --debug
   ```

5. For real-time entry scouting:

   ```bash
   # Scout entry opportunities from chart images
   pnpm scout /path/to/chart.png

   # Include trading context
   pnpm scout /path/to/chart.png --ticker SPY --price 587.54 --direction long
   ```

### Running Production Build

- Development (recommended during iteration):
  - `pnpm dev:start`

- Production build and run:
  - `pnpm build && pnpm start`

The production start registers a tiny Node ESM loader via `--import` that appends .js at runtime for
extensionless relative imports. No source edits, no post-build rewriting, ESM preserved.

## Configuration

AlphaGroove uses a centralized configuration system with all settings defined in the
`alphagroove.config.yaml` file. This is the single source of truth for all configuration values in
the application.

### Configuration File

**Required:** Create a file named `alphagroove.config.yaml` in the project root directory (same
level as `package.json`):

```yaml
default:
  date:
    from: '2023-01-01'
    to: '2025-05-02'
  ticker: 'SPY'
  timeframe: '1min'
  direction: 'llm_decides' # LLM analyzes charts and decides trade direction

  parallelization:
    maxConcurrentDays: 3 # Process multiple days concurrently for faster execution

# Entry pattern configuration
entry:
  enabled: [quickRise] # Available: quickRise, quickFall, fixedTimeEntry, randomTimeEntry
  strategyOptions:
    quickRise:
      risePct: 0.3
      withinMinutes: 5
    quickFall:
      fallPct: 0.3
      withinMinutes: 5
    fixedTimeEntry:
      entryTime: '13:00' # Required if using fixedTimeEntry
    randomTimeEntry:
      startTime: '09:30' # Start of random time window
      endTime: '16:00' # End of random time window

# Exit strategies configuration
exit:
  enabled: [profitTarget] # Available: stopLoss, profitTarget, trailingStop
  # Time-based constraints (automatically active when configured)
  endOfDay:
    time: '16:00'
  strategyOptions:
    profitTarget:
      atrMultiplier: 3.0

# Execution configuration
execution:
  slippage:
    model: 'fixed'
    value: 0.01

# LLM configuration for intelligent trade analysis
llmConfirmationScreen:
  llmProvider: 'anthropic'
  modelName: 'claude-sonnet-4-20250514'
  apiKeyEnvVar: 'ANTHROPIC_API_KEY'
  numCalls: 2
  agreementThreshold: 2
  temperatures: [0.1, 1.0]
  # ... (see full configuration below)
```

This configuration structure allows you to:

1. **Configure LLM analysis** for intelligent trade decisions
2. **Automatic chart generation** (enabled by default)
3. Configure entry patterns and their parameters
4. Set up exit strategies with ATR-based or percentage-based levels
5. Enable parallel processing for faster backtests

All pattern configuration must be explicitly provided - there are no hidden defaults in the code.
The system follows a clear hierarchy for configuration:

1. Command-line arguments (highest priority)
2. Values from `alphagroove.config.yaml`
3. ⚠️ **No system defaults** - missing configuration will cause clear error messages

**Important**: As of recent updates, all exit strategies and pattern configurations must be
explicitly provided. The system will throw descriptive errors if required configuration is missing,
rather than silently using hidden defaults.

You can generate a default config file by running:

```bash
pnpm dev:start init
```

**Note:** The configuration file must be named exactly `alphagroove.config.yaml` and placed in the
project root directory for the application to find it.

## LLM-Powered Chart Analysis

AlphaGroove's core strength lies in its integration with Large Language Models for intelligent trade
analysis. Rather than relying solely on technical indicators, the system generates high-quality
charts for every potential trade and sends them to an LLM for analysis.

**How it Works:**

- **Automatic Chart Generation**: Every entry signal triggers creation of anonymized candlestick
  charts
- **Multi-Model Analysis**: Configurable number of LLM calls with different temperature settings
- **Consensus Decision Making**: Trades execute only when LLMs reach agreement threshold
- **Dynamic Direction**: LLM can decide whether to go long, short, or skip the trade entirely
- **Price Target Suggestions**: LLMs can propose stop loss and profit target levels

**Key Benefits:**

- **Pattern Recognition**: LLMs excel at identifying complex chart patterns humans might miss
- **Context Awareness**: Considers volume, prior day action, and intraday dynamics
- **Risk Management**: Conservative approach - only trades when confident
- **Eliminates Bias**: Anonymized charts prevent historical knowledge from influencing decisions

The LLM analysis acts as a sophisticated filter, significantly improving trade quality over purely
mechanical systems.

### Configuration Validation & Error Messages

The system now enforces explicit configuration and will provide clear error messages for missing
settings:

```bash
# Missing exit strategies
Error: Exit strategies must be configured - no defaults provided to avoid hidden behavior

# Missing strategy configuration
Error: stopLoss strategy enabled but no configuration provided

# Missing entry time for fixed-time-entry pattern
Error: Fixed Time Entry pattern requires an entry time to be configured
```

These errors guide you to add the required configuration to your `alphagroove.config.yaml` file.

### Modern Configuration Example

Here's a comprehensive example showing the current configuration format including the new random
time entry pattern:

```yaml
default:
  date:
    from: '2023-01-01'
    to: '2025-05-02'
  ticker: 'SPY'
  timeframe: '1min'
  direction: 'llm_decides' # LLM analyzes charts and decides trade direction

  parallelization:
    maxConcurrentDays: 3 # Process up to 3 days concurrently for faster execution

# Entry pattern configuration
entry:
  enabled: [randomTimeEntry] # Can also use: quickRise, quickFall, fixedTimeEntry
  strategyOptions:
    randomTimeEntry:
      startTime: '10:00' # Start of random time window
      endTime: '15:00' # End of random time window
    fixedTimeEntry:
      entryTime: '13:00' # Required if using fixedTimeEntry
    quickRise:
      risePct: 0.3
      withinMinutes: 5
    quickFall:
      fallPct: 0.3
      withinMinutes: 5

# Exit strategies configuration
exit:
  enabled: [profitTarget, trailingStop]
  # Time-based constraints (automatically active when configured)
  endOfDay:
    time: '16:00'
  strategyOptions:
    profitTarget:
      atrMultiplier: 3.0
      useLlmProposedPrice: true
    trailingStop:
      activationAtrMultiplier: 0 # Immediate activation
      trailAtrMultiplier: 2.5

# Execution configuration
execution:
  slippage:
    model: 'fixed'
    value: 0.01

# LLM configuration for intelligent trade analysis
llmConfirmationScreen:
  llmProvider: 'anthropic'
  modelName: 'claude-sonnet-4-20250514'
  apiKeyEnvVar: 'ANTHROPIC_API_KEY'
  numCalls: 2
  agreementThreshold: 2
  temperatures: [0.1, 1.0]
  # ... (prompts configuration)
```

#### Why No Hidden Defaults?

This design choice ensures:

- **Predictable behavior**: No surprise defaults that might not match your intentions
- **Clear configuration**: You see exactly what settings are being used
- **Maintainable code**: No hidden behavior to debug or discover later
- **Explicit intent**: Every configuration choice is deliberate and visible

### Exit Strategies Location

Configure exit strategies at the root of the YAML under `exit` (with `exitStrategies` as an alias).

```yaml
exit:
  enabled: [profitTarget, trailingStop]
  # Time-based constraints are configured at base level and automatically active
  maxHoldTime:
    minutes: 60
  endOfDay:
    time: '16:00'
  # Price-based strategies are configured under strategyOptions
  strategyOptions:
    profitTarget:
      atrMultiplier: 5.0
    trailingStop:
      activationAtrMultiplier: 0
      trailAtrMultiplier: 2.5

# Execution configuration
execution:
  slippage:
    model: fixed
    value: 0.01
```

**Important**: Time-based constraints (`maxHoldTime` and `endOfDay`) are configured at the base
level and are **automatically active when configured** - they don't need to be in the `enabled`
array. These act as overlays/constraints on top of other strategies.

Price-based strategies (`stopLoss`, `profitTarget`, `trailingStop`) must be configured under
`strategyOptions` and explicitly enabled in the `enabled` array.

## Usage Examples

### Using Configuration File Only

Create `alphagroove.config.yaml` with your desired settings:

```yaml
default:
  date:
    from: '2020-01-01'
    to: '2025-05-02'
  ticker: 'SPY'
  direction: 'llm_decides' # LLM analyzes charts and decides trade direction

  parallelization:
    maxConcurrentDays: 3

entry:
  enabled: [quickRise]
  strategyOptions:
    quickRise:
      risePct: 0.3
      withinMinutes: 5

exit:
  enabled: [profitTarget, trailingStop]
  maxHoldTime:
    minutes: 60
  endOfDay:
    time: '16:00'
  strategyOptions:
    profitTarget:
      atrMultiplier: 5.0
    trailingStop:
      activationAtrMultiplier: 0
      trailAtrMultiplier: 2.5

execution:
  slippage:
    model: fixed
    value: 0.01

# LLM configuration for intelligent trade analysis
llmConfirmationScreen:
  llmProvider: 'anthropic'
  modelName: 'claude-sonnet-4-20250514'
  apiKeyEnvVar: 'ANTHROPIC_API_KEY'
  numCalls: 2
  agreementThreshold: 2
  temperatures: [0.1, 1.0]
```

Then simply run:

```bash
pnpm dev:start
```

### Using Command Line Arguments

Override config file settings or run without a config file:

```bash
# Override specific settings
pnpm dev:start --from 2023-01-01 --to 2023-12-31 --direction short

# Override entry pattern parameters
pnpm dev:start --quickRise.risePct=0.5 --fixedTimeEntry.entryTime=13:00

# Use different patterns
pnpm dev:start --entry-pattern quickFall
```

### Command Line Priority

Command line arguments always override config file settings. The hierarchy is:

1. **Command line arguments** (highest priority)
2. **Config file settings**
3. ⚠️ **No system defaults** - explicit configuration required

**Note**: The system no longer provides fallback defaults. If required configuration is missing,
you'll receive clear error messages indicating exactly what needs to be configured.

## Performance Optimization

### Parallel Processing

AlphaGroove supports parallel processing to significantly speed up backtests by processing multiple
trading days concurrently. This is especially beneficial for:

- **Multi-year backtests** with hundreds of trading days
- **LLM-enabled strategies** where each day involves expensive API calls
- **Large date ranges** that would otherwise take hours to process

#### How It Works

- **Year-Sequential, Day-Parallel**: Each year is processed sequentially to maintain proper yearly
  statistics, but individual trading days within each year are processed concurrently
- **Configurable Concurrency**: Control how many days are processed simultaneously (1-20)
- **Memory Efficient**: Uses Promise-based concurrency rather than spawning separate processes

#### Configuration

**Via Command Line:**

```bash
# Process up to 5 days concurrently
pnpm dev:start --maxConcurrentDays 5

# Sequential processing (default, backward compatible)
pnpm dev:start --maxConcurrentDays 1
```

**Via Configuration File:**

```yaml
default:
  parallelization:
    maxConcurrentDays: 5 # Process up to 5 days concurrently
```

### Entry Pattern Options

Entry patterns can be configured under root `entry` in the YAML (preferred) with `enabled` and
`strategyOptions`, or overridden via CLI dot notation:

```bash
pnpm dev:start --quickRise.risePct=0.5 --fixedTimeEntry.entryTime=13:00

# Combining standard and pattern-specific options
pnpm dev:start --from 2023-01-01 --to 2023-12-31 --direction short --quickRise.risePct=0.7
```

## Available Options

CLI options override values from the configuration file.

| Option                      | Description                                | Default                   |
| --------------------------- | ------------------------------------------ | ------------------------- |
| `--from <YYYY-MM-DD>`       | Start date (inclusive)                     | From config               |
| `--to <YYYY-MM-DD>`         | End date (inclusive)                       | From config               |
| `--entry-pattern <pattern>` | Entry pattern to use                       | quickRise                 |
| `--ticker <symbol>`         | Ticker to analyze                          | SPY                       |
| `--timeframe <period>`      | Data resolution                            | 1min                      |
| `--direction <direction>`   | Trading direction (long/short/llm_decides) | llm_decides               |
| `--config <path>`           | Path to custom configuration file          | ./alphagroove.config.yaml |

| `--maxConcurrentDays <number>` | Maximum days to process concurrently (1-20) | 3 | | `--debug` |
Show debug information and SQL queries | false | | `--verbose` | Show detailed LLM responses and
debug info | false | | `--dry-run` | Show query without executing | false |

### Pattern-Specific Options

#### Quick Rise Pattern Options

| Option                      | Description                                | Default from Config |
| --------------------------- | ------------------------------------------ | ------------------- |
| `--quickRise.risePct`       | Minimum percentage rise to trigger pattern | 0.3                 |
| `--quickRise.withinMinutes` | Number of minutes to look for the rise     | 5                   |

#### Quick Fall Pattern Options

| Option                      | Description                                | Default from Config |
| --------------------------- | ------------------------------------------ | ------------------- |
| `--quickFall.fallPct`       | Minimum percentage fall to trigger pattern | 0.3                 |
| `--quickFall.withinMinutes` | Number of minutes to look for the fall     | 5                   |

<!-- Exit pattern CLI options removed; exit strategies are configured in YAML under root `exit`. -->

#### Fixed Time Entry Pattern Options

| Option                       | Description                                | Default from Config |
| ---------------------------- | ------------------------------------------ | ------------------- |
| `--fixedTimeEntry.entryTime` | Entry time in HH:MM format (e.g., "13:00") | **Required**        |

**Note**: Entry time must be configured - no default provided. Configure in YAML under
`entry.strategyOptions.fixedTimeEntry.entryTime` or use CLI option.

#### Random Time Entry Pattern Options

| Option                        | Description                                 | Default from Config |
| ----------------------------- | ------------------------------------------- | ------------------- |
| `--randomTimeEntry.startTime` | Start of random time window in HH:MM format | `09:30`             |
| `--randomTimeEntry.endTime`   | End of random time window in HH:MM format   | `16:00`             |

**Note**: Random time entry generates a deterministic random time for each trading day within the
specified window. Configure in YAML under `entry.strategyOptions.randomTimeEntry` or use CLI
options.

### Available Timeframes

The system supports any timeframe granularity using the format `<number><unit>`, where:

- `<number>` is the duration (e.g., 1, 5, 15, 30)
- `<unit>` is the time unit (min, hour, day)

Common timeframes include:

- `1min`: 1-minute bars
- `5min`: 5-minute bars
- `15min`: 15-minute bars
- `30min`: 30-minute bars
- `1hour`: 1-hour bars
- `1day`: Daily bars

### Available Patterns

#### Entry Patterns

- `quickRise`: Detects a percentage rise in the first 5 minutes of trading (configurable)

- `quickFall`: Detects a percentage fall in the first 5 minutes of trading (configurable)

- `fixedTimeEntry`: Triggers an entry at a specific configured time of day (e.g., "13:00")

- `randomTimeEntry`: Triggers an entry at a random time each day within a configured time window.
  Each trading day gets a unique random entry time (deterministic based on date), useful for
  eliminating time-based biases in backtesting.

<!-- Exit patterns CLI/options removed; configure exit strategies under root `exit`. -->

### Trading Direction

The `--direction` parameter (and its corresponding `default.direction` in `alphagroove.config.yaml`)
can be set to `long`, `short`, or the new `llm_decides` option.

- **`long` or `short`**:
  - The system identifies market setups (like a quick rise in price).
  - If `direction: long`, it takes buy positions, profiting from price increases.
  - If `direction: short`, it takes sell positions, profiting from price decreases.
  - Return calculations are based on this fixed direction.
  - If the `llmConfirmationScreen` is enabled, it acts as a go/no-go filter for this pre-set
    direction.

- **`llm_decides`**:
  - This mode requires `llmConfirmationScreen.enabled` to be `true`.
  - When an entry pattern triggers, the chart is sent to the LLM.
  - The LLM's consensus (based on `numCalls` and `agreementThreshold`) determines the actual trade
    direction (long or short).
  - If the LLM consensus is to "do_nothing" or doesn't meet the threshold for a directional call, no
    trade is executed.
  - This allows the LLM to dynamically decide whether to go long or short on a pattern that might
    otherwise have a fixed interpretation.
  - The initial SQL query for fetching trade data identifies entry candidates and their entry
    prices. If `llm_decides` is active, the query may assume a base direction (e.g., 'long') for
    context, but it does not calculate a preliminary `return_pct`. The actual `return_pct` for the
    trade is calculated in JavaScript after the LLM's consensus determines the final trade direction
    ('long' or 'short'), using the standard formula appropriate for that chosen direction.

**Metrics Reporting with Dynamic Direction:**

When using fixed `long`/`short` directions, or when `llm_decides` results in trades, the output
summaries (both yearly and overall) will now be split into:

- **Long Trades Summary**: Metrics for all trades executed as long positions.
- **Short Trades Summary**: Metrics for all trades executed as short positions.

This provides a clear view of performance for each actual executed direction, regardless of the
initial `direction` setting.

### Chart Generation

AlphaGroove automatically generates high-quality candlestick charts for each entry signal, saved to
the `./charts` directory organized by pattern name. Charts display the current day (up to entry
point) plus 1 previous trading day, essential for LLM analysis.

Two PNG images are created for each signal:

- **Standard Chart**: Anonymized version used for LLM analysis (prevents data leakage)
- **Complete Chart**: Full two-day view for manual review

### LLM Configuration Details

The LLM chart analysis system is AlphaGroove's primary trade filtering mechanism. This section
covers the technical configuration details for the LLM integration.

**How it Works:**

- **Chart Analysis:** The LLM analyzes the provided chart image. The content of this chart image is
  anonymized (ticker, header date, and X-axis date labels are masked or made generic) to prevent
  data leakage. The filename of the image sent to the LLM is also randomized.
- **Multiple Calls:** The system makes a configurable number of parallel calls to the LLM,
  potentially with different temperature settings for varied responses.
- **JSON Response:** The LLM is prompted to return its decision (long, short, or do_nothing) and a
  rationalization in a structured JSON format. If `useLlmProposedPrice` is enabled for stop loss or
  profit targets in the exit strategy configuration, the prompt should also instruct the LLM to
  return `proposedStopLoss` and `proposedProfitTarget` numeric values (or null) within its JSON
  response. The system will average valid prices from responses that align with the consensus trade
  action.
- **Consensus Logic:**
  - If `default.direction` in `alphagroove.config.yaml` is set to `long` or `short`: A trade signal
    proceeds only if a configurable number of LLM responses agree on that specific pre-configured
    trade direction. Otherwise, the signal is filtered out.
  - If `default.direction` is `llm_decides`: The LLM's consensus determines the actual trade
    direction. If a sufficient number of LLMs (`agreementThreshold`) vote for `long` (and more than
    `short`), a long trade is initiated. Similarly for `short`. If there's no clear consensus or
    "do_nothing" is favored, no trade occurs.
- **Cost Tracking:** The cost of LLM calls is tracked and reported.

**Configuration:**

This feature is configured within the `alphagroove.config.yaml` file under the
`llmConfirmationScreen` key. Key options include:

- `llmProvider`: (string) The LLM provider to use (e.g., `'anthropic'`, `'openai'`). Default:
  `'anthropic'`.
- `modelName`: (string) The specific model to use (e.g., `'claude-sonnet-4-20250514'`).
- `apiKeyEnvVar`: (string) The name of the environment variable that holds the API key for the LLM
  provider (e.g., `'ANTHROPIC_API_KEY'`).
- `numCalls`: (number) The number of parallel calls to make to the LLM for each signal. Default:
  `3`.
- `agreementThreshold`: (number) The minimum number of LLM responses that must agree on an action
  for the signal to proceed. Default: `2`.
- `temperatures`: (array of numbers) An array of temperature settings, one for each LLM call. Length
  should match `numCalls`. Default: `[0.2, 0.5, 0.8]`.
- `prompts`: (string or array of strings) The prompt(s) to send to the LLM. If an array, its length
  should match `numCalls`.
- `commonPromptSuffixForJson`: (string, optional) A suffix appended to each prompt to instruct the
  LLM on JSON output format.
- `systemPrompt`: (string, optional) A system-level prompt for the LLM.
- `maxOutputTokens`: (number) Maximum number of tokens the LLM should generate. Default: `150`.
- `timeoutMs`: (number, optional) Timeout in milliseconds for LLM API calls.

Example snippet for `alphagroove.config.yaml`:

```yaml
llmConfirmationScreen:
  llmProvider: 'anthropic'
  modelName: 'claude-3-haiku-20240307' # Or your preferred model
  apiKeyEnvVar: 'ANTHROPIC_API_KEY'
  numCalls: 3
  agreementThreshold: 2
  temperatures: [0.3, 0.6, 0.9]
  prompts:
    - 'Analyze this chart as a cautious trader. Action: long, short, or do_nothing? Rationale?'
    - 'Analyze this chart as an aggressive trader. Action: long, short, or do_nothing? Rationale?'
    - 'Analyze this chart as a neutral analyst. Action: long, short, or do_nothing? Rationale?'
  commonPromptSuffixForJson:
    'Respond in JSON: {"action": "<action>", "rationalization": "<one_sentence_rationale>",
    "proposedStopLoss": <price_or_null>, "proposedProfitTarget": <price_or_null>}'
  maxOutputTokens: 100
```

Ensure the environment variable specified in `apiKeyEnvVar` is set in your environment (e.g., in an
`.env.local` file that is gitignored) for the LLM service to function.

## Entry Scout

AlphaGroove's entry scout bridges the gap between backtesting insights and live market execution.
This on-demand analysis tool scouts for entry opportunities using the same LLM configuration and
exit strategies validated through historical backtesting. Primarily designed for real-time market
reconnaissance, it's flexible enough to analyze specific historical moments for development and
testing.

### Current Capabilities (Chart Analysis Mode)

The entry scout currently operates in chart analysis mode, allowing you to scout entry opportunities
from existing chart images using your validated LLM configuration:

**Usage:**

```bash
# Scout entry opportunities from chart images
pnpm scout /path/to/chart.png

# Specify trading direction preference
pnpm scout /path/to/chart.png --direction long

# Include additional context for logging
pnpm scout /path/to/chart.png --ticker SPY --date 2025-01-15 --price 587.54
```

**Options:**

- `<imagePath>`: Path to the chart image to analyze (required)
- `-d, --direction <direction>`: Suggested direction (`long` or `short`, default: `long`)
- `-c, --config <path>`: Path to configuration file (default: `alphagroove.config.yaml`)
- `--ticker <symbol>`: Ticker symbol (for logging only)
- `--date <YYYY-MM-DD>`: Trade date (for logging only)
- `--price <number>`: Current price (for logging only)
- `-v, --verbose`: Show detailed LLM responses including rationales

### Planned Live Scouting Features

The entry scout is being enhanced to support full live market scouting:

**Upcoming Capabilities:**

- **Real-Time Data Integration**: Direct integration with Polygon.io API for live market data
- **Entry Pattern Detection**: Real-time monitoring for quickRise, quickFall, and fixedTimeEntry
  patterns
- **Automated Chart Generation**: Generate current market charts identical to backtesting format
- **Live Signal Generation**: Provide actionable trade signals with calculated stop loss and profit
  target levels
- **Brokerage Integration**: Export trade parameters in formats compatible with major trading
  platforms

**Target Workflow:**

1. Run backtesting to validate strategy parameters and LLM configuration
2. Deploy entry scout with live market monitoring
3. Receive real-time alerts when entry patterns trigger
4. Get LLM analysis of current market conditions with specific entry/exit levels
5. Execute trades in your brokerage using the provided parameters

### Integration with Backtesting

The entry scout uses identical configuration and analysis methods as the backtesting engine:

- **Same LLM Configuration**: Uses your validated `llmConfirmationScreen` settings
- **Identical Exit Strategies**: Applies the same stop loss, profit target, and trailing stop
  calculations
- **Consistent Chart Analysis**: Generates charts with the same format and anonymization used in
  backtesting
- **ATR-Based Calculations**: Uses real-time ATR calculations for dynamic exit levels

### Trade Levels Calculator

AlphaGroove includes a standalone CLI tool for calculating stop loss, profit target, and trailing
stop levels based on Average True Range (ATR) from a CSV file with minute bar data. This tool
calculates ATR based on **all data present in the provided CSV file**. Users should ensure the input
CSV contains only the historical data relevant for the desired ATR calculation period (e.g., only
the previous trading day's 1-minute bars). It uses the same configuration from your
`alphagroove.config.yaml` file to ensure that the calculated levels match what would be used in a
backtest.

**Usage:**

```bash
# Basic usage
pnpm levels charts/adhoc/recent-data-from-fidelity.csv --price 587.54 > PRICE.txt
```

**Options:**

- `<csvPath>`: Path to the CSV file with minute bar data (required)
- `-p, --price <price>`: Current execution price (required)
- `-c, --config <path>`: Path to configuration file (default: `alphagroove.config.yaml`)

**CSV Format:**

The minute bars CSV file should have the following columns (this format is geared towards manual
download from Fidelity which differs from the data source we use for backtesting in the `tickers/`
directory.):

- `Date`: Date in MM/DD/YYYY format
- `Time`: Time in HH:MM AM/PM format
- `Open`: Opening price for the period
- `High`: Highest price for the period
- `Low`: Lowest price for the period
- `Close`: Closing price for the period
- `Volume`: Trading volume for the period (optional)

The tool calculates the ATR from all data in the provided CSV and applies the exit strategy settings
from your configuration to determine appropriate exit levels for the current trade.

**Example Output:**

```
Loading configuration...
Parsing CSV data...
Parsed 391 records from CSV
Sample record: {"Date":"05/14/2025","Time":"9:31 AM","Open":"587.81","High":"588.45","Low":"587.81","Close":"588.3214","Volume":"470449"}
Calculating ATR from the provided CSV data...

ATR (from entire CSV): 0.2729

Trade Levels for LONG at 587.54

Stop Loss: 586.9942 (2x ATR below entry) [-0.09%]
Profit Target: 588.6316 (4x ATR above entry) [0.19%]
Trailing Stop: Immediate activation
Trailing Amount: 0.5458 (2.0x ATR, 0.09% of price)

Trade Levels for SHORT at 587.54

Stop Loss: 588.0858 (2x ATR above entry) [0.09%]
Profit Target: 586.4484 (4x ATR below entry) [-0.19%]
Trailing Stop: Immediate activation
Trailing Amount: 0.5458 (2.0x ATR, 0.09% of price)

Note: ATR is calculated from all data in the provided CSV. Ensure CSV contains only the desired historical period for ATR.
```

### Command Examples

```bash
# Use values from config file
pnpm dev:start

# Override date range
pnpm dev:start --from 2020-01-01 --to 2025-05-02

# Specify pattern options
pnpm dev:start --quickRise.risePct=0.5 --fixedTimeEntry.entryTime=13:00

# Use the quickFall pattern
pnpm dev:start --entry-pattern quickFall --quickFall.fallPct=0.4

# Analyze a different ticker with specific timeframe
pnpm dev:start --ticker QQQ --timeframe 5min

# Compare both long and short strategies
pnpm dev:start --direction long
pnpm dev:start --direction short

# Process multiple days concurrently for faster execution
pnpm dev:start --maxConcurrentDays 5



# List available patterns
pnpm dev:start list-patterns

# Use a custom config file
pnpm dev:start --config custom-config.yaml

# Entry scout examples
pnpm scout /path/to/chart.png --ticker SPY --direction long
pnpm scout /path/to/chart.png --price 587.54 --verbose
```

## Project Setup

The project has been initialized with the following structure:

- **TypeScript Configuration**: Set up with modern ES modules and strict type checking
- **ESLint & Prettier**: Code quality tools with recommended rules for TypeScript
- **Build System**: Simple build process using TypeScript compiler
- **Flexible Configuration**: YAML-based config with CLI overrides
- **Direct TypeScript Execution**: Using tsx for rapid development without build steps
- **Testing Framework**: Vitest for unit and integration testing

### Directory Structure

```
alphagroove/
├── src/                # Source code
│   ├── index.ts        # Main entry point (backtesting engine)
│   ├── scout.ts        # Entry scout for on-demand analysis
│   ├── trade-levels.ts # Standalone trade levels calculator
│   ├── patterns/       # Entry and exit pattern implementations
│   │   ├── entry/      # Entry patterns (quickRise, quickFall, etc.)
│   │   └── exit/       # Exit strategies (stopLoss, profitTarget, etc.)
│   ├── screens/        # LLM confirmation screen
│   ├── services/       # External service integrations (LLM APIs)
│   ├── utils/          # Utility functions and helpers
│   └── *.test.ts       # Test files
├── tickers/            # Market data organized by ticker and timeframe
│   ├── SPY/            # SPY ticker data
│   │   ├── 1min.csv    # 1-minute timeframe data
│   │   └── ...         # Other timeframes
│   └── README.md       # Documentation for the data structure
├── charts/             # Generated chart outputs (created when used)
├── results/            # Backtest result outputs
├── scripts/            # Build and development scripts
├── dist/               # Compiled output (generated)
├── package.json        # Project metadata and dependencies
├── tsconfig.json       # TypeScript configuration
├── eslint.config.ts    # ESLint configuration
├── vitest.config.ts    # Vitest configuration
├── alphagroove.config.yaml # Configuration file (you create this)
└── README.md           # Project documentation
```

### Getting Started

```bash
# Install dependencies
pnpm install

# Run directly with tsx (no build step)
pnpm dev:start

# Or build and run (for production)
pnpm build
pnpm start
```
