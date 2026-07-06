import { describe, it, expect } from 'vitest';
import { createMockSdkClient } from '../mocks/sdkMock';
import {
  getIndividualFundFlow,
  getMarketFundFlow,
} from '../../src/data/fundFlow';

describe('fundFlow data module', () => {
  const mockClient = createMockSdkClient();

  it('getIndividualFundFlow 应返回资金流向数组', async () => {
    const result = await getIndividualFundFlow(mockClient, '600519');
    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(result[0]).toHaveProperty('date');
      expect(result[0]).toHaveProperty('mainNetInflow');
    }
  });

  it('getMarketFundFlow 应返回大盘资金流向', async () => {
    const result = await getMarketFundFlow(mockClient);
    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(result[0]).toHaveProperty('shClose');
    }
  });
});
