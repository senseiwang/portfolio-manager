import { describe, it, expect } from 'vitest';
import { createMockSdkClient } from '../mocks/sdkMock';
import {
  getLimitUpPool,
  getStockMarketChanges,
} from '../../src/data/marketEvent';

describe('marketEvent data module', () => {
  const mockClient = createMockSdkClient();

  it('getLimitUpPool 应返回涨停池数组', async () => {
    const result = await getLimitUpPool(mockClient);
    expect(Array.isArray(result)).toBe(true);
  });

  it('getStockMarketChanges 应返回异动数组', async () => {
    const result = await getStockMarketChanges(mockClient);
    expect(Array.isArray(result)).toBe(true);
  });
});
