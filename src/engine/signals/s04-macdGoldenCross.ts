/**
 * S04 - MACD 金叉
 *
 * 当 DIF 线从下方向上突破 DEA 线时触发（金叉）。
 * 为经典的趋势反转看多信号。
 */
import type { SignalResult } from '../../types/signal';

export interface MACDPoint {
  dif: number | null;
  dea: number | null;
}

export interface MACDGoldenCrossInput {
  symbol: string;
  triggeredAt: string;
  /** MACD 计算结果数组（按时间升序） */
  macdResults: MACDPoint[];
}

/**
 * 计算信号强度：
 * - DIF 在零轴下方金叉（底背离）→ 5 星
 * - DIF 在零轴上方金叉（趋势加强）→ 4 星
 * - DIF 接近零轴金叉 → 3 星
 */
function calcStrength(latestDif: number | null): 1 | 2 | 3 | 4 | 5 {
  if (latestDif === null) return 3;
  if (latestDif < -0.5) return 5;
  if (latestDif > 0.5) return 4;
  return 3;
}

export function detectMACDGoldenCross(input: MACDGoldenCrossInput): SignalResult | null {
  const { symbol, triggeredAt, macdResults } = input;

  if (!macdResults || macdResults.length < 2) return null;

  const prev = macdResults[macdResults.length - 2];
  const curr = macdResults[macdResults.length - 1];

  if (prev.dif === null || prev.dea === null || curr.dif === null || curr.dea === null) {
    return null;
  }

  // 金叉条件：前一周期 dif <= dea，当前周期 dif > dea
  if (prev.dif > prev.dea || curr.dif <= curr.dea) {
    return null;
  }

  return {
    signalId: 'S04',
    symbol,
    triggeredAt,
    strength: calcStrength(curr.dif),
    detail: {
      prevDif: prev.dif,
      prevDea: prev.dea,
      currDif: curr.dif,
      currDea: curr.dea,
    },
  };
}
