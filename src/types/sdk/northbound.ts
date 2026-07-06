/** 沪深港通资金流向汇总，对应 sdk.northbound.summary() */
export interface NorthboundSummary {
  date: string;
  type: string;
  boardName: string;
  direction: string;
  status: string;
  netBuyAmount: number;
  netInflow: number;
  remainAmount: number;
  upCount: number;
  flatCount: number;
  downCount: number;
  indexCode: string;
  indexName: string;
  indexChangePercent: number | null;
}

/** 沪深港通持股排行项，对应 sdk.northbound.holdingRank() */
export interface NorthboundHoldingRank {
  code: string;
  name: string;
  holdingAmount: number;
  holdingShares: number;
  changeShares: number;
  changePercent: number | null;
  price: number;
  changePercentDay: number | null;
  market: string;
}

/** 沪深港通历史，对应 sdk.northbound.history() */
export interface NorthboundHistory {
  date: string;
  netBuyAmount: number;
  netInflow: number;
}

/** 个股北向持仓历史，对应 sdk.northbound.individual() */
export interface NorthboundIndividual {
  date: string;
  holdingShares: number;
  holdingAmount: number;
  changeShares: number;
  changePercent: number | null;
}
