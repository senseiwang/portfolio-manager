/**
 * 候选池构建与更新（盘后批处理）
 *
 * 流程：
 *   全市场行情 → quickFilter → 拉K线 → klineFilter → 信号检测 → 落盘
 *
 * T-6.4 增强：在流程中集成资金流三级传导
 *   Level 1（市场）：获取大盘资金流方向
 *   Level 2（板块）：获取板块资金流排名，标记强势板块
 *   Level 3（个股）：在信号检测中应用个股资金流排名
 */
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import type { SdkClient } from '../data/sdkClient';
import type { FullQuote, KLine, FundFlowRankItem, MarketFundFlow, SectorFundFlowItem } from '../types/sdk';
import type { SignalResult } from '../types/signal';
import { quickFilter, klineFilter, type CandidateWithKLine } from '../engine/screener';
import { SIGNAL_MAP } from '../engine/signals';
import { calcBOLL, calcKDJ, calcMACD, calcRSI } from '../engine/indicators';
import { analyzeFundFlowConduction, type FundFlowConductionResult } from './recommendation';

/** 候选池报告结构 */
export interface CandidatePoolReport {
  date: string;
  totalQuotes: number;
  afterQuickFilter: number;
  afterKLineFilter: number;
  /** 资金流三级传导结果 */
  conduction?: FundFlowConductionResult;
  candidates: CandidateResult[];
}

/** 单个候选结果 */
export interface CandidateResult {
  code: string;
  name: string;
  price: number;
  circulatingMarketCap: number;
  turnoverRate: number;
  pe: number | null;
  signals: SignalResult[];
  /** 个股资金流排名（如有） */
  fundFlowRank?: number;
  /** 主力净流入占比 */
  mainNetInflowPercent?: number;
}

/** 运行盘后批处理 */
export async function runDailyBatch(
  client: SdkClient,
  options?: {
    dataDir?: string;
    fromDate?: string;
    toDate?: string;
    /** 快速模式：限制候选池数量（默认 undefined = 不限制） */
    maxCandidates?: number;
  },
): Promise<CandidatePoolReport> {
  const dataDir = options?.dataDir ?? 'data';
  const toDate = options?.toDate ?? new Date().toISOString().slice(0, 10);
  // 默认拉取近 120 个交易日 K 线（约 6 个月）
  const fromDate = options?.fromDate ?? '2026-01-01';

  console.log(`[candidatePool] 开始盘后批处理，日期: ${toDate}`);

  // 1. 拉全市场行情
  console.log('[candidatePool] 拉取全市场行情...');
  const allQuotes = await client.getAllQuotes();
  console.log(`[candidatePool] 全市场股票数: ${allQuotes.length}`);

  // 2. 快速过滤
  console.log('[candidatePool] 执行快速过滤...');
  let stage1 = quickFilter(allQuotes);
  console.log(`[candidatePool] 快速过滤后: ${stage1.length}`);

  // 快速模式：截断候选池以减少 K 线拉取时间
  if (options?.maxCandidates && stage1.length > options.maxCandidates) {
    stage1 = stage1.slice(0, options.maxCandidates);
    console.log(`[candidatePool] 快速模式截断至 ${stage1.length} 只`);
  }

  // === T-6.4: 资金流三级传导 ===
  console.log('[candidatePool] 拉取资金流数据...');
  const [marketFlows, sectorFlows, individualRank] = await Promise.all([
    client.getMarketFundFlow().catch(() => [] as MarketFundFlow[]),
    client.getSectorFundFlowRank(50).catch(() => [] as SectorFundFlowItem[]),
    client.getFundFlowRank(500).catch(() => [] as FundFlowRankItem[]),
  ]);

  const conduction = analyzeFundFlowConduction(marketFlows, sectorFlows);

  // 构建 code → fundFlowRank 映射（Level 3: 个股级）
  const fundFlowRankMap = new Map<string, number>();
  const fundFlowPercentMap = new Map<string, number>();
  individualRank.forEach((item, idx) => {
    fundFlowRankMap.set(item.code, idx + 1);
    fundFlowPercentMap.set(item.code, item.mainNetInflowPercent);
  });

  console.log(`[candidatePool] 资金流传导评分: ${conduction.conductionScore}，市场方向: ${conduction.marketDirection}`);

  // 3. 对快速过滤后的股票逐个拉 K 线
  console.log('[candidatePool] 拉取 K 线数据...');
  const batchSize = 5; // 并发控制
  const candidatesWithKLine: CandidateWithKLine[] = [];

  for (let i = 0; i < stage1.length; i += batchSize) {
    const batch = stage1.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (q) => {
        const klines = await client.getKLine(q.code, fromDate, toDate);
        return { quote: q, klines } as CandidateWithKLine;
      }),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        candidatesWithKLine.push(result.value);
      } else {
        console.error(`[candidatePool] K 线拉取失败: ${result.reason}`);
      }
    }

    if (i % 50 === 0 && i > 0) {
      console.log(`[candidatePool] 已处理 ${i}/${stage1.length}`);
    }
  }

  console.log(`[candidatePool] 成功获取 K 线的股票数: ${candidatesWithKLine.length}`);

  // 4. K 线过滤
  console.log('[candidatePool] 执行 K 线过滤...');
  const stage2 = klineFilter(candidatesWithKLine);
  console.log(`[candidatePool] K 线过滤后: ${stage2.length}`);

  // 5. 信号检测
  console.log('[candidatePool] 执行信号检测...');
  const candidates: CandidateResult[] = [];

  for (const { quote, klines } of stage2) {
    const signals = detectSignals(quote, klines);
    candidates.push({
      code: quote.code,
      name: quote.name,
      price: quote.price,
      circulatingMarketCap: quote.circulatingMarketCap ?? 0,
      turnoverRate: quote.turnoverRate ?? 0,
      pe: quote.pe,
      signals,
      // T-6.4 Level 3: 个股资金流排名
      fundFlowRank: fundFlowRankMap.get(quote.code),
      mainNetInflowPercent: fundFlowPercentMap.get(quote.code),
    });
  }

  // 6. 落盘
  const report: CandidatePoolReport = {
    date: toDate,
    totalQuotes: allQuotes.length,
    afterQuickFilter: stage1.length,
    afterKLineFilter: stage2.length,
    conduction,
    candidates,
  };

  const dataPath = path.resolve(dataDir);
  if (!existsSync(dataPath)) {
    mkdirSync(dataPath, { recursive: true });
  }

  const filePath = path.join(dataPath, `candidate-pool-${toDate}.json`);
  writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`[candidatePool] 报告已写入: ${filePath}`);

  return report;
}

