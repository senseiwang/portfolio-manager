/** 龙虎榜详情，对应 sdk.dragonTiger.detail() */
export interface DragonTigerDetail {
  code: string;
  name: string;
  date: string;
  reason: string;
  totalBuy: number;
  totalSell: number;
  netBuy: number;
  buyCount: number;
  sellCount: number;
  changePercent: number;
  turnoverRate: number | null;
}

/** 龙虎榜营业部/机构席位详情，对应 sdk.dragonTiger.seatDetail() */
export interface DragonTigerSeat {
  name: string;
  type: string;
  buyAmount: number;
  sellAmount: number;
  netBuy: number;
}
