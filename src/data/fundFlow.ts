/**
 * 资金流向数据获取模块
 *
 * 业务语义包装：个股/大盘资金流向
 */
import type { SdkClient } from './sdkClient';
import type { IndividualFundFlow, MarketFundFlow } from '../types/sdk';

/** 获取个股资金流向历史 */
export async function getIndividualFundFlow(
  client: SdkClient,
  symbol: string,
  days = 20,
): Promise<IndividualFundFlow[]> {
  return client.getFundFlow(symbol, days);
}

/** 获取大盘资金流向 */
export async function getMarketFundFlow(
  client: SdkClient,
): Promise<MarketFundFlow[]> {
  return client.getMarketFundFlow();
}
