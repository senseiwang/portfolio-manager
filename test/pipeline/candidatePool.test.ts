/**
 * 候选池批处理测试
 *
 * 覆盖：
 * - 全流程 mock 数据跑通，报告符合 schema
 * - 候选池为空
 * - 部分 K 线拉取失败
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createMockSdkClient } from '../mocks/sdkMock';
import { runDailyBatch } from '../../src/pipeline/candidatePool';

describe('runDailyBatch', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'candidate-pool-test-'));
  });

  it('应正确执行完整流程并生成报告', async () => {
    const mockClient = createMockSdkClient();

    // 只使用流通市值 >= 50 亿的股票（确保能通过 quickFilter）
    const originalGetAll = mockClient.getAllQuotes.bind(mockClient);
    mockClient.getAllQuotes = async () => {
      const all = await originalGetAll();
      return all.filter(q => (q.circulatingMarketCap ?? 0) >= 50).slice(0, 5);
    };

    const report = await runDailyBatch(mockClient, {
      dataDir: tmpDir,
      toDate: '2026-07-06',
    });

    // 报告结构验证
    expect(report).toHaveProperty('date', '2026-07-06');
    expect(report.totalQuotes).toBe(5);
    expect(report.afterQuickFilter).toBe(5);
    expect(Array.isArray(report.candidates)).toBe(true);

    // 文件写入验证
    const filePath = join(tmpDir, 'candidate-pool-2026-07-06.json');
    expect(existsSync(filePath)).toBe(true);

    const fileContent = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(fileContent.date).toBe('2026-07-06');
  }, 30000);

  it('候选池为空时不应崩溃', async () => {
    const emptyMock = createMockSdkClient();
    emptyMock.getAllQuotes = async () => [];

    const report = await runDailyBatch(emptyMock, {
      dataDir: tmpDir,
      toDate: '2026-07-06',
    });

    expect(report.totalQuotes).toBe(0);
    expect(report.afterQuickFilter).toBe(0);
    expect(report.candidates).toEqual([]);
  });

  it('部分 K 线拉取失败应跳过失败股票而不影响整体流程', async () => {
    const mockClient = createMockSdkClient();

    // 使用高市值股票确保通过 quickFilter
    const originalGetAll = mockClient.getAllQuotes.bind(mockClient);
    mockClient.getAllQuotes = async () => {
      const all = await originalGetAll();
      return all.filter(q => (q.circulatingMarketCap ?? 0) >= 50).slice(0, 5);
    };

    // 模拟部分 K 线拉取失败
    let callCount = 0;
    const originalGetKLine = mockClient.getKLine.bind(mockClient);
    mockClient.getKLine = async (symbol: string, from: string, to: string) => {
      callCount++;
      if (callCount % 3 === 0) {
        throw new Error(`模拟 K 线拉取失败: ${symbol}`);
      }
      return originalGetKLine(symbol, from, to);
    };

    const report = await runDailyBatch(mockClient, {
      dataDir: tmpDir,
      toDate: '2026-07-06',
    });

    expect(report.totalQuotes).toBe(5);
    expect(report.afterQuickFilter).toBe(5);
    expect(Array.isArray(report.candidates)).toBe(true);
  }, 30000);
});
