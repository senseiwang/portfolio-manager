/**
 * 推荐存证挂载模块测试
 *
 * 覆盖 recordDailyRecommendations 的各种场景。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  recordDailyRecommendations,
  calculateRollingReturn,
  calculateRollingReturns,
  assessStrategyHealth,
  assessAllStrategiesHealth,
  generateStrategyHealthReport,
} from '../../src/pipeline/forwardTracking';
import type {
  SignalRecord,
  StrategyRecord,
  RecommendationRecord,
  RollingReturnInput,
  RollingReturnResult,
  StrategyHealthInput,
  StrategyHealthResult,
} from '../../src/pipeline/forwardTracking';

// ==================== 测试辅助 ====================

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forward-tracking-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const makeSignal = (overrides: Partial<SignalRecord> = {}): SignalRecord => ({
  signalId: 'S01',
  symbol: '600519',
  triggeredAt: '2026-07-06T09:35:00+08:00',
  strength: 0.85,
  price: 1888.50,
  detail: { maShort: 5, maLong: 20 },
  ...overrides,
});

const makeStrategy = (overrides: Partial<StrategyRecord> = {}): StrategyRecord => ({
  strategyId: 'STG01',
  symbol: '600519',
  triggeredAt: '2026-07-06T10:00:00+08:00',
  confidence: 0.75,
  price: 1890.00,
  ...overrides,
});

// ==================== 测试用例 ====================

describe('recordDailyRecommendations', () => {
  it('给定信号与策略数据，存证文件包含且仅包含实际触发的信号/推荐', () => {
    const signals = [
      makeSignal({ signalId: 'S01', symbol: '600519' }),
      makeSignal({ signalId: 'S02', symbol: '000858' }),
    ];
    const strategies = [
      makeStrategy({ strategyId: 'STG01', symbol: '600519' }),
    ];

    const filePath = recordDailyRecommendations('2026-07-06', signals, strategies, tmpDir);

    // 文件存在
    expect(fs.existsSync(filePath)).toBe(true);
    expect(path.basename(filePath)).toBe('2026-07-06.json');

    // 读取并解析
    const raw = fs.readFileSync(filePath, 'utf-8');
    const record: RecommendationRecord = JSON.parse(raw);

    expect(record.date).toBe('2026-07-06');
    expect(record.signals).toHaveLength(2);
    expect(record.strategies).toHaveLength(1);

    // 验证只包含我们传入的数据
    const signalIds = record.signals.map(s => s.signalId);
    expect(signalIds).toEqual(['S01', 'S02']);

    const strategyIds = record.strategies.map(s => s.strategyId);
    expect(strategyIds).toEqual(['STG01']);
  });

  it('信号记录字段完整（signalId, symbol, price, triggeredAt 等）', () => {
    const signals = [makeSignal()];
    const strategies = [makeStrategy()];

    const filePath = recordDailyRecommendations('2026-07-06', signals, strategies, tmpDir);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const record: RecommendationRecord = JSON.parse(raw);

    // SignalRecord 字段完整性
    const signal = record.signals[0];
    expect(signal).toHaveProperty('signalId', 'S01');
    expect(signal).toHaveProperty('symbol', '600519');
    expect(signal).toHaveProperty('triggeredAt', '2026-07-06T09:35:00+08:00');
    expect(signal).toHaveProperty('strength', 0.85);
    expect(signal).toHaveProperty('price', 1888.50);
    expect(signal).toHaveProperty('detail');
    expect(signal.detail).toEqual({ maShort: 5, maLong: 20 });

    // StrategyRecord 字段完整性
    const strategy = record.strategies[0];
    expect(strategy).toHaveProperty('strategyId', 'STG01');
    expect(strategy).toHaveProperty('symbol', '600519');
    expect(strategy).toHaveProperty('triggeredAt', '2026-07-06T10:00:00+08:00');
    expect(strategy).toHaveProperty('confidence', 0.75);
    expect(strategy).toHaveProperty('price', 1890.00);
  });

  it('目录不存在时自动创建', () => {
    const nestedDir = path.join(tmpDir, 'a', 'b', 'c');
    const signals = [makeSignal()];

    // nestedDir 一定还不存在
    expect(fs.existsSync(nestedDir)).toBe(false);

    const filePath = recordDailyRecommendations('2026-07-06', signals, [], nestedDir);

    // 目录和文件都应该存在
    expect(fs.existsSync(nestedDir)).toBe(true);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('空数据场景（空数组）', () => {
    const filePath = recordDailyRecommendations('2026-07-06', [], [], tmpDir);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const record: RecommendationRecord = JSON.parse(raw);

    expect(record.date).toBe('2026-07-06');
    expect(record.signals).toEqual([]);
    expect(record.strategies).toEqual([]);
    expect(record).toHaveProperty('timestamp');
    expect(typeof record.timestamp).toBe('string');
  });

  it('返回的文件路径是绝对路径', () => {
    const filePath = recordDailyRecommendations('2026-07-06', [], [], tmpDir);
    expect(path.isAbsolute(filePath)).toBe(true);
    expect(filePath).toBe(path.resolve(tmpDir, '2026-07-06.json'));
  });

  it('多次调用同一日期应覆盖旧文件', () => {
    // 第一次写入
    recordDailyRecommendations('2026-07-06', [makeSignal({ signalId: 'S01' })], [], tmpDir);

    // 第二次覆盖写入
    const signalsV2 = [makeSignal({ signalId: 'S99', symbol: '000001' })];
    const filePath = recordDailyRecommendations('2026-07-06', signalsV2, [], tmpDir);

    const raw = fs.readFileSync(filePath, 'utf-8');
    const record: RecommendationRecord = JSON.parse(raw);
    expect(record.signals).toHaveLength(1);
    expect(record.signals[0].signalId).toBe('S99');
  });
});

// ==================== 滚动复盘计算 ====================

describe('calculateRollingReturn', () => {
  it('按构造的历史价格序列精确计算收益率', () => {
    // recordDate: 2025-07-06, today: 2026-07-06 => daysHeld = 365
    // entryPrice: 100, currentPrice: 120 => returnPercent = 20%
    // daysHeld >= 365 => annualizedReturn = ((120/100)^(365/365)-1)*100 = 20%
    const result = calculateRollingReturn('2025-07-06', 100, 120, '2026-07-06');
    expect(result.recordDate).toBe('2025-07-06');
    expect(result.daysHeld).toBe(365);
    expect(result.returnPercent).toBeCloseTo(20, 5);
    expect(result.annualizedReturn).toBeCloseTo(20, 5);
  });

  it('持有不足 1 年时 annualizedReturn 为 null', () => {
    // recordDate: 2026-04-06, today: 2026-07-06 => daysHeld = 91
    const result = calculateRollingReturn('2026-04-06', 100, 110, '2026-07-06');
    expect(result.daysHeld).toBe(91);
    expect(result.returnPercent).toBeCloseTo(10, 5);
    expect(result.annualizedReturn).toBeNull();
  });

  it('价格下跌时收益率负值正确', () => {
    // recordDate: 2026-01-01, today: 2026-07-06 => daysHeld = 186
    // entryPrice: 200, currentPrice: 150 => returnPercent = -25%
    const result = calculateRollingReturn('2026-01-01', 200, 150, '2026-07-06');
    expect(result.daysHeld).toBe(186);
    expect(result.returnPercent).toBeCloseTo(-25, 5);
    expect(result.annualizedReturn).toBeNull();
  });

  it('价格不变时收益率 0', () => {
    const result = calculateRollingReturn('2025-07-06', 100, 100, '2026-07-06');
    expect(result.returnPercent).toBeCloseTo(0, 5);
    expect(result.annualizedReturn).toBeCloseTo(0, 5);
  });

  it('跨多年计算年化收益率', () => {
    // recordDate: 2023-07-06, today: 2026-07-06 => daysHeld = 1096 (含 1 个闰日?)
    // 2023-07-06 到 2026-07-06 是 3 年
    // 2023-07-06 -> 2024-07-06 = 366 (2024 是闰年)
    // 2024-07-06 -> 2025-07-06 = 365
    // 2025-07-06 -> 2026-07-06 = 365
    // Total = 1096? 让我算算...
    // Actually: from 2023-07-06 to 2026-07-06
    // 2023-07-06T00:00:00 -> 2026-07-06T00:00:00
    // Let's just verify daysHeld and compute manually
    const result = calculateRollingReturn('2023-07-06', 100, 200, '2026-07-06');
    expect(result.daysHeld).toBe(1096);
    // 年化 = ((200/100)^(365/1096)-1)*100 ≈ 26.0%
    // (2^(365/1096)-1)*100 = (2^0.333... - 1)*100 ≈ (1.2599 - 1)*100 ≈ 25.99%
    expect(result.annualizedReturn).not.toBeNull();
    if (result.annualizedReturn !== null) {
      expect(result.annualizedReturn).toBeGreaterThan(25);
      expect(result.annualizedReturn).toBeLessThan(27);
    }
  });
});

describe('calculateRollingReturns', () => {
  it('批量计算所有记录', () => {
    const inputs: RollingReturnInput[] = [
      { recordDate: '2025-07-06', entryPrice: 100, currentPrice: 120 },
      { recordDate: '2026-04-06', entryPrice: 50, currentPrice: 55 },
      { recordDate: '2026-01-01', entryPrice: 200, currentPrice: 180 },
    ];
    const results = calculateRollingReturns(inputs);
    expect(results).toHaveLength(3);
    expect(results[0].recordDate).toBe('2025-07-06');
    expect(results[1].recordDate).toBe('2026-04-06');
    expect(results[2].recordDate).toBe('2026-01-01');
    // 每个结果都应有正确的字段
    for (const r of results) {
      expect(r).toHaveProperty('daysHeld');
      expect(r).toHaveProperty('returnPercent');
      expect(r).toHaveProperty('annualizedReturn');
    }
  });

  it('空输入返回空数组', () => {
    expect(calculateRollingReturns([])).toEqual([]);
  });
});

// ==================== 策略健康度告警 ====================

describe('assessStrategyHealth', () => {
  it('历史优异+近期连续失败触发 critical 告警', () => {
    // 期望胜率 80%，但 20 条中只有 2 条盈利 => actualWinRate = 10%
    // winRateDrop = 70% > 20% => critical
    const input: StrategyHealthInput = {
      strategyId: 'STG_ALPHA',
      recentReturns: [
        -3.2, -1.5, -2.1, -4.0, -0.8,  // 亏损
        -2.5, -3.3, -1.1, -5.2, -0.5,  // 亏损
        1.2, -2.0, -3.7, -1.8, -0.3,   // 1 盈利
        -2.8, -4.1, -0.9, -3.0, 2.5,   // 1 盈利
      ],
      expectedAnnualReturn: 25,
      expectedWinRate: 80,
    };
    const result = assessStrategyHealth(input);
    expect(result.status).toBe('critical');
    expect(result.strategyId).toBe('STG_ALPHA');
    expect(result.sampleCount).toBe(20);
    expect(result.actualWinRate).toBe(10); // 2/20 = 10%
    expect(result.actualAvgReturn).toBeLessThan(0);
    expect(result.details).toContain('平均收益率为负');
  });

  it('平均收益率转负触发 critical（即使胜率下降未超 20%）', () => {
    // 期望胜率 60%，10 条中 5 条盈利 => actualWinRate = 50%，winRateDrop = 10%
    // 但平均收益率 < 0 => critical
    const input: StrategyHealthInput = {
      strategyId: 'STG_BETA',
      recentReturns: [
        -8.0, -7.0, 3.0, -9.0, 2.0,
        4.0, -6.0, 5.0, -5.0, 1.0,
      ],
      expectedAnnualReturn: 20,
      expectedWinRate: 60,
    };
    const result = assessStrategyHealth(input);
    expect(result.status).toBe('critical');
    expect(result.actualAvgReturn).toBeLessThan(0);
    expect(result.details).toContain('平均收益率为负');
  });

  it('表现一致的策略返回 healthy', () => {
    // 期望胜率 70%，10 条中 7 条盈利 => actualWinRate = 70%
    // winRateDrop = 0% <= 10%，且 avgReturn > 0 => healthy
    const input: StrategyHealthInput = {
      strategyId: 'STG_GAMMA',
      recentReturns: [
        2.0, -1.0, 1.5, 3.0, -0.5,
        2.5, 1.0, -0.8, 4.0, 1.2,
      ],
      expectedAnnualReturn: 20,
      expectedWinRate: 70,
    };
    const result = assessStrategyHealth(input);
    expect(result.status).toBe('healthy');
    expect(result.sampleCount).toBe(10);
    expect(result.actualWinRate).toBe(70);
    expect(result.actualAvgReturn).toBeGreaterThan(0);
  });

  it('样本不足 5 条时返回 insufficient_data', () => {
    const input: StrategyHealthInput = {
      strategyId: 'STG_NEW',
      recentReturns: [2.0, -1.0],
      expectedAnnualReturn: 15,
      expectedWinRate: 65,
    };
    const result = assessStrategyHealth(input);
    expect(result.status).toBe('insufficient_data');
    expect(result.sampleCount).toBe(2);
    expect(result.actualWinRate).toBe(0);
    expect(result.actualAvgReturn).toBe(0);
    expect(result.message).toContain('样本不足');
  });

  it('0 条样本时返回 insufficient_data', () => {
    const input: StrategyHealthInput = {
      strategyId: 'STG_EMPTY',
      recentReturns: [],
      expectedAnnualReturn: 15,
      expectedWinRate: 65,
    };
    const result = assessStrategyHealth(input);
    expect(result.status).toBe('insufficient_data');
    expect(result.sampleCount).toBe(0);
    expect(result.message).toContain('样本不足（0/5）');
  });

  it('胜率下降 10-20% 触发 warning', () => {
    // 期望胜率 80%，10 条中 6 条盈利 => actualWinRate = 60%
    // winRateDrop = 20% => 20 > 20 为 false, 20 > 10 为 true => warning
    // avg = (2-1+1.5-0.5+1+2-1+3+2.5-1)/10 = 8.5/10 = 0.85 > 0 => 不是 critical
    const input: StrategyHealthInput = {
      strategyId: 'STG_DELTA',
      recentReturns: [
        2.0, -1.0, 1.5, -0.5, 1.0,
        2.0, -1.0, 3.0, 2.5, -1.0,
      ],
      expectedAnnualReturn: 18,
      expectedWinRate: 80,
    };
    const result = assessStrategyHealth(input);
    // 6/10 = 60%, winRateDrop = 20%
    // winRateDrop > 20? false (20 > 20 是 false)
    // avg > 0? true => 不走 critical
    // winRateDrop > 10? true (20 > 10 是 true) => warning
    expect(result.status).toBe('warning');
    expect(result.actualWinRate).toBe(60);
  });
});

describe('assessAllStrategiesHealth', () => {
  it('批量评估多个策略', () => {
    const inputs: StrategyHealthInput[] = [
      {
        strategyId: 'STG_A',
        recentReturns: [2, 3, -1, 4, 1, -0.5, 1.5, 2.5, -2, 3],
        expectedAnnualReturn: 20,
        expectedWinRate: 70,
      },
      {
        strategyId: 'STG_B',
        recentReturns: [1, 2],
        expectedAnnualReturn: 15,
        expectedWinRate: 60,
      },
      {
        strategyId: 'STG_C',
        recentReturns: [-5, -3, -4, -2, -6, -1, -3, -7, -2, -4],
        expectedAnnualReturn: 25,
        expectedWinRate: 80,
      },
    ];
    const results = assessAllStrategiesHealth(inputs);
    expect(results).toHaveLength(3);
    expect(results[0].strategyId).toBe('STG_A');
    expect(results[1].strategyId).toBe('STG_B');
    expect(results[2].strategyId).toBe('STG_C');
    // 每个结果都有完整字段
    for (const r of results) {
      expect(r).toHaveProperty('status');
      expect(r).toHaveProperty('actualWinRate');
      expect(r).toHaveProperty('actualAvgReturn');
      expect(r).toHaveProperty('sampleCount');
      expect(r).toHaveProperty('message');
      expect(r).toHaveProperty('details');
    }
  });

  it('空输入返回空数组', () => {
    expect(assessAllStrategiesHealth([])).toEqual([]);
  });
});

describe('generateStrategyHealthReport', () => {
  const mockResults: StrategyHealthResult[] = [
    {
      strategyId: 'STG_A',
      status: 'healthy',
      actualWinRate: 70,
      actualAvgReturn: 1.25,
      expectedWinRate: 70,
      expectedAnnualReturn: 20,
      sampleCount: 10,
      message: '策略 STG_A 健康度良好，无需干预',
      details: ['表现与回测预期一致'],
    },
    {
      strategyId: 'STG_B',
      status: 'critical',
      actualWinRate: 10,
      actualAvgReturn: -2.3,
      expectedWinRate: 80,
      expectedAnnualReturn: 25,
      sampleCount: 20,
      message: '策略 STG_B 严重偏离预期，建议暂停或调整',
      details: ['平均收益率为负'],
    },
    {
      strategyId: 'STG_C',
      status: 'insufficient_data',
      actualWinRate: 0,
      actualAvgReturn: 0,
      expectedWinRate: 65,
      expectedAnnualReturn: 15,
      sampleCount: 3,
      message: '样本不足（3/5），无法评估',
      details: ['仅有 3 条推荐记录，需要至少 5 条才能评估'],
    },
  ];

  it('报告包含所有策略', () => {
    const report = generateStrategyHealthReport(mockResults, '2026-07-06');
    // 包含标题
    expect(report).toContain('# 策略健康度报告');
    expect(report).toContain('2026-07-06');
    // 包含所有策略 ID
    expect(report).toContain('STG_A');
    expect(report).toContain('STG_B');
    expect(report).toContain('STG_C');
    // 包含状态标识
    expect(report).toContain('healthy');
    expect(report).toContain('critical');
    expect(report).toContain('insufficient_data');
    // 包含总计
    expect(report).toContain('3 个策略');
    expect(report).toContain('✅ 1 健康');
    expect(report).toContain('🔴 1 严重');
    expect(report).toContain('⬜ 1 数据不足');
  });

  it('报告格式为 Markdown 表格', () => {
    const report = generateStrategyHealthReport(mockResults, '2026-07-06');
    const lines = report.split('\n');
    // 表头行（index 4: 标题、空行、日期、空行、表头）
    expect(lines[4]).toContain('| 策略ID');
    // 分隔行
    expect(lines[5]).toContain('|--------');
    // 数据行
    const dataRows = lines.filter(l => l.includes('STG_A') || l.includes('STG_B') || l.includes('STG_C'));
    expect(dataRows).toHaveLength(3);
  });

  it('空结果集也能生成有效报告', () => {
    const report = generateStrategyHealthReport([], '2026-07-06');
    expect(report).toContain('# 策略健康度报告');
    expect(report).toContain('0 个策略');
    expect(report).toContain('✅ 0 健康');
  });
});
