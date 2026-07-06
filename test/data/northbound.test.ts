import { describe, it, expect } from 'vitest';
import { createMockSdkClient } from '../mocks/sdkMock';
import {
  getNorthboundFlowSummary,
  getNorthboundTopHoldings,
} from '../../src/data/northbound';

describe('northbound data module', () => {
  const mockClient = createMockSdkClient();

  it('getNorthboundFlowSummary 应返回汇总数组', async () => {
    const result = await getNorthboundFlowSummary(mockClient);
    expect(Array.isArray(result)).toBe(true);
  });

  it('getNorthboundTopHoldings 应返回排行数组', async () => {
    const result = await getNorthboundTopHoldings(mockClient, 10);
    expect(Array.isArray(result)).toBe(true);
  });
});
