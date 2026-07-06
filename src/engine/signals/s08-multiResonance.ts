/**
 * S08 - 多维共振
 *
 * 综合多个信号进行二次判断。当满足以下条件时触发：
 * 1. S01（资金流排名前 10%）已触发
 * 2. S03（北向连续增持）或 S04（MACD 金叉）至少有一个触发
 * 3. RSI < 65（非超买区域）
 * 4. 价格未创新高（避免追高）
 *
 * 此信号直接调用 S01、S03、S04 的检测函数。
 */
import type { SignalResult } from '../../types/signal';
import { detectFundFlowRank } from './s01-fundFlowRank';
import { detectNorthbound } from './s03-northbound';
import { detectMACDGoldenCross } from './s04-macdGoldenCross';

export interface MultiResonanceInput {
  symbol: string;
  triggeredAt: string;
  /** S01 检测输入 */
  signal1Input: Parameters<typeof detectFundFlowRank>[0];
  /** S03 检测输入 */
  signal3Input: Parameters<typeof detectNorthbound>[0];
  /** S04 检测输入 */
  signal4Input: Parameters<typeof detectMACDGoldenCross>[0];
  /** 当前 RSI 值 */
  rsi: number | null;
  /** 最近一期收盘价 */
  closes: number[];
}

function isNewHigh(closes: number[]): boolean {
  if (closes.length < 2) return true;
  const latest = closes[closes.length - 1];
  // 检查前 N 个周期是否有更高收盘价
  const lookback = closes.slice(0, -1);
  return lookback.length > 0 && latest >= Math.max(...lookback);
}

function calcStrength(
  s1Strength: number,
  s3Strength: number | null,
  s4Strength: number | null,
  rsi: number | null,
): 1 | 2 | 3 | 4 | 5 {
  // 基础强度：取子信号最大强度
  const maxSubStrength = Math.max(
    s1Strength,
    s3Strength ?? 0,
    s4Strength ?? 0,
  );

  // RSI < 30（超卖）加分
  if (rsi !== null && rsi < 30) {
    return Math.min(5, maxSubStrength + 1) as 1 | 2 | 3 | 4 | 5;
  }

  return Math.min(5, maxSubStrength) as 1 | 2 | 3 | 4 | 5;
}

export function detectMultiResonance(input: MultiResonanceInput): SignalResult | null {
  const { symbol, triggeredAt, signal1Input, signal3Input, signal4Input, rsi, closes } = input;

  // 条件 1: S01 必须触发
  const s1Result = detectFundFlowRank(signal1Input);
  if (!s1Result) return null;

  // 条件 2: S03 或 S04 至少触发一个
  const s3Result = detectNorthbound(signal3Input);
  const s4Result = detectMACDGoldenCross(signal4Input);
  if (!s3Result && !s4Result) return null;

  // 条件 3: RSI < 65（非超买区域）
  if (rsi === null || rsi >= 65) return null;

  // 条件 4: 价格未创新高
  if (isNewHigh(closes)) return null;

  return {
    signalId: 'S08',
    symbol,
    triggeredAt,
    strength: calcStrength(
      s1Result.strength,
      s3Result?.strength ?? null,
      s4Result?.strength ?? null,
      rsi,
    ),
    detail: {
      s1Detail: s1Result.detail,
      s3Triggered: !!s3Result,
      s4Triggered: !!s4Result,
      rsi,
    },
  };
}
