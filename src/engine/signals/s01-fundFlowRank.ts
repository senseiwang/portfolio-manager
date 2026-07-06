/**
 * S01 - 资金流排名前 10%
 *
 * 当个股主力净流入排名在全市场前 10% 时触发。
 * 表示大资金正在主动买入，市场关注度高。
 */
import type { SignalResult } from '../../types/signal';

export interface FundFlowRankInput {
  symbol: string;
  triggeredAt: string;
  /** 资金流排名（1 = 最高净流入） */
  rank: number;
  /** 总排名数量 */
  total: number;
  /** 主力净流入百分比 */
  mainNetInflowPercent: number;
}

/**
 * 计算信号强度（基于排名百分位）
 * 前 3% → 5 星, 前 5% → 4 星, 前 8% → 3 星, 前 10% → 2 星
 */
function calcStrength(percentile: number): 1 | 2 | 3 | 4 | 5 {
  if (percentile <= 0.03) return 5;
  if (percentile <= 0.05) return 4;
  if (percentile <= 0.08) return 3;
  if (percentile <= 0.10) return 2;
  return 1;
}

export function detectFundFlowRank(input: FundFlowRankInput): SignalResult | null {
  const { symbol, triggeredAt, rank, total, mainNetInflowPercent } = input;

  if (total <= 0) return null;

  const percentile = rank / total;

  if (percentile > 0.1) return null;

  return {
    signalId: 'S01',
    symbol,
    triggeredAt,
    strength: calcStrength(percentile),
    detail: {
      rank,
      total,
      percentile: Math.round(percentile * 10000) / 10000,
      mainNetInflowPercent,
    },
  };
}
