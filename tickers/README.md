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
