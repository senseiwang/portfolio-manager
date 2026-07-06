/** 单个持仓条目 */
export interface HoldingEntry {
  /** 6 位代码，不含市场前缀，如 "600519" */
  code: string;
  /** 持有股数 */
  shares: number;
  /** 持仓成本价（元） */
  costPrice: number;
}

/** 投资组合配置 */
export interface PortfolioConfig {
  /** 已有持仓列表 */
  holdings: HoldingEntry[];
  /** Watchlist 代码数组 */
  watchlist: string[];
}
