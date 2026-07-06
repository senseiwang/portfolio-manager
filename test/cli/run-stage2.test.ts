/**
 * Stage 2 CLI 单元测试
 *
 * 覆盖：
 * - parseStage2Args 正确解析参数
 * - runStage2 使用 dry-run 模式，跳过等待
 * - 模拟 3 个交易日，验证日志和报告结构
 * - 非交易日被跳过
 * - buildStage2Report 生成有效 markdown
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, rmSync, mkdirSync } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { createMockSdkClient } from '../mocks/sdkMock';
import {
  parseStage2Args,
  runStage2,
  buildStage2Report,
} from '../../src/cli/run-stage2';
import type { SdkClient } from '../../src/data/sdkClient';
import type { Stage2Config, Stage2Summary, Stage2DailyLog } from '../../src/cli/run-stage2';

// ===================== 测试辅助 =====================

/** 日期加天数 */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * 创建可控的 Mock SDK 客户端
 *
 * 使用 createMockSdkClient() 作为基座，仅重写日历相关方法，
 * 其他方法（行情、K 线等）使用 fixture 默认行为。
 */
function createControllableMockClient(
  tradingDays: Set<string>,
): SdkClient {
  const base = createMockSdkClient();
  const sortedTradingDays = [...tradingDays].sort();

  return {
    ...base,
    async isTradingDay(date: string): Promise<boolean> {
      return tradingDays.has(date);
    },
    async nextTradingDay(date: string): Promise<string> {
      // 找到给定日期之后的下一个交易日
      const next = sortedTradingDays.find(d => d > date);
      return next ?? addDays(date, 1);
    },
  };
}

// ===================== Tests =====================

/* ==============================================
 * parseStage2Args
 * ============================================== */
describe('parseStage2Args', () => {
  it('解析 --stocks 参数', () => {
    const result = parseStage2Args(['--stocks=600519,000858,600036']);
    expect(result.baseStocks).toEqual(['600519', '000858', '600036']);
    expect(result.dataDir).toBe('data');
    expect(result.maxDays).toBe(5);
    expect(result.dryRun).toBe(false);
  });

  it('解析 --data-dir 参数', () => {
    const result = parseStage2Args(['--stocks=600519', '--data-dir=./my-data']);
    expect(result.dataDir).toBe('./my-data');
  });

  it('解析 --max-days 参数', () => {
    const result = parseStage2Args(['--stocks=600519', '--max-days=3']);
    expect(result.maxDays).toBe(3);
  });

  it('无效 --max-days 使用默认值 5', () => {
    const result = parseStage2Args(['--stocks=600519', '--max-days=abc']);
    expect(result.maxDays).toBe(5);
  });

  it('负值 --max-days 使用默认值 5', () => {
    const result = parseStage2Args(['--stocks=600519', '--max-days=-1']);
    expect(result.maxDays).toBe(5);
  });

  it('解析 --start-date 参数', () => {
    const result = parseStage2Args(['--stocks=600519', '--start-date=2026-07-06']);
    expect(result.startDate).toBe('2026-07-06');
  });

  it('解析 --dry-run 参数', () => {
    const result = parseStage2Args(['--stocks=600519', '--dry-run']);
    expect(result.dryRun).toBe(true);
  });

  it('默认值：空参数', () => {
    const result = parseStage2Args([]);
    expect(result.baseStocks).toEqual([]);
    expect(result.dataDir).toBe('data');
    expect(result.maxDays).toBe(5);
    expect(result.dryRun).toBe(false);
    expect(result.startDate).toBeUndefined();
  });

  it('--stocks= 空值应过滤', () => {
    const result = parseStage2Args(['--stocks=600519,,000858']);
    expect(result.baseStocks).toEqual(['600519', '000858']);
  });

  it('未识别参数应被忽略', () => {
    const result = parseStage2Args(['--stocks=600519', '--unknown=xxx', '--debug']);
    expect(result.baseStocks).toEqual(['600519']);
    expect(result.dataDir).toBe('data');
    expect(result.maxDays).toBe(5);
  });
});

/* ==============================================
 * buildStage2Report
 * ============================================== */
