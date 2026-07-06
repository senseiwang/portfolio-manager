/**
 * 北向资金数据获取模块
 */
import type { SdkClient } from './sdkClient';
import type { NorthboundSummary, NorthboundHoldingRank } from '../types/sdk';

/** 获取北向资金流向汇总 */
export async function getNorthboundFlowSummary(
  client: SdkClient,
): Promise<NorthboundSummary[]> {
  return client.getNorthboundSummary();
}

/** 获取北向资金持仓排行 */
export async function getNorthboundTopHoldings(
  client: SdkClient,
  limit = 20,
): Promise<NorthboundHoldingRank[]> {
  return client.getNorthboundHoldingRank(limit);
}
