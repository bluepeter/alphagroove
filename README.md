# AlphaGroove

A comprehensive trading strategy development and execution toolkit that bridges the gap between
backtesting and live trading. AlphaGroove consists of two complementary tools designed for hands-on
quant researchers who prefer scripting over spreadsheets, precision over black boxes, and
intelligent analysis over curve-fitting.

## Tools Overview

**Backtesting Engine (`pnpm dev:start`)**

- Historical analysis of intraday trading patterns using high-resolution datasets
- LLM-powered trade analysis with automated chart generation for pattern recognition
- **Enhanced Market Context**: LLM receives comprehensive market metrics including gaps, VWAP, SMA,
  and price relationships
- Statistical analysis with comprehensive metrics (mean/median returns, win rates, distribution
  analysis)
- Modular pattern architecture for entry/exit strategies

**Entry Scout (`pnpm scout`)**

- Real-time market analysis using Polygon.io API
- Same LLM configuration and analysis methods validated through backtesting
- **Rich Market Context**: LLM receives detailed market metrics including previous close, gaps, VWAP
  vs price, SMA vs price
- Generates actionable trade signals with specific entry/exit levels for manual execution
- On-demand analysis for any date/time, not just current market conditions
- **Automated Monitoring**: Continuous execution with prominent alerts for trade signal changes

## Installation & Setup

### Prerequisites

**Required: DuckDB Installation**

```bash
# Install DuckDB using Homebrew
brew install duckdb

# Verify the installation
duckdb --version
```

If you don't have Homebrew installed, you can install it from [brew.sh](https://brew.sh).

**Node.js Setup & Dependencies**

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

### Configuration

**Required:** Create a configuration file named `alphagroove.config.yaml` in the project root
directory:

```yaml
# === SHARED CONFIGURATION ===
# Used by both backtest and scout tools
shared:
  ticker: 'SPY'
  timeframe: '1min'
  suppressSma: false # Set to true to disable SMA computation and display
  suppressVwap: false # Set to true to disable VWAP computation and display
  suppressMetricsInPrompts: false # Set to true to exclude text metrics from LLM prompts

  # LLM configuration for intelligent trade analysis
  llmConfirmationScreen:
    # Choose your LLM provider - flagship models are automatically selected:
    llmProvider: 'anthropic' # Uses claude-sonnet-4-20250514 automatically
    # llmProvider: 'openai'   # Uses gpt-5-mini automatically

    numCalls: 2
    agreementThreshold: 2
    temperatures: [0.2, 1.0] # Note: GPT-5-mini only supports default temperature (1)
    prompts:
      - 'Analyze this chart as a cautious trader. Action: long, short, or do_nothing? Rationale?'
      - 'Analyze this chart as an aggressive trader. Action: long, short, or do_nothing? Rationale?'
    commonPromptSuffixForJson: >-
      Respond in JSON: {"action": "<action>", "rationalization": "<one_sentence_rationale>",
      "proposedStopLoss": <price_or_null>, "proposedProfitTarget": <price_or_null>}
    systemPrompt: >-
      You are a seasoned day trader. You know when to save your powder and wait. Only when you're
      sure will you go long or short.
    maxOutputTokens: 2000
    timeoutMs: 30000

# === BACKTEST-SPECIFIC CONFIGURATION ===
backtest:
  date:
    from: '2023-01-01'
    to: '2025-05-02'
  parallelization:
    maxConcurrentDays: 3

  # Entry pattern configuration (backtest only)
  entry:
    enabled: [randomTimeEntry]
    strategyOptions:
      randomTimeEntry:
        startTime: '10:00'
        endTime: '15:00'
      fixedTimeEntry:
        entryTime: '13:00'
      quickRise:
        risePct: 0.3
        withinMinutes: 5
      quickFall:
        fallPct: 0.3
        withinMinutes: 5

  # Exit strategies configuration (backtest only)
  exit:
    enabled: [profitTarget, trailingStop]
    endOfDay:
      time: '16:00'
    strategyOptions:
      profitTarget:
        atrMultiplier: 3.0
        useLlmProposedPrice: true
      trailingStop:
        activationAtrMultiplier: 0
        trailAtrMultiplier: 2.5

  # Execution configuration (backtest only)
  execution:
    slippage:
      model: 'fixed'
      value: 0.01

# === SCOUT-SPECIFIC CONFIGURATION ===
scout:
  polygon:
    apiKeyEnvVar: 'POLYGON_API_KEY'
```

**Configuration Structure**

The `alphagroove.config.yaml` file is organized into three sections:

