/**
 * SDK Mock 客户端
 *
 * 读取 T-0.2 探测生成的 fixture 文件返回 mock 数据，
 * 用于测试环境替代真实 SDK 调用。
 *
 * 方法签名与 src/data/sdkClient.ts 的 SdkClient 接口完全一致，
 * 通过 TypeScript satisfies 约束强制保证。
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import type { SdkClient } from '../../src/data/sdkClient';
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
} from '../../src/types/sdk';

// ===== Fixture 读取 =====
const FIXTURES_DIR = path.resolve(__dirname, '..', 'fixtures', 'raw');

function readFixture<T>(name: string, fallback: T): T {
  const filePath = path.join(FIXTURES_DIR, name);
  if (!existsSync(filePath)) return fallback;
  const raw = readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

// ===== fixture 文件名映射 =====
// 使用短横线命名映射：sdk.batch.cn → sdk.batch.cn.json
// 点号分隔的命名直接匹配文件名

const FIXTURE_NAMES = {
  allQuotes: 'sdk.batch.cn.json',
  quotesByCodes: 'sdk_batch_byCodes.json',
  kline: 'sdk.kline.cn.json',
  fundFlow: 'sdk_fundFlow_individual.json',
  marketFundFlow: 'sdk_fundFlow_market.json',
  northboundSummary: 'sdk_northbound_summary.json',
  northboundHoldingRank: 'sdk_northbound_holdingRank.json',
  ztPool: 'sdk_marketEvent_ztPool.json',
  stockChanges: 'sdk_marketEvent_stockChanges.json',
  boardChanges: 'sdk_marketEvent_boardChanges.json',
  dragonTigerDetail: 'sdk_dragonTiger_detail.json',
  dragonTigerSeatDetail: 'sdk_dragonTiger_seatDetail.json',
  blockTradeMarketStat: 'sdk_blockTrade_marketStat.json',
  marginAccountInfo: 'sdk_margin_accountInfo.json',
  search: 'sdk_search.json',
  fundFlowRank: 'sdk_fundFlow_rank.json',
  sectorFundFlowRank: 'sdk_fundFlow_sectorRank.json',
  dividendDetail: 'sdk_reference_dividendDetail.json',
  marginTargetList: 'sdk_margin_targetList.json',
} as const;

/**
 * 创建 Mock SDK 客户端
 *
 * 所有方法都返回 fixture 数据，不发起真实网络请求。
 * 方法签名通过 satisfies SdkClient 确保与真实客户端一致。
 */
