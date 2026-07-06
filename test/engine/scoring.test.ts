/**
 * 评分公式单元测试（TDD 方式）
 *
 * 覆盖：正常值、极端值（全 0、全满分）、null/undefined 输入
 */
import { describe, it, expect } from 'vitest';
import {
  calcFundFlowHealth,
  calcTechnicalHealth,
  calcPortfolioRisk,
  calcSentiment,
  calcEventSafety,
  calcStrategyOpportunity,
  calcPortfolioHealthScore,
} from '../../src/engine/scoring';

// ===== 1. 资金面健康度 =====
describe('calcFundFlowHealth', () => {
  it('主力净流入为正时应 > 50 分', () => {
    // mainNetInflowPercent = +3%, 表示净流入
    const score = calcFundFlowHealth({ mainNetInflowPercent: 3 });
    expect(score).toBeGreaterThan(50);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('主力净流入为负时应 < 50 分', () => {
    const score = calcFundFlowHealth({ mainNetInflowPercent: -3 });
    expect(score).toBeLessThan(50);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('主力净流入为 0 时应为 50 分', () => {
    const score = calcFundFlowHealth({ mainNetInflowPercent: 0 });
    expect(score).toBe(50);
  });

  it('大幅净流入（+10%）应封顶 100 分', () => {
    const score = calcFundFlowHealth({ mainNetInflowPercent: 10 });
    expect(score).toBe(100);
  });

  it('大幅净流出（-10%）应截断 0 分', () => {
    const score = calcFundFlowHealth({ mainNetInflowPercent: -10 });
    expect(score).toBe(0);
  });

  it('极端大值应 clamp 到 [0, 100]', () => {
    expect(calcFundFlowHealth({ mainNetInflowPercent: 999 })).toBe(100);
    expect(calcFundFlowHealth({ mainNetInflowPercent: -999 })).toBe(0);
  });

  it('mainNetInflowPercent 为 null 时应返回 50（中性）', () => {
    const score = calcFundFlowHealth({ mainNetInflowPercent: null });
    expect(score).toBe(50);
  });
});

// ===== 2. 技术面健康度 =====
describe('calcTechnicalHealth', () => {
  it('RSI 在 50-60 区间应接近满分', () => {
    const score = calcTechnicalHealth({ rsi: 55 });
    expect(score).toBeGreaterThanOrEqual(80);
  });

  it('RSI 低于 20 应得 0 分', () => {
    const score = calcTechnicalHealth({ rsi: 15 });
    expect(score).toBe(0);
  });

  it('RSI 高于 80 应得 0 分（超买风险）', () => {
    const score = calcTechnicalHealth({ rsi: 85 });
    expect(score).toBe(0);
  });

  it('RSI 为 null 时应返回 50（中性）', () => {
    const score = calcTechnicalHealth({ rsi: null });
    expect(score).toBe(50);
  });

  it('RSI 为 40 应在 50-80 之间', () => {
    const score = calcTechnicalHealth({ rsi: 40 });
    expect(score).toBeGreaterThanOrEqual(50);
    expect(score).toBeLessThanOrEqual(80);
  });
});

// ===== 3. 组合风险 =====
describe('calcPortfolioRisk', () => {
  it('回撤为 0 且波动率低时应接近 100（低风险）', () => {
    const score = calcPortfolioRisk({ maxDrawdown: 0, volatility: 5, concentration: 0.1 });
    expect(score).toBeGreaterThanOrEqual(80);
  });

  it('回撤大且波动率高时应接近 0（高风险）', () => {
    const score = calcPortfolioRisk({ maxDrawdown: 20, volatility: 30, concentration: 0.9 });
    expect(score).toBeLessThanOrEqual(20);
  });

  it('极端值应 clamp 到 [0, 100]', () => {
    expect(calcPortfolioRisk({ maxDrawdown: 0, volatility: 0, concentration: 0 })).toBe(100);
    expect(calcPortfolioRisk({ maxDrawdown: 999, volatility: 999, concentration: 1 })).toBe(0);
  });

  it('参数为 null 时应视为中性', () => {
    const score = calcPortfolioRisk({ maxDrawdown: null, volatility: null, concentration: null });
    expect(score).toBe(50);
  });

  it('部分参数为 null 时只计算有效的部分', () => {
    const score = calcPortfolioRisk({ maxDrawdown: 5, volatility: null, concentration: null });
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
  });
});

// ===== 4. 情绪面 =====
describe('calcSentiment', () => {
  it('量价齐升时应 > 70 分', () => {
    const score = calcSentiment({ priceChangePercent: 2, volumeChangePercent: 20 });
    expect(score).toBeGreaterThanOrEqual(70);
  });

  it('量价齐跌时应 < 30 分', () => {
    const score = calcSentiment({ priceChangePercent: -2, volumeChangePercent: -20 });
    expect(score).toBeLessThanOrEqual(30);
  });

  it('无量无变化时应在 50 分左右', () => {
    const score = calcSentiment({ priceChangePercent: 0, volumeChangePercent: 0 });
    expect(score).toBe(50);
  });

  it('极端值应 clamp 到 [0, 100]', () => {
    expect(calcSentiment({ priceChangePercent: 999, volumeChangePercent: 999 })).toBe(100);
    expect(calcSentiment({ priceChangePercent: -999, volumeChangePercent: -999 })).toBe(0);
  });

  it('参数为 null 时应返回 50', () => {
    expect(calcSentiment({ priceChangePercent: null, volumeChangePercent: null })).toBe(50);
  });
});

// ===== 5. 事件安全 =====
describe('calcEventSafety', () => {
  it('无事件时应为 100 分', () => {
    const score = calcEventSafety({ daysUntilNextEvent: null, eventType: null });
    expect(score).toBe(100);
  });

  it('距事件 30 天以上应接近满分', () => {
    const score = calcEventSafety({ daysUntilNextEvent: 60, eventType: 'dividend' });
    expect(score).toBeGreaterThanOrEqual(80);
  });

  it('事件当天应为 0 分', () => {
    const score = calcEventSafety({ daysUntilNextEvent: 0, eventType: 'earnings' });
    expect(score).toBe(0);
  });

  it('事件在 7 天内应 < 50 分', () => {
    const score = calcEventSafety({ daysUntilNextEvent: 3, eventType: 'earnings' });
    expect(score).toBeLessThan(50);
  });
});

// ===== 6. 策略机会 =====
describe('calcStrategyOpportunity', () => {
  it('0 个信号应为 0 分', () => {
    const score = calcStrategyOpportunity({ activeSignalCount: 0, maxSignals: 8 });
    expect(score).toBe(0);
  });

  it('全部信号触发应为 100 分', () => {
    const score = calcStrategyOpportunity({ activeSignalCount: 8, maxSignals: 8 });
    expect(score).toBe(100);
  });

  it('一半信号触发应为 50 分', () => {
    const score = calcStrategyOpportunity({ activeSignalCount: 4, maxSignals: 8 });
    expect(score).toBe(50);
  });

  it('maxSignals 为 0 时应返回 0 分（避免除零）', () => {
    const score = calcStrategyOpportunity({ activeSignalCount: 0, maxSignals: 0 });
    expect(score).toBe(0);
  });

  it('activeSignalCount 超过 maxSignals 时应 clamp 到 100', () => {
    const score = calcStrategyOpportunity({ activeSignalCount: 10, maxSignals: 8 });
    expect(score).toBe(100);
  });
});

// ===== 7. 综合健康度 =====
describe('calcPortfolioHealthScore', () => {
  it('所有维度满分时总分为 100', () => {
    const result = calcPortfolioHealthScore({
      fundFlowHealth: 100,
      technicalHealth: 100,
      portfolioRisk: 100,
      sentiment: 100,
      eventSafety: 100,
      strategyOpportunity: 100,
    });
    expect(result.total).toBe(100);
    expect(result.colorBand).toBe('green');
  });

  it('所有维度 0 分时总分为 0', () => {
    const result = calcPortfolioHealthScore({
      fundFlowHealth: 0,
      technicalHealth: 0,
      portfolioRisk: 0,
      sentiment: 0,
      eventSafety: 0,
      strategyOpportunity: 0,
    });
    expect(result.total).toBe(0);
    expect(result.colorBand).toBe('red');
  });

  it('总分 85+ 应为 green', () => {
    const result = calcPortfolioHealthScore({
      fundFlowHealth: 90,
      technicalHealth: 90,
      portfolioRisk: 90,
      sentiment: 90,
      eventSafety: 90,
      strategyOpportunity: 90,
    });
    expect(result.total).toBeGreaterThanOrEqual(85);
    expect(result.colorBand).toBe('green');
  });

  it('总分 70-84 应为 yellow', () => {
    const result = calcPortfolioHealthScore({
      fundFlowHealth: 75,
      technicalHealth: 75,
      portfolioRisk: 75,
      sentiment: 75,
      eventSafety: 75,
      strategyOpportunity: 75,
    });
    expect(result.total).toBeGreaterThanOrEqual(70);
    expect(result.total).toBeLessThan(85);
    expect(result.colorBand).toBe('yellow');
  });

  it('总分 50-69 应为 orange', () => {
    const result = calcPortfolioHealthScore({
      fundFlowHealth: 60,
      technicalHealth: 60,
      portfolioRisk: 60,
      sentiment: 60,
      eventSafety: 60,
      strategyOpportunity: 60,
    });
    expect(result.total).toBeGreaterThanOrEqual(50);
    expect(result.total).toBeLessThan(70);
    expect(result.colorBand).toBe('orange');
  });

  it('总分 < 50 应为 red', () => {
    const result = calcPortfolioHealthScore({
      fundFlowHealth: 30,
      technicalHealth: 30,
      portfolioRisk: 30,
      sentiment: 30,
      eventSafety: 30,
      strategyOpportunity: 30,
    });
    expect(result.total).toBeLessThan(50);
    expect(result.colorBand).toBe('red');
  });

  it('边界值 84.5 分应为 yellow（非 green）', () => {
    // 构造恰好 84 分的组合
    const result = calcPortfolioHealthScore({
      fundFlowHealth: 84,
      technicalHealth: 84,
      portfolioRisk: 84,
      sentiment: 84,
      eventSafety: 84,
      strategyOpportunity: 84,
    });
    expect(result.total).toBe(84);
    expect(result.colorBand).toBe('yellow');
  });

  it('单个维度为 null 应视为 0 分', () => {
    const result = calcPortfolioHealthScore({
      fundFlowHealth: null,
      technicalHealth: 100,
      portfolioRisk: 100,
      sentiment: 100,
      eventSafety: 100,
      strategyOpportunity: 100,
    });
    expect(result.total).toBeLessThan(100);
    expect(result.total).toBe(75); // 0*0.25 + 100*0.20 + 100*0.20 + 100*0.15 + 100*0.10 + 100*0.10 = 75
  });

  it('所有权重之和应精确等于 1.0', () => {
    // 内部验证：测试加权计算的精度
    const result = calcPortfolioHealthScore({
      fundFlowHealth: 50,
      technicalHealth: 50,
      portfolioRisk: 50,
      sentiment: 50,
      eventSafety: 50,
      strategyOpportunity: 50,
    });
    expect(result.total).toBe(50);
  });
});
