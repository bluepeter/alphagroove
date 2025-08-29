import { Bar } from '../patterns/types';
import { PolygonBar } from '../services/polygon-api.service';
import { formatTimestampET, isTradingHours, isBeforeEntryTime } from './date-helpers';

/**
 * Parse a timestamp string as Eastern Time and return UTC timestamp
 * The timestamp string format is "YYYY-MM-DD HH:MM:SS" and is assumed to be in ET
 */
export const parseTimestampAsET = (timestamp: string): number => {
  const [datePart, timePart] = timestamp.split(' ');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes, seconds] = timePart.split(':').map(Number);

  // Create a Date object in ET timezone
  const utcDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));

  // Adjust for Eastern Time (EDT in May is UTC-4)
  const etOffsetHours = 4; // EDT offset
  return utcDate.getTime() + etOffsetHours * 60 * 60 * 1000;
};

/**
 * Convert Polygon API data to our internal Bar format with timezone conversion
 */
export const convertPolygonData = (polygonBars: PolygonBar[]): Bar[] => {
  return polygonBars.map(bar => {
    // Convert UTC timestamp to Eastern Time formatted string
    const etTimestamp = formatTimestampET(bar.t);
    const [datePart, timePart] = etTimestamp.split(', ');
    const [month, day, year] = datePart.split('/');
    const formattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    const timestamp = `${formattedDate} ${timePart}`;

    return {
      timestamp,
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v,
      trade_date: formattedDate, // Add the required trade_date field
    };
  });
};

/**
 * Filter bars to only include trading hours and data before entry time
 */
export const filterTradingData = (bars: Bar[], tradeDate: string, entryTime: Date): Bar[] => {
  return bars.filter(bar => {
    const barTimestamp = parseTimestampAsET(bar.timestamp);
    return isTradingHours(barTimestamp) && isBeforeEntryTime(barTimestamp, tradeDate, entryTime);
  });
};

/**
 * Filter bars to only include trading hours (no entry time restriction)
 * Used for complete charts showing full 2-day data
 */
export const filterTradingHoursOnly = (bars: Bar[]): Bar[] => {
  return bars.filter(bar => {
    const barTimestamp = parseTimestampAsET(bar.timestamp);
    return isTradingHours(barTimestamp);
  });
};
