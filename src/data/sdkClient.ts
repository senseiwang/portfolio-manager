/**
 * Stock SDK 客户端封装
 *
 * 唯一允许直接调用 stock-sdk 的层。
 * 提供统一的接口供上层业务逻辑使用，方便测试时替换为 mock。
 */
import { StockSDK } from 'stock-sdk';
import type { RequestClientOptions } from 'stock-sdk';
import { normalizeSymbol, toTencentSymbol } from 'stock-sdk/symbols';
import type {
  FullQuote,
  KLine,
  IndividualFundFlow,
  MarketFundFlow,
  NorthboundSummary,
  NorthboundHoldingRank,
  ZTPoolItem,
  StockChange,
  BoardChange,
  DragonTigerDetail,
  DragonTigerSeat,
  BlockTradeMarketStat,
  MarginAccountInfo,
  MarginTarget,
  FundFlowRankItem,
  SectorFundFlowItem,
  DividendDetail,
  IsTradingDayResult,
  NextTradingDayResult,
  MarketStatus,
  SearchResult,
} from '../types/sdk';

/**
 * SDK 客户端接口
 * 所有方法签名必须与 mock 实现完全一致
 */
export interface SdkClient {
  /** 全市场 A 股批量行情 */
  getAllQuotes(): Promise<FullQuote[]>;
  /** 按代码批量获取行情 */
  getQuotesByCodes(codes: string[]): Promise<FullQuote[]>;
  /** A 股历史 K 线 */
  getKLine(symbol: string, from: string, to: string): Promise<KLine[]>;
  /** 个股资金流向 */
  getFundFlow(symbol: string, days?: number): Promise<IndividualFundFlow[]>;
  /** 大盘资金流向 */
  getMarketFundFlow(): Promise<MarketFundFlow[]>;
  /** 北向资金摘要 */
  getNorthboundSummary(): Promise<NorthboundSummary[]>;
  /** 北向资金持仓排行 */
  getNorthboundHoldingRank(limit?: number): Promise<NorthboundHoldingRank[]>;
  /** 涨停/跌停池 */
  getZTPool(): Promise<ZTPoolItem[]>;
  /** 盘口异动 */
  getStockChanges(): Promise<StockChange[]>;
  /** 板块异动 */
  getBoardChanges(): Promise<BoardChange[]>;
  /** 龙虎榜详情 */
  getDragonTigerDetail(date: string): Promise<DragonTigerDetail[]>;
  /** 龙虎榜席位详情 */
  getDragonTigerSeatDetail(symbol: string, date: string): Promise<DragonTigerSeat[]>;
  /** 大宗交易市场统计 */
  getBlockTradeMarketStat(date: string): Promise<BlockTradeMarketStat[]>;
  /** 融资融券账户统计 */
  getMarginAccountInfo(): Promise<MarginAccountInfo[]>;
  /** 是否为交易日 */
  isTradingDay(date: string): Promise<IsTradingDayResult>;
  /** 下一个交易日 */
  nextTradingDay(date: string): Promise<NextTradingDayResult>;
  /** 当前市场状态 */
  getMarketStatus(): MarketStatus;
  /** 个股资金流排名 */
  getFundFlowRank(limit?: number): Promise<FundFlowRankItem[]>;
  /** 板块资金流排名 */
  getSectorFundFlowRank(limit?: number): Promise<SectorFundFlowItem[]>;
  /** 个股分红详情 */
  getDividendDetail(symbol: string): Promise<DividendDetail>;
  /** 融资融券标的列表 */
  getMarginTargetList(date?: string): Promise<MarginTarget[]>;
  /** 搜索 */
  search(keyword: string): Promise<SearchResult[]>;
}

/**
 * 默认请求治理配置
 *
 * - 限流：每秒 5 个请求（≈ 200ms 间隔），突发上限 7
 * - 重试：最多 3 次，指数退避
 * - 熔断：5 次连续失败后暂停 30 秒
 */
export function createDefaultOptions(): RequestClientOptions {
  return {
    rateLimit: {
      requestsPerSecond: 5,
      maxBurst: 7,
    },
    retry: {
      maxRetries: 3,
      baseDelay: 1000,
      backoffMultiplier: 2,
      maxDelay: 30000,
      retryOnNetworkError: true,
      retryOnTimeout: true,
    },
    circuitBreaker: {
      failureThreshold: 5,
      resetTimeout: 30000,
      halfOpenRequests: 1,
    },
  };
}

