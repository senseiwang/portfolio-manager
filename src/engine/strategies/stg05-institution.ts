/**
 * STG05 - 机构打板回调策略
 *
 * 逻辑：涨停板当日有机构买入（龙虎榜），后续回调时买入。
 * 卖出条件：反弹至前高附近或止损。
 *
 * 需要外部提供涨停日期和龙虎榜机构买入数据。
 */
import type { KLine } from '../../types/sdk';
import type { StrategySignal } from '../../types/strategy';

/** 策略参数 */
export interface InstitutionStrategyParams {
  /** 涨停后回调最大天数，默认 5 */
  maxPullbackDays?: number;
  /** 回调最大幅度（从涨停价算起，%），默认 8 */
  maxPullbackPercent?: number;
  /** 机构净买入金额下限（万元），默认 1000 */
  minInstitutionBuyAmount?: number;
  /** 止盈（%），默认 5 */
  takeProfitPercent?: number;
  /** 止损（%），默认 5 */
  stopLossPercent?: number;
}

/** 涨停事件 */
export interface LimitUpEvent {
  date: string;
  /** 涨停当日收盘价 */
  limitPrice: number;
  /** 机构净买入金额（万元） */
  institutionBuyAmount: number;
}

/**
 * 检查是否满足买入条件（涨停+机构买入+回调充分）
 */
export function checkBuyCondition(
  index: number,
  klines: KLine[],
  limitUpEvents: LimitUpEvent[],
  params: Required<InstitutionStrategyParams>,
): boolean {
  // 找到最近的涨停事件
  const currentDate = klines[index].date;
  const recentEvent = limitUpEvents
    .filter(e => e.date <= currentDate)
    .sort((a, b) => b.date.localeCompare(a.date))[0];

  if (!recentEvent) return false;

  // 条件 1: 机构净买入金额达标
  if (recentEvent.institutionBuyAmount < params.minInstitutionBuyAmount) return false;

  // 计算涨停后的天数
  const eventIndex = klines.findIndex(k => k.date === recentEvent.date);
  if (eventIndex === -1 || eventIndex >= index) return false;

  const daysSinceLimitUp = index - eventIndex;

  // 条件 2: 在回调天数范围内
  if (daysSinceLimitUp > params.maxPullbackDays) return false;

  // 条件 3: 回调幅度足够（从涨停价到当前价的跌幅）
  const currentPrice = klines[index].close;
  const pullbackPercent =
    ((recentEvent.limitPrice - currentPrice) / recentEvent.limitPrice) * 100;

  if (pullbackPercent < 0) return false; // 还没开始回调
  if (pullbackPercent > params.maxPullbackPercent) return false; // 回调过深

  return true;
}

/**
 * 创建机构打板回调策略
 *
 * @param klines - K 线数据
 * @param limitUpEvents - 涨停事件列表（机构买入数据）
 * @param params - 可选参数
 */
export function createInstitutionStrategy(
  klines: KLine[],
  limitUpEvents: LimitUpEvent[],
  params?: InstitutionStrategyParams,
): (bar: KLine, index: number, history: readonly KLine[]) => StrategySignal {
  const p: Required<InstitutionStrategyParams> = {
    maxPullbackDays: params?.maxPullbackDays ?? 5,
    maxPullbackPercent: params?.maxPullbackPercent ?? 8,
    minInstitutionBuyAmount: params?.minInstitutionBuyAmount ?? 1000,
    takeProfitPercent: params?.takeProfitPercent ?? 5,
    stopLossPercent: params?.stopLossPercent ?? 5,
  };

  let buyPrice = 0;
  let hasPosition = false;

  return (bar: KLine, index: number) => {
    if (index >= klines.length) return 'hold';

    if (!hasPosition) {
      if (checkBuyCondition(index, klines, limitUpEvents, p)) {
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