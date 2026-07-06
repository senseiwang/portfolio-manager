/**
 * 候选池过滤器
 *
 * 基于 stock-sdk/screener 的 screen() 链式筛选器实现硬性过滤条件。
 * 两阶段过滤：
 *   阶段 1 - screen() 快速过滤：市值、ST、成交量
 *   阶段 2 - K 线过滤：日均成交额、上市天数、涨停次数、振幅
 */
import { screen } from 'stock-sdk/screener';
import type { FullQuote, KLine } from '../types/sdk';

/** 候选池过滤条件 */
export interface CandidateFilterCriteria {
  minCirculatingMarketCap: number;   // 50 亿
  minAvgAmount20d: number;           // 1 亿
  excludeST: boolean;
  minListedTradingDays: number;      // 60
  maxLimitUpDaysIn5: number;         // 3
  maxAvgAmplitude20d: number;        // 10%
}

/** 默认过滤条件 */
export const DEFAULT_FILTER_CRITERIA: CandidateFilterCriteria = {
  minCirculatingMarketCap: 50,
  minAvgAmount20d: 1,
  excludeST: true,
  minListedTradingDays: 60,
  maxLimitUpDaysIn5: 3,
  maxAvgAmplitude20d: 10,
};

/** 带 K 线数据的候选条目 */
export interface CandidateWithKLine {
  quote: FullQuote;
  klines: KLine[];
}

/**
 * 阶段 1：快速过滤
 * 使用 screen() 基于 batch.cn 数据进行 O(1) 过滤
 */
export function quickFilter(quotes: FullQuote[], criteria?: Partial<CandidateFilterCriteria>): FullQuote[] {
  const c = { ...DEFAULT_FILTER_CRITERIA, ...criteria };

  return screen(quotes)
    .where(q => !c.excludeST || !/^(\*?ST|S\*T)/.test(q.name))
    .where(q => q.circulatingMarketCap !== null && q.circulatingMarketCap >= c.minCirculatingMarketCap)
    .sortBy(q => q.circulatingMarketCap ?? 0, 'desc')
    .top(quotes.length); // 保留全部，仅过滤不排序截断
}

/**
 * 阶段 2：K 线过滤
 * 基于日 K 线数据判断过滤条件
 */
export function klineFilter(
  candidates: CandidateWithKLine[],
  criteria?: Partial<CandidateFilterCriteria>,
): CandidateWithKLine[] {
  const c = { ...DEFAULT_FILTER_CRITERIA, ...criteria };

  return candidates.filter(({ klines }) => {
    // 上市天数：K 线根数 >= minListedTradingDays
    if (klines.length < c.minListedTradingDays) return false;

    // 20 日平均成交额（万元→亿元）
    const recent20 = klines.slice(-20);
    const avgAmount20d =
      recent20.reduce((sum, k) => sum + k.amount, 0) / recent20.length / 10000;
    if (avgAmount20d < c.minAvgAmount20d) return false;

    // 20 日平均振幅
    const avgAmplitude20d =
      recent20.reduce((sum, k) => sum + (k.amplitude ?? 0), 0) / recent20.length;
    if (avgAmplitude20d > c.maxAvgAmplitude20d) return false;

    // 5 日内涨停次数（近似：changePercent >= 9.5%）
    const recent5 = klines.slice(-5);
    const limitUpDays = recent5.filter(k => (k.changePercent ?? 0) >= 9.5).length;
    if (limitUpDays > c.maxLimitUpDaysIn5) return false;

    return true;
  });
}

/**
 * 完整候选池过滤管道
 *
 * 1. quickFilter: 基于全市场行情快速过滤
 * 2. klineFilter: 基于 K 线数据二次过滤
 */
export function filterCandidatePool(
  quotes: FullQuote[],
  klineMap: Map<string, KLine[]>,
  criteria?: Partial<CandidateFilterCriteria>,
): FullQuote[] {
  const stage1 = quickFilter(quotes, criteria);

  const withKlines: CandidateWithKLine[] = [];
  for (const q of stage1) {
    const klines = klineMap.get(q.code);
    if (klines && klines.length > 0) {
      withKlines.push({ quote: q, klines });
    }
  }

  const passed = klineFilter(withKlines, criteria);
  return passed.map(c => c.quote);
}
