/**
 * STG01 - 强势回调策略
 *
 * 逻辑：识别前期强势股，当其回调至 MA20 附近时买入。
 * 卖出条件：反弹至前高附近止盈，或跌破止损线。
 */
import type { KLine } from '../../types/sdk';
import type { StrategySignal } from '../../types/strategy';

/** 策略参数 */
export interface PullbackStrategyParams {
  /** 均线周期，默认 20 */
  maPeriod?: number;
  /** 前期强势涨幅阈值（%），默认 15 */
  strongThreshold?: number;
  /** 回调至均线最大偏离（%），默认 3 */
  pullbackDeviation?: number;
  /** 止盈比例（%），默认 5 */
  takeProfitPercent?: number;
  /** 止损比例（%），默认 5 */
  stopLossPercent?: number;
  /** RSI 上限，默认 50（不超过该值才买入） */
  maxRsi?: number;
}

/** 策略上下文缓存 */
interface PullbackContext {
  ma: number[];
  rsi: number[];
  recentHighs: number[];
}

/** 计算 MA */
function calcMA(closes: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += closes[j];
      }
      result.push(sum / period);
    }
  }
  return result;
}

/** 计算 RSI */
function calcRSI(closes: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period) {
      result.push(NaN);
    } else {
      let gains = 0;
      let losses = 0;
      for (let j = i - period + 1; j <= i; j++) {
        const diff = closes[j] - closes[j - 1];
        if (diff > 0) gains += diff;
        else losses -= diff;
      }
      const avgGain = gains / period;
      const avgLoss = losses / period;
      result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
    }
  }
  return result;
}

/**
 * 计算 N 日内的最高价
 */
function calcRecentHighs(
  closes: number[],
  lookback: number,
): number[] {
  const result: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    const start = Math.max(0, i - lookback + 1);
    let max = -Infinity;
    for (let j = start; j <= i; j++) {
      if (closes[j] > max) max = closes[j];
    }
    result.push(max);
  }
  return result;
}

/**
 * 检查是否满足买入条件（强势后回调至 MA20 附近）
 */
export function checkBuyCondition(
  index: number,
  closes: number[],
  ctx: PullbackContext,
  params: Required<PullbackStrategyParams>,
): boolean {
  if (index < params.maPeriod) return false;

  const ma = ctx.ma[index];
  const rsi = ctx.rsi[index];
  const recentHigh = ctx.recentHighs[index];
  const currentPrice = closes[index];

  if (isNaN(ma) || isNaN(rsi) || isNaN(recentHigh)) return false;

  // 条件 1: 前期强势（近期最高价相比 N 期前的涨幅超过阈值）
  const prevClose = closes[index - params.maPeriod];
  const risePercent = ((recentHigh - prevClose) / prevClose) * 100;
  if (risePercent < params.strongThreshold) return false;

  // 条件 2: 价格在 MA20 附近（偏离不超过 pullbackDeviation %）
  const deviation = Math.abs((currentPrice - ma) / ma) * 100;
  if (deviation > params.pullbackDeviation) return false;

  // 条件 3: 价格在 MA20 下方或附近（回调确认）
  if (currentPrice > ma * 1.01) return false;

  // 条件 4: RSI 未超买
  if (rsi > params.maxRsi) return false;

  return true;
}

/**
 * 创建强势回调策略
 */
export function createPullbackStrategy(
  klines: KLine[],
  params?: PullbackStrategyParams,
): (bar: KLine, index: number, history: readonly KLine[]) => StrategySignal {
  const p: Required<PullbackStrategyParams> = {
    maPeriod: params?.maPeriod ?? 20,
    strongThreshold: params?.strongThreshold ?? 15,
    pullbackDeviation: params?.pullbackDeviation ?? 3,
    takeProfitPercent: params?.takeProfitPercent ?? 5,
    stopLossPercent: params?.stopLossPercent ?? 5,
    maxRsi: params?.maxRsi ?? 50,
  };

  const closes = klines.map(k => k.close);
  const ctx: PullbackContext = {
    ma: calcMA(closes, p.maPeriod),
    rsi: calcRSI(closes, 14),
    recentHighs: calcRecentHighs(closes, p.maPeriod),
  };

  let buyPrice = 0;
  let hasPosition = false;

  return (bar: KLine, index: number) => {
    if (index >= klines.length) return 'hold';

    if (!hasPosition) {
      // 买入逻辑
      if (checkBuyCondition(index, closes, ctx, p)) {
        buyPrice = bar.close;
        hasPosition = true;
        return 'buy';
      }
      return 'hold';
    }

    // 持仓中的卖出逻辑
    const returnPct = ((bar.close - buyPrice) / buyPrice) * 100;

    if (returnPct >= p.takeProfitPercent) {
      hasPosition = false;
      return 'sell'; // 止盈
    }

    if (returnPct <= -p.stopLossPercent) {
      hasPosition = false;
      return 'sell'; // 止损
    }

    return 'hold';
  };
}