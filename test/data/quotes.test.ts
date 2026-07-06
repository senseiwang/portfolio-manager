import { describe, it, expect } from 'vitest';
import { createMockSdkClient } from '../mocks/sdkMock';
import {
  getAllMarketQuotes,
  getQuotesByCodes,
  getStockKLine,
  searchStocks,
} from '../../src/data/quotes';

describe('quotes data module', () => {
  const mockClient = createMockSdkClient();

  it('getAllMarketQuotes 应返回行情数组', async () => {
    const result = await getAllMarketQuotes(mockClient);
    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(result[0]).toHaveProperty('code');
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).toHaveProperty('price');
    }
  });

  it('getQuotesByCodes 应返回行情数组', async () => {
    const result = await getQuotesByCodes(mockClient, ['600519']);
    expect(Array.isArray(result)).toBe(true);
  });

  it('getStockKLine 应返回 K 线数组', async () => {
    const result = await getStockKLine(mockClient, '600519', '2026-06-01', '2026-07-06');
    expect(Array.isArray(result)).toBe(true);
  });

  it('searchStocks 应返回搜索结果', async () => {
    const result = await searchStocks(mockClient, '600519');
    expect(Array.isArray(result)).toBe(true);
  });
});
