/**
 * 市场事件数据获取模块（涨停/异动）
 */
import type { SdkClient } from './sdkClient';
import type { ZTPoolItem, StockChange } from '../types/sdk';

/** 获取涨停/跌停股池 */
export async function getLimitUpPool(
  client: SdkClient,
): Promise<ZTPoolItem[]> {
  return client.getZTPool();
}

/** 获取盘口异动 */
export async function getStockMarketChanges(
  client: SdkClient,
): Promise<StockChange[]> {
  return client.getStockChanges();
}