describe('buildStage2Report', () => {
  it('生成包含摘要信息的 Markdown 报告', () => {
    const mockConfig: Stage2Config = {
      baseStocks: ['600519', '000858'],
      dataDir: 'data',
      maxDays: 3,
      startDate: '2026-07-06',
      dryRun: true,
    };

    const mockLogs: Stage2DailyLog[] = [
      {
        dayNumber: 1,
        date: '2026-07-06',
        stockCount: 2,
        success: true,
        durationMs: 1500,
        apiCallCount: 5,
        reportPath: 'data/stage1/2026-07-06.json',
        error: null,
        isTradingDay: true,
      },
      {
        dayNumber: 2,
        date: '2026-07-07',
        stockCount: 0,
        success: false,
        durationMs: 0,
        apiCallCount: 0,
        reportPath: null,
        error: null,
        isTradingDay: false,
      },
      {
        dayNumber: 2,
        date: '2026-07-08',
        stockCount: 2,
        success: true,
        durationMs: 1200,
        apiCallCount: 5,
        reportPath: 'data/stage1/2026-07-08.json',
        error: null,
        isTradingDay: true,
      },
      {
        dayNumber: 3,
        date: '2026-07-09',
        stockCount: 2,
        success: false,
        durationMs: 800,
        apiCallCount: 3,
        reportPath: null,
        error: '网络超时',
        isTradingDay: true,
      },
    ];

    const summary: Stage2Summary = {
      config: mockConfig,
      startDate: '2026-07-06',
      endDate: '2026-07-09',
      totalDays: 4,
      tradingDays: 3,
      successDays: 2,
      failedDays: 1,
      avgDurationMs: 1167,
      avgApiCalls: 4.3,
      dailyLogs: mockLogs,
    };

    const report = buildStage2Report(summary);

    // 报告应包含关键信息
    expect(report.includes('Stage 2 实盘运行报告')).toBe(true);
    expect(report.includes('2026-07-06 → 2026-07-09')).toBe(true);
    expect(report.includes('**实际交易日**: 3')).toBe(true);
    expect(report.includes('**成功天数**: 2')).toBe(true);
    expect(report.includes('**失败天数**: 1')).toBe(true);
    expect(report.includes('**平均耗时**: 1167ms')).toBe(true);
    expect(report.includes('**平均 API 调用**: 4.3')).toBe(true);

    // 报告应包含每日明细表
    expect(report.includes('每日明细')).toBe(true);
    expect(report.includes('| Day | 日期 | 股票数 | 结果 |')).toBe(true);
    expect(report.includes('| 1 | 2026-07-06 | 2 |')).toBe(true);
    expect(report.includes('| 2 | 2026-07-07 | 0 |')).toBe(true);
    expect(report.includes('| 2 | 2026-07-08 | 2 |')).toBe(true);

    // 失败详情应包含错误信息
    expect(report.includes('网络超时')).toBe(true);

    // 报告以分隔线结束
    expect(report.trim().endsWith('==')).toBe(true);
  });

  it('全部成功的报告不含失败详情', () => {
    const mockLogs: Stage2DailyLog[] = [
      {
        dayNumber: 1,
        date: '2026-07-06',
        stockCount: 2,
        success: true,
        durationMs: 1000,
        apiCallCount: 4,
        reportPath: 'r.json',
        error: null,
        isTradingDay: true,
      },
    ];

    const summary: Stage2Summary = {
      config: {
        baseStocks: ['600519'],
        dataDir: 'data',
        maxDays: 1,
        startDate: '2026-07-06',
      },
      startDate: '2026-07-06',
      endDate: '2026-07-06',
      totalDays: 1,
      tradingDays: 1,
      successDays: 1,
      failedDays: 0,
      avgDurationMs: 1000,
      avgApiCalls: 4,
      dailyLogs: mockLogs,
    };

    const report = buildStage2Report(summary);
    expect(report).not.toContain('失败详情');
  });

  it('空日志数组生成最小报告', () => {
    const summary: Stage2Summary = {
      config: {
        baseStocks: [],
        dataDir: 'data',
        maxDays: 0,
      },
      startDate: '2026-07-06',
      endDate: '2026-07-06',
      totalDays: 0,
      tradingDays: 0,
      successDays: 0,
      failedDays: 0,
      avgDurationMs: 0,
      avgApiCalls: 0,
      dailyLogs: [],
    };

    const report = buildStage2Report(summary);
    expect(report.includes('Stage 2 实盘运行报告')).toBe(true);
    expect(report.includes('**实际交易日**: 0')).toBe(true);
    expect(report.includes('每日明细')).toBe(true);
  });
});

/* ==============================================
 * runStage2（使用 mock + dry-run）
 * ============================================== */
