import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { Bar, Signal } from '../patterns/types';

// Choose lightweight-charts from Trading View as the charting library
// This provides professional-grade charts with candlesticks and volume support

interface ChartGeneratorOptions {
  ticker: string;
  timeframe: string;
  entryPatternName: string;
  tradeDate: string;
  entryTimestamp: string;
  entrySignal: Signal;
  outputDir?: string;
}

/**
 * Generate a multi-day chart for a specific entry signal
 * Displays the current day's data plus 2 previous days (3 days total)
 */
export const generateEntryChart = async (options: ChartGeneratorOptions): Promise<string> => {
  const {
    ticker,
    timeframe,
    entryPatternName,
    tradeDate,
    entrySignal,
    outputDir = './charts',
  } = options;

  const patternDir = path.join(outputDir, entryPatternName);
  fs.mkdirSync(patternDir, { recursive: true });

  const fileName = `${ticker}_${entryPatternName}_${tradeDate.replace(/-/g, '')}.svg`;
  const outputPath = path.join(patternDir, fileName);

  const data = await fetchMultiDayData(ticker, timeframe, tradeDate, 2);
  const svg = generateSvgChart(ticker, entryPatternName, data, entrySignal);
  fs.writeFileSync(outputPath, svg, 'utf-8');
  console.log(`Chart image generated: ${outputPath}`);

  return outputPath;
};

/**
 * Fetch market data for multiple days before the signal date
 * Gets 2 days prior + current day (3 days total)
 */
