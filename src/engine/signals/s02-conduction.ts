/**
 * S02 - 三级传导共振
 *
 * 当大盘上涨、板块排名前 3、个股资金流排名前 3% 同时满足时触发。
 * 代表自上而下的传导逻辑：大环境 → 板块 → 个股 形成共振。
 */
import type { SignalResult } from '../../types/signal';

export interface ConductionInput {
  symbol: string;
  triggeredAt: string;
  /** 大盘是否上涨 */
  marketUp: boolean;
  /** 板块涨跌排名（1 = 最强），个股所属行业或概念板块排名 */
  sectorRank: number;
  /** 个股在全市场中的资金流排名百分位（0~1，越小越好） */
  individualRank: number;
}

/**
 * 计算信号强度：
 * - 板块第 1 + 个股前 1% → 5 星
 * - 板块前 2 + 个股前 2% → 4 星
 * - 其余 → 3 星
 */
function calcStrength(sectorRank: number, individualRank: number): 1 | 2 | 3 | 4 | 5 {
  if (sectorRank <= 1 && individualRank <= 0.01) return 5;
  if (sectorRank <= 2 && individualRank <= 0.02) return 4;
  return 3;
}

export function detectConduction(input: ConductionInput): SignalResult | null {
  const { symbol, triggeredAt, marketUp, sectorRank, individualRank } = input;

  if (!marketUp) return null;
  if (sectorRank > 3) return null;
  if (individualRank > 0.03) return null;

  return {
    signalId: 'S02',
    symbol,
    triggeredAt,
    strength: calcStrength(sectorRank, individualRank),
    detail: {
      marketUp,
      sectorRank,
      individualRank: Math.round(individualRank * 10000) / 10000,
    },
  };
}
