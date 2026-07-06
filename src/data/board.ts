/**
 * 板块数据获取模块
 *
 * 注意：行业/概念板块相关 API 在探测时部分因网络原因失败，
 * 此模块作为占位，供后续完善。
 */
import type { SdkClient } from './sdkClient';
import type { BoardListItem, BoardKLine } from '../types/sdk';

/** 获取行业板块列表 */
export async function getIndustryBoards(
  client: SdkClient,
): Promise<BoardListItem[]> {
  // 暂未封装，需要使用 sdk.board.industry.list() 的直接调用
  // 后续在 T-0.2 探测成功后可接入
  void client;
  return [];
}

/** 获取行业板块 K 线（已有 fixture） */
export async function getIndustryBoardKLine(
  client: SdkClient,
  boardCode: string,
): Promise<BoardKLine[]> {
  void boardCode;
  // 暂未封装
  void client;
  return [];
}
