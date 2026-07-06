/**
 * T-5.1：持仓评分与再平衡建议
 *
 * 对每只持仓，基于近 20 日资金流 + 信号汇总评分，
 * 找出分数最低的 1-2 只作为建议替换对象。
 */
import { calcFundFlowHealth, calcStrategyOpportunity } from '../engine/scoring';
import type { SignalResult } from '../types/signal';
import type { EnrichedHolding } from './holdingsMonitor';

/** 单只持仓的评分结果 */
export interface HoldingScore {
  code: string;
  name: string;
  /** 资金面评分（0-100） */
  fundFlowScore: number;
  /** 信号评分（0-100） */
  signalScore: number;
  /** 综合评分（0-100），权重各 50% */
  totalScore: number;
  /** 信号列表 */
  signals: SignalResult[];
}

/** 再平衡建议 */
export interface RebalanceSuggestion {
  /** 基准日期 YYYY-MM-DD */
  date: string;
  /** 所有持仓评分（按总分升序） */
  holdings: HoldingScore[];
  /** 建议替换对象（最低 1-2 只） */
  replaceCandidates: HoldingScore[];
  /** 综合健康度评分 */
  overallHealthScore: number;
}

/**
 * 计算单只持仓的综合评分
 *
 * @param holding 增强后的持仓信息
 * @param fundFlowPercent 近 20 日主力净流入占比（%）（负值代表净流出）
 * @param signals 该股触发的信号列表
 * @param maxSignals 最大可能信号数（用于信号评分归一化）
 */
export function scoreHolding(
  holding: EnrichedHolding,
  fundFlowPercent: number | null,
  signals: SignalResult[],
  maxSignals: number = 8,
): HoldingScore {
  const fundFlowScore = calcFundFlowHealth({
    mainNetInflowPercent: fundFlowPercent,
  });

  const signalScore = calcStrategyOpportunity({
    activeSignalCount: signals.length,
    maxSignals,
  });

  // 综合评分：资金面 50% + 信号 50%
  const totalScore = Math.round(fundFlowScore * 0.5 + signalScore * 0.5);

  return {
    code: holding.code,
    name: holding.name,
    fundFlowScore,
    signalScore,
    totalScore,
    signals,
  };
}

/**
 * 评估持仓组合，生成再平衡建议
 *
 * @param holdings 增强后的持仓列表
 * @param fundFlowMap code → 近 20 日主力净流入占比（%）
 * @param signalMap code → 触发的信号列表
 * @param date 基准日期
 */
export function evaluateRebalance(
  holdings: EnrichedHolding[],
  fundFlowMap: Map<string, number | null>,
  signalMap: Map<string, SignalResult[]>,
  date?: string,
): RebalanceSuggestion {
  const today = date ?? new Date().toISOString().slice(0, 10);

  // 对所有持仓评分
  const scored = holdings.map(h => {
    const fundFlowPercent = fundFlowMap.get(h.code) ?? null;
    const signals = signalMap.get(h.code) ?? [];
    return scoreHolding(h, fundFlowPercent, signals);
  });

  // 按总分升序排序
  scored.sort((a, b) => a.totalScore - b.totalScore);

  // 建议替换最低分的 1-2 只（至少 3 只持仓才建议替换）
  const replaceCount = scored.length >= 3 ? Math.min(2, Math.ceil(scored.length / 3)) : 0;
  const replaceCandidates = scored.slice(0, replaceCount);

  // 综合健康度：所有持仓的平均分
  const overallHealthScore =
    scored.length > 0
      ? Math.round(scored.reduce((sum, h) => sum + h.totalScore, 0) / scored.length)
      : 0;

  return {
    date: today,
    holdings: scored,
    replaceCandidates,
    overallHealthScore,
  };
}