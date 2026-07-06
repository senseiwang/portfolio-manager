/**
 * Stage 3 CLI 单元测试
 *
 * 覆盖：
 * - parseStage3Args 参数解析
 * - createLiveEventWatcher 单轮采集
 * - runStage3 dry-run 模式多轮采集
 * - generateStage3Report 报告生成
 * - stable 判定逻辑
 */
import { describe, it, expect } from 'vitest';
import { createMockSdkClient } from '../mocks/sdkMock';
import {
  parseStage3Args,
  createLiveEventWatcher,
  runStage3,
  generateStage3Report,
} from '../../src/cli/run-stage3';
import type { Stage3Config, Stage3Summary } from '../../src/cli/run-stage3';

/* ==============================================
 * parseStage3Args
 * ============================================== */
describe('parseStage3Args', () => {
  it('空参数使用全部默认值', () => {
    const result = parseStage3Args([]);
    expect(result.dataDir).toBe('data');
    expect(result.pollIntervalMs).toBe(30000);
    expect(result.maxRounds).toBe(480);
    expect(result.dryRun).toBe(false);
    expect(result.stockCodes).toEqual([]);
  });

  it('解析 --dry-run', () => {
    const result = parseStage3Args(['--dry-run']);
    expect(result.dryRun).toBe(true);
    expect(result.maxRounds).toBe(480);
  });

  it('解析 --max-rounds=5', () => {
    const result = parseStage3Args(['--max-rounds=5']);
    expect(result.maxRounds).toBe(5);
  });

  it('解析 --stocks=600519,000858', () => {
    const result = parseStage3Args(['--stocks=600519,000858']);
    expect(result.stockCodes).toEqual(['600519', '000858']);
  });

  it('解析 --data-dir 自定义路径', () => {
    const result = parseStage3Args(['--data-dir=./my-data']);
    expect(result.dataDir).toBe('./my-data');
  });

  it('解析 --poll-interval=15000', () => {
    const result = parseStage3Args(['--poll-interval=15000']);
    expect(result.pollIntervalMs).toBe(15000);
  });

  it('无效 --max-rounds 保留默认值', () => {
    const result = parseStage3Args(['--max-rounds=abc']);
    expect(result.maxRounds).toBe(480);
  });

  it('无效 --poll-interval 保留默认值', () => {
    const result = parseStage3Args(['--poll-interval=-1']);
    expect(result.pollIntervalMs).toBe(30000);
  });

  it('--stocks= 空值过滤', () => {
    const result = parseStage3Args(['--stocks=600519,,000858']);
    expect(result.stockCodes).toEqual(['600519', '000858']);
  });

  it('组合多个参数', () => {
    const result = parseStage3Args([
      '--dry-run',
      '--max-rounds=10',
      '--stocks=600519,000858',
      '--data-dir=./output',
      '--poll-interval=5000',
    ]);
    expect(result.dryRun).toBe(true);
    expect(result.maxRounds).toBe(10);
    expect(result.stockCodes).toEqual(['600519', '000858']);
    expect(result.dataDir).toBe('./output');
    expect(result.pollIntervalMs).toBe(5000);
  });
});

/* ==============================================
 * createLiveEventWatcher
 * ============================================== */
describe('createLiveEventWatcher', () => {
  it('返回三个数据源计数和空错误数组', async () => {
    const mockClient = createMockSdkClient();
    const watcher = createLiveEventWatcher(mockClient);
    const result = await watcher();

    expect(result).toHaveProperty('ztPoolCount');
    expect(result).toHaveProperty('stockChangeCount');
    expect(result).toHaveProperty('boardChangeCount');
    expect(result).toHaveProperty('errors');
    expect(Array.isArray(result.errors)).toBe(true);
    expect(result.ztPoolCount).toBeGreaterThan(0);
    expect(result.stockChangeCount).toBeGreaterThan(0);
    expect(result.boardChangeCount).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);
  });

  it('并发获取三个数据源互不影响', async () => {
    const mockClient = createMockSdkClient();
    const watcher = createLiveEventWatcher(mockClient);

    const [r1, r2] = await Promise.all([watcher(), watcher()]);
    // 两次采集结果应一致（mock 数据不变）
    expect(r1.ztPoolCount).toBe(r2.ztPoolCount);
    expect(r1.stockChangeCount).toBe(r2.stockChangeCount);
    expect(r1.boardChangeCount).toBe(r2.boardChangeCount);
  });
});

