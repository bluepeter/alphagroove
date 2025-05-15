## Project Overview

AlphaGroove is a command-line research and strategy toolkit for exploring intraday trading
patterns—particularly focused on high-resolution datasets like 1-minute SPY bars. Built with DuckDB
and Node.js, it enables rapid querying, filtering, and analysis of market behavior around key time
windows (e.g. first and last 10 minutes of the trading day). The tool is designed to surface
conditional setups—such as sharp opens followed by reversals—and evaluate them using statistical
summaries, match scanning, and optional visualization.

The project supports a modular "pattern" architecture where each strategy condition is encapsulated
in code and run via a consistent CLI interface. Developers can define and test new patterns, run
batched analyses across date ranges, and output metrics like mean/median returns, win rate, and
distribution buckets. AlphaGroove is intended for hands-on quant researchers who prefer scripting
over spreadsheets, precision over black boxes, and clarity over curve-fitting.

For future enhancement ideas, see [docs/enhancement-ideas.md](docs/enhancement-ideas.md).

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

### Profit Target

Exits the trade when price moves in your favor by a specified amount.

**Configuration options:**

- `percentFromEntry`: Exit when price moves in your favor by this percentage (e.g., 2.0 means 2%)
- `atrMultiplier`: Alternative to percentFromEntry; exit when price moves in your favor by this
  multiple of ATR

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

### Slippage Model

Models realistic trading costs by applying slippage to exit prices.

**Configuration options:**

- `model`: Type of slippage model to use, either 'percent' or 'fixed'
- `value`: For percent model, the percentage of slippage (e.g., 0.05 for 0.05%); for fixed model,
  the absolute amount

### Dynamic Volatility Adjustment (ATR-Based)

To make exit parameters more adaptive to market conditions, Stop Loss, Profit Target, and Trailing
Stop strategies can optionally use the Average True Range (ATR) calculated from the prior trading
day to set their levels. The ATR used is the simple average of all 1-minute True Range values from
the entire prior trading day. This is configured per-strategy:

- **`exitStrategies.stopLoss.atrMultiplier`**: (Optional, e.g., `1.5`) If set and the prior day's
  ATR (`entryAtrValue`) can be calculated, the stop loss will be
  `entryPrice - (ATR * atrMultiplier)` for longs, or `entryPrice + (ATR * atrMultiplier)` for
  shorts.
- **`exitStrategies.profitTarget.atrMultiplier`**: (Optional, e.g., `3.0`) If set and
  `entryAtrValue` is available, the profit target will be `entryPrice + (ATR * atrMultiplier)` for
  longs, or `entryPrice - (ATR * atrMultiplier)` for shorts.
- **`exitStrategies.trailingStop.activationAtrMultiplier`**: (Optional, e.g., `1.0`) If set and
  `entryAtrValue` is available, the trailing stop activates after price moves
  `ATR * activationAtrMultiplier` in your favor.
- **`exitStrategies.trailingStop.trailAtrMultiplier`**: (Optional, e.g., `0.75`) If set and
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
exitStrategies:
  enabled:
    - stopLoss
    - profitTarget
    - trailingStop
    - maxHoldTime
    - endOfDay
  maxHoldTime:
    minutes: 60
  stopLoss:
    percentFromEntry: 1.0
    # or use ATR-based stop loss with:
    # atrMultiplier: 1.5
  profitTarget:
    percentFromEntry: 2.0
    # or use ATR-based target with:
    # atrMultiplier: 3.0
  trailingStop:
    activationPercent: 1.0 # activates after 1% favorable move
    trailPercent: 0.5 # trails by 0.5%
  endOfDay:
    time: '16:00' # exit by 4:00 PM
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
3. Run the application:

   ```bash
   # Run with specific date range and patterns
   pnpm dev:start --from 2020-01-01 --to 2025-05-02 --entry-pattern quick-rise --exit-pattern fixed-time

   # Example output:
   # SPY Analysis (2020-01-01 to 2025-05-02):
   # Entry Pattern: Quick Rise
   # Exit Pattern: Fixed Time Exit
   # ...
   ```

