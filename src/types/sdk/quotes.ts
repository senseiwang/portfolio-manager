/** A 股全量行情（含盘口五档），对应 sdk.batch.cn() / sdk.quotes.cn() */
export interface FullQuote {
  marketId: string;
  name: string;
  code: string;
  price: number;
  prevClose: number;
  open: number;
  volume: number;
  outerVolume: number;
  innerVolume: number;
  bid: Array<{ price: number; volume: number }>;
  ask: Array<{ price: number; volume: number }>;
  time: string;
  timestamp: number;
  tz: string;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  volume2: number;
  amount: number;
  turnoverRate: number | null;
  pe: number | null;
  amplitude: number | null;
  circulatingMarketCap: number | null;
  totalMarketCap: number | null;
  pb: number | null;
  limitUp: number | null;
  limitDown: number | null;
  volumeRatio: number | null;
  avgPrice: number | null;
  peStatic: number | null;
  peDynamic: number | null;
  high52w: number | null;
  low52w: number | null;
  circulatingShares: number | null;
  totalShares: number | null;
  market?: string;
  assetType?: string;
  source?: string;
}

/** A 股简要行情，对应 sdk.quotes.cnSimple() */
export interface SimpleQuote {
  marketId: string;
  name: string;
  code: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  amount: number;
  marketCap: number | null;
  marketType: string;
  market: string;
  assetType: string;
  source: string;
}

/** 港股行情，对应 sdk.quotes.hk() */
export interface HKQuote {
  code: string;
  name: string;
  price: number;
  prevClose: number;
  open: number;
  volume: number;
  high: number;
  low: number;
  change: number;
  changePercent: number;
  amount: number;
  timestamp: number;
  bid: number;
  ask: number;
  turnoverRate: number | null;
  pe: number | null;
  amplitude: number | null;
  high52w: number | null;
  low52w: number | null;
}

/** A 股 K 线，对应 sdk.kline.cn() */
export interface KLine {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
  amplitude: number | null;
  changePercent: number | null;
  change: number | null;
  turnoverRate: number | null;
  timestamp: number;
  tz: string;
  code: string;
}

/** 分时数据项，对应 sdk.quotes.timeline() */
export interface TimelineItem {
  time: string;
  price: number;
  avgPrice: number | null;
  volume: number;
  amount: number;
  changePercent: number | null;
}

/** 搜索结果，对应 sdk.search() */
export interface SearchResult {
  code: string;
  name: string;
  market: string;
  type: string;
  category: string;
}