1. **`shared`**: Settings used by both tools (ticker, LLM configuration, SMA suppression)
2. **`backtest`**: Backtest-specific settings (date ranges, entry patterns, exit strategies)
3. **`scout`**: Scout-specific settings (API configuration)

**Environment Variables**

Create a `.env.local` file in the project root with your API keys:

```bash
# LLM Provider API Keys (set the one you're using)
ANTHROPIC_API_KEY=your_anthropic_api_key_here  # For Anthropic Claude
OPENAI_API_KEY=your_openai_api_key_here        # For OpenAI GPT models

# Market Data API Key
POLYGON_API_KEY=your_polygon_api_key_here
```

**Note**: The system automatically selects the correct API key based on your `llmProvider` setting:

- `llmProvider: 'anthropic'` → uses `ANTHROPIC_API_KEY`
- `llmProvider: 'openai'` → uses `OPENAI_API_KEY`

**Available Timeframes**

Format: `<number><unit>` where unit is min, hour, or day

- `1min`, `5min`, `15min`, `30min`, `1hour`, `1day`

**Configuration Priority**

Configuration hierarchy (highest to lowest priority):

1. Command line arguments
2. Config file settings
3. ⚠️ **No system defaults** - explicit configuration required

All configuration must be explicitly provided. The system will provide clear error messages for
missing settings rather than using hidden defaults.

**SMA Suppression**

The `suppressSma` option in the shared configuration allows you to disable SMA (Simple Moving
Average) computation and display across both backtest and scout tools:

- **Performance Benefits**: Eliminates the need to fetch additional historical data for SMA
  calculation
- **Faster Execution**: Reduces API calls to Polygon for scout and database queries for backtest
- **Simplified Analysis**: Focuses analysis on price action, volume, and VWAP without SMA context
- **Chart Clarity**: Removes SMA line and VWAP vs SMA comparison from charts
- **LLM Prompts**: Excludes SMA context from market metrics sent to LLMs

Set `suppressSma: true` when you want to focus purely on intraday price action and VWAP analysis
without the overhead of 20-day SMA calculations.

**VWAP Suppression**

The `suppressVwap` option in the shared configuration allows you to disable VWAP (Volume Weighted
Average Price) computation and display across both backtest and scout tools:

- **Performance Benefits**: Eliminates VWAP calculations during chart generation
- **Faster Execution**: Reduces computation overhead for volume-weighted price analysis
- **Simplified Analysis**: Focuses analysis on price action and SMA without VWAP context
- **Chart Clarity**: Removes VWAP line and VWAP vs SMA comparison from charts
- **LLM Prompts**: Excludes VWAP context from market metrics sent to LLMs

Set `suppressVwap: true` when you want to focus purely on price action and SMA analysis without VWAP
calculations. You can use both `suppressSma` and `suppressVwap` together to create the most
streamlined analysis focusing only on basic price action.

**Market Metrics in Prompts Suppression**

The `suppressMetricsInPrompts` option in the shared configuration allows you to exclude all text
metrics from LLM prompts while keeping them visible in charts:

- **Chart Preservation**: All metrics (VWAP, SMA, gap analysis) remain visible in generated charts
- **Prompt Simplification**: LLM prompts contain no "Market Context" section with text metrics
- **Performance Benefits**: Eliminates market metrics calculation overhead for LLM calls
- **Focus on Visual Analysis**: Forces LLM to rely purely on visual chart analysis

Set `suppressMetricsInPrompts: true` when you want the LLM to make decisions based solely on chart
patterns without being influenced by numerical market context. This can be useful for testing
whether the LLM's visual pattern recognition performs better without text-based market data.

You can generate a default config file by running:

```bash
pnpm dev:start init
```

## LLM-Powered Analysis

Both tools use Large Language Models to analyze chart patterns and make intelligent trading
decisions. Rather than relying solely on technical indicators, the system generates high-quality
charts for every potential trade and sends them to an LLM for analysis.

**How it Works:**

- **Automatic Chart Generation**: Every signal triggers creation of anonymized candlestick charts
- **Multi-Model Analysis**: Configurable number of LLM calls with different temperature settings
- **Consensus Decision Making**: Trades execute only when LLMs reach agreement threshold
- **Dynamic Direction**: LLM can decide whether to go long, short, or skip the trade entirely
- **Price Target Suggestions**: LLMs can propose stop loss and profit target levels

**Key Benefits:**

- **Pattern Recognition**: LLMs excel at identifying complex chart patterns humans might miss
- **Context Awareness**: Considers volume, prior day action, and intraday dynamics
- **Risk Management**: Conservative approach - only trades when confident
- **Eliminates Bias**: Anonymized charts prevent historical knowledge from influencing decisions

