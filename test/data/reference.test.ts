import { describe, it, expect } from 'vitest';
import { createMockSdkClient } from '../mocks/sdkMock';
import {
  checkTradingDay,
  getNextTradingDay,
  getCurrentMarketStatus,
  getBlockTradeStats,
  getMarginStats,
} from '../../src/data/reference';

describe('reference data module', () => {
  const mockClient = createMockSdkClient();

  it('checkTradingDay 应返回布尔值', async () => {
    const result = await checkTradingDay(mockClient, '2026-07-06');
    expect(typeof result).toBe('boolean');
  });

  it('getNextTradingDay 应返回日期字符串', async () => {
    const result = await getNextTradingDay(mockClient, '2026-07-06');
    expect(typeof result).toBe('string');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('getCurrentMarketStatus 应返回字符串', () => {
    const result = getCurrentMarketStatus(mockClient);
    expect(typeof result).toBe('string');
  });

  it('getBlockTradeStats 应返回数组', async () => {
    const result = await getBlockTradeStats(mockClient, '2026-07-06');
    expect(Array.isArray(result)).toBe(true);
  });

  it('getMarginStats 应返回数组', async () => {
    const result = await getMarginStats(mockClient);
    expect(Array.isArray(result)).toBe(true);
  });
});
