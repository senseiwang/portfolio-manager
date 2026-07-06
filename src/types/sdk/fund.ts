/** 基金简介，对应 sdk.fund.profile() */
export interface FundProfile {
  code: string;
  name: string;
  sourceRate: number;
  rate: number;
  minSubscription: number;
  holdings: FundHolding[];
  bondHoldings: FundHolding[];
  assetAllocation: FundAssetAllocation[];
}

export interface FundHolding {
  marketId: string;
  code: string;
}

export interface FundAssetAllocation {
  date: string;
  timestamp: number;
  stockRatio: number;
  bondRatio: number;
  cashRatio: number;
  otherRatio: number;
  netAsset: number;
}

/** 基金分红列表，对应 sdk.fund.dividendList() 的 items 结构 */
export interface FundDividendItem {
  code: string;
  name: string;
  equityRecordDate: string;
  exDividendDate: string;
  dividendPerShare: number;
  payDate: string;
  dividendType: string | null;
}

export interface FundDividendListResponse {
  items: FundDividendItem[];
}