export function createMockSdkClient(): SdkClient {
  const mockClient = {
    async getAllQuotes(): Promise<FullQuote[]> {
      return readFixture<FullQuote[]>(FIXTURE_NAMES.allQuotes, []);
    },

    async getQuotesByCodes(codes: string[]): Promise<FullQuote[]> {
      // 用全市场行情 fixture 替代，因为 byCodes 的 fixture 为空数组
      const all = readFixture<FullQuote[]>(FIXTURE_NAMES.allQuotes, []);
      const codeSet = new Set(codes);
      return all.filter(q => codeSet.has(q.code));
    },

    async getKLine(
      _symbol: string,
      _from?: string,
      _to?: string,
    ): Promise<KLine[]> {
      return readFixture<KLine[]>(FIXTURE_NAMES.kline, []);
    },

    async getFundFlow(
      _symbol: string,
      _days?: number,
    ): Promise<IndividualFundFlow[]> {
      return readFixture<IndividualFundFlow[]>(FIXTURE_NAMES.fundFlow, []);
    },

    async getMarketFundFlow(): Promise<MarketFundFlow[]> {
      return readFixture<MarketFundFlow[]>(FIXTURE_NAMES.marketFundFlow, []);
    },

    async getNorthboundSummary(): Promise<NorthboundSummary[]> {
      return readFixture<NorthboundSummary[]>(
        FIXTURE_NAMES.northboundSummary,
        [],
      );
    },

    async getNorthboundHoldingRank(
      _limit?: number,
    ): Promise<NorthboundHoldingRank[]> {
      return readFixture<NorthboundHoldingRank[]>(
        FIXTURE_NAMES.northboundHoldingRank,
        [],
      );
    },

    async getZTPool(): Promise<ZTPoolItem[]> {
      return readFixture<ZTPoolItem[]>(FIXTURE_NAMES.ztPool, []);
    },

    async getStockChanges(): Promise<StockChange[]> {
      return readFixture<StockChange[]>(FIXTURE_NAMES.stockChanges, []);
    },

    async getBoardChanges(): Promise<BoardChange[]> {
      return readFixture<BoardChange[]>(FIXTURE_NAMES.boardChanges, []);
    },

    async getDragonTigerDetail(
      _date: string,
    ): Promise<DragonTigerDetail[]> {
      return readFixture<DragonTigerDetail[]>(
        FIXTURE_NAMES.dragonTigerDetail,
        [],
      );
    },

    async getDragonTigerSeatDetail(
      _symbol: string,
      _date: string,
    ): Promise<DragonTigerSeat[]> {
      return readFixture<DragonTigerSeat[]>(
        FIXTURE_NAMES.dragonTigerSeatDetail,
        [],
      );
    },

    async getBlockTradeMarketStat(
      _date: string,
    ): Promise<BlockTradeMarketStat[]> {
      return readFixture<BlockTradeMarketStat[]>(
        FIXTURE_NAMES.blockTradeMarketStat,
        [],
      );
    },

    async getMarginAccountInfo(): Promise<MarginAccountInfo[]> {
      return readFixture<MarginAccountInfo[]>(
        FIXTURE_NAMES.marginAccountInfo,
        [],
      );
    },

    async isTradingDay(_date: string): Promise<IsTradingDayResult> {
      return readFixture<IsTradingDayResult>(
        'sdk_calendar_isTradingDay.json',
        true,
      );
    },

    async nextTradingDay(_date: string): Promise<NextTradingDayResult> {
      return readFixture<NextTradingDayResult>(
        'sdk_calendar_nextTradingDay.json',
        '2026-07-07',
      );
    },

    getMarketStatus(): MarketStatus {
      return readFixture<MarketStatus>(
        'sdk_calendar_marketStatus.json',
        'closed',
      );
    },

    async search(_keyword: string): Promise<SearchResult[]> {
      return readFixture<SearchResult[]>(FIXTURE_NAMES.search, []);
    },

    async getFundFlowRank(
      _limit?: number,
    ): Promise<FundFlowRankItem[]> {
      return readFixture<FundFlowRankItem[]>(FIXTURE_NAMES.fundFlowRank, []);
    },

    async getSectorFundFlowRank(
      _limit?: number,
    ): Promise<SectorFundFlowItem[]> {
      return readFixture<SectorFundFlowItem[]>(
        FIXTURE_NAMES.sectorFundFlowRank,
        [],
      );
    },

    async getDividendDetail(
      _symbol: string,
    ): Promise<DividendDetail> {
      return readFixture<DividendDetail>(
        FIXTURE_NAMES.dividendDetail,
        {} as DividendDetail,
      );
    },

    async getMarginTargetList(
      _date?: string,
    ): Promise<MarginTarget[]> {
      return readFixture<MarginTarget[]>(
        FIXTURE_NAMES.marginTargetList,
        [],
      );
    },
  };

  return mockClient;
}

/**
 * 测试辅助：根据环境变量决定使用真实客户端还是 mock 客户端
 *
 * 用法：
 * ```ts
 * import { getSdkClient } from './sdkMock';
 * const client = getSdkClient();
 * ```
 */
export function getSdkClient(): SdkClient {
  if (process.env.NODE_ENV === 'test') {
    return createMockSdkClient();
  }
  // 动态导入真实客户端避免在测试环境中加载 SDK
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createSdkClient } = require('../../src/data/sdkClient');
  return createSdkClient();
}
