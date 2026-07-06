import { describe, it, expect } from 'vitest';
import { createMockSdkClient } from '../mocks/sdkMock';
import {
  getDragonTigerList,
  getDragonTigerSeats,
} from '../../src/data/dragonTiger';

describe('dragonTiger data module', () => {
  const mockClient = createMockSdkClient();

  it('getDragonTigerList 应返回数组', async () => {
    const result = await getDragonTigerList(mockClient, '2026-07-06');
    expect(Array.isArray(result)).toBe(true);
  });

  it('getDragonTigerSeats 应返回数组', async () => {
    const result = await getDragonTigerSeats(mockClient, '600519', '2026-07-06');
    expect(Array.isArray(result)).toBe(true);
  });
});
