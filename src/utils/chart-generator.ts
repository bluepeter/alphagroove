import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import sharp from 'sharp';

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
}

/**
 * Generate a multi-day chart for a specific entry signal
 * Displays the current day's data plus 1 previous actual trading day with data.
 */
export const generateEntryChart = async (options: ChartGeneratorOptions): Promise<string> => {
  const { ticker, timeframe, entryPatternName, tradeDate, entrySignal } = options;

  const patternDir = path.join('./charts', entryPatternName);
  fs.mkdirSync(patternDir, { recursive: true });

  const baseFileName = `${ticker}_${entryPatternName}_${tradeDate.replace(/-/g, '')}`;
  const svgOutputPathLlm = path.join(patternDir, `${baseFileName}_llm_temp.svg`); // Temp SVG for LLM
  const svgOutputPathComplete = path.join(patternDir, `${baseFileName}_complete_temp.svg`); // Temp SVG for Complete
  const pngOutputPath = path.join(patternDir, `${baseFileName}.png`);
  const completePngOutputPath = path.join(patternDir, `${baseFileName}_complete.png`);

  // Fetch data for the tradeDate and 1 prior actual trading day
  const data = await fetchMultiDayData(ticker, timeframe, tradeDate, 1);

  if (!data || data.length === 0) {
    console.warn(
      `No data returned by fetchMultiDayData for ${tradeDate} and prior day. Cannot generate chart.`
    );
    return ''; // Or throw an error
  }

  // Generate SVG for the LLM chart (filtered up to entry)
  const svgLlm = generateSvgChart(ticker, entryPatternName, data, entrySignal, false, true);
  // console.log(`[generateEntryChart DEBUG] Length of svgLlm (LLM chart): ${svgLlm.length}`);
  fs.writeFileSync(svgOutputPathLlm, svgLlm, 'utf-8');

  // Generate SVG for the "complete" 2-day chart (full days)
  const svgComplete = generateSvgChart(ticker, entryPatternName, data, entrySignal, true, false);
  // console.log(
  //   `[generateEntryChart DEBUG] Length of svgComplete (Complete chart): ${svgComplete.length}`
  // );
  fs.writeFileSync(svgOutputPathComplete, svgComplete, 'utf-8');

  try {
    // Generate the original chart for LLM
    await sharp(svgOutputPathLlm, { density: 300 })
      .flatten({ background: '#FFFFFF' })
      .png()
      .toFile(pngOutputPath);

    // Generate the "complete" 2-day chart for analysis
    await sharp(svgOutputPathComplete, { density: 300 })
      .flatten({ background: '#FFFFFF' })
      .png()
      .toFile(completePngOutputPath);

    // Log file sizes for definitive comparison -  No longer needed
    // try {
    //   const statsLlmPng = fs.statSync(pngOutputPath);
    //   console.log(
    //     `[generateEntryChart DEBUG] Size of LLM PNG (${path.basename(pngOutputPath)}): ${statsLlmPng.size} bytes`
    //   );
    //   const statsCompletePng = fs.statSync(completePngOutputPath);
    //   console.log(
    //     `[generateEntryChart DEBUG] Size of Complete PNG (${path.basename(completePngOutputPath)}): ${statsCompletePng.size} bytes`
    //   );
    // } catch (statError) {
    //   console.error('[generateEntryChart DEBUG] Error stating PNG files:', statError);
    // }

    fs.unlinkSync(svgOutputPathLlm); // Re-enable deletion of temp SVG
    fs.unlinkSync(svgOutputPathComplete); // Re-enable deletion of temp SVG
    return pngOutputPath; // Return path of the original chart
  } catch (err) {
    console.error(`Error generating PNG from SVG for ${baseFileName}:`, err);
    throw err;
  }
};

/**
 * Fetches market data for a given signal date and a specified number of prior *actual trading days* with data.
 * @param ticker The stock ticker symbol.
 * @param timeframe The data timeframe (e.g., '1min').
 * @param signalDate The reference date for the signal (YYYY-MM-DD).
 * @param numPriorTradingDays The number of prior trading days (with data) to fetch before the signalDate.
 *                            The signalDate itself is always included if it has data.
 * @returns A promise that resolves to an array of Bar objects, or an empty array if an error occurs.
 */
