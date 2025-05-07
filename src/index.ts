#!/usr/bin/env node

/**
 * AlphaGroove - A simple CLI hello world
 */

// Function that returns the greeting message
export const getGreeting = (): string => {
  return 'Hello from AlphaGroove!';
};

// Function that returns the description
export const getDescription = (): string => {
  return 'A command-line research and strategy toolkit for exploring intraday trading patterns';
};

// Main function that prints messages to the console
export const main = (): void => {
  console.log(getGreeting());
  console.log(getDescription());
};

// Execute main function if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