/* ==============================================
 * runStage3（dry-run 模式）
 * ============================================== */
describe('runStage3（dry-run 模式）', () => {
  const baseConfig: Stage3Config = {
    dataDir: 'data',
    pollIntervalMs: 30000,
    maxRounds: 5,
    dryRun: true,
    stockCodes: [],
  };

  it('返回完整的 Stage3Summary 结构', async () => {
    const mockClient = createMockSdkClient();
    const summary = await runStage3(baseConfig, mockClient);

    expect(summary).toBeDefined();
    expect(summary.config).toEqual(baseConfig);
    expect(typeof summary.startTime).toBe('string');
    expect(typeof summary.endTime).toBe('string');
    expect(summary.totalRounds).toBe(5);
    expect(summary.rounds).toHaveLength(5);
    expect(summary.memoryStartMB).toBeGreaterThan(0);
    expect(summary.memoryEndMB).toBeGreaterThan(0);
    expect(typeof summary.memoryGrowthPercent).toBe('number');
    expect(typeof summary.totalErrors).toBe('number');
    expect(typeof summary.stable).toBe('boolean');
  });

  it('每轮都采集到完整数据', async () => {
    const mockClient = createMockSdkClient();
    const summary = await runStage3(baseConfig, mockClient);

    for (const round of summary.rounds) {
      expect(round.roundNumber).toBeGreaterThan(0);
      expect(round.timestamp).toBeTruthy();
      expect(round.pollDurationMs).toBeGreaterThanOrEqual(0);
      expect(round.ztPoolCount).toBeGreaterThan(0);
      expect(round.stockChangeCount).toBeGreaterThan(0);
      expect(round.boardChangeCount).toBeGreaterThan(0);
      expect(round.memoryMB).toBeGreaterThan(0);
      expect(Array.isArray(round.errors)).toBe(true);
      expect(round.errors).toHaveLength(0);
    }
  });

  it('每轮 roundNumber 从 1 开始连续递增', async () => {
    const mockClient = createMockSdkClient();
    const summary = await runStage3(baseConfig, mockClient);

    for (let i = 0; i < summary.rounds.length; i++) {
      expect(summary.rounds[i].roundNumber).toBe(i + 1);
    }
  });

  it('stable 判定逻辑正确', async () => {
    const mockClient = createMockSdkClient();
    const summary = await runStage3(baseConfig, mockClient);

    // stable 应严格基于 memoryGrowthPercent < 20 判定
    // 不直接断言具体百分比（V8 GC 时序不稳定），只验证判定关系
    expect(summary.stable).toBe(summary.memoryGrowthPercent < 20);
  });

  it('dry-run maxRounds=1 只运行 1 轮', async () => {
    const mockClient = createMockSdkClient();
    const config: Stage3Config = { ...baseConfig, maxRounds: 1 };
    const summary = await runStage3(config, mockClient);

    expect(summary.totalRounds).toBe(1);
    expect(summary.rounds).toHaveLength(1);
    expect(summary.rounds[0].roundNumber).toBe(1);
  });

  it('dry-run maxRounds=0 运行 0 轮', async () => {
    const mockClient = createMockSdkClient();
    const config: Stage3Config = { ...baseConfig, maxRounds: 0 };
    const summary = await runStage3(config, mockClient);

    expect(summary.totalRounds).toBe(0);
    expect(summary.rounds).toHaveLength(0);
  });

  it('dry-run maxRounds=10 正确运行 10 轮', async () => {
    const mockClient = createMockSdkClient();
    const config: Stage3Config = { ...baseConfig, maxRounds: 10 };
    const summary = await runStage3(config, mockClient);

    expect(summary.totalRounds).toBe(10);
    expect(summary.rounds).toHaveLength(10);
  });

  it('totalErrors 为所有轮次的错误数之和', async () => {
    const mockClient = createMockSdkClient();
    const summary = await runStage3(baseConfig, mockClient);

    const calculatedErrors = summary.rounds.reduce((sum, r) => sum + r.errors.length, 0);
    expect(summary.totalErrors).toBe(calculatedErrors);
  });
});

/* ==============================================
 * generateStage3Report
 * ============================================== */
