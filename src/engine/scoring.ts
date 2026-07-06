/**
 * 评分公式实现
 *
 * 6 个维度评分函数 + 1 个综合健康度加权函数
 * 每个函数都是纯函数，无副作用。
 */

// ===== 类型定义 =====

export interface FundFlowHealthInput {
  mainNetInflowPercent: number | null;
}

export interface TechnicalHealthInput {
  rsi: number | null;
}

export interface PortfolioRiskInput {
  maxDrawdown: number | null;
  volatility: number | null;
  concentration: number | null;
}

export interface SentimentInput {
  priceChangePercent: number | null;
  volumeChangePercent: number | null;
}

export interface EventSafetyInput {
  daysUntilNextEvent: number | null;
  eventType: string | null;
}

export interface StrategyOpportunityInput {
  activeSignalCount: number;
  maxSignals: number;
}

export interface PortfolioHealthInput {
  fundFlowHealth: number | null;
  technicalHealth: number | null;
  portfolioRisk: number | null;
  sentiment: number | null;
  eventSafety: number | null;
  strategyOpportunity: number | null;
}

export interface PortfolioHealthResult {
  fundFlowHealth: number;
  technicalHealth: number;
  portfolioRisk: number;
  sentiment: number;
  eventSafety: number;
  strategyOpportunity: number;
  total: number;
  colorBand: 'green' | 'yellow' | 'orange' | 'red';
}

// ===== 工具函数 =====

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ===== 1. 资金面健康度 =====
// 基于主力净流入百分比评分
// 公式: score = 50 + mainNetInflowPercent * 5, clamp [0, 100]
export function calcFundFlowHealth(input: FundFlowHealthInput): number {
  if (input.mainNetInflowPercent === null) return 50;
  return clamp(50 + input.mainNetInflowPercent * 5, 0, 100);
}

// ===== 2. 技术面健康度 =====
// 基于 RSI 评分，最优区间 45-55，超出越远分越低
// 公式: 分段线性函数
export function calcTechnicalHealth(input: TechnicalHealthInput): number {
  const { rsi } = input;
  if (rsi === null) return 50;
  if (rsi <= 20 || rsi >= 80) return 0;
  if (rsi >= 45 && rsi <= 55) return 100;
  if (rsi < 45) return clamp(((rsi - 20) / 25) * 100, 0, 100);
  // rsi > 55
  return clamp(((80 - rsi) / 25) * 100, 0, 100);
}

// ===== 3. 组合风险 =====
// 基于最大回撤、波动率、集中度评分（值越低风险越低，得分越高）
// 各子维度满分后加权汇总
export function calcPortfolioRisk(input: PortfolioRiskInput): number {
  const drawdownScore = input.maxDrawdown !== null
    ? clamp(100 - input.maxDrawdown * 5, 0, 100)
    : 50;
  const volatilityScore = input.volatility !== null
    ? clamp(100 - input.volatility * 4, 0, 100)
    : 50;
  const concentrationScore = input.concentration !== null
    ? clamp(100 - input.concentration * 100, 0, 100)
    : 50;

  // 权重：回撤 40%，波动率 35%，集中度 25%
  return Math.round(
    drawdownScore * 0.4 + volatilityScore * 0.35 + concentrationScore * 0.25,
  );
}

// ===== 4. 情绪面 =====
// 基于量价变化评分
// 公式: score = 50 + priceChangePercent * 10 + clamp(volumeChangePercent/2, -20, 20)
export function calcSentiment(input: SentimentInput): number {
  const priceChange = input.priceChangePercent ?? 0;
  const volumeChange = input.volumeChangePercent ?? 0;

  if (input.priceChangePercent === null && input.volumeChangePercent === null) {
    return 50;
  }

  const score = 50 + priceChange * 10 + clamp(volumeChange / 2, -20, 20);
  return clamp(Math.round(score), 0, 100);
}

// ===== 5. 事件安全 =====
// 基于距下一次事件的剩余天数评分
export function calcEventSafety(input: EventSafetyInput): number {
  const { daysUntilNextEvent } = input;
  if (daysUntilNextEvent === null) return 100;
  if (daysUntilNextEvent <= 0) return 0;
  if (daysUntilNextEvent <= 7) return 20;
  if (daysUntilNextEvent <= 14) return 50;
  if (daysUntilNextEvent <= 30) return 75;
  return 100;
}

// ===== 6. 策略机会 =====
// 基于活跃信号数量与最大信号数的比值评分
export function calcStrategyOpportunity(input: StrategyOpportunityInput): number {
  if (input.maxSignals <= 0) return 0;
  return clamp(
    Math.round((input.activeSignalCount / input.maxSignals) * 100),
    0,
    100,
  );
}

// ===== 7. 综合健康度 =====
// 权重定义
const HEALTH_WEIGHTS = {
  fundFlowHealth: 0.25,
  technicalHealth: 0.20,
  portfolioRisk: 0.20,
  sentiment: 0.15,
  eventSafety: 0.10,
  strategyOpportunity: 0.10,
};

function getColorBand(total: number): PortfolioHealthResult['colorBand'] {
  if (total >= 85) return 'green';
  if (total >= 70) return 'yellow';
  if (total >= 50) return 'orange';
  return 'red';
}

export function calcPortfolioHealthScore(
  input: PortfolioHealthInput,
): PortfolioHealthResult {
  const scores = {
    fundFlowHealth: input.fundFlowHealth ?? 0,
    technicalHealth: input.technicalHealth ?? 0,
    portfolioRisk: input.portfolioRisk ?? 0,
    sentiment: input.sentiment ?? 0,
    eventSafety: input.eventSafety ?? 0,
    strategyOpportunity: input.strategyOpportunity ?? 0,
  };

  const total = Math.round(
    scores.fundFlowHealth * HEALTH_WEIGHTS.fundFlowHealth +
    scores.technicalHealth * HEALTH_WEIGHTS.technicalHealth +
    scores.portfolioRisk * HEALTH_WEIGHTS.portfolioRisk +
    scores.sentiment * HEALTH_WEIGHTS.sentiment +
    scores.eventSafety * HEALTH_WEIGHTS.eventSafety +
    scores.strategyOpportunity * HEALTH_WEIGHTS.strategyOpportunity,
  );

  return {
    ...scores,
    total: clamp(total, 0, 100),
    colorBand: getColorBand(total),
  };
}
