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

/** 健康度各维度解释 */
export interface HealthDetail {
  dimension: string;
  label: string;
  score: number;
  weight: number;
  interpretation: string;
  reason: string;
  suggestion: string;
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
  details: HealthDetail[];
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

/**
 * 将分数转为文字评级
 */
function scoreLabel(score: number): string {
  if (score >= 80) return '优秀';
  if (score >= 60) return '良好';
  if (score >= 40) return '关注';
  if (score >= 20) return '预警';
  return '危险';
}

/** 构建各维度解释 */
function buildDetails(scores: Record<string, number>, input: PortfolioHealthInput): HealthDetail[] {
  return [
    {
      dimension: 'fundFlowHealth',
      label: '资金面',
      score: scores.fundFlowHealth,
      weight: HEALTH_WEIGHTS.fundFlowHealth,
      interpretation: scoreLabel(scores.fundFlowHealth),
      reason: input.fundFlowHealth === null
        ? '未获取到持仓资金流数据，暂以中性评分代替'
        : scores.fundFlowHealth >= 60 ? '主力资金净流入为主' : '主力资金净流出或无明显流入',
      suggestion: scores.fundFlowHealth < 40 ? '关注主力资金流向变化，考虑减仓资金持续流出的个股' : '维持现有配置',
    },
    {
      dimension: 'technicalHealth',
      label: '技术面',
      score: scores.technicalHealth,
      weight: HEALTH_WEIGHTS.technicalHealth,
      interpretation: scoreLabel(scores.technicalHealth),
      reason: input.technicalHealth === null
        ? '未获取到技术指标数据，暂以中性评分代替'
        : scores.technicalHealth >= 60 ? 'RSI等技术指标处于健康区间' : '技术指标偏弱',
      suggestion: scores.technicalHealth < 40 ? '关注超卖反弹机会或考虑止损' : '技术面正常',
    },
    {
      dimension: 'portfolioRisk',
      label: '组合风险',
      score: scores.portfolioRisk,
      weight: HEALTH_WEIGHTS.portfolioRisk,
      interpretation: scoreLabel(scores.portfolioRisk),
      reason: scores.portfolioRisk >= 60
        ? '持仓最大回撤可控，组合分散度良好'
        : '持仓最大回撤较大或集中度偏高',
      suggestion: scores.portfolioRisk < 40 ? '考虑降低单只股票仓位或增加ETF占比以分散风险' : '风险水平可接受',
    },
    {
      dimension: 'sentiment',
      label: '情绪面',
      score: scores.sentiment,
      weight: HEALTH_WEIGHTS.sentiment,
      interpretation: scoreLabel(scores.sentiment),
      reason: scores.sentiment >= 60
        ? '持仓整体上涨，市场情绪偏积极'
        : scores.sentiment >= 40 ? '持仓涨跌互现，情绪中性' : '持仓整体下跌，情绪偏弱',
      suggestion: scores.sentiment < 40 ? '市场情绪偏弱时谨慎加仓，等待企稳信号' : '情绪面正常',
    },
    {
      dimension: 'eventSafety',
      label: '事件安全',
      score: scores.eventSafety,
      weight: HEALTH_WEIGHTS.eventSafety,
      interpretation: scoreLabel(scores.eventSafety),
      reason: scores.eventSafety >= 80
        ? '近期无重大事件（分红/解禁/财报）发生'
        : scores.eventSafety >= 40 ? '有事件临近，需关注' : '重大事件即将发生',
      suggestion: scores.eventSafety < 40 ? '请关注持仓股的分红除权/解禁/财报日期' : '事件安全',
    },
    {
      dimension: 'strategyOpportunity',
      label: '策略机会',
      score: scores.strategyOpportunity,
      weight: HEALTH_WEIGHTS.strategyOpportunity,
      interpretation: scoreLabel(scores.strategyOpportunity),
      reason: scores.strategyOpportunity >= 60
        ? '多只个股触发多个信号，策略机会较多'
        : scores.strategyOpportunity >= 40 ? '有少量信号触发' : '当前触发信号较少',
      suggestion: scores.strategyOpportunity < 40
        ? '市场信号稀少时可减少操作频率，等待明确信号'
        : '可关注候选池中的信号股',
    },
  ];
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

  const clampedTotal = clamp(total, 0, 100);
  const details = buildDetails(scores, input);

  return {
    ...scores,
    total: clampedTotal,
    colorBand: getColorBand(clampedTotal),
    details,
  };
}
