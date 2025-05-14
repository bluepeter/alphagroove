# Market Data Structure

This directory contains historical market data organized by ticker symbol. Each ticker has its own
subdirectory containing data files for different timeframes.

## Directory Structure

```
tickers/
├── SPY/                # SPY ticker data
│   ├── 1min.csv       # 1-minute timeframe data
│   ├── 5min.csv       # 5-minute timeframe data
│   ├── 15min.csv      # 15-minute timeframe data
│   ├── 30min.csv      # 30-minute timeframe data
│   ├── 1hour.csv      # 1-hour timeframe data
│   └── 1day.csv       # Daily timeframe data
└── TEST/              # Test data for development and testing
    ├── 1min.csv       # Test data with known patterns
    ├── 5min.csv       # Test data with known patterns
    └── 1day.csv       # Test data with known patterns
```

## File Format

Each CSV file contains the following columns:

1. Timestamp (YYYY-MM-DD HH:MM:SS)
2. Open price
3. High price
4. Low price
5. Close price
6. Volume

## Timeframe Naming Convention

Files are named using a simple format: `<number><unit>.csv` where:

- `<number>` is the duration (e.g., 1, 5, 15, 30)
- `<unit>` is the time unit (min, hour, day)

Examples:

- `1min.csv`: 1-minute bars
- `5min.csv`: 5-minute bars
- `30min.csv`: 30-minute bars
- `1hour.csv`: 1-hour bars
- `1day.csv`: Daily bars

The system supports any timeframe granularity that follows this naming convention.

## Test Data

The `TEST/` directory contains a small dataset designed for testing and development:

- Covers a 1-week period
- Includes various market conditions
- Contains known patterns for testing
- Includes edge cases and special scenarios

## Usage

When running the analysis tool, you can specify:

- Which ticker to analyze (default: SPY)
- Which timeframe to use (default: 1min)
- Where to find the data (default: tickers/)

Example:

```bash
# Analyze SPY 1-minute data
pnpm dev:start --from 2020-01-01 --to 2025-05-02 --ticker SPY --timeframe 1min

# Analyze test data
pnpm dev:start --from 2024-01-01 --to 2024-01-07 --ticker TEST --timeframe 1min
```

## Trade Execution Model (Backtesting)

It's important to understand how trade entries and exits are simulated in backtesting, as this
impacts how results should be interpreted.

### Entry Logic

- **Signal Generation:** When a strategy (e.g., "Fixed Time Entry") generates an entry signal at a
  specific bar (e.g., the 13:00:00 bar), this bar is referred to as the "signal bar".
- **Execution Timing:** To ensure a more realistic simulation and avoid using information not yet
  available at the point of decision, trades are executed based on the data of the bar _immediately
  following_ the signal bar. This is called the "execution bar".
  - For example, if a signal is generated for the 13:00:00 bar, the actual trade execution will be
    based on the 13:01:00 bar (assuming a 1-minute timeframe).
- **Logged Prices:**
  - The "Entry Time" displayed in trade logs will be the timestamp of the **execution bar** (e.g.,
    13:01:00).
  - The contextual "Entry" price displayed in logs is the **CLOSE of the execution bar**. This
    represents the price level around which the simulated fill occurs.
  - The "Adj Entry" price, which is used for all Profit & Loss (P&L) calculations, is the **CLOSE of
    the execution bar, adjusted for configured slippage** (e.g.,
    `Close_of_Execution_Bar +/- $0.01`).
- **LLM Analysis:** If an LLM is used for trade confirmation, it analyzes data up to and including
  the **signal bar**. The decision to trade is made based on this information, before the execution
  bar's data is known.

### Exit Logic

- Exit conditions (e.g., stop-loss, profit target, trailing stop) are evaluated on a bar-by-bar
  basis after entry.
- When an exit condition is met during a bar, the trade is typically simulated to exit at a price
  within that same bar (e.g., the Open of the next bar if an intraday condition is met, or the Close
  if it's an end-of-bar condition like `maxHoldTime` or `endOfDay`), adjusted for configured
  slippage.

This "next bar execution" model for entries aims to provide more conservative and realistic
backtesting results.

## Data Characteristics

- **Time Zone**: All timestamps are in US Eastern Time (ET)
- **Adjustments**: Prices are split-adjusted but not dividend-adjusted
- **Zero Volume**: Periods with zero volume are omitted (gaps in timestamp sequence)
- **Trading Hours**: Data may include pre-market (4:00 AM - 9:30 AM), regular market (9:30 AM - 4:00
  PM), and after-hours (4:00 PM - 8:00 PM) sessions

## Data Sources

Sample data is provided from:

- FirstRateData (sample dataset)

## Adding New Data

To add a new ticker:

1. Create a directory with the ticker symbol under `tickers/`
2. Add CSV files for each timeframe with standard naming (e.g., `1min.csv`, `5min.csv`)

## Notes

- Time periods with zero volume are omitted from the dataset
- Files may be large - use the AlphaGroove CLI rather than trying to open directly in spreadsheet
  applications
- The first and last available dates may vary between timeframes
