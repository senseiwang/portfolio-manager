/**
 * 盘中事件监听测试（T-3.2）
 *
 * 覆盖：
 * - 首次轮询，从 mock 中提取三源事件
 * - 重复轮询，同股票不重复追加
 * - 数据源全空
 * - 文件 I/O 正确性
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createMockSdkClient } from '../mocks/sdkMock';
import { pollMarketEvents, readIntradayEvents } from '../../src/pipeline/eventWatcher';

describe('pollMarketEvents', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'event-watcher-test-'));
  });

  it('首次轮询应从涨停池 / 盘口异动 / 板块异动中提取事件', async () => {
    const client = createMockSdkClient();

    const result = await pollMarketEvents(client, tmpDir);

    // 断言返回结构
    expect(result).toHaveProperty('date');
    expect(result.date).toBe(new Date().toISOString().slice(0, 10));
    expect(result.totalEvents).toBeGreaterThan(0);

    // 验证文件落盘
    const filePath = join(tmpDir, `intraday-events-${result.date}.json`);
    expect(existsSync(filePath)).toBe(true);

    const fileContent = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(fileContent).toHaveProperty('date', result.date);
    expect(Array.isArray(fileContent.events)).toBe(true);

    // 验证事件结构
    for (const event of fileContent.events) {
      expect(event).toHaveProperty('code');
      expect(event).toHaveProperty('name');
      expect(event).toHaveProperty('eventType');
      expect(['limit_up', 'stock_change', 'board_change']).toContain(event.eventType);
      expect(event).toHaveProperty('eventLabel');
    }
  });

  it('同一只股票多次轮询不应重复追加', async () => {
    const client = createMockSdkClient();

    // 第一次轮询
    const result1 = await pollMarketEvents(client, tmpDir);

    // 第二次轮询（相同的数据源，应无新事件）
    const result2 = await pollMarketEvents(client, tmpDir);

    // 新事件数为 0
    expect(result2.newEvents).toHaveLength(0);
    // 总事件数不变
    expect(result2.totalEvents).toBe(result1.totalEvents);
  });

  it('数据源全空（无涨停、无异动）时应返回空事件', async () => {
    const emptyClient = createMockSdkClient();
    emptyClient.getZTPool = async () => [];
    emptyClient.getStockChanges = async () => [];
    emptyClient.getBoardChanges = async () => [];

    const result = await pollMarketEvents(emptyClient, tmpDir);

    expect(result.newEvents).toHaveLength(0);
    expect(result.totalEvents).toBe(0);

    // 文件仍应存在（空事件文件）
    const filePath = join(tmpDir, `intraday-events-${result.date}.json`);
    expect(existsSync(filePath)).toBe(true);
  });

  it('部分数据源异常不应影响其他源', async () => {
    const client = createMockSdkClient();
    // 让 ztPool 抛异常
    client.getZTPool = async () => { throw new Error('网络错误'); };

    const result = await pollMarketEvents(client, tmpDir);

    // 仍应有来自 stockChanges 和 boardChanges 的事件
    expect(result.totalEvents).toBeGreaterThan(0);
  });
});

describe('readIntradayEvents', () => {
  it('文件不存在时应返回空数组', () => {
    const events = readIntradayEvents('2026-07-06', '/tmp/nonexistent-dir');
    expect(events).toEqual([]);
  });

  it('应正确读取已写入的事件文件', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'event-reader-test-'));
    const client = createMockSdkClient();

    await pollMarketEvents(client, tmpDir);
    const date = new Date().toISOString().slice(0, 10);

    const events = readIntradayEvents(date, tmpDir);
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBeGreaterThan(0);
  });
});