const fetchMultiDayData = async (
  ticker: string,
  timeframe: string,
  signalDate: string, // YYYY-MM-DD format
  numPriorTradingDays: number
): Promise<Bar[]> => {
  const dataFilePath = `tickers/${ticker}/${timeframe}.csv`;
  const limitDays = numPriorTradingDays + 1;

  const query = `
    WITH AllAvailableTradingDays AS (
      SELECT DISTINCT strftime(column0::TIMESTAMP, '%Y-%m-%d') AS trade_date_str
      FROM read_csv_auto('${dataFilePath}', header=false)
      WHERE strftime(column0::TIMESTAMP, '%Y-%m-%d') <= '${signalDate}'
    ),
    RankedTradingDays AS (
      SELECT 
        trade_date_str,
        row_number() OVER (ORDER BY trade_date_str DESC) as rn
      FROM AllAvailableTradingDays
    ),
    TargetTradingDays AS (
      SELECT trade_date_str
      FROM RankedTradingDays
      WHERE rn <= ${limitDays}
    )
    SELECT 
      column0::TIMESTAMP as timestamp,
      column1::DOUBLE as open,
      column2::DOUBLE as high,
      column3::DOUBLE as low,
      column4::DOUBLE as close,
      column5::BIGINT as volume,
      strftime(column0::TIMESTAMP, '%Y-%m-%d') as trade_date
    FROM read_csv_auto('${dataFilePath}', header=false)
    WHERE strftime(column0::TIMESTAMP, '%Y-%m-%d') IN (SELECT trade_date_str FROM TargetTradingDays)
      AND strftime(column0::TIMESTAMP, '%H:%M') BETWEEN '09:30' AND '16:00'
    ORDER BY timestamp ASC;
  `;

  try {
    // Pass the query directly to duckdb via stdin
    const result = execSync('duckdb -csv -header', {
      input: query,
      encoding: 'utf-8',
      maxBuffer: 100 * 1024 * 1024,
    });

    const [header, ...lines] = result.trim().split('\n');
    if (!header || lines.length === 0) {
      console.warn(
        `No data returned from DuckDB for ${signalDate} and ${numPriorTradingDays} prior days for ${ticker}.`
      );
      return [];
    }

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
        trade_date: row.trade_date as string,
      };
    });
    return bars;
  } catch (error) {
    console.error(
      `Error fetching multi-day data for ${signalDate} with ${numPriorTradingDays} prior days for ${ticker}:`,
      error
    );
    return [];
  } finally {
    // No temp file to unlink
  }
};

