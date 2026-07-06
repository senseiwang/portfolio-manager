/** 个股资金流向，对应 sdk.fundFlow.individual() */
export interface IndividualFundFlow {
  date: string;
  mainNetInflow: number;
  smallNetInflow: number;
  mediumNetInflow: number;
  largeNetInflow: number;
  superLargeNetInflow: number;
  mainNetInflowPercent: number;
  smallNetInflowPercent: number;
  mediumNetInflowPercent: number;
  largeNetInflowPercent: number;
  superLargeNetInflowPercent: number;
  close: number;
  changePercent: number | null;
}

/** 大盘资金流向，对应 sdk.fundFlow.market() */
export interface MarketFundFlow {
  date: string;
  mainNetInflow: number;
  smallNetInflow: number;
  mediumNetInflow: number;
  largeNetInflow: number;
  superLargeNetInflow: number;
  mainNetInflowPercent: number;
  smallNetInflowPercent: number;
  mediumNetInflowPercent: number;
  largeNetInflowPercent: number;
  superLargeNetInflowPercent: number;
  shClose: number | null;
  shChangePercent: number | null;
  szClose: number | null;
  szChangePercent: number | null;
}

/** 板块资金流向历史，对应 sdk.fundFlow.sectorHistory() */
export interface SectorFundFlowHistory {
  date: string;
  mainNetInflow: number;
  smallNetInflow: number;
  mediumNetInflow: number;
  largeNetInflow: number;
  superLargeNetInflow: number;
  mainNetInflowPercent: number;
}

/** 资金流向排名项，对应 sdk.fundFlow.rank() */
export interface FundFlowRankItem {
  code: string;
  name: string;
  mainNetInflow: number;
  mainNetInflowPercent: number;
}

/** 板块资金流排名项，对应 sdk.fundFlow.sectorRank() */
export interface SectorFundFlowItem {
  code: string;
  name: string;
  changePercent: number | null;
  mainNetInflow: number | null;
  mainNetInflowPercent: number | null;
}
