/**
 * 参考数据获取模块（交易日历、市场状态、大宗交易、两融）
 */
import type { SdkClient } from './sdkClient';
import type {
  IsTradingDayResult,
  NextTradingDayResult,
  MarketStatus,
  BlockTradeMarketStat,
  MarginAccountInfo,
} from '../types/sdk';

/** 判断是否为交易日 */
export async function checkTradingDay(
  client: SdkClient,
  date: string,
): Promise<IsTradingDayResult> {
  return client.isTradingDay(date);
}

/** 获取下一个交易日 */
export async function getNextTradingDay(
  client: SdkClient,
  date: string,
): Promise<NextTradingDayResult> {
  return client.nextTradingDay(date);
}

/** 获取当前市场状态 */
export function getCurrentMarketStatus(
  client: SdkClient,
): MarketStatus {
  return client.getMarketStatus();
}

/** 获取大宗交易市场统计 */
export async function getBlockTradeStats(
  client: SdkClient,
  date: string,
): Promise<BlockTradeMarketStat[]> {
  return client.getBlockTradeMarketStat(date);
}

/** 获取融资融券账户统计 */
export async function getMarginStats(
  client: SdkClient,
): Promise<MarginAccountInfo[]> {
  return client.getMarginAccountInfo();
}