## LLM Provider Support

AlphaGroove supports multiple LLM providers with automatic flagship model selection and optimized
configurations:

### Supported Providers

**Anthropic Claude**

- **Model**: `claude-sonnet-4-20250514` (automatically selected)
- **API Key**: `ANTHROPIC_API_KEY` (automatically used)
- **Temperature Support**: Full range (0.0 - 2.0)
- **Cost**: ~$3/$15 per million input/output tokens

**OpenAI GPT**

- **Model**: `gpt-5-mini` (automatically selected)
- **API Key**: `OPENAI_API_KEY` (automatically used)
- **Temperature Support**: Default only (1.0) - model limitation
- **Cost**: ~$5/$20 per million input/output tokens
- **Special Features**: Reasoning effort, verbosity controls

### Switching Providers

Simply change the `llmProvider` setting in your config:

```yaml
shared:
  llmConfirmationScreen:
    # Switch between providers:
    llmProvider: 'anthropic' # Uses claude-sonnet-4-20250514
    # llmProvider: 'openai'   # Uses gpt-5-mini
```

**No other configuration changes needed** - the system automatically:

- Selects the flagship model for your chosen provider
- Uses the correct API key environment variable
- Applies provider-specific parameter optimizations
- Handles model-specific limitations (e.g., temperature restrictions)

### Provider-Specific Behavior

- **Temperature Handling**: OpenAI GPT-5-mini uses default temperature (1.0) regardless of your
  `temperatures` config due to model limitations. Anthropic supports custom temperatures.
- **API Parameters**: Each provider uses optimized parameters (e.g., `max_completion_tokens` for
  GPT-5, `reasoning_effort` settings)
- **Cost Tracking**: Accurate token-based cost calculation for each provider
- **Error Handling**: Provider-specific error messages and graceful degradation

---

# Backtesting Engine

Historical analysis of trading patterns with comprehensive statistical reporting.

## Usage

```bash
# Basic usage with config file
pnpm dev:start

# Override specific settings
pnpm dev:start --from 2023-01-01 --to 2023-12-31

# Use different entry pattern
pnpm dev:start --entry-pattern quickFall

# Override pattern parameters
pnpm dev:start --quickRise.risePct=0.5 --fixedTimeEntry.entryTime=13:00

# Process multiple days concurrently for faster execution
pnpm dev:start --maxConcurrentDays 5

# Show debug information
pnpm dev:start --debug --verbose

# Dry run (show query without executing)
pnpm dev:start --dry-run
```

## Entry Patterns

Entry patterns detect specific market conditions for trade initiation:

- **`quickRise`**: Detects a percentage rise in the first few minutes of trading
- **`quickFall`**: Detects a percentage fall in the first few minutes of trading
- **`fixedTimeEntry`**: Triggers entry at a specific time of day
- **`randomTimeEntry`**: Triggers entry at a random time within a configured window (eliminates
  time-based biases)

## Exit Strategies

Dynamic exit strategies analyze price action bar-by-bar:

### Stop Loss

Exits when price moves against your position by a specified amount.

- `percentFromEntry`: Exit when price moves against position by this percentage
- `atrMultiplier`: Alternative using Average True Range multiplier
- `useLlmProposedPrice`: Use LLM-suggested stop loss price if available

### Profit Target

Exits when price moves in your favor by a specified amount.

- `percentFromEntry`: Exit when price moves in favor by this percentage
- `atrMultiplier`: Alternative using ATR multiplier
- `useLlmProposedPrice`: Use LLM-suggested profit target price if available

### Trailing Stop

Follows price movement with a dynamic stop loss.

- `activationPercent`: Trailing stop activates after this favorable move
- `trailPercent`: Stop trails best price by this percentage

### Time-Based Exits

- **Max Hold Time**: Exit after holding for specified minutes
- **End of Day**: Exit at specific time to avoid overnight exposure

### ATR-Based Dynamic Adjustment

Exit parameters can use Average True Range from the prior trading day for volatility-adaptive
levels:

```yaml
exit:
  strategyOptions:
    stopLoss:
      atrMultiplier: 1.5 # Stop at 1.5x ATR below entry (longs)
    profitTarget:
      atrMultiplier: 3.0 # Target at 3.0x ATR above entry (longs)
```

### Slippage Modeling

Models realistic trading costs:

- `model`: 'percent' or 'fixed'
- `value`: Percentage (e.g., 0.05 for 0.05%) or fixed amount

## Performance Optimization

**Parallel Processing**: Process multiple trading days concurrently for faster backtests:

```bash
# Process up to 5 days simultaneously
pnpm dev:start --maxConcurrentDays 5
```

