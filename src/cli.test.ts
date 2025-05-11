import { Command } from 'commander';
import { describe, it, expect } from 'vitest';

describe('AlphaGroove CLI options', () => {
  it('should have required command line options', () => {
    const program = new Command();

    program
      .requiredOption('--from <date>', 'Start date (YYYY-MM-DD)')
      .requiredOption('--to <date>', 'End date (YYYY-MM-DD)')
      .option(
        '--entry-pattern <pattern>',
        'Entry pattern to use (default: quick-rise)',
        'quick-rise'
      )
      .option('--exit-pattern <pattern>', 'Exit pattern to use (default: fixed-time)', 'fixed-time')
      .option('--ticker <symbol>', 'Ticker to analyze (default: SPY)', 'SPY')
      .option('--timeframe <period>', 'Data resolution (default: 1min)', '1min');

    expect(program.options).toHaveLength(6);
    expect(program.options[0].required).toBe(true);
    expect(program.options[1].required).toBe(true);
  });

  it('should use default values for optional parameters', () => {
    const program = new Command();

    program
      .requiredOption('--from <date>', 'Start date (YYYY-MM-DD)')
      .requiredOption('--to <date>', 'End date (YYYY-MM-DD)')
      .option(
        '--entry-pattern <pattern>',
        'Entry pattern to use (default: quick-rise)',
        'quick-rise'
      )
      .option('--exit-pattern <pattern>', 'Exit pattern to use (default: fixed-time)', 'fixed-time')
      .option('--ticker <symbol>', 'Ticker to analyze (default: SPY)', 'SPY')
      .option('--timeframe <period>', 'Data resolution (default: 1min)', '1min');

    program.parse(['node', 'index.js', '--from', '2025-05-02', '--to', '2025-05-05']);

    expect(program.opts().entryPattern).toBe('quick-rise');
    expect(program.opts().exitPattern).toBe('fixed-time');
    expect(program.opts().ticker).toBe('SPY');
    expect(program.opts().timeframe).toBe('1min');
  });
});
