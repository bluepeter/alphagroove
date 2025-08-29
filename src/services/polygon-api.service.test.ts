import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { PolygonApiService, type PolygonResponse, type PolygonBar } from './polygon-api.service';

// Mock axios
vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    isAxiosError: vi.fn(),
  },
}));

const mockedAxios = {
  get: vi.mocked(axios.get),
  isAxiosError: vi.mocked(axios.isAxiosError),
};

describe('PolygonApiService', () => {
  let service: PolygonApiService;
  const mockApiKey = 'test-api-key';

  beforeEach(() => {
    service = new PolygonApiService(mockApiKey);
    vi.clearAllMocks();
  });

  describe('fetchPolygonData', () => {
    const mockPolygonBars: PolygonBar[] = [
      { t: 1640995200000, o: 100, h: 105, l: 95, c: 102, v: 1000 },
      { t: 1640995260000, o: 102, h: 107, l: 98, c: 104, v: 1500 },
    ];

    const mockResponse: PolygonResponse = {
      ticker: 'SPY',
      queryCount: 1,
      resultsCount: 2,
      adjusted: true,
      results: mockPolygonBars,
      status: 'OK',
      request_id: 'test-request-id',
    };

    it('should fetch data successfully with OK status', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockResponse });

      const result = await service.fetchPolygonData('SPY', '2022-01-01', '2022-01-02');

      expect(result).toEqual(mockPolygonBars);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining(
          'https://api.polygon.io/v2/aggs/ticker/SPY/range/1/minute/2022-01-01/2022-01-02'
        )
      );
      expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining(`apikey=${mockApiKey}`));
    });

    it('should fetch data successfully with DELAYED status', async () => {
      const delayedResponse = { ...mockResponse, status: 'DELAYED' };
      mockedAxios.get.mockResolvedValue({ data: delayedResponse });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await service.fetchPolygonData('SPY', '2022-01-01', '2022-01-02');

      expect(result).toEqual(mockPolygonBars);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Using delayed data from Polygon API')
      );

      consoleSpy.mockRestore();
    });

    it('should throw error when no results returned', async () => {
      const noResultsResponse = { ...mockResponse, results: [] };
      mockedAxios.get.mockResolvedValue({ data: noResultsResponse });

      await expect(service.fetchPolygonData('SPY', '2022-01-01', '2022-01-02')).rejects.toThrow(
        'No data returned from Polygon API'
      );
    });

    it('should throw error when results is null', async () => {
      const nullResultsResponse = { ...mockResponse, results: null as any };
      mockedAxios.get.mockResolvedValue({ data: nullResultsResponse });

      await expect(service.fetchPolygonData('SPY', '2022-01-01', '2022-01-02')).rejects.toThrow(
        'No data returned from Polygon API'
      );
    });

    it('should throw error for non-OK/DELAYED status', async () => {
      const errorResponse = { ...mockResponse, status: 'ERROR' };
      mockedAxios.get.mockResolvedValue({ data: errorResponse });

      await expect(service.fetchPolygonData('SPY', '2022-01-01', '2022-01-02')).rejects.toThrow(
        'Polygon API returned status: ERROR'
      );
    });

    it('should handle axios errors', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 404, statusText: 'Not Found' },
      };
      mockedAxios.get.mockRejectedValue(axiosError);
      mockedAxios.isAxiosError.mockReturnValue(true);

      await expect(service.fetchPolygonData('SPY', '2022-01-01', '2022-01-02')).rejects.toThrow(
        'Polygon API request failed: 404 Not Found'
      );
    });

    it('should handle non-axios errors', async () => {
      const genericError = new Error('Network error');
      mockedAxios.get.mockRejectedValue(genericError);
      mockedAxios.isAxiosError.mockReturnValue(false);

      await expect(service.fetchPolygonData('SPY', '2022-01-01', '2022-01-02')).rejects.toThrow(
        'Network error'
      );
    });

    it('should use custom multiplier and timespan', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockResponse });

      await service.fetchPolygonData('SPY', '2022-01-01', '2022-01-02', 5, 'hour');

      expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining('/range/5/hour/'));
    });

    it('should log debug URL when DEBUG env var is set', async () => {
      const originalDebug = process.env.DEBUG;
      process.env.DEBUG = 'true';

      mockedAxios.get.mockResolvedValue({ data: mockResponse });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await service.fetchPolygonData('SPY', '2022-01-01', '2022-01-02');

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Polygon URL:'));

      consoleSpy.mockRestore();
      process.env.DEBUG = originalDebug;
    });
  });
});
