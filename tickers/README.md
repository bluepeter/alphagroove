# AlphaGroove Ticker Data

This directory contains market data organized by ticker symbol and timeframe for pattern analysis in
AlphaGroove.

## Data Organization

```
tickers/
├── SPY/                 # SPY ticker data
│   ├── 1min.csv         # 1-minute timeframe data
│   ├── 5min.csv         # 5-minute timeframe data
│   ├── 30min.csv        # 30-minute timeframe data
│   ├── 1hour.csv        # 1-hour timeframe data
│   └── 1day.csv         # Daily timeframe data
└── README.md            # This file
```

## Data Format

All price data files follow the same CSV format:

```
timestamp,open,high,low,close,volume
2025-04-21 09:30:00,521.16,521.7,520.08,520.6,837232
2025-04-21 09:35:00,520.58,520.68,519.0,519.9901,1023443
...
```

### Field Descriptions

- `timestamp`: Date and time in format 'YYYY-MM-DD HH:MM:SS' (Eastern Time)
- `open`: Opening price for the period
- `high`: Highest price during the period
- `low`: Lowest price during the period
- `close`: Closing price for the period
- `volume`: Volume in number of shares traded

## Data Characteristics

- **Time Zone**: All timestamps are in US Eastern Time (ET)
- **Adjustments**: Prices are split-adjusted but not dividend-adjusted
- **Zero Volume**: Periods with zero volume are omitted (gaps in timestamp sequence)
- **Trading Hours**: Data may include pre-market (4:00 AM - 9:30 AM), regular market (9:30 AM - 4:00
  PM), and after-hours (4:00 PM - 8:00 PM) sessions

## Available Timeframes

- **1min**: 1-minute bars
- **5min**: 5-minute bars
- **30min**: 30-minute bars
- **1hour**: 1-hour bars
- **1day**: Daily bars

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
