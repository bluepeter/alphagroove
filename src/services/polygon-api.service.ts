import axios from 'axios';
import chalk from 'chalk';

// Polygon.io API interfaces
export interface PolygonBar {
  t: number; // timestamp in milliseconds
  o: number; // open price
  h: number; // high price
  l: number; // low price
  c: number; // close price
  v: number; // volume
}

export interface PolygonResponse {
  ticker: string;
  queryCount: number;
  resultsCount: number;
  adjusted: boolean;
  results: PolygonBar[];
  status: string;
  request_id: string;
  next_url?: string;
}

export class PolygonApiService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Fetch data from Polygon.io API for a date range
   */
  fetchPolygonData = async (
    ticker: string,
    fromDate: string,
    toDate: string,
    multiplier = 1,
    timespan = 'minute'
  ): Promise<PolygonBar[]> => {
    const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${fromDate}/${toDate}?adjusted=true&sort=asc&limit=50000&apikey=${this.apiKey}`;

    console.log(chalk.dim(`Fetching data from Polygon API...`));
    if (process.env.DEBUG) {
      console.log(chalk.dim(`Polygon URL: ${url}`));
    }

    try {
      const response = await axios.get<PolygonResponse>(url);
      const data = response.data;

      if (!data.results || data.results.length === 0) {
        throw new Error(
          `No data returned from Polygon API for ${ticker} from ${fromDate} to ${toDate}`
        );
      }

      // Accept both OK and DELAYED status
      if (data.status !== 'OK' && data.status !== 'DELAYED') {
        throw new Error(`Polygon API returned status: ${data.status}`);
      }

      if (data.status === 'DELAYED') {
        console.log(chalk.yellow('⚠️  Using delayed data from Polygon API'));
      }

      console.log(chalk.dim(`Retrieved ${data.results.length} bars from Polygon API`));
      return data.results;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Polygon API request failed: ${error.response?.status} ${error.response?.statusText}`
        );
      }
      throw error;
    }
  };
}
