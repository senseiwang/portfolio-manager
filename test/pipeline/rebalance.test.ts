/**
 * T-5.1：持仓评分与再平衡建议测试
 *
 * 验证：
 * 1. scoreHolding 正确计算资金面 + 信号加权评分
 * 2. evaluateRebalance 按分数排序并选出最低分 1-2 只
 * 3. 空持仓/边界情况不崩溃
 */
import { describe, it, expect } from 'vitest';
import { scoreHolding, evaluateRebalance } from '../../src/pipeline/rebalance';
import type { EnrichedHolding } from '../../src/pipeline/holdingsMonitor';
import type { SignalResult } from '../../src/types/signal';

function makeHolding(overrides: Partial<EnrichedHolding> & { code: string }): EnrichedHolding {
  return {
    shares: 100,
    costPrice: 10,
    currentPrice: 12,
    name: '测试股票',
    marketValue: 1200,
    costValue: 1000,
    pnl: 200,
    pnlPercent: 20,
    changePercent: 2,
    ...overrides,
  };
}

describe('scoreHolding', () => {
  it('资金净流入 + 多信号应得高分', () => {
    const holding = makeHolding({ code: '600001', name: '优质股' });
    const signals: SignalResult[] = [
      { signalId: 'S01', symbol: '600001', triggeredAt: '2026-07-01', strength: 4, detail: {} },
      { signalId: 'S02', symbol: '600001', triggeredAt: '2026-07-01', strength: 3, detail: {} },
    ];

    const score = scoreHolding(holding, 3, signals, 8);
    // fundFlowScore = 50 + 3*5 = 65, signalScore = 2/8*100 = 25
    // totalScore = round(65*0.5 + 25*0.5) = 45
    expect(score.fundFlowScore).toBe(65);
    expect(score.signalScore).toBe(25);
    expect(score.totalScore).toBe(45);
    expect(score.code).toBe('600001');
  });

  it('资金净流出 + 无信号应得低分', () => {
    const holding = makeHolding({ code: '600002', name: '弱势股' });
    const score = scoreHolding(holding, -5, [], 8);
    expect(score.totalScore).toBeLessThan(50);
    expect(score.fundFlowScore).toBeLessThan(50); // 负净流入
    expect(score.signalScore).toBe(0);             // 无信号
  });

  it('资金流为 null 时应取中性 50 分', () => {
    const holding = makeHolding({ code: '600003', name: '中性股' });
    const score = scoreHolding(holding, null, [], 8);
    expect(score.fundFlowScore).toBe(50);
  });

  it('信号数为 0 时 signalScore 应为 0', () => {
    const holding = makeHolding({ code: '600004', name: '无信号' });
    const score = scoreHolding(holding, 0, [], 8);
    expect(score.signalScore).toBe(0);
  });
});

describe('evaluateRebalance', () => {
  it('应正确排序并选出最低分 1-2 只', () => {
    const holdings: EnrichedHolding[] = [
      makeHolding({ code: '600001', name: 'A', marketValue: 10000 }),
      makeHolding({ code: '600002', name: 'B', marketValue: 10000 }),
      makeHolding({ code: '600003', name: 'C', marketValue: 10000 }),
      makeHolding({ code: '600004', name: 'D', marketValue: 10000 }),
      makeHolding({ code: '600005', name: 'E', marketValue: 10000 }),
    ];

    // 人为构造：A 净流入正且有信号（高分）、E 净流出负且无信号（低分）
    const fundFlowMap = new Map<string, number | null>([
      ['600001', 5],
      ['600002', 2],
      ['600003', 0],
      ['600004', -3],
      ['600005', -8],
    ]);

    const signalMap = new Map<string, SignalResult[]>([
      ['600001', [{ signalId: 'S01', symbol: '600001', triggeredAt: '2026-07-01', strength: 4, detail: {} }]],
      ['600002', []],
      ['600003', []],
      ['600004', []],
      ['600005', []],
    ]);

    const result = evaluateRebalance(holdings, fundFlowMap, signalMap, '2026-07-06');

    expect(result.date).toBe('2026-07-06');
    expect(result.holdings).toHaveLength(5);

    // 按总分升序排列，最低分应该是 600005
    expect(result.holdings[0].code).toBe('600005');
    expect(result.holdings[4].code).toBe('600001'); // 最高分

    // 建议替换的最低的 1-2 只（5 只中 ceil(5/3) = 2）
    expect(result.replaceCandidates.length).toBe(2);
    expect(result.replaceCandidates[0].code).toBe('600005');
    expect(result.replaceCandidates[1].code).toBe('600004');

    // 综合健康度应为平均分
    expect(result.overallHealthScore).toBeGreaterThan(0);
  });

  it('持仓少于 3 只时不应建议替换', () => {
    const holdings: EnrichedHolding[] = [
      makeHolding({ code: '600001', name: 'A' }),
      makeHolding({ code: '600002', name: 'B' }),
    ];

    const result = evaluateRebalance(
      holdings,
      new Map([['600001', 0], ['600002', 0]]),
      new Map(),
    );

    expect(result.replaceCandidates).toHaveLength(0);
  });

  it('空持仓应返回空建议', () => {
    const result = evaluateRebalance([], new Map(), new Map());
    expect(result.holdings).toHaveLength(0);
    expect(result.replaceCandidates).toHaveLength(0);
    expect(result.overallHealthScore).toBe(0);
  });
});