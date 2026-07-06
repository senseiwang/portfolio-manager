/**
 * T-5.3 / T-5.4：日报数据聚合与渲染测试
 *
 * 验证：
 * 1. buildDailyReport 正确聚合各管道输入，无 undefined 泄漏
 * 2. renderPlainTextReport 输出格式正确，包含所有 7 大板块
 */
import { describe, it, expect } from 'vitest';
import { buildDailyReport, renderPlainTextReport } from '../../src/pipeline/reportBuilder';
import type { DailyReport, DailyReportInput } from '../../src/pipeline/reportBuilder';
import type { EnrichedHolding, EnrichedWatchlistItem } from '../../src/pipeline/holdingsMonitor';
import type { CandidatePoolReport, CandidateResult } from '../../src/pipeline/candidatePool';
import type { RebalanceSuggestion, HoldingScore } from '../../src/pipeline/rebalance';
import type { PortfolioHealthResult } from '../../src/engine/scoring';
import type { BacktestResult } from '../../src/engine/backtestRunner';
import type { SignalResult } from '../../src/types/signal';

// ===== Mock 数据工厂 =====

function makeHolding(overrides: Partial<EnrichedHolding> & { code: string }): EnrichedHolding {
  return {
    shares: 100,
    costPrice: 10,
    currentPrice: 12,
    name: '测试股',
    marketValue: 1200,
    costValue: 1000,
    pnl: 200,
    pnlPercent: 20,
    changePercent: 2,
    ...overrides,
  };
}

function makeWatchlistItem(overrides: Partial<EnrichedWatchlistItem> & { code: string }): EnrichedWatchlistItem {
  return {
    name: '关注股',
    currentPrice: 15,
    changePercent: 1.5,
    ...overrides,
  };
}

function makeHealthScore(overrides?: Partial<PortfolioHealthResult>): PortfolioHealthResult {
  return {
    fundFlowHealth: 70,
    technicalHealth: 80,
    portfolioRisk: 60,
    sentiment: 75,
    eventSafety: 90,
    strategyOpportunity: 50,
    total: 72,
    colorBand: 'yellow',
    ...overrides,
  };
}

function makeSignal(signalId: string): SignalResult {
  return { signalId, symbol: '600001', triggeredAt: '2026-07-06', strength: 3, detail: {} };
}

function makeCandidateResult(overrides: Partial<CandidateResult> & { code: string }): CandidateResult {
  return {
    name: '候选股',
    price: 10,
    circulatingMarketCap: 50,
    turnoverRate: 2,
    pe: 15,
    signals: [],
    ...overrides,
  };
}

function makeCandidatePoolReport(overrides?: Partial<CandidatePoolReport>): CandidatePoolReport {
  return {
    date: '2026-07-06',
    totalQuotes: 100,
    afterQuickFilter: 50,
    afterKLineFilter: 20,
    candidates: [
      makeCandidateResult({ code: '600001', name: '候选A', signals: [makeSignal('S01'), makeSignal('S04')] }),
      makeCandidateResult({ code: '600002', name: '候选B', signals: [makeSignal('S03')] }),
    ],
    ...overrides,
  };
}

function makeHoldingScore(overrides: Partial<HoldingScore> & { code: string }): HoldingScore {
  return {
    name: '持仓股',
    fundFlowScore: 60,
    signalScore: 40,
    totalScore: 50,
    signals: [],
    ...overrides,
  };
}

function makeRebalanceSuggestion(overrides?: Partial<RebalanceSuggestion>): RebalanceSuggestion {
  return {
    date: '2026-07-06',
    holdings: [
      makeHoldingScore({ code: '600001', name: '持仓A', totalScore: 80 }),
      makeHoldingScore({ code: '600002', name: '持仓B', totalScore: 30 }),
    ],
    replaceCandidates: [
      makeHoldingScore({ code: '600002', name: '持仓B', totalScore: 30 }),
    ],
    overallHealthScore: 55,
    ...overrides,
  };
}

function makeBacktestResult(overrides?: Partial<BacktestResult>): BacktestResult {
  return {
    code: '600001',
    strategy: 'stg01-pullback',
    report: {
      initialCapital: 100000,
      finalEquity: 105000,
      totalReturn: 5,
      winRate: 60,
      maxDrawdown: 3,
      tradeCount: 5,
      trades: [],
      equityCurve: [100000, 101000, 102000, 103000, 104000, 105000],
    },
    ...overrides,
  };
}

// ===== 测试用例 =====

