## Directions to Cursor

- Use Typescript for everything
- Use arrow functions over regular functions
- Use es6 and advanced JS patterns
- Use pnpm

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

### Directory Structure

```
alphagroove/
├── src/              # Source code
│   └── index.ts      # Main entry point
├── dist/             # Compiled output (generated)
├── package.json      # Project metadata and dependencies
├── tsconfig.json     # TypeScript configuration
├── eslint.config.mjs  # ESLint configuration
├── .prettierrc       # Prettier configuration
├── .gitignore        # Git ignore patterns
└── README.md         # Project documentation
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

### Development Workflow

- `pnpm dev:start` - Run directly with ts-node (no build step)
- `pnpm dev` - Watch for changes and rebuild
- `pnpm lint` - Run ESLint
- `pnpm format` - Format code with Prettier

### Next Steps

- Implement DuckDB integration for data storage
- Create pattern detection framework
- Add command-line argument parsing
