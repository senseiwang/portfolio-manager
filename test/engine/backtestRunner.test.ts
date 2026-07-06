/**
 * 回测引擎封装测试
 *
 * 使用纯本地计算的 backtest()（无网络依赖），
 * 验证 runBacktest / runBacktestAll 在不同策略下的行为。
 */
import { describe, it, expect } from 'vitest';
import { runBacktest, runBacktestAll } from '../../src/engine/backtestRunner';
import type { KLine } from '../../src/types/sdk';

// ===== 构造 mock K 线数据 =====
function makeKLine(overrides: Partial<KLine> & { date: string }): KLine {
  return {
    date: overrides.date,
    open: 10,
    close: 10,
    high: 11,
    low: 9,
    volume: 100000,
    amount: 5000000, // 500 万
    amplitude: 3,
    changePercent: 0,
    change: 0,
    turnoverRate: 2,
    timestamp: new Date(overrides.date).getTime(),
    tz: 'Asia/Shanghai',
    code: '000000',
    ...overrides,
  };
}

/**
 * 生成一轮上涨趋势的 K 线序列
 * 从 10 涨到 15，用于触发 STG01（强势回调）的强势条件
 */
function makeUpTrendKlines(length: number): KLine[] {
  const result: KLine[] = [];
  for (let i = 0; i < length; i++) {
    const price = 10 + (i / length) * 5; // 10 → 15
    result.push(
      makeKLine({
        date: `2025-0${String(Math.floor(i / 30) + 1).padStart(2, '0')}-${String((i % 30) + 1).padStart(2, '0')}`,
        close: price,
        high: price * 1.02,
        low: price * 0.98,
        volume: 100000 + i * 1000,
        amount: (100000 + i * 1000) * price,
        changePercent: i === 0 ? 0 : ((price - result[i - 1].close) / result[i - 1].close) * 100,
      }),
    );
  }
  return result;
}

// ===== 测试用例 =====

describe('runBacktest', () => {
  it('空 K 线应返回空结果（STG01 不触发买入）', () => {
    // 空 K 线数组或不足 20 期
    const klines = Array.from({ length: 10 }, (_, i) =>
      makeKLine({ date: `2025-01-${String(i + 1).padStart(2, '0')}`, close: 10 }),
    );

    const results = runBacktest({
      code: '000001',
      klines,
    });

    // 应返回 stg01 和 stg03（仅需 K 线的策略）
    expect(results.length).toBeGreaterThanOrEqual(2);
    for (const r of results) {
      expect(r.code).toBe('000001');
      expect(r.report.tradeCount).toBe(0);
      expect(r.report.initialCapital).toBe(100000);
      expect(r.report.finalEquity).toBe(100000);
      expect(r.report.totalReturn).toBe(0);
    }
  });

  it('初始资金不足时应返回 0 交易', () => {
    const klines = makeUpTrendKlines(100);
    const results = runBacktest(
      { code: '000001', klines },
      { initialCapital: 1 }, // 1 元，远低于股价
    );

    // STG01 和 STG03 需要 20 期数据，且有足够数据
    // 但初始资金 1 元不够买入任何股票，交易应为 0
    for (const r of results) {
      expect(r.report.tradeCount).toBe(0);
    }
  });

  it('runBacktestAll 应处理多只股票', () => {
    const klinesA = makeUpTrendKlines(100);
    const klinesB = makeUpTrendKlines(100);

    const results = runBacktestAll([
      { code: '000001', klines: klinesA },
      { code: '000002', klines: klinesB },
    ]);

    // 2 只股票 × 2 个策略（stg01 + stg03）= 4 个结果
    expect(results).toHaveLength(4);

    const codes = new Set(results.map(r => r.code));
    expect(codes.has('000001')).toBe(true);
    expect(codes.has('000002')).toBe(true);

    const strategies = new Set(results.map(r => r.strategy));
    expect(strategies.has('stg01-pullback')).toBe(true);
    expect(strategies.has('stg03-breakout')).toBe(true);
  });

  it('回测报告应包含所有必需字段', () => {
    const klines = makeUpTrendKlines(200);
    const results = runBacktest({ code: '000001', klines });

    for (const r of results) {
      const report = r.report;
      expect(report).toHaveProperty('initialCapital');
      expect(report).toHaveProperty('finalEquity');
      expect(report).toHaveProperty('totalReturn');
      expect(report).toHaveProperty('winRate');
      expect(report).toHaveProperty('maxDrawdown');
      expect(report).toHaveProperty('tradeCount');
      expect(report).toHaveProperty('trades');
      expect(report).toHaveProperty('equityCurve');

      expect(typeof report.initialCapital).toBe('number');
      expect(typeof report.finalEquity).toBe('number');
      expect(typeof report.totalReturn).toBe('number');
      expect(typeof report.winRate).toBe('number');
      expect(typeof report.maxDrawdown).toBe('number');
      expect(typeof report.tradeCount).toBe('number');
      expect(Array.isArray(report.trades)).toBe(true);
      expect(Array.isArray(report.equityCurve)).toBe(true);

      // equityCurve 应与 K 线等长
      expect(report.equityCurve.length).toBe(klines.length);
    }
  });

  it('应跳过缺少外部数据的策略', () => {
    const klines = makeUpTrendKlines(100);

    // 不提供 fundFlowMap / northboundMap / limitUpEvents，
    // 应只返回 stg01 和 stg03
    const results = runBacktest({ code: '000001', klines });

    const strategies = results.map(r => r.strategy);
    expect(strategies).toContain('stg01-pullback');
    expect(strategies).toContain('stg03-breakout');
    expect(strategies).not.toContain('stg02-fundFlow');
    expect(strategies).not.toContain('stg04-northbound');
    expect(strategies).not.toContain('stg05-institution');
  });

  it('提供 fundFlowMap 时应包含 STG02', () => {
    const klines = makeUpTrendKlines(100);
    const fundFlowMap = new Map<string, number>();
    // 给最近 5 天设置净流入
    for (let i = 95; i < 100; i++) {
      fundFlowMap.set(klines[i].date, 1.0);
    }

    const results = runBacktest({
      code: '000001',
      klines,
      fundFlowMap,
    });

    const strategies = results.map(r => r.strategy);
    expect(strategies).toContain('stg02-fundFlow');
  });

  it('提供 northboundMap 时应包含 STG04', () => {
    const klines = makeUpTrendKlines(100);
    const northboundMap = new Map<string, number>();
    for (let i = 95; i < 100; i++) {
      northboundMap.set(klines[i].date, 0.05);
    }

    const results = runBacktest({
      code: '000001',
      klines,
      northboundMap,
    });

    const strategies = results.map(r => r.strategy);
    expect(strategies).toContain('stg04-northbound');
  });

  it('提供 limitUpEvents 时应包含 STG05', () => {
    const klines = makeUpTrendKlines(100);
    const limitUpEvents = [
      { date: klines[90].date, limitPrice: 15, institutionBuyAmount: 2000 },
    ];

    const results = runBacktest({
      code: '000001',
      klines,
      limitUpEvents,
    });

    const strategies = results.map(r => r.strategy);
    expect(strategies).toContain('stg05-institution');
  });
});