For production use, build and run:

```bash
# Build the project
pnpm build

# Run the built version
pnpm start --from 2020-01-01 --to 2025-05-02 --entry-pattern quick-rise --exit-pattern fixed-time
```

## Configuration

AlphaGroove uses a centralized configuration system with all settings defined in the
`alphagroove.config.yaml` file. This is the single source of truth for all configuration values in
the application.

### Configuration File

Create a file named `alphagroove.config.yaml` in the project root:

```yaml
default:
  date:
    from: '2023-01-01'
    to: '2025-05-02'
  ticker: 'SPY'
  timeframe: '1min'
  direction: 'long'
  patterns:
    entry: 'quick-rise' # Default entry pattern to use
    exit: 'fixed-time' # Default exit pattern to use
  charts:
    generate: false # Set to true to automatically generate charts for each entry
    outputDir: './charts' # Directory to store chart outputs

patterns:
  entry:
    quick-rise:
      rise-pct: 0.3
      within-minutes: 5
    quick-fall:
      fall-pct: 0.3
      within-minutes: 5

  exit:
    fixed-time:
      hold-minutes: 10
```

This configuration structure allows you to:

1. Define default entry and exit patterns to use when none are specified via CLI
2. Organize patterns by type (entry vs exit)
3. Configure parameters for each pattern
4. Set default chart generation options

All pattern configuration lives in this file - there are no hardcoded defaults in the code. The
system follows a clear hierarchy for configuration:

