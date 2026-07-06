/** 涨停/跌停股池，对应 sdk.marketEvent.ztPool() */
export interface ZTPoolItem {
  code: string;
  name: string;
  price: number;
  changePercent: number;
  limitPrice: number | null;
  amount: number;
  floatMarketValue: number;
  totalMarketValue: number;
  turnoverRate: number;
  continuousBoardCount: number;
  firstBoardTime: string;
  lastBoardTime: string;
  boardAmount: number;
  sealAmount: number;
  failedCount: number;
  industry: string;
  ztStatistics: string;
  amplitude: number | null;
  speed: number | null;
}

/** 盘口异动，对应 sdk.marketEvent.stockChanges() */
export interface StockChange {
  time: string;
  code: string;
  name: string;
  changeType: string;
  changeTypeLabel: string;
  info: string;
}

/** 板块异动，对应 sdk.marketEvent.boardChanges() */
export interface BoardChange {
  /** 板块名称 */
  name: string;
  /** 涨跌幅(%) */
  changePercent: number | null;
  /** 主力净流入(元) */
  mainNetInflow: number | null;
  /** 异动总次数 */
  totalChangeCount: number | null;
  /** 异动最频繁个股代码 */
  topStockCode: string;
  /** 异动最频繁个股名称 */
  topStockName: string;
  /** 异动最频繁个股方向 */
  topStockDirection: string;
  /** 异动类型分布 */
  changeTypeDistribution: Record<string, number>;
}
