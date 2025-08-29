/**
 * Date and timezone utilities for scout functionality
 */

/**
 * Get the previous trading day (skips weekends)
 */
export const getPreviousTradingDay = (date: Date): string => {
  const prevDate = new Date(date);
  prevDate.setDate(prevDate.getDate() - 1);

  // Skip weekends - if it's Sunday (0) or Saturday (6), go back further
  while (prevDate.getDay() === 0 || prevDate.getDay() === 6) {
    prevDate.setDate(prevDate.getDate() - 1);
  }

  return prevDate.toISOString().split('T')[0];
};

/**
 * Convert UTC timestamp to Eastern Time and format for display
 */
export const formatTimestampET = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
};

/**
 * Check if a timestamp is within trading hours (9:30 AM - 4:00 PM ET)
 */
export const isTradingHours = (timestamp: number): boolean => {
  const etDate = new Date(timestamp);
  const etTimeString = etDate.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
  });

  const [hours, minutes] = etTimeString.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes;

  // 9:30 AM = 570 minutes, 4:00 PM = 960 minutes
  return totalMinutes >= 570 && totalMinutes <= 960;
};

/**
 * Check if timestamp is before the entry time on the trade date
 */
export const isBeforeEntryTime = (
  timestamp: number,
  tradeDate: string,
  entryTime: Date
): boolean => {
  const barDate = new Date(timestamp);
  const barDateString = barDate.toLocaleDateString('en-CA', {
    timeZone: 'America/New_York',
  });

  // If it's not the trade date, include all bars from previous days
  if (barDateString !== tradeDate) {
    return true;
  }

  // If it's the trade date, only include bars before or at entry time
  return timestamp <= entryTime.getTime();
};

/**
 * Generate a filename-safe timestamp string
 */
export const generateTimestamp = (): string => {
  return new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
};
