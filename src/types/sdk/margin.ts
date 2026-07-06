/** 融资融券账户统计，对应 sdk.margin.accountInfo() */
export interface MarginAccountInfo {
  date: string;
  finBalance: number;
  loanBalance: number;
  finBuyAmount: number;
  loanSellAmount: number;
  investorCount: number;
  liabilityInvestorCount: number | null;
  totalGuarantee: number;
  avgGuaranteeRatio: number;
}

/** 融资融券标的列表，对应 sdk.margin.targetList() */
export interface MarginTarget {
  code: string;
  name: string;
  market: string;
}
