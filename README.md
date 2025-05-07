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

## Future Implementation Plan

### 1. DuckDB Integration

AlphaGroove will use DuckDB as its data storage and query engine for high-performance analysis of
time-series data.

#### Data Access Approach

The application will implement a hybrid approach to working with the ticker data:

- **Direct CSV Querying**: DuckDB can query the ticker CSV files directly, avoiding unnecessary ETL
- **In-Memory Database**: For repeated queries, data is loaded into memory once
- **Lazy Loading**: Timeframes are only loaded when needed based on CLI parameters

This implementation provides excellent performance while maintaining flexibility:

```typescript
// Example DuckDB integration
const db = new duckdb.Database(':memory:');
await db.connect();

// Load specific timeframe data on demand
await db.exec(`
  CREATE TABLE spy_1min AS 
  SELECT 
    strptime(timestamp, '%Y-%m-%d %H:%M:%S') AS timestamp,
    open::DOUBLE, high::DOUBLE, low::DOUBLE, close::DOUBLE, 
    volume::BIGINT
  FROM read_csv_auto('tickers/SPY/1min.csv');
`);
```

### 2. Pattern Architecture

Patterns will follow a modular architecture:

```
src/patterns/
├── base-pattern.ts     # Abstract base class with common functionality
├── open-up-1pct/       # Individual pattern implementation
│   ├── index.ts        # Pattern definition and logic
│   ├── query.sql       # SQL query for pattern detection
│   └── test.ts         # Pattern-specific tests
└── ...
```

Each pattern module will implement a standard interface:

- `analyze(options)`: Run the pattern detection algorithm
- `getMetrics()`: Calculate statistics on the results
- `describe()`: Return a human-readable description of the pattern

### 3. Command Line Interface

The CLI will be implemented using Commander.js with:

- Consistent argument parsing
- Automatic help generation
- Command validation
- Support for chaining commands

### 4. Visualization

For the visualization option, AlphaGroove will generate interactive charts using:

- HTML/JavaScript output
- Candlestick charts with pattern annotations
- Statistical summary visualizations
- Auto-opening in the default browser

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
