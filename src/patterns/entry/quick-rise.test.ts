import { describe, it, expect } from 'vitest';
import { detectQuickRiseEntry, QuickRiseEntryConfig } from './quick-rise.js';
import { Bar } from '../types.js';

describe('Quick Rise Entry Pattern', () => {
  const createBar = (timestamp: string, open: number, high: number): Bar => ({
    timestamp,
    open,
    high,
    low: open,
    close: high,
    volume: 1000,
  });

  it('should detect a quick rise when price increases by configured percentage', () => {
    // Using real data example: 566.83 → 568.53 (+0.3%)
    const bars: Bar[] = [
      createBar('2025-05-02 09:31:00', 566.83, 566.85),
      createBar('2025-05-02 09:32:00', 566.85, 567.5),
      createBar('2025-05-02 09:33:00', 567.5, 568.0),
      createBar('2025-05-02 09:34:00', 568.0, 568.25),
      createBar('2025-05-02 09:35:00', 568.25, 568.53),
    ];

    const config: QuickRiseEntryConfig = {
      percentIncrease: 0.3,
      maxBars: 5,
    };

    const result = detectQuickRiseEntry(bars, config);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('entry');
    expect(result?.price).toBe(568.53);
    expect(result?.timestamp).toBe('2025-05-02 09:35:00');
  });

  it('should not detect a rise when price increase is below threshold', () => {
    // Using real data example with smaller rise
    const bars: Bar[] = [
      createBar('2025-05-02 09:31:00', 566.83, 566.85),
      createBar('2025-05-02 09:32:00', 566.85, 566.87),
      createBar('2025-05-02 09:33:00', 566.87, 566.9),
      createBar('2025-05-02 09:34:00', 566.9, 566.92),
      createBar('2025-05-02 09:35:00', 566.92, 566.95),
    ];

    const config: QuickRiseEntryConfig = {
      percentIncrease: 0.3,
      maxBars: 5,
    };

    const result = detectQuickRiseEntry(bars, config);
    expect(result).toBeNull();
  });

  it('should return null when not enough bars are provided', () => {
    const bars: Bar[] = [
      createBar('2025-05-02 09:31:00', 566.83, 566.85),
      createBar('2025-05-02 09:32:00', 566.85, 566.9),
      createBar('2025-05-02 09:33:00', 566.9, 567.05),
    ];

    const config: QuickRiseEntryConfig = {
      percentIncrease: 0.3,
      maxBars: 5,
    };

    const result = detectQuickRiseEntry(bars, config);
    expect(result).toBeNull();
  });

  it('should use default configuration when none provided', () => {
    // Using real data example: 566.83 → 568.53 (+0.3%)
    const bars: Bar[] = [
      createBar('2025-05-02 09:31:00', 566.83, 566.85),
      createBar('2025-05-02 09:32:00', 566.85, 567.5),
      createBar('2025-05-02 09:33:00', 567.5, 568.0),
      createBar('2025-05-02 09:34:00', 568.0, 568.25),
      createBar('2025-05-02 09:35:00', 568.25, 568.53),
    ];

    const result = detectQuickRiseEntry(bars);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('entry');
    expect(result?.price).toBe(568.53);
  });
});
