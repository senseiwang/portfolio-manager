/**
 * STG02 - 资金流驱动策略
 *
 * 逻辑：主力资金连续净流入时买入，出现净流出时卖出。
 * 需要外部提供资金流数据（按日期索引）。
 */
import type { KLine } from '../../types/sdk';
import type { StrategySignal } from '../../types/strategy';

/** 策略参数 */
export interface FundFlowStrategyParams {
  /** 连续净流入天数阈值，默认 3 */
  consecutiveInflowDays?: number;
  /** 单日净流入占成交额比例阈值（%），默认 0.5 */
  minInflowPercent?: number;
  /** 止盈（%），默认 8 */
  takeProfitPercent?: number;
  /** 止损（%），默认 5 */
  stopLossPercent?: number;
}

/**
 * 检查是否满足买入条件（连续净流入）
 */
export function checkBuyCondition(
  index: number,
  klines: KLine[],
  fundFlowMap: Map<string, number>,
  params: Required<FundFlowStrategyParams>,
): boolean {
  if (index < params.consecutiveInflowDays) return false;

  // 检查最近 N 天是否连续净流入
  for (let i = index - params.consecutiveInflowDays + 1; i <= index; i++) {
    const date = klines[i].date;
    const inflowPercent = fundFlowMap.get(date);

    // 缺少资金流数据则视为不满足
    if (inflowPercent === undefined || inflowPercent === null) return false;
    if (inflowPercent < params.minInflowPercent) return false;
  }

  return true;
}

/**
 * 创建资金流驱动策略
 *
 * @param klines - K 线数据
 * @param fundFlowMap - 按日期索引的主力净流入占比（%），key 为日期字符串 "YYYY-MM-DD"
 * @param params - 可选参数
 */
export function createFundFlowStrategy(
  klines: KLine[],
  fundFlowMap: Map<string, number>,
  params?: FundFlowStrategyParams,
): (bar: KLine, index: number, history: readonly KLine[]) => StrategySignal {
  const p: Required<FundFlowStrategyParams> = {
    consecutiveInflowDays: params?.consecutiveInflowDays ?? 3,
    minInflowPercent: params?.minInflowPercent ?? 0.5,
    takeProfitPercent: params?.takeProfitPercent ?? 8,
    stopLossPercent: params?.stopLossPercent ?? 5,
  };

  let buyPrice = 0;
  let hasPosition = false;

  return (bar: KLine, index: number) => {
    if (index >= klines.length) return 'hold';

    if (!hasPosition) {
      if (checkBuyCondition(index, klines, fundFlowMap, p)) {
        buyPrice = bar.close;
        hasPosition = true;
        return 'buy';
      }
      return 'hold';
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