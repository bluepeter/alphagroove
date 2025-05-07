import { describe, it, expect, vi } from 'vitest';

import { getGreeting, getDescription, main } from './index.js';

describe('AlphaGroove CLI', () => {
  it('should return the correct greeting', () => {
    expect(getGreeting()).toBe('Hello from AlphaGroove!');
  });

  it('should return the correct description', () => {
    expect(getDescription()).toBe(
      'A command-line research and strategy toolkit for exploring intraday trading patterns'
    );
  });

  it('should log greeting and description when main is called', () => {
    // Mock console.log
    const consoleSpy = vi.spyOn(console, 'log');

    // Call the main function
    main();

    // Check console.log was called with the right arguments
    expect(consoleSpy).toHaveBeenCalledTimes(2);
    expect(consoleSpy).toHaveBeenNthCalledWith(1, 'Hello from AlphaGroove!');
    expect(consoleSpy).toHaveBeenNthCalledWith(
      2,
      'A command-line research and strategy toolkit for exploring intraday trading patterns'
    );

    // Restore the original console.log
    consoleSpy.mockRestore();
  });
});