describe('generateStage3Report', () => {
  it('生成包含所有关键信息的报告文本', () => {
    const mockConfig: Stage3Config = {
      dataDir: 'data',
      pollIntervalMs: 30000,
      maxRounds: 2,
      dryRun: true,
      stockCodes: ['600519'],
    };

    const mockRound = {
      roundNumber: 1,
      timestamp: '2026-07-06T10:00:00.000Z',
      pollDurationMs: 150,
      ztPoolCount: 42,
      stockChangeCount: 15,
      boardChangeCount: 8,
      memoryMB: 128.5,
      errors: [],
    };

    const summary: Stage3Summary = {
      config: mockConfig,
      startTime: '2026-07-06T09:30:00.000Z',
      endTime: '2026-07-06T10:00:00.000Z',
      totalRounds: 1,
      rounds: [mockRound],
      memoryStartMB: 100,
      memoryEndMB: 128,
      memoryGrowthPercent: 28,
      totalErrors: 0,
      stable: false,
    };

    const report = generateStage3Report(summary);

    // 报告标题
    expect(report).toContain('Stage 3 盘中稳定性测试报告');
    // 时间信息
    expect(report).toContain('2026-07-06T09:30:00.000Z');
    expect(report).toContain('2026-07-06T10:00:00.000Z');
    // 内存数据
    expect(report).toContain('100 MB');
    expect(report).toContain('128 MB');
    expect(report).toContain('28%');
    // 稳定性判定
    expect(report).toContain('不稳定');
    // 轮次明细
    expect(report).toContain('ztPool');
    expect(report).toContain('stockChanges');
    expect(report).toContain('boardChanges');
    expect(report).toContain('42');
    expect(report).toContain('15');
    expect(report).toContain('8');
    expect(report).toContain('128.5');
  });

  it('稳定时显示正确状态', () => {
    const mockConfig: Stage3Config = {
      dataDir: 'data',
      pollIntervalMs: 30000,
      maxRounds: 1,
      dryRun: true,
      stockCodes: [],
    };

    const summary: Stage3Summary = {
      config: mockConfig,
      startTime: '2026-07-06T09:30:00.000Z',
      endTime: '2026-07-06T10:00:00.000Z',
      totalRounds: 1,
      rounds: [{
        roundNumber: 1,
        timestamp: '2026-07-06T10:00:00.000Z',
        pollDurationMs: 100,
        ztPoolCount: 10,
        stockChangeCount: 5,
        boardChangeCount: 3,
        memoryMB: 100,
        errors: [],
      }],
      memoryStartMB: 100,
      memoryEndMB: 105,
      memoryGrowthPercent: 5,
      totalErrors: 0,
      stable: true,
    };

    const report = generateStage3Report(summary);
    expect(report).toContain('稳定');
  });

  it('报告包含轮次明细表头', () => {
    const mockConfig: Stage3Config = {
      dataDir: 'data',
      pollIntervalMs: 30000,
      maxRounds: 0,
      dryRun: true,
      stockCodes: [],
    };

    const summary: Stage3Summary = {
      config: mockConfig,
      startTime: '2026-07-06T09:30:00.000Z',
      endTime: '2026-07-06T10:00:00.000Z',
      totalRounds: 0,
      rounds: [],
      memoryStartMB: 100,
      memoryEndMB: 100,
      memoryGrowthPercent: 0,
      totalErrors: 0,
      stable: true,
    };

    const report = generateStage3Report(summary);
    expect(report).toContain('轮次');
    expect(report).toContain('ztPool');
    expect(report).toContain('stockChanges');
    expect(report).toContain('boardChanges');
  });

  it('报告包含错误明细', () => {
    const mockConfig: Stage3Config = {
      dataDir: 'data',
      pollIntervalMs: 30000,
      maxRounds: 1,
      dryRun: true,
      stockCodes: [],
    };

    const summary: Stage3Summary = {
      config: mockConfig,
      startTime: '2026-07-06T09:30:00.000Z',
      endTime: '2026-07-06T10:00:00.000Z',
      totalRounds: 1,
      rounds: [{
        roundNumber: 1,
        timestamp: '2026-07-06T10:00:00.000Z',
        pollDurationMs: 100,
        ztPoolCount: 0,
        stockChangeCount: 0,
        boardChangeCount: 0,
        memoryMB: 100,
        errors: ['ztPool: timeout', 'stockChanges: network error'],
      }],
      memoryStartMB: 100,
      memoryEndMB: 100,
      memoryGrowthPercent: 0,
      totalErrors: 2,
      stable: true,
    };

    const report = generateStage3Report(summary);
    expect(report).toContain('ztPool: timeout');
    expect(report).toContain('stockChanges: network error');
    expect(report).toContain('2');
  });
});