const fetchMultiDayData = async (
  ticker: string,
  timeframe: string,
  signalDate: string,
  daysBack: number
): Promise<Bar[]> => {
  const startDate = getPriorTradingDate(signalDate, daysBack);
  const tempFile = path.join(process.cwd(), 'temp_chart_query.sql');

  const query = `
    WITH raw_data AS (
      SELECT 
        column0::TIMESTAMP as timestamp,
        column1::DOUBLE as open,
        column2::DOUBLE as high,
        column3::DOUBLE as low,
        column4::DOUBLE as close,
        column5::BIGINT as volume,
        strftime(column0, '%Y-%m-%d') as trade_date
      FROM read_csv_auto('tickers/${ticker}/${timeframe}.csv', header=false)
      WHERE column0 >= '${startDate} 00:00:00'
        AND column0 <= '${signalDate} 23:59:59'
        AND strftime(timestamp, '%H:%M') BETWEEN '09:30' AND '16:00'
    )
    SELECT * FROM raw_data
    ORDER BY timestamp ASC;
  `;

  fs.writeFileSync(tempFile, query, 'utf-8');

  try {
    const result = execSync(`duckdb -csv -header < ${tempFile}`, {
      encoding: 'utf-8',
      maxBuffer: 100 * 1024 * 1024,
    });

    const [header, ...lines] = result.trim().split('\n');
    const columns = header.split(',');

    const bars = lines.map(line => {
      const values = line.split(',');
      const row = columns.reduce(
        (obj, col, i) => {
          const currentVal = values[i];
          obj[col] = isNaN(Number(currentVal)) ? currentVal : Number(currentVal);
          return obj;
        },
        {} as Record<string, string | number>
      );

      return {
        timestamp: row.timestamp as string,
        open: row.open as number,
        high: row.high as number,
        low: row.low as number,
        close: row.close as number,
        volume: row.volume as number,
      };
    });

    return bars;
  } catch (error) {
    console.error('Error fetching multi-day data:', error);
    return [];
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
};

const getPriorTradingDate = (date: string, daysBack: number): string => {
  const dateObj = new Date(date);
  let tradingDaysBack = 0;
  while (tradingDaysBack < daysBack) {
    dateObj.setDate(dateObj.getDate() - 1);
    const day = dateObj.getDay();
    if (day !== 0 && day !== 6) {
      tradingDaysBack++;
    }
  }
  return dateObj.toISOString().split('T')[0];
};

const generateSvgChart = (
  ticker: string,
  patternName: string,
  allData: Bar[],
  entrySignal: Signal
): string => {
  const width = 1200;
  const height = 800;
  const marginTop = 70;
  const marginRight = 50;
  const marginBottom = 150;
  const marginLeft = 70;
  const chartWidth = width - marginLeft - marginRight;
  const chartHeight = (height - marginTop - marginBottom) * 0.7;
  const volumeHeight = (height - marginTop - marginBottom) * 0.3;
  const volumeTop = marginTop + chartHeight + 20;

  const entryIndexOverall = allData.findIndex(d => d.timestamp === entrySignal.timestamp);
  const dataToShow = allData.slice(0, entryIndexOverall + 1);

  if (dataToShow.length === 0) {
    console.warn('No data to display after filtering for entry signal.');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-size="18">No data available</text>
    </svg>`;
  }

  const tradingDays = dataToShow.reduce(
    (days, bar) => {
      const date = new Date(bar.timestamp).toISOString().split('T')[0];
      if (!days[date]) {
        days[date] = [];
      }
      days[date].push(bar);
      return days;
    },
    {} as Record<string, Bar[]>
  );
  const uniqueDayStrings = Object.keys(tradingDays).sort((a, b) => a.localeCompare(b));
  const displayDayStrings = uniqueDayStrings.slice(-3); // Current day and 2 previous

  const finalData = dataToShow.filter(d =>
    displayDayStrings.includes(new Date(d.timestamp).toISOString().split('T')[0])
  );

  if (finalData.length === 0) {
    console.warn('No data for the last 3 relevant days.');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-size="18">No data available for selected days</text>
    </svg>`;
  }

  const minPrice = Math.min(...finalData.map(d => d.low)) * 0.995;
  const maxPrice = Math.max(...finalData.map(d => d.high)) * 1.005;
  const priceRange = maxPrice - minPrice;
  const maxVolume = Math.max(...finalData.map(d => d.volume));

  const priceToY = (price: number) =>
    marginTop + chartHeight - ((price - minPrice) / priceRange) * chartHeight;
  const volumeToHeight = (volume: number) => (volume / maxVolume) * volumeHeight;

  const getXPosition = (index: number) => {
    if (finalData.length <= 1) return marginLeft + chartWidth / 2; // Center if 1 or 0 points
    return marginLeft + (index / (finalData.length - 1)) * chartWidth;
  };

  interface ChartLabel {
    text: string;
    x: number;
  }

  const xLabels: ChartLabel[] = [];
  const dayBoundaryLines: { x: number; date: string }[] = [];
  let lastDateString = '';

  finalData.forEach((d, i) => {
    const currentDateString = new Date(d.timestamp).toISOString().split('T')[0];
    if (currentDateString !== lastDateString) {
      if (i > 0) {
        // Don't add boundary for the very first data point
        dayBoundaryLines.push({
          x: getXPosition(i - 1) + (getXPosition(i) - getXPosition(i - 1)) / 2, // Midpoint between last of old day and first of new
          date: new Date(currentDateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          }),
        });
      }
      // Add day label at the start of the day section
      xLabels.push({
        text: new Date(currentDateString).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        x: getXPosition(i) + 5, // Slightly offset to the right of the data start for the day
      });
      lastDateString = currentDateString;
    }
  });

  // Add time labels (e.g., first, middle, last point of the displayed data)
  if (finalData.length > 0) {
    xLabels.push({
      text: new Date(finalData[0].timestamp).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      x: getXPosition(0),
    });
    if (finalData.length > 2) {
      const midIndex = Math.floor(finalData.length / 2);
      xLabels.push({
        text: new Date(finalData[midIndex].timestamp).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        x: getXPosition(midIndex),
      });
    }
    xLabels.push({
      text: new Date(finalData[finalData.length - 1].timestamp).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      x: getXPosition(finalData.length - 1),
    });
  }

  // Deduplicate and sort xLabels by x position to prevent overlap
  const uniqueXLabels = Array.from(new Map(xLabels.map(label => [label.x, label])).values()).sort(
    (a, b) => a.x - b.x
  );

  const linePath = finalData
    .map((d, i) => {
      const x = getXPosition(i);
      const y = priceToY(d.close);
      return (i === 0 ? 'M' : 'L') + `${x},${y}`;
    })
    .join(' ');

  const entryDateFormatted = new Date(entrySignal.timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const entryTime = new Date(entrySignal.timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <text x="${width / 2}" y="25" text-anchor="middle" font-size="18" font-weight="bold">${ticker} - ${patternName}</text>
  <text x="${width / 2}" y="50" text-anchor="middle" font-size="14">
    Date: ${entryDateFormatted}, Time: ${entryTime}, Current Price: $${entrySignal.price.toFixed(2)}
  </text>
  
  <rect x="${marginLeft}" y="${marginTop}" width="${chartWidth}" height="${chartHeight}" fill="none" stroke="#ccc" stroke-width="1" />
  
  ${dayBoundaryLines
    .map(
      line => `
    <line x1="${line.x}" y1="${marginTop}" x2="${line.x}" y2="${marginTop + chartHeight}" stroke="#999" stroke-width="1" stroke-dasharray="5,5" />
    <text x="${line.x + 5}" y="${marginTop + 15}" font-size="10" fill="#666">${line.date}</text>
  `
    )
    .join('\n')}
    
  <line x1="${marginLeft}" y1="${marginTop}" x2="${marginLeft}" y2="${marginTop + chartHeight}" stroke="#333" stroke-width="1" />
  ${Array.from({ length: 6 }, (_, i) => {
    const price = minPrice + (i / 5) * priceRange;
    return `<text x="${marginLeft - 10}" y="${priceToY(price)}" text-anchor="end" dominant-baseline="middle" font-size="12">$${price.toFixed(2)}</text>`;
  }).join('\n  ')}
  <line x1="${marginLeft}" y1="${marginTop + chartHeight}" x2="${marginLeft + chartWidth}" y2="${marginTop + chartHeight}" stroke="#333" stroke-width="1" />
  
  <path d="${linePath}" fill="none" stroke="#0066cc" stroke-width="2" />

  <rect x="${marginLeft}" y="${volumeTop}" width="${chartWidth}" height="${volumeHeight}" fill="none" stroke="#ccc" stroke-width="1" />
  ${dayBoundaryLines
    .map(
      line => `
    <line x1="${line.x}" y1="${volumeTop}" x2="${line.x}" y2="${volumeTop + volumeHeight}" stroke="#999" stroke-width="1" stroke-dasharray="5,5" />
  `
    )
    .join('\n')}
    
  ${finalData
    .map((bar, i) => {
      const x = getXPosition(i);
      const barWidth = Math.max(1, Math.min(15, (chartWidth / finalData.length) * 0.6));
      const h = volumeToHeight(bar.volume);
      const y = volumeTop + volumeHeight - h;
      const color = bar.close >= bar.open ? 'rgba(0, 128, 0, 0.5)' : 'rgba(255, 0, 0, 0.5)';
      return `<rect x="${x - barWidth / 2}" y="${y}" width="${barWidth}" height="${h}" fill="${color}" />`;
    })
    .join('\n  ')}
  
  <line x1="${marginLeft}" y1="${volumeTop}" x2="${marginLeft}" y2="${volumeTop + volumeHeight}" stroke="#333" stroke-width="1" />
  ${Array.from({ length: 3 }, (_, i) => {
    const volume = (i / 2) * maxVolume;
    const formatVolume =
      volume >= 1000000
        ? `${(volume / 1000000).toFixed(1)}M`
        : volume >= 1000
          ? `${(volume / 1000).toFixed(0)}K`
          : volume.toFixed(0);
    return `<text x="${marginLeft - 10}" y="${volumeTop + volumeHeight - (i / 2) * volumeHeight}" text-anchor="end" dominant-baseline="middle" font-size="10">${formatVolume}</text>`;
  }).join('\n  ')}
  <line x1="${marginLeft}" y1="${volumeTop + volumeHeight}" x2="${marginLeft + chartWidth}" y2="${volumeTop + volumeHeight}" stroke="#333" stroke-width="1" />
  
  ${uniqueXLabels
    .map(label => {
      return `<text x="${label.x}" y="${volumeTop + volumeHeight + 20}" text-anchor="middle" font-size="11" transform="rotate(45, ${label.x}, ${volumeTop + volumeHeight + 20})">${label.text}</text>`;
    })
    .join('\n  ')}
  
  <text x="${marginLeft - 45}" y="${marginTop + chartHeight / 2}" text-anchor="middle" transform="rotate(-90, ${marginLeft - 45}, ${marginTop + chartHeight / 2})" font-size="14">Price ($)</text>
  <text x="${marginLeft - 45}" y="${volumeTop + volumeHeight / 2}" text-anchor="middle" transform="rotate(-90, ${marginLeft - 45}, ${volumeTop + volumeHeight / 2})" font-size="12">Volume</text>
  <text x="${marginLeft + chartWidth / 2}" y="${height - 25}" text-anchor="middle" font-size="14">Time</text>
</svg>
  `.trim();
};

/**
 * Generate charts for all entry signals found in a backtest
 */
export const generateEntryCharts = async (
  ticker: string,
  timeframe: string,
  entryPatternName: string,
  trades: Array<{
    trade_date: string;
    entry_time: string;
    entry_price: number;
    direction?: 'long' | 'short';
  }>,
  outputDir: string = './charts'
): Promise<string[]> => {
  const outputPaths: string[] = [];

  for (const trade of trades) {
    const entrySignal: Signal = {
      timestamp: trade.entry_time,
      price: trade.entry_price,
      type: 'entry',
      direction: trade.direction || 'long',
    };

    try {
      const outputPath = await generateEntryChart({
        ticker,
        timeframe,
        entryPatternName,
        tradeDate: trade.trade_date,
        entryTimestamp: trade.entry_time,
        entrySignal,
        outputDir,
      });

      outputPaths.push(outputPath);
    } catch (error) {
      console.error(`Error generating chart for trade on ${trade.trade_date}:`, error);
    }
  }

  return outputPaths;
};
