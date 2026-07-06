/** 行业/概念板块列表项，对应 sdk.board.industry.list() / sdk.board.concept.list() */
export interface BoardListItem {
  rank: number;
  name: string;
  code: string;
  price: number;
  change: number;
  changePercent: number;
  totalMarketCap: number;
  turnoverRate: number;
}

/** 板块实时行情快照，对应 sdk.board.industry.spot() / sdk.board.concept.spot() */
export interface BoardSpotItem {
  item: string;
  value: number;
}

/** 板块成分股，对应 sdk.board.industry.constituents() */
export interface BoardConstituent {
  code: string;
  name: string;
  price: number;
  changePercent: number;
  weight: number | null;
}

/** 板块 K 线，对应 sdk.board.industry.kline() */
export interface BoardKLine {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
  amplitude: number | null;
}