/** 创建真实 SDK 客户端 */
export function createSdkClient(options?: RequestClientOptions): SdkClient {
  const mergedOptions = { ...createDefaultOptions(), ...options };
  const sdk = new StockSDK(mergedOptions);

  return {
    async getAllQuotes(): Promise<FullQuote[]> {
      return sdk.batch.cn() as unknown as Promise<FullQuote[]>;
    },

    async getQuotesByCodes(codes: string[]): Promise<FullQuote[]> {
      // SDK batch.byCodes 需要带 sh/sz 前缀的腾讯格式代码
      const normalized = codes.map(c => {
        try {
          return toTencentSymbol(normalizeSymbol(c));
        } catch {
          return c; // 保底：不认识的格式原样传递
        }
      });
      return sdk.batch.byCodes(normalized) as unknown as Promise<FullQuote[]>;
    },

    async getKLine(
      symbol: string,
      from: string,
      to: string,
    ): Promise<KLine[]> {
      // EastMoney API 要求 YYYYMMDD 格式日期
      const fmt = (d: string) => d.replace(/-/g, '');
      return sdk.kline.cn(symbol, {
        period: 'daily',
        startDate: fmt(from),
        endDate: fmt(to),
      }) as unknown as Promise<KLine[]>;
    },

    async getFundFlow(
      symbol: string,
      days = 20,
    ): Promise<IndividualFundFlow[]> {
      // SDK 的 fundFlow.individual 接受 days 作为参数
      return sdk.fundFlow.individual(symbol, {
        // @ts-expect-error SDK accepts numeric days param
        days,
      }) as unknown as Promise<IndividualFundFlow[]>;
    },

    async getMarketFundFlow(): Promise<MarketFundFlow[]> {
      return sdk.fundFlow.market() as unknown as Promise<MarketFundFlow[]>;
    },

    async getNorthboundSummary(): Promise<NorthboundSummary[]> {
      return sdk.northbound.summary() as unknown as Promise<NorthboundSummary[]>;
    },

    async getNorthboundHoldingRank(
      limit = 20,
    ): Promise<NorthboundHoldingRank[]> {
      return sdk.northbound.holdingRank({
        // @ts-expect-error SDK uses internal type with different field name
        limit,
      }) as unknown as Promise<NorthboundHoldingRank[]>;
    },

    async getZTPool(): Promise<ZTPoolItem[]> {
      return sdk.marketEvent.ztPool() as unknown as Promise<ZTPoolItem[]>;
    },

    async getStockChanges(): Promise<StockChange[]> {
      return sdk.marketEvent.stockChanges() as unknown as Promise<StockChange[]>;
    },

    async getBoardChanges(): Promise<BoardChange[]> {
      return sdk.marketEvent.boardChanges() as unknown as Promise<BoardChange[]>;
    },

    async getDragonTigerDetail(
      date: string,
    ): Promise<DragonTigerDetail[]> {
      const fmt = (d: string) => d.replace(/-/g, '');
      return sdk.dragonTiger.detail({
        startDate: fmt(date),
        endDate: fmt(date),
      }) as unknown as Promise<DragonTigerDetail[]>;
    },

    async getDragonTigerSeatDetail(
      symbol: string,
      date: string,
    ): Promise<DragonTigerSeat[]> {
      return sdk.dragonTiger.seatDetail(
        symbol,
        date,
      ) as unknown as Promise<DragonTigerSeat[]>;
    },

    async getBlockTradeMarketStat(
      _date: string,
    ): Promise<BlockTradeMarketStat[]> {
      // marketStat 无日期参数，始终返回最新的市场统计数据
      return sdk.blockTrade.marketStat() as unknown as Promise<BlockTradeMarketStat[]>;
    },

    async getMarginAccountInfo(): Promise<MarginAccountInfo[]> {
      return sdk.margin.accountInfo() as unknown as Promise<MarginAccountInfo[]>;
    },

    async isTradingDay(date: string): Promise<IsTradingDayResult> {
      return sdk.calendar.isTradingDay(date) as unknown as Promise<IsTradingDayResult>;
    },

    async nextTradingDay(date: string): Promise<NextTradingDayResult> {
      return sdk.calendar.nextTradingDay(date) as unknown as Promise<NextTradingDayResult>;
    },

    getMarketStatus(): MarketStatus {
      return sdk.calendar.marketStatus() as unknown as MarketStatus;
    },

    async search(keyword: string): Promise<SearchResult[]> {
      return sdk.search(keyword) as unknown as Promise<SearchResult[]>;
    },

    async getFundFlowRank(
      limit = 100,
    ): Promise<FundFlowRankItem[]> {
      return sdk.fundFlow.rank({
        // @ts-expect-error SDK accepts limit/rankType params
        limit,
      }) as unknown as Promise<FundFlowRankItem[]>;
    },

    async getSectorFundFlowRank(
      limit = 50,
    ): Promise<SectorFundFlowItem[]> {
      return sdk.fundFlow.sectorRank({
        // @ts-expect-error SDK accepts limit/rankType params
        limit,
      }) as unknown as Promise<SectorFundFlowItem[]>;
    },

    async getDividendDetail(
      symbol: string,
    ): Promise<DividendDetail> {
      return sdk.reference.dividendDetail(
        symbol,
      ) as unknown as Promise<DividendDetail>;
    },

    async getMarginTargetList(
      date?: string,
    ): Promise<MarginTarget[]> {
      return sdk.margin.targetList(
        date,
      ) as unknown as Promise<MarginTarget[]>;
    },
  };
}
