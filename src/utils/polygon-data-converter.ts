import { Bar } from '../patterns/types';
import { PolygonBar } from '../services/polygon-api.service';
import { formatTimestampET, isTradingHours, isBeforeEntryTime } from './date-helpers';

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
    const barTimestamp = new Date(bar.timestamp).getTime();

    return isTradingHours(barTimestamp) && isBeforeEntryTime(barTimestamp, tradeDate, entryTime);
  });
};
