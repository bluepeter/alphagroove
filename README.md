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

### Node.js Setup

The project requires Node.js 18 or later. We recommend using `pnpm` as the package manager.

```bash
# Install dependencies
pnpm install
```

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

  - Can be combined with the `--direction` parameter to interpret the pattern for long or short
    positions
  - For `--direction long`: Takes a long position at the peak of the rise (default)
  - For `--direction short`: Takes a short position at the peak of the rise

- `quick-fall`: Detects a percentage fall in the first 5 minutes of trading (configurable)
  - Can be combined with the `--direction` parameter to interpret the pattern for long or short
    positions
  - For `--direction short`: Takes a short position at the bottom of the fall (default)
  - For `--direction long`: Takes a long position at the bottom of the fall (buying the dip)

#### Exit Patterns

- `fixed-time`: Exits the trade after a configurable number of minutes from entry (default: 10)

### Trading Direction

The `--direction` parameter doesn't change what patterns are detected, but rather how they are
interpreted:

- Both directions identify the same market setups (like a quick rise in price)
- The difference is how positions are taken:
  - `--direction long`: Takes buy positions, profiting from price increases
  - `--direction short`: Takes sell positions, profiting from price decreases
- Return calculations change based on direction:
  - For long positions, price increases are profitable
  - For short positions, price decreases are profitable

This approach lets you analyze the same market conditions but test both long and short strategies.

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

## Proposed Pattern Architecture

The project will implement a modular pattern system where each trading pattern consists of paired
entry and exit conditions. This architecture will allow for flexible strategy development and
testing.

### Proposed Pattern Structure

```
src/patterns/
├── types.ts           # Common interfaces and types
├── entry/            # Entry pattern implementations
│   ├── open-up-1pct.ts
│   └── ...
├── exit/             # Exit pattern implementations
│   ├── fixed-time.ts
│   ├── take-profit.ts
│   └── ...
└── backtest.ts       # Backtesting engine
```

### Proposed Pattern Interfaces

```typescript
interface EntryPattern {
  id: string;
  name: string;
  description: string;
  detect(data: MarketData): EntrySignal[];
}

interface ExitPattern {
  id: string;
  name: string;
  description: string;
  detect(data: MarketData, entry: EntrySignal): ExitSignal[];
}
```

### Planned Exit Strategies

The system will include several built-in exit strategies:

1. **Fixed Time Exit**: Exit after a specified duration (e.g., 30 minutes)
2. **Take Profit Exit**: Exit when price reaches a target profit level
3. **Stop Loss Exit**: Exit when price hits a stop loss level
4. **Trailing Stop Exit**: Exit when price retraces from its peak by a specified amount

### Proposed Backtesting Logic

The backtesting engine will follow this process:

1. Load market data for the specified date range
2. For each day:
   - Run entry pattern detection
   - For each entry signal:
     - Run exit pattern detection
     - Calculate returns and metrics
3. Aggregate results across all days
4. Generate performance statistics

### Execution Modeling

The backtesting engine will include realistic execution modeling to account for real-world trading
conditions:

1. **Slippage Model**:

   - Entry slippage: Simulates the difference between signal price and actual execution
   - Exit slippage: Accounts for market impact when closing positions
   - Configurable slippage parameters based on:
     - Time of day (higher during open/close)
     - Volume conditions
     - Position size

2. **Execution Delays**:

   - Signal processing delay
   - Order routing delay
   - Fill confirmation delay

3. **Order Types**:

   - Market orders (immediate execution with slippage)
   - Limit orders (execution at specified price or better)
   - Stop orders (execution at specified price or worse)

4. **Position Sizing**:
   - Fixed size per trade
   - Percentage of account
   - Risk-based sizing (e.g., fixed risk per trade)

These execution models will help provide more realistic backtesting results and better estimate
real-world performance.

## Future Implementation Plan

### 1. DuckDB Integration ✅

AlphaGroove has successfully implemented DuckDB integration for high-performance analysis of
time-series data.

#### Implemented Features

- **Direct CSV Querying**: DuckDB queries ticker CSV files directly
- **In-Memory Database**: Data is loaded into memory for repeated queries
- **Lazy Loading**: Timeframes are loaded on demand based on CLI parameters

The implementation provides excellent performance while maintaining flexibility through the
`query-builder.ts` module.

### 2. Command Line Interface ✅

The CLI has been implemented using Commander.js with:

- Consistent argument parsing
- Automatic help generation
- Command validation
- Support for chaining commands

### 3. Pattern System ✅

The pattern system has been implemented with:

- Modular entry and exit patterns
- Pattern factory for easy pattern registration
- SQL-based pattern definitions
- Support for multiple timeframes
- Long/short direction support with smart trade success determination
- Centralized configuration through `alphagroove.config.yaml`

### 4. Remaining Tasks

#### Visualization (Planned)

For the visualization option, AlphaGroove will generate interactive charts using:

- HTML/JavaScript output
- Candlestick charts with pattern annotations
- Statistical summary visualizations
- Auto-opening in the default browser

#### Additional Pattern Types (Planned)

The system will be extended with more pattern types:

1. **Entry Patterns**:

   - Gap and Go
   - Volume Breakout
   - Price Action Patterns

2. **Exit Patterns**:
   - Take Profit
   - Stop Loss
   - Trailing Stop

#### Execution Modeling (Planned)

The backtesting engine will be enhanced with realistic execution modeling:

1. **Slippage Model**:

   - Entry/exit slippage simulation
   - Time-of-day based adjustments
   - Volume-based impact modeling

2. **Order Types**:

   - Market orders
   - Limit orders
   - Stop orders

3. **Position Sizing**:
   - Fixed size per trade
   - Percentage of account
   - Risk-based sizing
