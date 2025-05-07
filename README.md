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

## Available Options

| Option                      | Description            | Default    |
| --------------------------- | ---------------------- | ---------- |
| `--from <YYYY-MM-DD>`       | Start date (inclusive) | Required   |
| `--to <YYYY-MM-DD>`         | End date (inclusive)   | Required   |
| `--entry-pattern <pattern>` | Entry pattern to use   | quick-rise |
| `--exit-pattern <pattern>`  | Exit pattern to use    | fixed-time |
| `--ticker <symbol>`         | Ticker to analyze      | SPY        |
| `--timeframe <period>`      | Data resolution        | 1min       |

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

- `quick-rise`: Detects a 0.3% rise in the first 5 minutes of trading

#### Exit Patterns

- `fixed-time`: Exits the trade 10 minutes after entry

Example usage with different options:

```bash
# Use default patterns and SPY 1-minute data
pnpm dev:start --from 2020-01-01 --to 2025-05-02

# Specify different patterns and timeframe
pnpm dev:start --from 2020-01-01 --to 2025-05-02 --entry-pattern quick-rise --exit-pattern fixed-time --timeframe 5min

# Analyze a different ticker
pnpm dev:start --from 2020-01-01 --to 2025-05-02 --ticker QQQ --timeframe 1hour
```

## Project Setup

The project has been initialized with the following structure:

- **TypeScript Configuration**: Set up with modern ES modules and strict type checking
- **ESLint & Prettier**: Code quality tools with recommended rules for TypeScript
- **Build System**: Simple build process using TypeScript compiler
- **Basic CLI**: Hello world script that demonstrates the project structure
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
├── eslint.config.mjs   # ESLint configuration
├── vitest.config.ts    # Vitest configuration
├── .prettierrc         # Prettier configuration
├── .gitignore          # Git ignore patterns
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

# Run tests
pnpm test
```

### Development Workflow

- `pnpm dev:start` - Run directly with ts-node (no build step)
- `pnpm dev` - Watch for changes and rebuild
- `pnpm test` - Run tests once
- `pnpm test:watch` - Run tests in watch mode
- `pnpm test:coverage` - Run tests with coverage report
- `pnpm lint` - Run ESLint
- `pnpm format` - Format code with Prettier

### Coding Standards

- Use TypeScript for all code
- Use arrow functions over regular functions
- Follow ES6+ patterns and idioms
- Write tests for all new functionality
- Maintain high test coverage
- Review other repos that are one directory back from this one (`../`) to see how their coding
  standards and tech stack are used.

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

## Future CLI Ideas

The planned command-line interface will provide a flexible way to analyze trading patterns:

### CLI Options

| Flag                   | Meaning                                   | Default      |
| ---------------------- | ----------------------------------------- | ------------ |
| `--from <YYYY-MM-DD>`  | Start date (inclusive)                    | required     |
| `--to <YYYY-MM-DD>`    | End date (inclusive)                      | required     |
| `--pattern <id>`       | Pattern module to run                     | open-up-1pct |
| `--timeframe <period>` | Data resolution (1min, 5min, etc.)        | 1min         |
| `--session <type>`     | Time filter ("regular"/"premarket"/"all") | regular      |
| `--plot`               | Render chart(s) in browser                | false        |
| `--export <format>`    | Dump raw matches (csv/json)               | none         |

### Example Usage

```bash
# Run the default "open-up-1pct" pattern on SPY data for one week
alphagroove --from 2025-04-21 --to 2025-04-25

# Analyze pre-market behavior with 5-minute bars and export results
alphagroove --from 2025-04-01 --to 2025-04-30 --pattern gap-and-go --timeframe 5min --session premarket --export csv

# Plot a specific pattern's matches for visual analysis
alphagroove --from 2025-04-01 --to 2025-04-30 --pattern reversal-30min --plot
```