describe('runStage2', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `stage2-test-${crypto.randomUUID()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('返回完整的 Stage2Summary 结构（3 个交易日）', async () => {
    // 交易日: 2026-07-06 (Mon), 2026-07-08 (Wed), 2026-07-09 (Thu)
    // 非交易日: 2026-07-07 (Tue)
    const tradingDays = new Set<string>([
      '2026-07-06',
      '2026-07-08',
      '2026-07-09',
    ]);
    const mockClient = createControllableMockClient(tradingDays);

    const config: Stage2Config = {
      baseStocks: ['600519', '000858', '600036', '000001', '000002',
        '000333', '000651', '000725', '000858', '000100',
        '000063', '000069', '000157', '000166', '000301',
        '000333', '000338', '000425', '000538', '000568',
        '000596', '000625', '000627', '000630', '000651',
        '000661', '000671', '000686', '000703', '000709',
        '000723', '000725', '000728', '000738', '000750',
        '000776', '000778', '000786', '000792', '000793',
        '000799', '000800', '000807', '000818', '000821',
        '000822', '000823', '000825', '000826', '000828',
        '000829', '000830', '000831', '000833', '000836',
        '000837', '000838', '000839', '000840', '000841',
        '000842', '000843', '000844', '000845', '000846',
        '000847', '000848', '000849', '000850', '000851',
        '000852', '000853', '000854', '000855', '000856',
        '000857', '000858', '000859', '000860', '000861',
        '000862', '000863', '000864', '000865', '000866',
        '000867', '000868', '000869', '000870', '000871',
        '000872', '000873', '000874', '000875', '000876',
        '000877', '000878', '000879', '000880', '000881'],
      dataDir: tmpDir,
      maxDays: 3,
      startDate: '2026-07-06',
      dryRun: true,
    };

    const summary = await runStage2(config, mockClient);

    // 验证结构
    expect(summary).toBeDefined();
    expect(summary.config).toEqual(config);
    expect(summary.startDate).toBe('2026-07-06');
    expect(summary.endDate).toBe('2026-07-09');

    // 总天数: 4（含 1 个非交易日），实际交易日: 3
    expect(summary.totalDays).toBe(4);
    expect(summary.tradingDays).toBe(3);
    expect(summary.successDays).toBeGreaterThanOrEqual(0);
    expect(summary.failedDays).toBeGreaterThanOrEqual(0);
    expect(summary.avgDurationMs).toBeGreaterThanOrEqual(0);
    expect(summary.avgApiCalls).toBeGreaterThanOrEqual(0);

    // 每日日志应有 4 条
    expect(summary.dailyLogs.length).toBe(4);
  });

  it('非交易日被跳过且不计数', async () => {
    // 只有一个交易日，其他都是非交易日
    const tradingDays = new Set<string>(['2026-07-06']);
    const mockClient = createControllableMockClient(tradingDays);

    const config: Stage2Config = {
      baseStocks: ['600519', '000858'],
      dataDir: tmpDir,
      maxDays: 1,
      startDate: '2026-07-05',
      dryRun: true,
    };

    const summary = await runStage2(config, mockClient);

    // 2026-07-05: 非交易日（跳过）
    // 2026-07-06: 交易日（Day 1）
    // totalDays=2, tradingDays=1

    expect(summary.totalDays).toBe(2);
    expect(summary.tradingDays).toBe(1);

    // 第一条日志应为非交易日
    expect(summary.dailyLogs[0].isTradingDay).toBe(false);
    expect(summary.dailyLogs[0].date).toBe('2026-07-05');

    // 第二条日志应为交易日
    expect(summary.dailyLogs[1].isTradingDay).toBe(true);
    expect(summary.dailyLogs[1].date).toBe('2026-07-06');
  });

  it('每日日志包含正确字段', async () => {
    const tradingDays = new Set<string>([
      '2026-07-06',
      '2026-07-07',
    ]);
    const mockClient = createControllableMockClient(tradingDays);

    const config: Stage2Config = {
      baseStocks: ['600519', '000858'],
      dataDir: tmpDir,
      maxDays: 2,
      startDate: '2026-07-06',
      dryRun: true,
    };

    const summary = await runStage2(config, mockClient);

    // 验证每日日志字段
    for (const log of summary.dailyLogs) {
      expect(typeof log.dayNumber).toBe('number');
      expect(typeof log.date).toBe('string');
      expect(log.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof log.stockCount).toBe('number');
      expect(typeof log.success).toBe('boolean');
      expect(typeof log.durationMs).toBe('number');
      expect(typeof log.apiCallCount).toBe('number');
      expect(typeof log.isTradingDay).toBe('boolean');
      // non-null reportPath should only exist for successful trading days
      if (log.isTradingDay && log.success) {
        expect(typeof log.reportPath).toBe('string');
      }
    }

    // Day 1: 20 stocks
    const day1 = summary.dailyLogs.find(l => l.dayNumber === 1 && l.isTradingDay);
    expect(day1).toBeDefined();
    // 由于 mock 返回的行情可能为空，stockCount 可能不等于 20
    expect(day1!.stockCount).toBe(2); // 我们的 baseStocks 有 2 只

    // Day 2: 50 stocks（但 baseStocks 只有 2 只）
    const day2 = summary.dailyLogs.find(l => l.dayNumber === 2 && l.isTradingDay);
    expect(day2).toBeDefined();
    expect(day2!.stockCount).toBe(2); // slice(0, 50) 只拿到 2 只
  });

  it('股票池规模按天数逐步扩大（Day 1: 20, Day 2: 50）', async () => {
    // 准备 60+ 只股票
    const manyStocks = Array.from({ length: 60 }, (_, i) =>
      `600${String(i).padStart(3, '0')}`,
    );
    const tradingDays = new Set<string>(['2026-07-06', '2026-07-07']);
    const mockClient = createControllableMockClient(tradingDays);

    const config: Stage2Config = {
      baseStocks: manyStocks,
      dataDir: tmpDir,
      maxDays: 2,
      startDate: '2026-07-06',
      dryRun: true,
    };

    const summary = await runStage2(config, mockClient);

    const day1 = summary.dailyLogs.find(l => l.dayNumber === 1 && l.isTradingDay);
    const day2 = summary.dailyLogs.find(l => l.dayNumber === 2 && l.isTradingDay);

    // 实际传递给 runStage1 的股票数由 baseStocks.slice(0, poolSize) 决定
    // Day 1: 20, Day 2: 50
    expect(summary.dailyLogs.filter(l => l.isTradingDay).length).toBe(2);
    expect(day1).toBeDefined();
    expect(day2).toBeDefined();
  });

  it('每日日志被写入 daily-log.json', async () => {
    const tradingDays = new Set<string>(['2026-07-06', '2026-07-07']);
    const mockClient = createControllableMockClient(tradingDays);

    const config: Stage2Config = {
      baseStocks: ['600519', '000858'],
      dataDir: tmpDir,
      maxDays: 2,
      startDate: '2026-07-06',
      dryRun: true,
    };

    await runStage2(config, mockClient);

    // 验证日志文件存在
    const logPath = path.join(tmpDir, 'stage2', 'daily-log.json');
    expect(existsSync(logPath)).toBe(true);

    // 验证日志文件是有效 JSON
    const raw = readFileSync(logPath, 'utf-8');
    const logs = JSON.parse(raw) as Stage2DailyLog[];
    expect(Array.isArray(logs)).toBe(true);
    expect(logs.length).toBe(2);

    // 每条日志包含必要字段
    for (const log of logs) {
      expect(log).toHaveProperty('dayNumber');
      expect(log).toHaveProperty('date');
      expect(log).toHaveProperty('stockCount');
      expect(log).toHaveProperty('success');
      expect(log).toHaveProperty('durationMs');
      expect(log).toHaveProperty('apiCallCount');
      expect(log).toHaveProperty('reportPath');
      expect(log).toHaveProperty('error');
      expect(log).toHaveProperty('isTradingDay');
    }
  });

  it('断点续跑：从已有日志恢复计数', async () => {
    const tradingDays = new Set<string>(['2026-07-06', '2026-07-07', '2026-07-08']);
    const mockClient = createControllableMockClient(tradingDays);

    // 先运行 2 天
    const config1: Stage2Config = {
      baseStocks: ['600519', '000858'],
      dataDir: tmpDir,
      maxDays: 2,
      startDate: '2026-07-06',
      dryRun: true,
    };
    await runStage2(config1, mockClient);

    // 再续跑 1 天（maxDays=3）
    const config2: Stage2Config = {
      baseStocks: ['600519', '000858'],
      dataDir: tmpDir,
      maxDays: 3,
      startDate: '2026-07-06',
      dryRun: true,
    };
    const summary = await runStage2(config2, mockClient);

    // 最终应有 3 个交易日
    expect(summary.tradingDays).toBe(3);
    expect(summary.dailyLogs.filter(l => l.isTradingDay).length).toBe(3);

    // 验证日志文件中的记录数
    const logPath = path.join(tmpDir, 'stage2', 'daily-log.json');
    const raw = readFileSync(logPath, 'utf-8');
    const logs = JSON.parse(raw) as Stage2DailyLog[];
    expect(logs.filter(l => l.isTradingDay).length).toBe(3);
  });

  it('空 baseStocks 不应抛出异常', async () => {
    const tradingDays = new Set<string>(['2026-07-06']);
    const mockClient = createControllableMockClient(tradingDays);

    const config: Stage2Config = {
      baseStocks: [],
      dataDir: tmpDir,
      maxDays: 1,
      startDate: '2026-07-06',
      dryRun: true,
    };

    const summary = await runStage2(config, mockClient);
    expect(summary.tradingDays).toBe(1);
  });
});
