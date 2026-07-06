/**
 * SDK Fixture 类型验证测试
 *
 * 用 zod schema 去 parse 每一个 fixture 文件，
 * 确保 TypeScript 类型定义与真实 SDK 返回结构一致。
 *
 * 验收标准：
 * 1. 每个 fixture 文件都有对应的 schema 验证
 * 2. parse 失败即测试失败
 * 3. fixture 文件数 === schema 测试数
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';

// ===== 路径 =====
const FIXTURES_DIR = path.resolve(__dirname, '..', 'fixtures', 'raw');

// ===== 辅助函数 =====
function readFixture(name: string): unknown {
  const filePath = path.join(FIXTURES_DIR, name);
  const raw = readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

function readFixtureAsArray(name: string): unknown[] {
  const data = readFixture(name);
  if (!Array.isArray(data)) {
    throw new Error(`Expected ${name} to be an array`);
  }
  return data;
}

// ===== Zod Schema 定义 =====

// --- 通用 ---
const BidAskItemSchema = z.object({
  price: z.number(),
  volume: z.number(),
});

// --- FullQuote (sdk.batch.cn / sdk.quotes.cn) ---
const FullQuoteSchema = z.object({
  marketId: z.string(),
  name: z.string(),
  code: z.string(),
  price: z.number(),
  prevClose: z.number(),
  open: z.number(),
  volume: z.number(),
  outerVolume: z.number(),
  innerVolume: z.number(),
  bid: z.array(BidAskItemSchema),
  ask: z.array(BidAskItemSchema),
  time: z.string(),
  timestamp: z.number(),
  tz: z.string(),
  change: z.number(),
  changePercent: z.number(),
  high: z.number(),
  low: z.number(),
  volume2: z.number(),
  amount: z.number(),
  turnoverRate: z.nullable(z.number()),
  pe: z.nullable(z.number()),
  amplitude: z.nullable(z.number()),
  circulatingMarketCap: z.nullable(z.number()),
  totalMarketCap: z.nullable(z.number()),
  pb: z.nullable(z.number()),
  limitUp: z.nullable(z.number()),
  limitDown: z.nullable(z.number()),
  volumeRatio: z.nullable(z.number()),
  avgPrice: z.nullable(z.number()),
  peStatic: z.nullable(z.number()),
  peDynamic: z.nullable(z.number()),
  high52w: z.nullable(z.number()),
  low52w: z.nullable(z.number()),
  circulatingShares: z.nullable(z.number()),
  totalShares: z.nullable(z.number()),
  market: z.string().optional(),
  assetType: z.string().optional(),
  source: z.string().optional(),
});

// --- SimpleQuote (sdk.quotes.cnSimple) ---
const SimpleQuoteSchema = z.object({
  marketId: z.string(),
  name: z.string(),
  code: z.string(),
  price: z.number(),
  change: z.number(),
  changePercent: z.number(),
  volume: z.number(),
  amount: z.number(),
  marketCap: z.nullable(z.number()),
  marketType: z.string(),
  market: z.string(),
  assetType: z.string(),
  source: z.string(),
});

// --- HKQuote ---
const HKQuoteSchema = z.object({
  marketId: z.string(),
  name: z.string(),
  code: z.string(),
  price: z.number(),
  prevClose: z.number(),
  open: z.number(),
  volume: z.number(),
  time: z.string(),
  timestamp: z.nullable(z.number()),
  tz: z.string(),
  change: z.number(),
  changePercent: z.number(),
  high: z.number(),
  low: z.number(),
  amount: z.number(),
  lotSize: z.nullable(z.number()),
  circulatingMarketCap: z.nullable(z.number()),
  totalMarketCap: z.nullable(z.number()),
  currency: z.string(),
  market: z.string(),
  assetType: z.string(),
  source: z.string(),
});

// --- KLine ---
const KLineSchema = z.object({
  date: z.string(),
  open: z.number(),
  close: z.number(),
  high: z.number(),
  low: z.number(),
  volume: z.number(),
  amount: z.number(),
  amplitude: z.nullable(z.number()),
  changePercent: z.nullable(z.number()),
  change: z.nullable(z.number()),
  turnoverRate: z.nullable(z.number()),
  timestamp: z.number(),
  tz: z.string(),
  code: z.string(),
});

// --- Timeline/MinuteKLine ---
const TimelineItemSchema = z.object({
  time: z.string(),
  price: z.number().optional(),
  timestamp: z.number(),
  tz: z.string().optional(),
  avgPrice: z.number().optional(),
  volume: z.number().optional(),
  amount: z.number().optional(),
  changePercent: z.nullable(z.number()).optional(),
});

// --- FundFlow ---
const IndividualFundFlowSchema = z.object({
  date: z.string(),
  mainNetInflow: z.number(),
  smallNetInflow: z.number(),
  mediumNetInflow: z.number(),
  largeNetInflow: z.number(),
  superLargeNetInflow: z.number(),
  mainNetInflowPercent: z.number(),
  smallNetInflowPercent: z.number(),
  mediumNetInflowPercent: z.number(),
  largeNetInflowPercent: z.number(),
  superLargeNetInflowPercent: z.number(),
  close: z.number(),
  changePercent: z.nullable(z.number()),
});

const MarketFundFlowSchema = z.object({
  date: z.string(),
  mainNetInflow: z.number(),
  smallNetInflow: z.number(),
  mediumNetInflow: z.number(),
  largeNetInflow: z.number(),
  superLargeNetInflow: z.number(),
  mainNetInflowPercent: z.number(),
  smallNetInflowPercent: z.number(),
  mediumNetInflowPercent: z.number(),
  largeNetInflowPercent: z.number(),
  superLargeNetInflowPercent: z.number(),
  shClose: z.nullable(z.number()),
  shChangePercent: z.nullable(z.number()),
  szClose: z.nullable(z.number()),
  szChangePercent: z.nullable(z.number()),
});

const SectorFundFlowSchema = z.object({
  date: z.string(),
  mainNetInflow: z.number(),
  smallNetInflow: z.number(),
  mediumNetInflow: z.number(),
  largeNetInflow: z.number(),
  superLargeNetInflow: z.number(),
  mainNetInflowPercent: z.number(),
});

// --- Northbound ---
const NorthboundSummarySchema = z.object({
  date: z.string(),
  type: z.string(),
  boardName: z.string(),
  direction: z.string(),
  status: z.string(),
  netBuyAmount: z.number(),
  netInflow: z.number(),
  remainAmount: z.number(),
  upCount: z.number(),
  flatCount: z.number(),
  downCount: z.number(),
  indexCode: z.string(),
  indexName: z.string(),
  indexChangePercent: z.nullable(z.number()),
});

const NorthboundMinuteSchema = z.object({
  date: z.string(),
  time: z.string(),
  shanghaiNetInflow: z.number().optional(),
  shenzhenNetInflow: z.number().optional(),
  totalNetInflow: z.number().optional(),
});

const NorthboundHoldingRankSchema = z.object({
  code: z.string(),
  name: z.string(),
  holdingAmount: z.number(),
  holdingShares: z.number(),
  changeShares: z.number(),
  changePercent: z.nullable(z.number()),
  price: z.number(),
  changePercentDay: z.nullable(z.number()),
  market: z.string(),
});

const NorthboundHistorySchema = z.object({
  date: z.string(),
  netBuyAmount: z.number(),
  netInflow: z.number(),
});

const NorthboundIndividualSchema = z.object({
  date: z.string(),
  holdShares: z.number(),
  holdMarketValue: z.number(),
  holdRatioFloat: z.nullable(z.number()),
  holdRatioTotal: z.nullable(z.number()),
  close: z.number(),
  changePercent: z.nullable(z.number()),
});

// --- MarketEvent ---
const ZTPoolItemSchema = z.object({
  code: z.string(),
  name: z.string(),
  price: z.number(),
  changePercent: z.number(),
  limitPrice: z.nullable(z.number()),
  amount: z.number(),
  floatMarketValue: z.number(),
  totalMarketValue: z.number(),
  turnoverRate: z.number(),
  continuousBoardCount: z.number(),
  firstBoardTime: z.string(),
  lastBoardTime: z.string(),
  boardAmount: z.number(),
  sealAmount: z.number(),
  failedCount: z.number(),
  industry: z.string(),
  ztStatistics: z.string(),
  amplitude: z.nullable(z.number()),
  speed: z.nullable(z.number()),
});

const StockChangeSchema = z.object({
  time: z.string(),
  code: z.string(),
  name: z.string(),
  changeType: z.string(),
  changeTypeLabel: z.string(),
  info: z.string(),
});

const BoardChangeSchema = z.object({
  name: z.string(),
  changePercent: z.nullable(z.number()),
  mainNetInflow: z.nullable(z.number()),
  totalChangeCount: z.nullable(z.number()),
  topStockCode: z.string(),
  topStockName: z.string(),
  topStockDirection: z.string(),
  changeTypeDistribution: z.record(z.unknown()),
});

// --- DragonTiger ---
const DragonTigerDetailSchema = z.object({
  code: z.string(),
  name: z.string(),
  date: z.string().optional(),
  reason: z.string().optional(),
  totalBuy: z.number().optional(),
  totalSell: z.number().optional(),
  netBuy: z.number().optional(),
  buyCount: z.number().optional(),
  sellCount: z.number().optional(),
  changePercent: z.number().optional(),
  turnoverRate: z.nullable(z.number()).optional(),
});

const DragonTigerSeatSchema = z.object({
  name: z.string(),
  type: z.string(),
  buyAmount: z.number(),
  sellAmount: z.number(),
  netBuy: z.number(),
});

// --- BlockTrade ---
const BlockTradeMarketStatSchema = z.object({
  date: z.string(),
  shClose: z.nullable(z.number()),
  shChangePercent: z.nullable(z.number()),
  totalAmount: z.nullable(z.number()),
  premiumAmount: z.nullable(z.number()),
  premiumRatio: z.nullable(z.number()),
  discountAmount: z.nullable(z.number()),
  discountRatio: z.nullable(z.number()),
});

const BlockTradeDetailSchema = z.object({
  code: z.string(),
  name: z.string(),
  price: z.number(),
  volume: z.number(),
  amount: z.number(),
  premiumRatio: z.nullable(z.number()),
  buyBranch: z.string(),
  sellBranch: z.string(),
  date: z.string(),
});

// --- Margin ---
const MarginAccountInfoSchema = z.object({
  date: z.string(),
  finBalance: z.number(),
  loanBalance: z.number(),
  finBuyAmount: z.number(),
  loanSellAmount: z.number(),
  investorCount: z.nullable(z.number()),
  liabilityInvestorCount: z.nullable(z.number()),
  totalGuarantee: z.nullable(z.number()),
  avgGuaranteeRatio: z.nullable(z.number()),
});

const MarginTargetSchema = z.object({
  code: z.string(),
  name: z.string(),
  market: z.string(),
});

// --- Board ---
const BoardListItemSchema = z.object({
  rank: z.number(),
  name: z.string(),
  code: z.string(),
  price: z.number(),
  change: z.number(),
  changePercent: z.number(),
  totalMarketCap: z.number(),
  turnoverRate: z.number(),
});

const BoardSpotItemSchema = z.object({
  item: z.string(),
  value: z.number(),
});

const BoardConstituentSchema = z.object({
  rank: z.number().optional(),
  code: z.string(),
  name: z.string(),
  price: z.number().optional(),
  changePercent: z.number().optional(),
  weight: z.nullable(z.number()).optional(),
});

const BoardKLineSchema = z.object({
  date: z.string(),
  open: z.number(),
  close: z.number(),
  high: z.number(),
  low: z.number(),
  volume: z.number(),
  amount: z.number(),
  amplitude: z.nullable(z.number()),
});

// --- Fund ---
const FundProfileSchema = z.object({
  code: z.string(),
  name: z.string(),
  sourceRate: z.number(),
  rate: z.number(),
  minSubscription: z.number(),
  holdings: z.array(z.object({ marketId: z.string(), code: z.string() })),
  bondHoldings: z.array(z.object({ marketId: z.string(), code: z.string() })),
  assetAllocation: z.array(z.object({
    date: z.string(),
    timestamp: z.number(),
    stockRatio: z.number(),
    bondRatio: z.number(),
    cashRatio: z.number(),
    otherRatio: z.number(),
    netAsset: z.number(),
  })),
});

const FundDividendItemSchema = z.object({
  code: z.string(),
  name: z.string(),
  equityRecordDate: z.string(),
  exDividendDate: z.string(),
  dividendPerShare: z.number(),
  payDate: z.string(),
  dividendType: z.nullable(z.string()),
});

// --- Reference ---
const DividendDetailSchema = z.object({
  code: z.string(),
  name: z.string(),
  reportDate: z.string(),
  planNoticeDate: z.string(),
  disclosureDate: z.string(),
  assignTransferRatio: z.nullable(z.number()),
  bonusRatio: z.nullable(z.number()),
  transferRatio: z.nullable(z.number()),
  dividendPretax: z.nullable(z.number()),
  dividendDesc: z.string(),
  dividendYield: z.nullable(z.number()),
  eps: z.nullable(z.number()),
  bps: z.nullable(z.number()),
  capitalReserve: z.nullable(z.number()),
  unassignedProfit: z.nullable(z.number()),
  netProfitYoy: z.nullable(z.number()),
  totalShares: z.number(),
  equityRecordDate: z.nullable(z.string()),
  exDividendDate: z.nullable(z.string()),
  payDate: z.nullable(z.string()),
  assignProgress: z.string(),
  noticeDate: z.string(),
});

// --- Search ---
const SearchResultSchema = z.object({
  code: z.string(),
  name: z.string(),
  market: z.string(),
  type: z.string(),
  category: z.string(),
});

// --- Screener/backtest/calcSignals ---
const CalcSignalItemSchema = z.object({
  type: z.string().optional(),
  date: z.string().optional(),
  strength: z.number().optional(),
  detail: z.record(z.unknown()).optional(),
}).passthrough();

const BacktestReportSchema = z.object({
  initialCapital: z.number(),
  finalEquity: z.number(),
  totalReturn: z.number(),
  winRate: z.number(),
  maxDrawdown: z.number(),
  tradeCount: z.number(),
  trades: z.array(z.any()),
  equityCurve: z.array(z.number()),
});

const ScreenSampleSchema = z.object({
  input: z.array(z.any()),
  result: z.array(z.any()),
});

// ===== Fixture → Schema 映射表 =====
// 每一条记录对应一个 fixture 文件及其期望的 zod schema
const FIXTURE_MAP: Record<string, z.ZodSchema> = {
  // --- 标量 ---
  'sdk_calendar_isTradingDay.json': z.boolean(),
  'sdk_calendar_marketStatus.json': z.string(),
  'sdk_calendar_nextTradingDay.json': z.string(),
  'sdk_calendar_prevTradingDay.json': z.string(),

  // --- 字符串数组 ---
  'sdk_codes_cn.json': z.array(z.string()),

  // --- 对象数组 ---
  'sdk.batch.cn.json': z.array(FullQuoteSchema),
  'sdk_batch_byCodes.json': z.array(FullQuoteSchema),
  'sdk_quotes_cn.json': z.array(FullQuoteSchema),
  'sdk_quotes_cnSimple.json': z.array(SimpleQuoteSchema),
  'sdk_quotes_hk.json': z.array(HKQuoteSchema),

  // K 线
  'sdk.kline.cn.json': z.array(KLineSchema),
  'sdk_kline_cnMinute.json': z.array(TimelineItemSchema),
  'sdk_quotes_timeline.json': z.object({
    code: z.string(),
    date: z.string(),
    timestamp: z.number(),
    tz: z.string(),
    preClose: z.number(),
    data: z.array(TimelineItemSchema),
  }),

  // 资金流向
  'sdk_fundFlow_individual.json': z.array(IndividualFundFlowSchema),
  'sdk_fundFlow_market.json': z.array(MarketFundFlowSchema),
  'sdk_fundFlow_sectorHistory.json': z.array(SectorFundFlowSchema),

  // 北向资金
  'sdk_northbound_summary.json': z.array(NorthboundSummarySchema),
  'sdk_northbound_minute.json': z.array(NorthboundMinuteSchema),
  'sdk_northbound_holdingRank.json': z.array(NorthboundHoldingRankSchema),
  'sdk_northbound_history.json': z.array(NorthboundHistorySchema),
  'sdk_northbound_individual.json': z.array(NorthboundIndividualSchema),

  // 市场事件
  'sdk_marketEvent_ztPool.json': z.array(ZTPoolItemSchema),
  'sdk_marketEvent_stockChanges.json': z.array(StockChangeSchema),
  'sdk_marketEvent_boardChanges.json': z.array(BoardChangeSchema),

  // 龙虎榜
  'sdk_dragonTiger_detail.json': z.array(DragonTigerDetailSchema),
  'sdk_dragonTiger_seatDetail.json': z.array(DragonTigerSeatSchema),

  // 大宗交易
  'sdk_blockTrade_marketStat.json': z.array(BlockTradeMarketStatSchema),
  'sdk_blockTrade_detail.json': z.array(BlockTradeDetailSchema),

  // 融资融券
  'sdk_margin_accountInfo.json': z.array(MarginAccountInfoSchema),
  'sdk_margin_targetList.json': z.array(MarginTargetSchema),

  // 板块
  'sdk_board_industry_list.json': z.array(BoardListItemSchema),
  'sdk_board_concept_list.json': z.array(BoardListItemSchema),
  'sdk_board_industry_spot.json': z.array(BoardSpotItemSchema),
  'sdk_board_concept_spot.json': z.array(BoardSpotItemSchema),
  'sdk_board_industry_constituents.json': z.array(BoardConstituentSchema),
  'sdk_board_industry_kline.json': z.array(BoardKLineSchema),

  // 基金
  'sdk_fund_profile.json': FundProfileSchema,
  'sdk_fund_dividendList.json': z.object({
    items: z.array(FundDividendItemSchema),
  }),

  // 参考数据
  'sdk_reference_dividendDetail.json': z.array(DividendDetailSchema),

  // 搜索
  'sdk_search.json': z.array(SearchResultSchema),

  // screener/回测/信号
  'calcSignals.sample.json': z.array(CalcSignalItemSchema),
  'backtest.sample.json': BacktestReportSchema,
  'screen.sample.json': ScreenSampleSchema,
};

// ===== 测试 =====
describe('SDK Fixture 类型验证', () => {
  // 获取所有 fixture 文件
  const fixtureFiles = readdirSync(FIXTURES_DIR)
    .filter(f => f.endsWith('.json'))
    .sort();

  // 1. 覆盖检查：确保每个 fixture 文件都有对应的 schema
  it('每个 fixture 文件都有对应的 schema 验证（覆盖率 100%）', () => {
    const mappedFiles = Object.keys(FIXTURE_MAP).sort();
    const unmapped = fixtureFiles.filter(f => !FIXTURE_MAP[f]);
    const extraMappings = mappedFiles.filter(f => !fixtureFiles.includes(f));

    if (unmapped.length > 0) {
      console.warn('以下 fixture 文件没有对应的 schema:', unmapped);
    }
    if (extraMappings.length > 0) {
      console.warn('以下 schema 映射没有对应的 fixture 文件:', extraMappings);
    }

    expect(unmapped).toEqual([]);
    expect(extraMappings).toEqual([]);
    expect(fixtureFiles.length).toBe(Object.keys(FIXTURE_MAP).length);
  });

  // 2. 逐一验证每个 fixture 文件
  describe('逐一验证 fixture 数据结构', () => {
    for (const [fileName, schema] of Object.entries(FIXTURE_MAP)) {
      it(`${fileName} 符合预期 schema`, () => {
        const data = readFixture(fileName);
        const result = schema.safeParse(data);
        if (!result.success) {
          // 提供详细的错误信息
          const errors = result.error.issues.map(
            issue => `  ${issue.path.join('.')}: ${issue.message}`
          ).join('\n');
          throw new Error(`Schema validation failed for ${fileName}:\n${errors}`);
        }
      });
    }
  });

  // 3. 额外检查：重要数组不应为非空数组（如果数据存在）
  describe('数据完整性检查', () => {
    it('batch.cn 行情数据应包含至少 500 只股票', () => {
      const data = readFixtureAsArray('sdk.batch.cn.json');
      expect(data.length).toBeGreaterThan(500);
    });

    it('batch.cn 的每个 item 都应包含 pe 和 circulatingMarketCap', () => {
      const data = readFixtureAsArray('sdk.batch.cn.json');
      const samples = data.slice(0, 20);
      for (const item of samples) {
        const parsed = FullQuoteSchema.safeParse(item);
        expect(parsed.success).toBe(true);
        const q = item as Record<string, unknown>;
        // pe 和 circulatingMarketCap 可能存在为 null（如指数），但不应该缺失
        expect(q).toHaveProperty('pe');
        expect(q).toHaveProperty('circulatingMarketCap');
      }
    });

    it('K 线数据应包含至少 20 根 K 线', () => {
      const data = readFixtureAsArray('sdk.kline.cn.json');
      expect(data.length).toBeGreaterThanOrEqual(20);
    });
  });
});