export const generateSvgChart = (
  ticker: string,
  patternName: string,
  allDataInput: Bar[],
  entrySignal: Signal,
  showFullDayData?: boolean,
  anonymize?: boolean
): string => {
  // Explicit console logs for debugging timestamp matching - REMOVE/COMMENT OUT
  if (!showFullDayData) {
    // console.log(
    //   `[generateSvgChart DEBUG FOR LLM CHART] entrySignal.timestamp: >>>${entrySignal.timestamp}<<<`
    // );
    // if (allDataInput.length > 0) {
    //   // console.log(
    //   //   `[generateSvgChart DEBUG FOR LLM CHART] Sample allDataInput[0].timestamp: >>>${allDataInput[0].timestamp}<<<`
    //   // );
    //   // // Log first 5 timestamps from allDataInput for comparison
    //   // for (let i = 0; i < Math.min(5, allDataInput.length); i++) {
    //   //   console.log(
    //   //     `[generateSvgChart DEBUG FOR LLM CHART] allDataInput[${i}].timestamp: >>>${allDataInput[i].timestamp}<<<`
    //   //   );
    //   // }
    //   const found = allDataInput.find(b => b.timestamp === entrySignal.timestamp); // This find can be removed as findIndex is primary
    //   if (!found) {
    //     // console.error( // This can be removed
    //     //   `[generateSvgChart DEBUG FOR LLM CHART] CRITICAL: entrySignal.timestamp was NOT found in allDataInput. Formats MUST match.`
    //     // );
    //   }
    // } else {
    //   // console.warn( // This specific warning can be removed if the main one for findIndex covers it
    //   //   `[generateSvgChart DEBUG FOR LLM CHART] allDataInput is empty, cannot compare timestamps.`
    //   // );
    // }
  }

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

  // 1. Determine the actual distinct trading days present in the full input from fetchMultiDayData
  const allInputTradingDays = allDataInput.reduce(
    (days, bar) => {
      const date = bar.trade_date;
      if (!days[date]) {
        days[date] = [];
      }
      return days;
    },
    {} as Record<string, Bar[]>
  );
  const allUniqueInputDayStrings = Object.keys(allInputTradingDays).sort((a, b) =>
    a.localeCompare(b)
  );
  const numPriorDaysToDisplay = 1;
  const displayDayStrings = allUniqueInputDayStrings.slice(-(numPriorDaysToDisplay + 1));

  // 2. Now, filter the data that will actually be plotted:
  let finalDataForChart: Bar[];

  if (showFullDayData) {
    finalDataForChart = allDataInput.filter(d => displayDayStrings.includes(d.trade_date));
    // console.log(`[generateSvgChart DEBUG] COMPLETE CHART: allDataInput.length: ${allDataInput.length}, displayDayStrings: ${displayDayStrings.join(', ')}, finalDataForChart.length: ${finalDataForChart.length}`);
  } else {
    const entryIndexInAllData = allDataInput.findIndex(d => d.timestamp === entrySignal.timestamp);

    if (entryIndexInAllData === -1) {
      console.warn(
        // KEEP THIS OPERATIONAL WARNING
        `[generateSvgChart] LLM Chart Warning: Entry signal timestamp '${entrySignal.timestamp}' ` +
          `not found in fetched 2-day data. LLM chart will show full 2-day data instead of data up to entry.`
      );
      finalDataForChart = allDataInput.filter(d => displayDayStrings.includes(d.trade_date));
    } else {
      const dataUpToEntrySignal = allDataInput.slice(0, entryIndexInAllData + 1);
      finalDataForChart = dataUpToEntrySignal.filter(d => displayDayStrings.includes(d.trade_date));
    }
    // console.log(`[generateSvgChart DEBUG] LLM CHART: allDataInput.length: ${allDataInput.length}, entryIndexInAllData: ${entryIndexInAllData}, displayDayStrings: ${displayDayStrings.join(', ')}, finalDataForChart.length: ${finalDataForChart.length}`);
  }

  if (finalDataForChart.length === 0) {
    console.warn('No data to display after filtering for entry signal and selected days.');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-size="18">No data available</text>
    </svg>`;
  }

  // This grouping is for creating day-specific labels/boundaries from the final, filtered data
  const tradingDaysForLabels = finalDataForChart.reduce(
    (days, bar) => {
      const date = bar.trade_date;
      if (!days[date]) {
        days[date] = [];
      }
      days[date].push(bar);
      return days;
    },
    {} as Record<string, Bar[]>
  );

  const minPrice = Math.min(...finalDataForChart.map(d => d.low)) * 0.995;
  const maxPrice = Math.max(...finalDataForChart.map(d => d.high)) * 1.005;
  const priceRange = maxPrice - minPrice;
  const maxVolume = Math.max(...finalDataForChart.map(d => d.volume));

  const priceToY = (price: number) =>
    marginTop + chartHeight - ((price - minPrice) / priceRange) * chartHeight;
  const volumeToHeight = (volume: number) => (volume / maxVolume) * volumeHeight;

  const getXPosition = (index: number) => {
    if (finalDataForChart.length <= 1) return marginLeft + chartWidth / 2;
    return marginLeft + (index / (finalDataForChart.length - 1)) * chartWidth;
  };

  interface ChartLabel {
    text: string;
    x: number;
    isDate?: boolean;
    isTime?: boolean;
    isTick?: boolean;
  }

  const xTicksAndLabels: ChartLabel[] = [];
  const dayBoundaryLines: { x: number }[] = [];
  const dateLabelsForChartArea: ChartLabel[] = [];

  // Generate Date Labels for Price Chart Area and Day Boundary Lines using displayDayStrings
  displayDayStrings.forEach((dateStr, dayIdx) => {
    const dayData = tradingDaysForLabels[dateStr];
    if (!dayData || dayData.length === 0) {
      console.warn(
        `No actual data in finalData for date ${dateStr}, which was in displayDayStrings. Skipping labels/boundaries for it.`
      );
      return;
    }

    const firstBarOfDayIndex = finalDataForChart.findIndex(
      b => b.timestamp === dayData[0].timestamp
    );
    const xDayStart = getXPosition(firstBarOfDayIndex);

    let dateLabelText = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });

    if (anonymize) {
      if (displayDayStrings.length > 1) {
        dateLabelText = dayIdx === 0 ? 'Prior Day' : 'Signal Day';
      } else {
        dateLabelText = 'Signal Day';
      }
    }

    dateLabelsForChartArea.push({
      text: dateLabelText,
      x: xDayStart + 5,
      isDate: true,
    });

    if (dayIdx > 0) {
      const boundaryX = xDayStart - chartWidth / finalDataForChart.length / 20;
      dayBoundaryLines.push({ x: Math.max(marginLeft, boundaryX) });
    }
  });

  // Generate Time Ticks and Selective Time Labels for X-Axis, using displayDayStrings and tradingDaysForLabels
  const RTH_START_HOUR = 9;
  const RTH_START_MINUTE = 30;
  const RTH_END_HOUR = 16;
  const RTH_END_MINUTE = 0;
  const FULL_LABEL_HOURS = [9, 12, 16];

  displayDayStrings.forEach(dateStr => {
    const dayData = tradingDaysForLabels[dateStr];
    if (!dayData || dayData.length === 0) return;

    for (let hour = RTH_START_HOUR; hour <= RTH_END_HOUR; hour++) {
      const minute = hour === RTH_START_HOUR ? RTH_START_MINUTE : 0;
      if (hour === RTH_END_HOUR && minute > RTH_END_MINUTE) continue;

      let closestBar: Bar | null = null;
      let minDiff = Infinity;

      for (const bar of dayData) {
        const barDate = new Date(bar.timestamp);
        const barHour = barDate.getHours();
        const barMinute = barDate.getMinutes();

        const targetTimeThisHour = new Date(dateStr);
        targetTimeThisHour.setHours(hour, minute, 0, 0);

        if (barHour === hour && barMinute === minute) {
          closestBar = bar;
          break;
        }
        const diff = Math.abs(barDate.getTime() - targetTimeThisHour.getTime());
        if (diff < minDiff && barDate.getTime() >= targetTimeThisHour.getTime()) {
          minDiff = diff;
          closestBar = bar;
        }
      }

      if (closestBar) {
        const barIndex = finalDataForChart.findIndex(b => b.timestamp === closestBar!.timestamp);
        if (barIndex !== -1) {
          const actualTime = new Date(closestBar.timestamp);
          const xPos = getXPosition(barIndex);

          xTicksAndLabels.push({ text: '', x: xPos, isTick: true });

          const isFullLabelHour = FULL_LABEL_HOURS.includes(hour);
          const isMarketOpen = hour === RTH_START_HOUR && minute === RTH_START_MINUTE;
          const isMarketClose =
            hour === RTH_END_HOUR &&
            minute === RTH_END_MINUTE &&
            actualTime.getHours() === RTH_END_HOUR &&
            actualTime.getMinutes() === RTH_END_MINUTE;

          if (isMarketOpen || isMarketClose || (isFullLabelHour && actualTime.getMinutes() === 0)) {
            let timeText = '';
            if (isMarketOpen) {
              timeText = actualTime.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
              });
            } else if (isMarketClose) {
              timeText = actualTime.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
              });
            } else if (isFullLabelHour) {
              timeText = actualTime.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
            }

            const tooClose = xTicksAndLabels.some(l => l.isTime && Math.abs(l.x - xPos) < 30);
            if (!tooClose && timeText) {
              xTicksAndLabels.push({
                text: timeText,
                x: xPos,
                isTime: true,
              });
            }
          }
        }
      }
    }
  });

  const uniqueXTicksAndLabels = Array.from(
    new Map(xTicksAndLabels.map(label => [label.x.toFixed(1), label])).values()
  ).sort((a, b) => a.x - b.x);

  const entryDateFormatted = new Date(entrySignal.timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const entryTime = new Date(entrySignal.timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const chartTitle = anonymize ? `XXX - ${patternName}` : `${ticker} - ${patternName}`;
  const headerDateText = anonymize ? 'XXX' : entryDateFormatted;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <text x="${width / 2}" y="25" text-anchor="middle" font-size="18" font-weight="bold">${chartTitle}</text>
  <text x="${width / 2}" y="50" text-anchor="middle" font-size="14">
    Date: ${headerDateText}, Time: ${entryTime}, Current Price: $${entrySignal.price.toFixed(2)}
  </text>
  
  <rect x="${marginLeft}" y="${marginTop}" width="${chartWidth}" height="${chartHeight}" fill="none" stroke="none" />
  
  ${dayBoundaryLines
    .map(
      line =>
        `<line x1="${line.x}" y1="${marginTop}" x2="${line.x}" y2="${marginTop + chartHeight}" stroke="#999" stroke-width="1" stroke-dasharray="5,5" />`
    )
    .join('\n')}
    
  {/* Date Labels in Price Chart Area */}
  ${dateLabelsForChartArea
    .map(
      label =>
        `<text x="${label.x}" y="${marginTop + 15}" font-size="10" fill="#333" font-weight="bold">${label.text}</text>`
    )
    .join('\n  ')}
  
  <line x1="${marginLeft}" y1="${marginTop}" x2="${marginLeft}" y2="${marginTop + chartHeight}" stroke="#333" stroke-width="1" />
  ${Array.from({ length: 6 }, (_, i) => {
    const price = minPrice + (i / 5) * priceRange;
    return `<text x="${marginLeft - 10}" y="${priceToY(price)}" text-anchor="end" dominant-baseline="middle" font-size="12">$${price.toFixed(2)}</text>`;
  }).join('\n  ')}
  <line x1="${marginLeft}" y1="${marginTop + chartHeight}" x2="${marginLeft + chartWidth}" y2="${marginTop + chartHeight}" stroke="#333" stroke-width="1" />
  
  {/* Horizontal Grid Lines */}
  ${Array.from({ length: 6 }, (_, i) => {
    const price = minPrice + (i / 5) * priceRange;
    const y = priceToY(price);
    if (y < marginTop + 5 || y > marginTop + chartHeight - 5) return '';
    return `<line x1="${marginLeft}" y1="${y}" x2="${marginLeft + chartWidth}" y2="${y}" stroke="#e0e0e0" stroke-width="0.5" stroke-dasharray="2,2" />`;
  }).join('\n  ')}
  
  {/* Candlestick drawing logic START */}
  ${finalDataForChart
    .map((d, i) => {
      const x = getXPosition(i);
      const candleWidth = Math.max(2, (chartWidth / finalDataForChart.length) * 0.7);
      const yOpen = priceToY(d.open);
      const yClose = priceToY(d.close);
      const yHigh = priceToY(d.high);
      const yLow = priceToY(d.low);
      const bodyTop = Math.min(yOpen, yClose);
      const bodyHeight = yOpen === yClose ? 1 : Math.abs(yOpen - yClose);
      const color = d.close >= d.open ? '#26a69a' : '#ef5350';
      const wick = `<line x1="${x}" y1="${yHigh}" x2="${x}" y2="${yLow}" stroke="black" stroke-width="0.5" />`;
      const body = `<rect x="${x - candleWidth / 2}" y="${bodyTop}" width="${candleWidth}" height="${bodyHeight}" fill="${color}" />`;
      return `
      ${wick}
      ${body}
    `;
    })
    .join('\n  ')}
  {/* Candlestick drawing logic END */}

  <rect x="${marginLeft}" y="${volumeTop}" width="${chartWidth}" height="${volumeHeight}" fill="none" stroke="none" />
  ${dayBoundaryLines
    .map(
      line =>
        `<line x1="${line.x}" y1="${volumeTop}" x2="${line.x}" y2="${volumeTop + volumeHeight}" stroke="#999" stroke-width="1" stroke-dasharray="5,5" />`
    )
    .join('\n')}
    
  ${finalDataForChart
    .map((bar, i) => {
      const x = getXPosition(i);
      const barWidth = Math.max(1, Math.min(15, (chartWidth / finalDataForChart.length) * 0.6));
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
  
  ${uniqueXTicksAndLabels
    .map(label => {
      if (label.isTick && !label.isTime) {
        return `<line x1="${label.x}" y1="${volumeTop + volumeHeight}" x2="${label.x}" y2="${volumeTop + volumeHeight + 5}" stroke="#333" stroke-width="1" />`;
      }
      if (label.isTime && label.text) {
        return `<text x="${label.x}" y="${volumeTop + volumeHeight + 20}" text-anchor="middle" font-size="11" transform="rotate(45, ${label.x}, ${volumeTop + volumeHeight + 20})">${label.text}</text>`;
      }
      return '';
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
 * Outputs PNG files (SVG is an intermediate step and is deleted).
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
  }>
): Promise<string[]> => {
  // Now returns array of PNG paths
  const outputPngPaths: string[] = [];

  for (const trade of trades) {
    const entrySignal: Signal = {
      timestamp: trade.entry_time,
      price: trade.entry_price,
      type: 'entry',
      direction: trade.direction || 'long',
    };

    try {
      const pngPath = await generateEntryChart({
        ticker,
        timeframe,
        entryPatternName,
        tradeDate: trade.trade_date,
        entryTimestamp: trade.entry_time,
        entrySignal,
      });
      if (pngPath) {
        // Check if a path was returned (might be empty on error)
        outputPngPaths.push(pngPath);
      }
    } catch (error) {
      // Log the specific error encountered for this trade's chart generation
      console.error(
        `Skipping chart for trade on ${trade.trade_date}. Error during PNG generation:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  return outputPngPaths;
};
