/**
 * 候选池过滤器测试
 *
 * 给定构造好的 mock 数据（包含明确应被过滤掉的股票），
 * 断言过滤后的候选池恰好不包含这些股票。
 */
import { describe, it, expect } from 'vitest';
import { quickFilter, klineFilter, filterCandidatePool } from '../../src/engine/screener';
import type { FullQuote, KLine } from '../../src/types/sdk';

// ===== 构造 mock 行情数据 =====
function makeQuote(overrides: Partial<FullQuote> & { code: string; name: string }): FullQuote {
  return {
    marketId: '1',
    code: overrides.code,
    name: overrides.name,
    price: 10,
    prevClose: 10,
    open: 10,
    volume: 100000,
    outerVolume: 50000,
    innerVolume: 50000,
    bid: [],
    ask: [],
    time: '20260703153641',
    timestamp: Date.now(),
    tz: 'Asia/Shanghai',
    change: 0,
    changePercent: 0,
    high: 11,
    low: 9,
    volume2: 100000,
    amount: 5000,
    turnoverRate: 2,
    pe: 15,
    amplitude: 3,
    circulatingMarketCap: 100,
    totalMarketCap: 120,
    pb: 2,
    limitUp: 11,
    limitDown: 9,
    volumeRatio: 1.2,
    avgPrice: 10,
    peStatic: 15,
    peDynamic: 14,
    high52w: 15,
    low52w: 8,
    circulatingShares: 100000000,
    totalShares: 120000000,
    market: 'CN',
    assetType: 'stock',
    source: 'tencent',
    ...overrides,
  };
}

// ===== 构造 mock K 线数据 =====
function makeKLine(overrides: Partial<KLine> & { date: string }): KLine {
  return {
    date: overrides.date,
    open: 10,
    close: 10,
    high: 11,
    low: 9,
    volume: 100000,
    amount: 5000,
    amplitude: 3,
    changePercent: 0,
    change: 0,
    turnoverRate: 2,
    timestamp: Date.now(),
    tz: 'Asia/Shanghai',
    code: '000000',
    ...overrides,
  };
}

describe('quickFilter', () => {
  it('应过滤掉 ST 股票', () => {
    const quotes: FullQuote[] = [
      makeQuote({ code: '600001', name: '正常股票' }),
      makeQuote({ code: '600002', name: 'ST预警' }),
      makeQuote({ code: '600003', name: '*ST退市' }),
      makeQuote({ code: '600004', name: '正常股票2' }),
    ];

    const result = quickFilter(quotes);
    expect(result).toHaveLength(2);
    expect(result.every(q => q.code === '600001' || q.code === '600004')).toBe(true);
  });

  it('应过滤掉流通市值低于 50 亿的股票', () => {
    const quotes: FullQuote[] = [
      makeQuote({ code: '600001', name: '大市值', circulatingMarketCap: 100 }),
      makeQuote({ code: '600002', name: '小市值', circulatingMarketCap: 49 }),
      makeQuote({ code: '600003', name: '临界值', circulatingMarketCap: 50 }),
    ];

    const result = quickFilter(quotes);
    expect(result).toHaveLength(2);
    expect(result.map(q => q.code)).toEqual(expect.arrayContaining(['600001', '600003']));
  });

  it('空数组输入应返回空数组', () => {
    const result = quickFilter([]);
    expect(result).toEqual([]);
  });
});

describe('klineFilter', () => {
  it('应过滤掉 K 线数据不足 60 根的股票', () => {
    const quote = makeQuote({ code: '600001', name: '新股' });
    const shortKlines: KLine[] = Array.from({ length: 30 }, (_, i) =>
      makeKLine({ date: `2026-0${String(i + 1).padStart(2, '0')}-01`, amount: 50000 }),
    );

    const result = klineFilter([
      { quote, klines: shortKlines },
      { quote: makeQuote({ code: '600002', name: '老股' }), klines: Array.from({ length: 100 }, (_, i) =>
        makeKLine({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, amount: 50000 }),
      )},
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].quote.code).toBe('600002');
  });

  it('应过滤掉 20 日均成交额低于 1 亿的股票', () => {
    const quote = makeQuote({ code: '600001', name: '低成交' });
    const lowVolumeKlines: KLine[] = Array.from({ length: 100 }, (_, i) =>
      makeKLine({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, amount: 500 }), // 500万 < 1亿
    );

    const highVolumeKlines: KLine[] = Array.from({ length: 100 }, (_, i) =>
      makeKLine({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, amount: 500000 }), // 5亿 > 1亿
    );

    const result = klineFilter([
      { quote, klines: lowVolumeKlines },
      { quote: makeQuote({ code: '600002', name: '高成交' }), klines: highVolumeKlines },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].quote.code).toBe('600002');
  });

  it('应过滤掉 5 日内涨停次数超过 3 次的股票', () => {
    // 确保 amount 足够高以避免被日均成交额过滤掉
    const normalKlines: KLine[] = [
      ...Array.from({ length: 95 }, (_, i) =>
        makeKLine({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, amount: 50000, changePercent: 0 }),
      ),
      // 最近 5 天有 4 天涨停
      ...Array.from({ length: 4 }, (_, i) =>
        makeKLine({ date: `2026-04-${String(i + 1).padStart(2, '0')}`, amount: 50000, changePercent: 10 }),
      ),
      makeKLine({ date: '2026-04-05', amount: 50000, changePercent: 5 }),
    ];

    const safeKlines: KLine[] = [
      ...Array.from({ length: 95 }, (_, i) =>
        makeKLine({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, amount: 50000, changePercent: 0 }),
      ),
      // 最近 5 天仅 1 天涨停
      ...Array.from({ length: 4 }, (_, i) =>
        makeKLine({ date: `2026-04-${String(i + 1).padStart(2, '0')}`, amount: 50000, changePercent: 2 }),
      ),
      makeKLine({ date: '2026-04-05', amount: 50000, changePercent: 10 }),
    ];

    const result = klineFilter([
      { quote: makeQuote({ code: '600001', name: '多涨停' }), klines: normalKlines },
      { quote: makeQuote({ code: '600002', name: '安全' }), klines: safeKlines },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].quote.code).toBe('600002');
  });

  describe('空数组输入', () => {
    it('应返回空数组', () => {
      expect(klineFilter([])).toEqual([]);
    });
  });
});

describe('filterCandidatePool（完整管道）', () => {
  it('应正确串联两阶段过滤', () => {
    const quotes: FullQuote[] = [
      makeQuote({ code: '600001', name: '正常股', circulatingMarketCap: 100 }),
      makeQuote({ code: '600002', name: 'ST垃圾', circulatingMarketCap: 100 }),
      makeQuote({ code: '600003', name: '小市值', circulatingMarketCap: 30 }),
    ];

    const goodKlines: KLine[] = Array.from({ length: 100 }, (_, i) =>
      makeKLine({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, amount: 200000 }),
    );

    const klineMap = new Map<string, KLine[]>([
      ['600001', goodKlines],
      ['600002', goodKlines],
      ['600003', goodKlines],
    ]);

    const result = filterCandidatePool(quotes, klineMap);
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe('600001');
  });

  it('输入为空时应返回空数组', () => {
    const result = filterCandidatePool([], new Map());
    expect(result).toEqual([]);
  });
});
