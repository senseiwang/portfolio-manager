/**
 * S05 - KDJ 超卖 + 底背离
 *
 * 当 KDJ 的 K 值低于 20（超卖区域），同时价格创出新低但 K 值未创新低（底背离）时触发。
 * 表示下跌动能衰竭，可能即将反弹。
 */
import type { SignalResult } from '../../types/signal';

export interface KDJPoint {
  k: number | null;
  d: number | null;
}

export interface KDJDivergenceInput {
  symbol: string;
  triggeredAt: string;
  /** KDJ 计算结果数组（按时间升序） */
  kdjResults: KDJPoint[];
  /** 收盘价数组（按时间升序，与 kdjResults 等长） */
  closes: number[];
}

/**
 * 计算信号强度：
 * - K < 10（深度超卖）+ 底背离 → 5 星
 * - K 15-20 + 底背离 → 3 星
 * - K 10-15 + 底背离 → 4 星
 */
function calcStrength(k: number): 1 | 2 | 3 | 4 | 5 {
  if (k < 10) return 5;
  if (k < 15) return 4;
  if (k < 20) return 3;
  return 1;
}

export function detectKDJDivergence(input: KDJDivergenceInput): SignalResult | null {
  const { symbol, triggeredAt, kdjResults, closes } = input;

  if (!kdjResults || kdjResults.length < 3 || !closes || closes.length < 3) {
    return null;
  }

  if (kdjResults.length !== closes.length) return null;

  const currK = kdjResults[kdjResults.length - 1].k;
  const currClose = closes[closes.length - 1];

  if (currK === null || currClose === null) return null;

  // 条件 1: K < 20（超卖）
  if (currK >= 20) return null;

  // 条件 2: 底背离 - 价格创新低但 K 未创新低
  // 取最近 3 个周期比较
  const prevK1 = kdjResults[kdjResults.length - 2].k;
  const prevK2 = kdjResults.length >= 3 ? kdjResults[kdjResults.length - 3].k : null;
  const prevClose1 = closes[closes.length - 2];
  const prevClose2 = closes.length >= 3 ? closes[closes.length - 3] : null;

  if (prevK1 === null) return null;

  // 价格创新低：当前收盘价 <= 前两个周期中的最低收盘价
  const lowestPrevClose = Math.min(
    prevClose1,
    prevClose2 !== null ? prevClose2 : prevClose1,
  );

  if (currClose >= lowestPrevClose) return null;

  // K 未创新低：当前 K > 前两个周期中的最低 K
  const lowestPrevK = Math.min(
    prevK1,
    prevK2 !== null ? prevK2 : prevK1,
  );

  if (currK <= lowestPrevK) return null;

  return {
    signalId: 'S05',
    symbol,
    triggeredAt,
    strength: calcStrength(currK),
    detail: {
      currK,
      currClose,
      lowestPrevClose,
      lowestPrevK,
      prevK1,
      prevK2,
    },
  };
}
