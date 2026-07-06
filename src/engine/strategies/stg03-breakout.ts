/**
 * STG03 - 突破跟进策略
 *
 * 逻辑：放量突破前期高点时买入，跌破 MA20 时卖出。
 */
import type { KLine } from '../../types/sdk';
import type { StrategySignal } from '../../types/strategy';

/** 策略参数 */
export interface BreakoutStrategyParams {
  /** 突破观察期（日），默认 20 */
  lookbackPeriod?: number;
  /** 量能放大倍数，默认 1.5 */
  volumeMultiplier?: number;
  /** 均线周期（卖出参考），默认 20 */
  maPeriod?: number;
  /** 止损（%），默认 5 */
  stopLossPercent?: number;
}

/** 策略上下文 */
interface BreakoutContext {
  highs: number[];
  avgVolumes: number[];
  ma: number[];
}

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

/** 计算 N 日内最高价 */
function calcHighs(highs: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < highs.length; i++) {
    const start = Math.max(0, i - period + 1);
    let max = -Infinity;
    for (let j = start; j <= i; j++) {
      if (highs[j] > max) max = highs[j];
    }
    result.push(max);
  }
  return result;
}

/** 计算 N 日均量 */
function calcAvgVolume(volumes: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < volumes.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += volumes[j];
      }
      result.push(sum / period);
    }
  }
  return result;
}

/**
 * 检查是否满足买入条件（放量突破前高）
 */
export function checkBuyCondition(
  index: number,
  closes: number[],
  volumes: number[],
  ctx: BreakoutContext,
  params: Required<BreakoutStrategyParams>,
): boolean {
  if (index < params.lookbackPeriod) return false;

  const prevHigh = ctx.highs[index - 1]; // 上一期的前 N 日最高价
  const currentClose = closes[index];
  const currentVolume = volumes[index];
  const avgVolume = ctx.avgVolumes[index];
  const ma = ctx.ma[index];

  if (isNaN(prevHigh) || isNaN(avgVolume) || isNaN(ma)) return false;

  // 条件 1: 收盘价突破前期 N 日最高价
  if (currentClose <= prevHigh) return false;

  // 条件 2: 成交量放大
  if (currentVolume < avgVolume * params.volumeMultiplier) return false;

  // 条件 3: 价格在 MA20 之上（确认趋势）
  if (currentClose < ma) return false;

  return true;
}

/**
 * 创建突破跟进策略
 */
export function createBreakoutStrategy(
  klines: KLine[],
  params?: BreakoutStrategyParams,
): (bar: KLine, index: number, history: readonly KLine[]) => StrategySignal {
  const p: Required<BreakoutStrategyParams> = {
    lookbackPeriod: params?.lookbackPeriod ?? 20,
    volumeMultiplier: params?.volumeMultiplier ?? 1.5,
    maPeriod: params?.maPeriod ?? 20,
    stopLossPercent: params?.stopLossPercent ?? 5,
  };

  const closes = klines.map(k => k.close);
  const highs = klines.map(k => k.high);
  const volumes = klines.map(k => k.volume);

  const ctx: BreakoutContext = {
    highs: calcHighs(highs, p.lookbackPeriod),
    avgVolumes: calcAvgVolume(volumes, p.lookbackPeriod),
    ma: calcMA(closes, p.maPeriod),
  };

  let buyPrice = 0;
  let hasPosition = false;

  return (bar: KLine, index: number) => {
    if (index >= klines.length) return 'hold';

    if (!hasPosition) {
      if (checkBuyCondition(index, closes, volumes, ctx, p)) {
        buyPrice = bar.close;
        hasPosition = true;
        return 'buy';
      }
      return 'hold';
    }

    // 跌破 MA20 卖出
    const ma = ctx.ma[index];
    if (!isNaN(ma) && bar.close < ma) {
      hasPosition = false;
      return 'sell';
    }

    // 止损
    const returnPct = ((bar.close - buyPrice) / buyPrice) * 100;
    if (returnPct <= -p.stopLossPercent) {
      hasPosition = false;
      return 'sell';
    }

    return 'hold';
  };
}