describe('buildDailyReport', () => {
  function makeDefaultInput(): DailyReportInput {
    return {
      date: '2026-07-06',
      holdings: [makeHolding({ code: '600001' })],
      watchlist: [makeWatchlistItem({ code: '600002' })],
      healthScore: makeHealthScore(),
      candidatePool: makeCandidatePoolReport(),
      rebalance: makeRebalanceSuggestion(),
      backtestResults: [makeBacktestResult()],
      marketStatus: { isTradingDay: true, marketOpen: false },
    };
  }

  it('应正确聚合所有 7 大板块', () => {
    const report = buildDailyReport(makeDefaultInput());

    expect(report.date).toBe('2026-07-06');
    expect(report.holdingsOverview).toBeDefined();
    expect(report.watchlistOverview).toBeDefined();
    expect(report.healthScore).toBeDefined();
    expect(report.candidatePool).toBeDefined();
    expect(report.rebalance).toBeDefined();
    expect(report.backtestSummary).toBeDefined();
    expect(report.marketStatus).toBeDefined();
  });

  it('持仓概览应正确计算总市值和盈亏', () => {
    const input = makeDefaultInput();
    input.holdings = [
      makeHolding({ code: '600001', name: '股A', marketValue: 5000, pnl: 500, costValue: 4500, pnlPercent: 11.11 }),
      makeHolding({ code: '600002', name: '股B', marketValue: 3000, pnl: -200, costValue: 3200, pnlPercent: -6.25 }),
    ];

    const report = buildDailyReport(input);
    expect(report.holdingsOverview.totalMarketValue).toBe(8000);
    expect(report.holdingsOverview.totalPnl).toBe(300);
    expect(report.holdingsOverview.holdings).toHaveLength(2);
  });

  it('候选池 topSignals 应按信号数量排序', () => {
    const report = buildDailyReport(makeDefaultInput());
    expect(report.candidatePool.topSignals).toHaveLength(2);
    // 候选A 有 2 个信号，排第一
    expect(report.candidatePool.topSignals[0].code).toBe('600001');
  });

  it('回测摘要应找出最优策略', () => {
    const input = makeDefaultInput();
    input.backtestResults = [
      makeBacktestResult({ strategy: 'stg01-pullback', report: { initialCapital: 100000, finalEquity: 105000, totalReturn: 5, winRate: 60, maxDrawdown: 3, tradeCount: 5, trades: [], equityCurve: [] } }),
      makeBacktestResult({ strategy: 'stg03-breakout', report: { initialCapital: 100000, finalEquity: 112000, totalReturn: 12, winRate: 70, maxDrawdown: 4, tradeCount: 8, trades: [], equityCurve: [] } }),
    ];

    const report = buildDailyReport(input);
    expect(report.backtestSummary.bestStrategy).not.toBeNull();
    expect(report.backtestSummary.bestStrategy!.strategy).toBe('stg03-breakout');
    expect(report.backtestSummary.bestStrategy!.totalReturn).toBe(12);
  });

  it('无回测结果时 bestStrategy 应为 null', () => {
    const input = makeDefaultInput();
    input.backtestResults = [];
    const report = buildDailyReport(input);
    expect(report.backtestSummary.bestStrategy).toBeNull();
  });

  it('所有字段应无 undefined 泄漏', () => {
    const report = buildDailyReport(makeDefaultInput());
    const json = JSON.stringify(report);
    expect(json).not.toContain('undefined');
    expect(json).not.toContain('null'); // null 是合法的，但 undefined 不应出现

    // 递归检查
    function checkNoUndefined(obj: unknown, path: string): void {
      if (obj === null || obj === undefined) return;
      if (typeof obj !== 'object') return;
      if (Array.isArray(obj)) {
        obj.forEach((item, i) => checkNoUndefined(item, `${path}[${i}]`));
        return;
      }
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        if (value === undefined) {
          throw new Error(`字段 ${path}.${key} 为 undefined`);
        }
        checkNoUndefined(value, `${path}.${key}`);
      }
    }
    expect(() => checkNoUndefined(report as unknown as Record<string, unknown>, 'report')).not.toThrow();
  });
});

describe('renderPlainTextReport', () => {
  function makeReport(): DailyReport {
    return {
      date: '2026-07-06',
      holdingsOverview: {
        totalMarketValue: 8000,
        totalPnl: 300,
        totalPnlPercent: 3.9,
        holdings: [makeHolding({ code: '600001', name: '股A', marketValue: 5000, pnl: 500, pnlPercent: 11.11 })],
      },
      watchlistOverview: {
        totalStocks: 1,
        items: [makeWatchlistItem({ code: '600002', name: '关注股' })],
      },
      healthScore: makeHealthScore({ total: 72, colorBand: 'yellow' }),
      candidatePool: {
        totalCandidates: 2,
        topSignals: [
          { code: '600001', name: '候选A', signals: [makeSignal('S01'), makeSignal('S04')] },
        ],
      },
      rebalance: makeRebalanceSuggestion(),
      backtestSummary: {
        totalResults: 1,
        bestStrategy: { strategy: 'stg01-pullback', totalReturn: 5 },
        results: [makeBacktestResult()],
      },
      marketStatus: { isTradingDay: true, marketOpen: false, date: '2026-07-06' },
    };
  }

  it('应包含所有 7 个板块标题', () => {
    const text = renderPlainTextReport(makeReport());
    expect(text).toContain('【持仓概览】');
    expect(text).toContain('【Watchlist 概览】');
    expect(text).toContain('【组合健康度】');
    expect(text).toContain('【候选池摘要】');
    expect(text).toContain('【再平衡建议】');
    expect(text).toContain('【回测摘要】');
    expect(text).toContain('【市场状态】');
  });

  it('应包含报告日期', () => {
    const text = renderPlainTextReport(makeReport());
    expect(text).toContain('2026-07-06');
  });

  it('应包含持仓盈亏信息', () => {
    const text = renderPlainTextReport(makeReport());
    expect(text).toContain('总市值');
    expect(text).toContain('总盈亏');
    expect(text).toContain('股A');
  });

  it('应包含健康度评分', () => {
    const text = renderPlainTextReport(makeReport());
    expect(text).toContain('72/100');
    expect(text).toContain('关注'); // yellow 对应"关注"
  });

  it('应包含再平衡建议', () => {
    const text = renderPlainTextReport(makeReport());
    expect(text).toContain('建议关注替换');
  });

  it('应包含市场状态', () => {
    const text = renderPlainTextReport(makeReport());
    expect(text).toContain('交易日: 是');
    expect(text).toContain('已收盘');
  });

  it('应包含分隔线', () => {
    const text = renderPlainTextReport(makeReport());
    expect(text).toContain('='.repeat(60));
  });
});