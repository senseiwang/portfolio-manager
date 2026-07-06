/** calcSignals 返回值（来自 stock-sdk/signals） */
export interface CalcSignalItem {
  type: string;
  date: string;
  strength: number;
  detail: Record<string, unknown>;
}

/** backtest 返回值（来自 stock-sdk/screener） */
export interface BacktestReport {
  initialCapital: number;
  finalEquity: number;
  totalReturn: number;
  winRate: number;
  maxDrawdown: number;
  tradeCount: number;
  trades: BacktestTrade[];
  equityCurve: number[];
}

export interface BacktestTrade {
  entryIndex: number;
  exitIndex: number;
  entryPrice: number;
  exitPrice: number;
  returnPercent: number;
}