Configuration:

```yaml
backtest:
  parallelization:
    maxConcurrentDays: 5
```

**LLM Analysis Output**: When LLM screening is enabled, the backtest generates chart overlays with
color-coded decisions (LONG/SHORT/DO_NOTHING) and detailed analysis files for each trade, saved in
the entry pattern directory.

## Command Line Options

| Option                         | Description                                                      | Default     |
| ------------------------------ | ---------------------------------------------------------------- | ----------- |
| `--from <YYYY-MM-DD>`          | Start date (inclusive)                                           | From config |
| `--to <YYYY-MM-DD>`            | End date (inclusive)                                             | From config |
| `--entry-pattern <pattern>`    | Entry pattern to use                                             | From config |
| `--ticker <symbol>`            | Ticker to analyze                                                | SPY         |
| `--timeframe <period>`         | Data resolution                                                  | 1min        |
| `--maxConcurrentDays <number>` | Max concurrent days (1-20)                                       | 3           |
| `--debug`                      | Show debug information                                           | false       |
| `--verbose`                    | Show detailed LLM responses and full prompts with market context | false       |
| `--dry-run`                    | Show query without executing                                     | false       |

### Pattern-Specific Options

**Quick Rise/Fall:**

- `--quickRise.risePct=0.5` - Minimum percentage rise to trigger
- `--quickRise.withinMinutes=5` - Minutes to look for the rise
- `--quickFall.fallPct=0.3` - Minimum percentage fall to trigger
- `--quickFall.withinMinutes=5` - Minutes to look for the fall

**Fixed Time Entry:**

- `--fixedTimeEntry.entryTime=13:00` - Entry time in HH:MM format (required)

**Random Time Entry:**

- `--randomTimeEntry.startTime=09:30` - Start of random window
- `--randomTimeEntry.endTime=16:00` - End of random window

---

# Entry Scout

Real-time market analysis for live trading decisions.

## Usage

```bash
# Scout current market conditions
pnpm scout

# Scout with verbose LLM output
pnpm scout --verbose

# Scout specific ticker
pnpm scout --ticker AAPL

# Scout specific date and time
pnpm scout --date 2025-05-28 --time 12:30

# Scout with custom ticker and time
pnpm scout --ticker SPY --date 2025-05-28 --time 14:30 --verbose
```

## Features

- **Real-Time Data**: Uses Polygon.io API for current and historical market data
- **Identical Analysis**: Same LLM configuration and chart generation as backtesting
- **Enhanced Market Context**: LLM receives comprehensive market metrics (see below)
- **Trade Recommendations**: Provides entry/exit levels, stop loss, and profit targets
- **Risk/Reward Analysis**: Calculates risk-reward ratios and percentage moves
- **Flexible Timing**: Analyze any date/time, not just current market conditions
- **Result Charts**: Automatically generates charts with LLM decision overlays
- **Output Files**: Saves complete analysis results to timestamped and latest files

## Market Context for LLM Analysis

Both the backtesting engine and scout provide rich market context to the LLM for more informed
decision-making. When using the `--verbose` flag, you can see the full prompts including this market
context.

### Market Metrics Included

The LLM receives a **Market Context** section with each prompt containing:

- **Previous Close & Today's Open**: Gap analysis with percentage and direction
- **Today's High/Low Range**: Current trading range context
- **Current Price & Time**: Real-time price action
- **VWAP Analysis**: Current price relative to Volume Weighted Average Price (if not suppressed)
- **SMA Analysis**: Current price relative to 20-day Simple Moving Average (if not suppressed)
- **VWAP vs SMA**: Relationship between technical indicators (if neither VWAP nor SMA suppressed)

### Example Market Context

```
Market Context:
Prev Close: $644.84 | Today Open: $637.50 | GAP DOWN: $-7.34 (-1.14%)
Today H/L: $640.14/$634.92 | Current: $638.53 @ 03:10 PM
Current price of $638.53 is $1.08 ABOVE VWAP of $637.45.
Current price of $638.53 is $2.02 BELOW SMA of $640.55.
VWAP of $637.45 is $3.10 BELOW SMA of $640.55.
```

This context helps the LLM understand:

- **Gap conditions** (up/down from previous close)
- **Intraday momentum** (relative to VWAP)
- **Trend context** (relative to 20-day SMA, when enabled)
- **Technical alignment** (VWAP vs SMA positioning, when SMA enabled)

**Note**: When `suppressSma: true` is set in configuration, SMA-related metrics are excluded from
both charts and LLM prompts, focusing analysis on price action and VWAP only.

## Generated Files