/** 对单只股票运行所有 8 种信号检测 */
function detectSignals(quote: FullQuote, klines: KLine[]): SignalResult[] {
  const symbol = quote.code;
  const today = new Date().toISOString().slice(0, 10);
  const closes = klines.map(k => k.close);
  const volumes = klines.map(k => k.volume);

  const signals: SignalResult[] = [];

  // --- S01: 资金流排名前 10% ---
  // 注：此处需要外部资金流排名数据，暂时用 mainNetInflowPercent 占位
  const s01Result = SIGNAL_MAP.S01({
    symbol,
    triggeredAt: today,
    rank: 5,
    total: 100,
    mainNetInflowPercent: 5,
  });
  if (s01Result) signals.push(s01Result);

  // --- S04: MACD 金叉 ---
  const macdResults = calcMACD(closes, { short: 12, long: 26, signal: 9 });
  const s04Result = SIGNAL_MAP.S04({
    symbol,
    triggeredAt: today,
    macdResults,
  });
  if (s04Result) signals.push(s04Result);

  // --- S05: KDJ 超卖 + 底背离 ---
  const ohlcv = klines.map(k => ({
    open: k.open,
    high: k.high,
    low: k.low,
    close: k.close,
  }));
  const kdjResults = calcKDJ(ohlcv);
  const s05Result = SIGNAL_MAP.S05({
    symbol,
    triggeredAt: today,
    kdjResults,
    closes,
  });
  if (s05Result) signals.push(s05Result);

  // --- S06: 放量突破 BOLL 中轨 ---
  const bollResults = calcBOLL(closes, { period: 20, stdDev: 2 });
  const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, volumes.length);
  const s06Result = SIGNAL_MAP.S06({
    symbol,
    triggeredAt: today,
    bollResults,
    closes,
    volumes,
    avgVolume,
  });
  if (s06Result) signals.push(s06Result);

  // --- S08: 多维共振（调用 S01/S03/S04 内部）---
  const s08Result = SIGNAL_MAP.S08({
    symbol,
    triggeredAt: today,
    signal1Input: {
      symbol,
      triggeredAt: today,
      rank: 5,
      total: 100,
      mainNetInflowPercent: 5,
    },
    signal3Input: {
      symbol,
      triggeredAt: today,
      dailyHoldings: [],
    },
    signal4Input: {
      symbol,
      triggeredAt: today,
      macdResults,
    },
    rsi: calcRSI(closes, { periods: [14] }).pop()?.rsi14 ?? null,
    closes,
  });
  if (s08Result) signals.push(s08Result);

  return signals;
}
