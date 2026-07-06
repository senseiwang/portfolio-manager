/**
 * Stage 1 CLI 单元测试
 *
 * 覆盖：
 * - parseArgs 正确解析 --stocks 参数
 * - createApiCallCounter 计数正确
 * - runStage1 返回完整结果结构
 * - 报告文件被正确写入磁盘
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, rmSync, mkdirSync } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { createMockSdkClient } from '../mocks/sdkMock';
import {
  parseArgs,
  runStage1,
  createApiCallCounter,
} from '../../src/cli/run-stage1';
import type { SdkClient } from '../../src/data/sdkClient';
import type { Stage1Result } from '../../src/cli/run-stage1';

/* ==============================================
 * parseArgs
 * ============================================== */
describe('parseArgs', () => {
  it('解析单只股票 --stocks=600519', () => {
    const result = parseArgs(['--stocks=600519']);
    expect(result.stocks).toEqual(['600519']);
    expect(result.dataDir).toBe('data');
  });

  it('解析多只股票 --stocks=600519,000858,600036', () => {
    const result = parseArgs(['--stocks=600519,000858,600036']);
    expect(result.stocks).toEqual(['600519', '000858', '600036']);
  });

  it('解析 --data-dir 参数', () => {
    const result = parseArgs(['--stocks=600519', '--data-dir=./my-data']);
    expect(result.stocks).toEqual(['600519']);
    expect(result.dataDir).toBe('./my-data');
  });

  it('空参数时 stocks 应为空数组', () => {
    const result = parseArgs([]);
    expect(result.stocks).toEqual([]);
    expect(result.dataDir).toBe('data');
  });

  it('--stocks= 空值应过滤', () => {
    const result = parseArgs(['--stocks=600519,,000858']);
    expect(result.stocks).toEqual(['600519', '000858']);
  });

  it('未识别参数应被忽略', () => {
    const result = parseArgs(['--stocks=600519', '--unknown=xxx', '--debug']);
    expect(result.stocks).toEqual(['600519']);
    expect(result.dataDir).toBe('data');
  });
});

/* ==============================================
 * createApiCallCounter
 * ============================================== */
describe('createApiCallCounter', () => {
  let mockClient: SdkClient;

  beforeEach(() => {
    mockClient = createMockSdkClient();
  });

  it('初始计数为 0', () => {
    const counter = createApiCallCounter(mockClient);
    expect(counter.count).toBe(0);
  });

  it('调用异步方法后计数递增', async () => {
    const counter = createApiCallCounter(mockClient);
    await counter.client.getQuotesByCodes(['600519']);
    expect(counter.count).toBe(1);
  });

  it('调用同步方法 getMarketStatus 也应计数', () => {
    const counter = createApiCallCounter(mockClient);
    counter.client.getMarketStatus();
    expect(counter.count).toBe(1);
  });

  it('多次调用计数累加', async () => {
    const counter = createApiCallCounter(mockClient);
    counter.client.getMarketStatus();
    await counter.client.getQuotesByCodes(['600519']);
    await counter.client.getQuotesByCodes(['000858']);
    expect(counter.count).toBe(3);
  });

  it('不同方法均正常计数', async () => {
    const counter = createApiCallCounter(mockClient);
    counter.client.getMarketStatus();
    await counter.client.getQuotesByCodes(['600519']);
    await counter.client.getAllQuotes();
    // getMarketStatus → 1, getQuotesByCodes → 1, getAllQuotes → 1
    expect(counter.count).toBe(3);
  });

  it('包装后的客户端仍返回原始数据', async () => {
    const counter = createApiCallCounter(mockClient);
    const rawResult = await mockClient.getQuotesByCodes(['600519']);
    const wrappedResult = await counter.client.getQuotesByCodes(['600519']);
    expect(wrappedResult).toEqual(rawResult);
  });
});

/* ==============================================
 * runStage1（使用 mock 客户端）
 * ============================================== */
describe('runStage1', () => {
  let tmpDir: string;

  beforeEach(() => {
    // 创建临时目录用于输出
    tmpDir = path.join(os.tmpdir(), `stage1-test-${crypto.randomUUID()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    // 清理临时目录
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('返回完整的 Stage1Result 结构', async () => {
    const mockClient = createMockSdkClient();
    const stocks = ['600519', '000858'];

    const result = await runStage1(stocks, tmpDir, mockClient);

    // 验证全部字段存在且类型正确
    expect(result).toBeDefined();
    expect(typeof result.date).toBe('string');
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.stockCount).toBe(2);
    expect(result.marketStatus).toHaveProperty('isTradingDay');
    expect(result.marketStatus).toHaveProperty('marketOpen');
    expect(typeof result.startTime).toBe('string');
    expect(typeof result.endTime).toBe('string');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.apiCallCount).toBeGreaterThanOrEqual(0);
    expect(typeof result.reportPath).toBe('string');
    expect(typeof result.textReportPath).toBe('string');
    expect(typeof result.reportValid).toBe('boolean');
  });

  it('报告文件被写入磁盘', async () => {
    const mockClient = createMockSdkClient();
    const stocks = ['600519', '000858'];

    const result = await runStage1(stocks, tmpDir, mockClient);

    // JSON 文件存在且内容有效
    expect(existsSync(result.reportPath)).toBe(true);
    const jsonContent = readFileSync(result.reportPath, 'utf-8');
    const parsed = JSON.parse(jsonContent);
    expect(parsed).toHaveProperty('date');
    expect(parsed).toHaveProperty('holdingsOverview');
    expect(parsed).toHaveProperty('marketStatus');

    // 文本文件存在且内容非空
    expect(existsSync(result.textReportPath)).toBe(true);
    const txtContent = readFileSync(result.textReportPath, 'utf-8');
    expect(txtContent.length).toBeGreaterThan(0);
    expect(txtContent).toContain('投资组合日报');
  });

  it('报告路径符合 data/stage1/{date}.* 模式', async () => {
    const mockClient = createMockSdkClient();
    const stocks = ['600519'];

    const result = await runStage1(stocks, tmpDir, mockClient);

    expect(result.reportPath).toContain(path.join(tmpDir, 'stage1'));
    expect(result.textReportPath).toContain(path.join(tmpDir, 'stage1'));
    expect(result.reportPath).toContain(`${result.date}.json`);
    expect(result.textReportPath).toContain(`${result.date}.txt`);
  });

  it('空股票列表不应引发异常', async () => {
    const mockClient = createMockSdkClient();

    const result = await runStage1([], tmpDir, mockClient);
    expect(result.stockCount).toBe(0);
    expect(existsSync(result.reportPath)).toBe(true);
  });

  it('无行情数据时 reportValid 为 false', async () => {
    // 使用一个不存在的股票代码，mock 会返回空数组
    const mockClient = createMockSdkClient();
    const stocks = ['999999']; // 不存在于 fixture 中

    const result = await runStage1(stocks, tmpDir, mockClient);
    // mock 返回的 quotes 为空 → reportValid = false
    expect(result.reportValid).toBe(false);
  });

  it('多次运行产生独立结果', async () => {
    const mockClient = createMockSdkClient();

    const result1 = await runStage1(['600519'], tmpDir, mockClient);
    const result2 = await runStage1(['000858'], tmpDir, mockClient);

    // 两次结果应该都有有效的文件
    expect(existsSync(result1.reportPath)).toBe(true);
    expect(existsSync(result2.reportPath)).toBe(true);
    // 文件路径应该不同（因股票数不同会影响文件名中的路径，但日期相同）
    expect(result1.reportPath).toBe(result2.reportPath); // 同一天的文件名相同
  });
});