Scout automatically generates multiple files for each analysis:

### Chart Files

- **`YYYY-MM-DDTHH-mm-ss_TICKER_YYYYMMDD_masked.png`** - Anonymized chart sent to LLM
- **`YYYY-MM-DDTHH-mm-ss_TICKER_YYYYMMDD_complete.png`** - Full chart with all details
- **`YYYY-MM-DDTHH-mm-ss_TICKER_YYYYMMDD_masked_result.png`** - Masked chart with LLM decision
  overlay
- **`latest_masked.png`** - Most recent anonymized chart
- **`latest_complete.png`** - Most recent complete chart
- **`latest_masked_result.png`** - Most recent chart with decision overlay

### Output Files

- **`YYYY-MM-DDTHH-mm-ss_TICKER_YYYYMMDD_action_[DECISION].txt`** - Timestamped analysis results
- **`latest_action.txt`** - Most recent analysis results (overwritten each run)

### Decision Overlays

Charts with `_result.png` suffix include color-coded decision overlays:

- **LONG** - Green text overlay
- **SHORT** - Red text overlay
- **DO NOTHING** - Orange text overlay

## Command Line Options

| Option                | Description                                                      | Default      |
| --------------------- | ---------------------------------------------------------------- | ------------ |
| `--ticker <symbol>`   | Ticker symbol (overrides config)                                 | From config  |
| `--date <YYYY-MM-DD>` | Trade date                                                       | Today        |
| `--time <HH:MM>`      | Entry time in Eastern Time                                       | Current time |
| `-v, --verbose`       | Show detailed LLM responses and full prompts with market context | false        |

## Requirements

- Polygon.io API key set in environment variable
- Market data availability for requested date/time

## Integration with Backtesting

The scout uses identical methods as the backtesting engine:

- Same LLM configuration and consensus logic
- Identical exit strategy calculations (stop loss, profit target, trailing stop)
- Same chart format and anonymization
- ATR-based calculations using real-time data

## Automated Live Trading Monitoring

For continuous monitoring during trading hours, use the two-terminal approach:

### Terminal 1: Continuous Scout Execution

```bash
# Run scout every 60 seconds continuously
watch -n 60 'pnpm scout'

# Alternative: Run every 30 seconds for faster updates
watch -n 30 'pnpm scout'
```

### Terminal 2: Decision Change Monitoring

```bash
# Monitor for trade signal changes with prominent alerts
./monitor_scout.sh
```

### How It Works

1. **Terminal 1** runs `pnpm scout` continuously at your chosen interval (30-60 seconds recommended)
2. Each scout run updates `charts/scout/latest_action_simple.txt` with the current decision: `LONG`,
   `SHORT`, or `DO NOTHING`
3. **Terminal 2** monitors this file and provides **prominent alerts** when decisions change:
   - **🚨 TRADE SIGNALS (LONG/SHORT)**: Multiple notifications with different sounds, visual
     terminal alerts, and audio bells
   - **💤 DO NOTHING**: Single quiet notification

### Setup

```bash
# Make the monitoring script executable (one-time setup)
chmod +x monitor_scout.sh

# Start monitoring in one terminal
./monitor_scout.sh

# Start continuous scout execution in another terminal
watch -n 60 'pnpm scout'
```

### Files Generated

- **`latest_action_simple.txt`** - Single word decision file for monitoring (`LONG`, `SHORT`,
  `DO NOTHING`)
- **`latest_action.txt`** - Full detailed analysis results
- **`latest_masked_result.png`** - Chart with decision overlay
- All timestamped versions are also created for historical reference

## Typical Workflow

1. **Backtest**: Validate strategy parameters and LLM configuration using historical data
2. **Scout**: Use real-time analysis for current market conditions
3. **Monitor**: Use automated monitoring for continuous trade signal detection
4. **Execute**: Apply LLM recommendations and calculated levels in your brokerage platform

## Directory Structure

```
alphagroove/
├── src/                # Source code
│   ├── index.ts        # Backtesting engine
│   ├── scout.ts        # Entry scout
│   ├── patterns/       # Entry and exit pattern implementations
│   ├── services/       # External service integrations
│   └── utils/          # Utility functions
├── tickers/            # Market data (SPY, TEST, etc.)
├── charts/             # Generated chart outputs
├── results/            # Backtest results
├── alphagroove.config.yaml # Configuration file (you create this)
└── README.md           # This documentation
```

## Licensing

- Community: AGPL‑3.0‑only. See [LICENSE](LICENSE).
- Commercial: Need to use our software without AGPL obligations or for closed‑source use?
  [COMMERCIAL.md](COMMERCIAL.md) has details.
