/**
 * S03 - 北向连续 5 日增持
 *
 * 当北向资金连续 5 个交易日增持某只个股时触发。
 * 表示外资持续看好，中长线资金入场信号。
 */
import type { SignalResult } from '../../types/signal';

export interface NorthboundHolding {
  /** 持有股数 */
  holdShares: number;
  /** 日期（YYYY-MM-DD） */
  date: string;
}

export interface NorthboundInput {
  symbol: string;
  triggeredAt: string;
  /** 每日持仓数据（按日期升序排列） */
  dailyHoldings: NorthboundHolding[];
}

/**
 * 计算信号强度：
 * - 连增 10 日+ → 5 星
 * - 连增 8-9 日 → 4 星
 * - 连增 5-7 日 → 3 星
 */
function calcStrength(consecutiveDays: number): 1 | 2 | 3 | 4 | 5 {
  if (consecutiveDays >= 10) return 5;
  if (consecutiveDays >= 8) return 4;
  if (consecutiveDays >= 5) return 3;
  return 1;
}

export function detectNorthbound(input: NorthboundInput): SignalResult | null {
  const { symbol, triggeredAt, dailyHoldings } = input;

  if (!dailyHoldings || dailyHoldings.length < 5) return null;

  // 检查最近 5 天是否连续增持
  const last5 = dailyHoldings.slice(-5);
  for (let i = 1; i < last5.length; i++) {
    if (last5[i].holdShares <= last5[i - 1].holdShares) {
      return null;
    }
  }

  // 计算实际连续增持天数
  let consecutiveDays = 1;
  for (let i = dailyHoldings.length - 1; i >= 1; i--) {
    if (dailyHoldings[i].holdShares > dailyHoldings[i - 1].holdShares) {
      consecutiveDays++;
    } else {
      break;
    }
  }

  return {
    signalId: 'S03',
    symbol,
    triggeredAt,
    strength: calcStrength(consecutiveDays),
    detail: {
      consecutiveDays,
      startDate: last5[0].date,
      endDate: last5[last5.length - 1].date,
      startShares: last5[0].holdShares,
      endShares: last5[last5.length - 1].holdShares,
    },
  };
}
