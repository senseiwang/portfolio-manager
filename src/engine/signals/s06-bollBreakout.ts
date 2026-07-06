/**
 * S06 - 放量突破 BOLL 中轨
 *
 * 当股价从 BOLL 中轨下方突破至中轨上方，且成交量显著放大时触发。
 * 为趋势由弱转强的标志。
 */
import type { SignalResult } from '../../types/signal';

export interface BOLLPoint {
  mid: number | null;
  upper: number | null;
  lower: number | null;
}

export interface BOLLBreakoutInput {
  symbol: string;
  triggeredAt: string;
  /** BOLL 计算结果数组（按时间升序） */
  bollResults: BOLLPoint[];
  /** 收盘价数组（按时间升序，与 bollResults 等长） */
  closes: number[];
  /** 成交量数组（按时间升序，与 bollResults 等长） */
  volumes: number[];
  /** 近期平均成交量（用于判断是否放量） */
  avgVolume: number;
}

/**
 * 计算信号强度：
 * - 突破且成交量 > 均量 3 倍 → 5 星
 * - 突破且成交量 > 均量 2.5 倍 → 4 星
 * - 突破且成交量 > 均量 2 倍 → 3 星
 * - 突破且成交量 > 均量 1.5 倍 → 2 星
 */
function calcStrength(volumeRatio: number): 1 | 2 | 3 | 4 | 5 {
  if (volumeRatio >= 3) return 5;
  if (volumeRatio >= 2.5) return 4;
  if (volumeRatio >= 2) return 3;
  if (volumeRatio >= 1.5) return 2;
  return 1;
}

export function detectBOLLBreakout(input: BOLLBreakoutInput): SignalResult | null {
  const { symbol, triggeredAt, bollResults, closes, volumes, avgVolume } = input;

  if (!bollResults || bollResults.length < 2 || !closes || !volumes) {
    return null;
  }

  if (bollResults.length !== closes.length || bollResults.length !== volumes.length) {
    return null;
  }

  const prevBOLL = bollResults[bollResults.length - 2];
  const currBOLL = bollResults[bollResults.length - 1];
  const prevClose = closes[closes.length - 2];
  const currClose = closes[closes.length - 1];
  const currVolume = volumes[volumes.length - 1];

  if (
    prevBOLL.mid === null || currBOLL.mid === null ||
    prevClose === null || currClose === null ||
    currVolume === null || avgVolume <= 0
  ) {
    return null;
  }

  // 条件 1: 当前收盘价突破中轨，且前一周期在中轨下方（或刚好在中轨上）
  const wasBelowOrAtMid = prevClose <= prevBOLL.mid;
  const isAboveMid = currClose > currBOLL.mid;

  if (!wasBelowOrAtMid || !isAboveMid) return null;

  // 条件 2: 成交量放量（> 均量 1.5 倍）
  const volumeRatio = currVolume / avgVolume;
  if (volumeRatio <= 1.5) return null;

  return {
    signalId: 'S06',
    symbol,
    triggeredAt,
    strength: calcStrength(volumeRatio),
    detail: {
      prevClose,
      currClose,
      mid: currBOLL.mid,
      volume: currVolume,
      avgVolume,
      volumeRatio: Math.round(volumeRatio * 100) / 100,
    },
  };
}