1. Command-line arguments (highest priority)
2. Values from `alphagroove.config.yaml`
3. System fallback defaults (used only if a config file doesn't exist)

You can generate a default config file by running:

```bash
pnpm dev:start init
```

### Pattern-Specific Options

Each pattern can have its own set of configuration options. You can specify these in the config file
or using the CLI with dot notation:

```bash
# Using dot notation for pattern-specific options
pnpm dev:start --quick-rise.rise-pct=0.5 --fixed-time.hold-minutes=15

# Combining standard and pattern-specific options
pnpm dev:start --from 2023-01-01 --to 2023-12-31 --direction short --quick-rise.rise-pct=0.7
```

## Available Options

CLI options override values from the configuration file.

| Option                      | Description                                    | Default                   |
| --------------------------- | ---------------------------------------------- | ------------------------- |
| `--from <YYYY-MM-DD>`       | Start date (inclusive)                         | From config               |
| `--to <YYYY-MM-DD>`         | End date (inclusive)                           | From config               |
| `--entry-pattern <pattern>` | Entry pattern to use                           | quick-rise                |
| `--exit-pattern <pattern>`  | Exit pattern to use                            | fixed-time                |
| `--ticker <symbol>`         | Ticker to analyze                              | SPY                       |
| `--timeframe <period>`      | Data resolution                                | 1min                      |
| `--direction <direction>`   | Trading direction for position (long or short) | long                      |
| `--config <path>`           | Path to custom configuration file              | ./alphagroove.config.yaml |
| `--generate-charts`         | Generate multiday charts for each entry        | false                     |
| `--charts-dir <path>`       | Directory for chart output                     | ./charts                  |

### Pattern-Specific Options

#### Quick Rise Pattern Options

| Option                        | Description                                | Default from Config |
| ----------------------------- | ------------------------------------------ | ------------------- |
| `--quick-rise.rise-pct`       | Minimum percentage rise to trigger pattern | 0.3                 |
| `--quick-rise.within-minutes` | Number of minutes to look for the rise     | 5                   |

#### Quick Fall Pattern Options

| Option                        | Description                                | Default from Config |
| ----------------------------- | ------------------------------------------ | ------------------- |
| `--quick-fall.fall-pct`       | Minimum percentage fall to trigger pattern | 0.3                 |
| `--quick-fall.within-minutes` | Number of minutes to look for the fall     | 5                   |

#### Fixed Time Pattern Options

| Option                      | Description                                    | Default from Config |
| --------------------------- | ---------------------------------------------- | ------------------- |
| `--fixed-time.hold-minutes` | Number of minutes to hold position before exit | 10                  |

#### Fixed Time Entry Pattern Options

| Option                          | Description                                | Default from Config |
| ------------------------------- | ------------------------------------------ | ------------------- |
| `--fixed-time-entry.entry-time` | Entry time in HH:MM format (e.g., "13:00") | "12:00"             |

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

- `quick-rise`: Detects a percentage rise in the first 5 minutes of trading (configurable)

- `quick-fall`: Detects a percentage fall in the first 5 minutes of trading (configurable)

- `fixed-time-entry`: Triggers an entry at a specific configured time of day (e.g., "13:00").

#### Exit Patterns

- `fixed-time`: Exits the trade after a configurable number of minutes from entry (default: 10)

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

AlphaGroove can generate high-quality chart images for each entry signal it detects. These charts:

- Show the current day (up to the entry point) and 1 previous trading day
- Are rendered as Candlestick charts for detailed OHLC analysis
- Display volume data below the price chart
- Highlight the entry point with a marker (Note: entry point marker not yet implemented)
- Only include regular market hours (9:30 AM - 4:00 PM ET)
- Organize charts by pattern name for easy reference
- Save as both SVG (vector) and high-quality PNG (300 DPI, white background) image files for easy
  sharing and inclusion in reports

When chart generation is enabled (`--generate-charts` or via config), two PNG images are produced
for each signal:

1.  **Standard Chart (e.g., `TICKER_PATTERN_DATE.png`):** This chart displays data up to the entry
    signal's timestamp on the signal day, plus the full prior trading day. This version is typically
    used for LLM analysis. To prevent data leakage to the LLM, this chart image has its content
    anonymized: the ticker symbol is replaced with "XXX", the date in the header is replaced with
    "XXX", and the X-axis date labels are changed to generic day identifiers (e.g., "Prior Day",
    "Signal Day").
2.  **Complete Two-Day Chart (e.g., `TICKER_PATTERN_DATE_complete.png`):** This chart displays the
    _entirety_ of the signal day and the _entirety_ of the prior trading day. This version is
    intended for more comprehensive manual review and analysis.

Both charts share the same visual style and are saved in the pattern-specific output directory.

To generate charts:

```bash
# Generate charts for all entry signals with specific output directory
pnpm dev:start --generate-charts --charts-dir ./my-charts

# Using configuration file settings
# (Set default.charts.generate: true in alphagroove.config.yaml)
pnpm dev:start
```

Chart images are automatically generated and saved to the specified directory, with folders
organized by entry pattern name. Each chart is named with the pattern, ticker, and date for easy
identification.

> **Note on former HTML/Puppeteer fallback:** Previously, the system might fall back to HTML charts
> if Puppeteer had issues. With the current direct SVG-to-PNG generation using `sharp`, this
> fallback is no longer in place. Ensure `sharp` installs correctly for PNG output.

The image formats make it easy to:

- Include charts in research reports and presentations
- Share findings with colleagues
- Document market behavior around specific entry conditions
- Compare patterns visually across multiple days

### LLM Chart Confirmation Screen

AlphaGroove includes an optional screening step that utilizes a Large Language Model (LLM) to
provide an additional layer of confirmation for trading signals. When enabled, this screen sends the
generated chart (the version truncated up to the entry signal) to a configured LLM provider for
analysis.

**How it Works:**

- **Chart Analysis:** The LLM analyzes the provided chart image. The content of this chart image is
  anonymized (ticker, header date, and X-axis date labels are masked or made generic) to prevent
  data leakage. The filename of the image sent to the LLM is also randomized.
- **Multiple Calls:** The system makes a configurable number of parallel calls to the LLM,
  potentially with different temperature settings for varied responses.
- **JSON Response:** The LLM is prompted to return its decision (long, short, or do_nothing) and a
  rationalization in a structured JSON format.
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

- `enabled`: (boolean) Set to `true` to enable this screen. Default: `false`.
- `llmProvider`: (string) The LLM provider to use (e.g., `'anthropic'`, `'openai'`). Default:
  `'anthropic'`.
- `modelName`: (string) The specific model to use (e.g., `'claude-3-7-sonnet-latest'`).
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
  enabled: true
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
    'Respond in JSON: {"action": "<action>", "rationalization": "<one_sentence_rationale>"}'
  maxOutputTokens: 100
```

Ensure the environment variable specified in `apiKeyEnvVar` is set in your environment (e.g., in an
`.env.local` file that is gitignored) for the LLM service to function.

### Standalone LLM Chart Analyzer

AlphaGroove includes a standalone CLI tool for analyzing chart images with the LLM configuration
defined in your `alphagroove.config.yaml` file. This allows you to get LLM analysis of any chart
image without running a full backtest.

**Usage:**

```bash
# Basic usage
pnpm analyze /path/to/chart.png
```

**Options:**

- `<imagePath>`: Path to the chart image to analyze (required)
- `-d, --direction <direction>`: Suggested direction (`long` or `short`, default: `long`)
- `-c, --config <path>`: Path to configuration file (default: `alphagroove.config.yaml`)

### Trade Levels Calculator

AlphaGroove includes a standalone CLI tool for calculating stop loss, profit target, and trailing
stop levels based on Average True Range (ATR) from a CSV file with minute bar data. This tool uses
the same configuration from your `alphagroove.config.yaml` file to ensure that the calculated levels
match what would be used in a backtest.

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

The tool calculates the ATR from the prior day's data and applies the exit strategy settings from
your configuration to determine appropriate exit levels for the current trade.

### Command Examples

```bash
# Use values from config file
pnpm dev:start

# Override date range
pnpm dev:start --from 2020-01-01 --to 2025-05-02

# Specify pattern options
pnpm dev:start --quick-rise.rise-pct=0.5 --fixed-time.hold-minutes=15

# Use the quick-fall pattern
pnpm dev:start --entry-pattern quick-fall --fall-pct=0.4

# Analyze a different ticker with specific timeframe
pnpm dev:start --ticker QQQ --timeframe 5min

# Compare both long and short strategies
pnpm dev:start --direction long
pnpm dev:start --direction short

# Generate charts for entry signals
pnpm dev:start --generate-charts

# List available patterns
pnpm dev:start list-patterns

# Use a custom config file
pnpm dev:start --config custom-config.yaml
```

## Project Setup

The project has been initialized with the following structure:

- **TypeScript Configuration**: Set up with modern ES modules and strict type checking
- **ESLint & Prettier**: Code quality tools with recommended rules for TypeScript
- **Build System**: Simple build process using TypeScript compiler
- **Flexible Configuration**: YAML-based config with CLI overrides
- **Direct TypeScript Execution**: Using ts-node for rapid development without build steps
- **Testing Framework**: Vitest for unit and integration testing

### Directory Structure

```
alphagroove/
├── src/                # Source code
│   ├── index.ts        # Main entry point
│   └── index.test.ts   # Tests for index.ts
├── tickers/            # Market data organized by ticker and timeframe
│   ├── SPY/            # SPY ticker data
│   │   ├── 1min.csv    # 1-minute timeframe data
│   │   └── ...         # Other timeframes
│   └── README.md       # Documentation for the data structure
├── dist/               # Compiled output (generated)
├── package.json        # Project metadata and dependencies
├── tsconfig.json       # TypeScript configuration
├── eslint.config.ts    # ESLint configuration
├── vitest.config.ts    # Vitest configuration
├── .prettierrc         # Prettier configuration
├── .gitignore          # Git ignore patterns
├── alphagroove.config.yaml # Default configuration
└── README.md           # Project documentation
```

### Getting Started

```bash
# Install dependencies
pnpm install

# Run directly with ts-node (no build step)
pnpm dev:start

# Or build and run (for production)
pnpm build
pnpm start
```
