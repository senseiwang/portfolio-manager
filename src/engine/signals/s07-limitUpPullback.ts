/**
 * S07 - 涨停后机构买入回调
 *
 * 当个股涨停且有机构席位买入时触发。
 * 机构在涨停板买入通常意味着看好后续走势，回调后可能是介入机会。
 */
import type { SignalResult } from '../../types/signal';

export interface LimitUpPullbackInput {
  symbol: string;
  triggeredAt: string;
  /** 是否涨停 */
  isLimitUp: boolean;
  /** 是否有机构席位买入 */
  hasInstitutionBuy: boolean;
  /** 涨跌幅百分比 */
  changePercent: number;
}

/**
 * 计算信号强度：
 * - 涨停 + 机构买入 + 涨幅 10%+（主板涨停）→ 5 星
 * - 涨停 + 机构买入 + 涨幅 5%+（中小板/创业板）→ 4 星
 * - 涨停 + 机构买入 → 3 星
 */
function calcStrength(changePercent: number): 1 | 2 | 3 | 4 | 5 {
  if (changePercent >= 10) return 5;
  if (changePercent >= 5) return 4;
  return 3;
}

export function detectLimitUpPullback(input: LimitUpPullbackInput): SignalResult | null {
  const { symbol, triggeredAt, isLimitUp, hasInstitutionBuy, changePercent } = input;

  if (!isLimitUp || !hasInstitutionBuy) return null;

  return {
    signalId: 'S07',
    symbol,
    triggeredAt,
    strength: calcStrength(changePercent),
    detail: {
      isLimitUp,
      hasInstitutionBuy,
      changePercent,
    },
  };
}
