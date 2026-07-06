/**
 * 龙虎榜数据获取模块
 */
import type { SdkClient } from './sdkClient';
import type { DragonTigerDetail, DragonTigerSeat } from '../types/sdk';

/** 获取指定日期的龙虎榜榜单 */
export async function getDragonTigerList(
  client: SdkClient,
  date: string,
): Promise<DragonTigerDetail[]> {
  return client.getDragonTigerDetail(date);
}

/** 获取个股龙虎榜席位明细 */
export async function getDragonTigerSeats(
  client: SdkClient,
  symbol: string,
  date: string,
): Promise<DragonTigerSeat[]> {
  return client.getDragonTigerSeatDetail(symbol, date);
}
