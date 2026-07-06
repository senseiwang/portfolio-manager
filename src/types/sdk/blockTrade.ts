/** 大宗交易市场统计，对应 sdk.blockTrade.marketStat() */
export interface BlockTradeMarketStat {
  date: string;
  shClose: number | null;
  shChangePercent: number | null;
  totalAmount: number | null;
  premiumAmount: number | null;
  premiumRatio: number | null;
  discountAmount: number | null;
  discountRatio: number | null;
}

/** 大宗交易明细，对应 sdk.blockTrade.detail() */
export interface BlockTradeDetail {
  code: string;
  name: string;
  price: number;
  volume: number;
  amount: number;
  premiumRatio: number | null;
  buyBranch: string;
  sellBranch: string;
  date: string;
}
