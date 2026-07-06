/**
 * 行情数据获取模块
 *
 * 业务语义包装：全市场扫描、按代码拉取、K 线获取
 */
import type { SdkClient } from './sdkClient';
import type { FullQuote, KLine, SearchResult } from '../types/sdk';

/** 全市场 A 股行情（用于候选池构建） */
export async function getAllMarketQuotes(
  client: SdkClient,
): Promise<FullQuote[]> {
  return client.getAllQuotes();
}

/** 按代码列表批量获取行情 */
export async function getQuotesByCodes(
  client: SdkClient,
  codes: string[],
): Promise<FullQuote[]> {
  return client.getQuotesByCodes(codes);
}

/** 获取个股历史 K 线 */
export async function getStockKLine(
  client: SdkClient,
  symbol: string,
  from: string,
  to: string,
): Promise<KLine[]> {
  return client.getKLine(symbol, from, to);
}

/** 搜索股票 */
export async function searchStocks(
  client: SdkClient,
  keyword: string,
): Promise<SearchResult[]> {
  return client.search(keyword);
}
