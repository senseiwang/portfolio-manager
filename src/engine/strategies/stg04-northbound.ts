/**
 * STG04 - 北向资金共振策略
 *
 * 逻辑：北向资金连续增持 + MACD 金叉时买入，北向减持或 MACD 死叉时卖出。
 * 需要外部提供北向持仓数据和 MACD 计算。
 */
import type { KLine } from '../../types/sdk';
import type { StrategySignal } from '../../types/strategy';

/** 策略参数 */
export interface NorthboundStrategyParams {
  /** 北向连续增持天数阈值，默认 3 */
  consecutiveIncreaseDays?: number;
  /** 单日增持占流通市值比例下限（%），默认 0.01 */
  minIncreasePercent?: number;
  /** 止盈（%），默认 8 */
  takeProfitPercent?: number;
  /** 止损（%），默认 5 */
  stopLossPercent?: number;
}

/** MACD 计算结果 */
export interface MACDResult {
  dif: number;
  dea: number;
  macd: number;
}

function calcMACD(closes: number[]): MACDResult[] {
  const results: MACDResult[] = [];
  const ema12: number[] = [];
  const ema26: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      ema12.push(closes[i]);
      ema26.push(closes[i]);
    } else {
      ema12.push(ema12[i - 1] * (11 / 13) + closes[i] * (2 / 13));
      ema26.push(ema26[i - 1] * (25 / 27) + closes[i] * (2 / 27));
    }

    const dif = ema12[i] - ema26[i];
    const dea = i === 0 ? dif : results[i - 1].dea * (8 / 10) + dif * (2 / 10);
    const macd = 2 * (dif - dea);

    results.push({ dif, dea, macd });
  }

  return results;
}

/**
 * 检查是否出现 MACD 金叉
 */
export function checkMACDGoldenCross(
  index: number,
  macdResults: MACDResult[],
): boolean {
  if (index < 1) return false;
  // DIF 从下方穿过 DEA
  return (
    macdResults[index - 1].dif <= macdResults[index - 1].dea &&
    macdResults[index].dif > macdResults[index].dea
  );
}

/**
 * 检查是否出现 MACD 死叉
 */
export function checkMACDDeathCross(
  index: number,
  macdResults: MACDResult[],
): boolean {
  if (index < 1) return false;
  return (
    macdResults[index - 1].dif >= macdResults[index - 1].dea &&
    macdResults[index].dif < macdResults[index].dea
  );
}

/**
 * 检查是否满足买入条件（北向连续增持 + MACD 金叉）
 */
export function checkBuyCondition(
  index: number,
  klines: KLine[],
  northboundMap: Map<string, number>,
  macdResults: MACDResult[],
  params: Required<NorthboundStrategyParams>,
): boolean {
  if (index < params.consecutiveIncreaseDays) return false;

  // 条件 1: 北向连续增持
  for (let i = index - params.consecutiveIncreaseDays + 1; i <= index; i++) {
    const date = klines[i].date;
    const increasePct = northboundMap.get(date);
    if (increasePct === undefined || increasePct === null) return false;
    if (increasePct < params.minIncreasePercent) return false;
  }

  // 条件 2: MACD 金叉
  if (!checkMACDGoldenCross(index, macdResults)) return false;

  return true;
}

/**
 * 创建北向资金共振策略
 *
 * @param klines - K 线数据
 * @param northboundMap - 按日期索引的北向增持比例（%），key 为日期 "YYYY-MM-DD"
 * @param params - 可选参数
 */
export function createNorthboundStrategy(
  klines: KLine[],
  northboundMap: Map<string, number>,
  params?: NorthboundStrategyParams,
): (bar: KLine, index: number, history: readonly KLine[]) => StrategySignal {
  const p: Required<NorthboundStrategyParams> = {
    consecutiveIncreaseDays: params?.consecutiveIncreaseDays ?? 3,
    minIncreasePercent: params?.minIncreasePercent ?? 0.01,
    takeProfitPercent: params?.takeProfitPercent ?? 8,
    stopLossPercent: params?.stopLossPercent ?? 5,
  };

  const closes = klines.map(k => k.close);
  const macdResults = calcMACD(closes);

  let buyPrice = 0;
  let hasPosition = false;

  return (bar: KLine, index: number) => {
    if (index >= klines.length) return 'hold';

    if (!hasPosition) {
      if (checkBuyCondition(index, klines, northboundMap, macdResults, p)) {
        buyPrice = bar.close;
        hasPosition = true;
        return 'buy';
      }
      return 'hold';
    }

    // 卖出条件：MACD 死叉 或 止盈止损
    if (checkMACDDeathCross(index, macdResults)) {
      hasPosition = false;
      return 'sell';
    }

    const returnPct = ((bar.close - buyPrice) / buyPrice) * 100;
    if (returnPct >= p.takeProfitPercent) {
      hasPosition = false;
      return 'sell';
    }
    if (returnPct <= -p.stopLossPercent) {
      hasPosition = false;
      return 'sell';
    }

    return 'hold';
  };
}