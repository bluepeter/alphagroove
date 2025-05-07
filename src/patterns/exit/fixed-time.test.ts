import { describe, it, expect } from 'vitest';

import { Bar, Signal } from '../types.js';

import { detectFixedTimeExit, FixedTimeExitConfig } from './fixed-time.js';

describe('Fixed Time Exit Pattern', () => {
  const createBar = (timestamp: string, close: number): Bar => ({
    timestamp,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1000,
  });

  const createEntrySignal = (timestamp: string, price: number): Signal => ({
    timestamp,
    price,
    type: 'entry',
  });

  it('should exit after configured number of bars', () => {
    // Using real data example: 567.12 → 566.94 (-0.32%)
    const bars: Bar[] = [
      createBar('2025-05-02 09:35:00', 567.12), // Entry
      createBar('2025-05-02 09:36:00', 567.1),
      createBar('2025-05-02 09:37:00', 567.05),
      createBar('2025-05-02 09:38:00', 567.0),
      createBar('2025-05-02 09:39:00', 566.98),
      createBar('2025-05-02 09:40:00', 566.97),
      createBar('2025-05-02 09:41:00', 566.96),
      createBar('2025-05-02 09:42:00', 566.95),
      createBar('2025-05-02 09:43:00', 566.95),
      createBar('2025-05-02 09:44:00', 566.94),
      createBar('2025-05-02 09:45:00', 566.94), // Exit
    ];

    const entry = createEntrySignal('2025-05-02 09:35:00', 567.12);
    const config: FixedTimeExitConfig = { barsAfterEntry: 10 };

    const result = detectFixedTimeExit(bars, entry, config);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('exit');
    expect(result?.price).toBe(566.94);
    expect(result?.timestamp).toBe('2025-05-02 09:45:00');
  });

  it('should return null when entry signal is not found in bars', () => {
    const bars: Bar[] = [
      createBar('2025-05-02 09:35:00', 567.12),
      createBar('2025-05-02 09:36:00', 567.1),
    ];

    const entry = createEntrySignal('2025-05-02 09:34:00', 567.0); // Different timestamp
    const config: FixedTimeExitConfig = { barsAfterEntry: 10 };

    const result = detectFixedTimeExit(bars, entry, config);
    expect(result).toBeNull();
  });

  it('should return null when not enough bars after entry', () => {
    const bars: Bar[] = [
      createBar('2025-05-02 09:35:00', 567.12),
      createBar('2025-05-02 09:36:00', 567.1),
      createBar('2025-05-02 09:37:00', 567.05),
    ];

    const entry = createEntrySignal('2025-05-02 09:35:00', 567.12);
    const config: FixedTimeExitConfig = { barsAfterEntry: 10 };

    const result = detectFixedTimeExit(bars, entry, config);
    expect(result).toBeNull();
  });

  it('should use default configuration when none provided', () => {
    const bars: Bar[] = Array(11)
      .fill(null)
      .map((_, i) => createBar(`2025-05-02 09:${35 + i}:00`, 567.12 - i * 0.02));

    const entry = createEntrySignal('2025-05-02 09:35:00', 567.12);

    const result = detectFixedTimeExit(bars, entry);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('exit');
    expect(result?.timestamp).toBe('2025-05-02 09:45:00');
  });
});
