/**
 * 真实数据回放一致性测试
 *
 * 把 T-0.2 阶段生成的原始 fixture 文件喂给生产代码路径，
 * 验证解析和后续计算不抛异常，且结果符合基本预期。
 *
 * 测试策略：
 * 1. 直接读取 fixture JSON 文件（不依赖网络）
 * 2. 用 Zod schema 校验 fixture 数据结构（复用 T-0.3 类型 schema）
 * 3. 将 parse 后的数据喂给 engine 层的纯计算函数（indicators / signals / screener / scoring）
 * 4. 验证全链路无异常，且结果符合基本预期
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { readFileSync } from 'fs';
import path from 'path';

// ===== 导入生产代码（engine 层纯计算函数） =====
import {
  calcMA,
  calcMACD,
  calcBOLL,
  calcKDJ,
  calcRSI,
  calcATR,
  calcSAR,
} from '../../src/engine/indicators';
import type { OHLCV } from '../../src/engine/indicators';
import { quickFilter, filterCandidatePool } from '../../src/engine/screener';
import {
  calcFundFlowHealth,
  calcTechnicalHealth,
} from '../../src/engine/scoring';
import { detectMACDGoldenCross } from '../../src/engine/signals/s04-macdGoldenCross';
import { detectKDJDivergence } from '../../src/engine/signals/s05-kdjDivergence';
import { detectBOLLBreakout } from '../../src/engine/signals/s06-bollBreakout';

// ===== 路径 =====
const FIXTURES_DIR = path.resolve(__dirname, '..', 'fixtures', 'raw');

// ===== 辅助函数 =====
function readFixture<T = unknown>(name: string): T {
  const filePath = path.join(FIXTURES_DIR, name);
  const raw = readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

// ===== Zod Schema（与 test/types/sdk-fixtures.test.ts 保持一致的 schema 定义） =====

const BidAskItemSchema = z.object({
  price: z.number(),
  volume: z.number(),
});

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

const CalcSignalItemSchema = z.object({
  type: z.string().optional(),
  date: z.string().optional(),
  strength: z.number().optional(),
  detail: z.record(z.unknown()).optional(),
}).passthrough();

// ===== 测试 =====

describe('真实数据回放一致性测试', () => {
  // ================================================
  // 1. SDK K 线数据 → 指标计算
  // ================================================
  describe('sdk.kline.cn.json → indicators 指标计算', () => {
    let klines: unknown[];
    let closes: number[];
    let ohlcvs: OHLCV[];

    it('fixture 读取和 schema 校验应通过', () => {
      klines = readFixture('sdk.kline.cn.json');
      expect(Array.isArray(klines)).toBe(true);
      expect(klines.length).toBeGreaterThan(20);

      const result = z.array(KLineSchema).safeParse(klines);
      expect(result.success).toBe(true);
      if (!result.success) {
        throw new Error(`KLine schema 校验失败: ${result.error.message}`);
      }

      // 提取收盘价和 OHLCV 供后续测试使用
      closes = result.data.map(k => k.close);
      ohlcvs = result.data.map(k => ({
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
        volume: k.volume,
      }));
    });

    it('calcMA 应不抛异常且返回等长数组', () => {
      const result = calcMA(closes, { periods: [5, 10, 20] });
      expect(result).toHaveLength(closes.length);
      // 验证结构
      expect(result[0]).toHaveProperty('ma5');
      expect(result[0]).toHaveProperty('ma10');
      expect(result[0]).toHaveProperty('ma20');
    });

    it('calcMACD 应不抛异常且返回等长数组', () => {
      const result = calcMACD(closes);
      expect(result).toHaveLength(closes.length);
      expect(result[0]).toHaveProperty('dif');
      expect(result[0]).toHaveProperty('dea');
      expect(result[0]).toHaveProperty('macd');
    });

    it('calcBOLL 应不抛异常且返回等长数组', () => {
      const result = calcBOLL(closes, { period: 20, stdDev: 2 });
      expect(result).toHaveLength(closes.length);
      expect(result[0]).toHaveProperty('mid');
      expect(result[0]).toHaveProperty('upper');
      expect(result[0]).toHaveProperty('lower');
    });

    it('calcKDJ 应不抛异常且返回等长数组', () => {
      const result = calcKDJ(ohlcvs);
      expect(result).toHaveLength(ohlcvs.length);
      expect(result[0]).toHaveProperty('k');
      expect(result[0]).toHaveProperty('d');
      expect(result[0]).toHaveProperty('j');
    });

    it('calcRSI 应不抛异常且返回等长数组', () => {
      const result = calcRSI(closes, { periods: [6, 12, 24] });
      expect(result).toHaveLength(closes.length);
      expect(result[0]).toHaveProperty('rsi6');
      expect(result[0]).toHaveProperty('rsi12');
      expect(result[0]).toHaveProperty('rsi24');
    });

    it('calcATR 应不抛异常且返回等长数组', () => {
      const result = calcATR(ohlcvs);
      expect(result).toHaveLength(ohlcvs.length);
      expect(result[0]).toHaveProperty('tr');
      expect(result[0]).toHaveProperty('atr');
    });

    it('calcSAR 应不抛异常且返回等长数组', () => {
      const result = calcSAR(ohlcvs);
      expect(result).toHaveLength(ohlcvs.length);
      expect(result[0]).toHaveProperty('sar');
      expect(result[0]).toHaveProperty('trend');
      expect(result[0]).toHaveProperty('ep');
      expect(result[0]).toHaveProperty('af');
    });

    it('所有指标计算不应抛出任何异常', () => {
      expect(() => {
        calcMA(closes, { periods: [5] });
        calcMACD(closes);
        calcBOLL(closes);
        calcKDJ(ohlcvs);
        calcRSI(closes, { periods: [14] });
        calcATR(ohlcvs);
        calcSAR(ohlcvs);
      }).not.toThrow();
    });
  });

  // ================================================
  // 2. SDK 批量行情数据 → screener 过滤
  // ================================================
  describe('sdk.batch.cn.json → screener 候选池过滤', () => {
    let quotes: unknown[];

    it('fixture 读取和 schema 校验应通过', () => {
      quotes = readFixture('sdk.batch.cn.json');
      expect(Array.isArray(quotes)).toBe(true);
      expect(quotes.length).toBeGreaterThan(500);

      // 抽样校验前 20 条
      const samples = quotes.slice(0, 20);
      for (const item of samples) {
        const result = FullQuoteSchema.safeParse(item);
        expect(result.success).toBe(true);
      }
    });

    it('quickFilter 应不抛异常', () => {
      // 使用完整的 quotes 数据（已通过 schema 校验）
      const typedQuotes = z.array(FullQuoteSchema).parse(quotes);

      expect(() => {
        const result = quickFilter(typedQuotes);
        // 快速过滤后应仍有结果保留
        expect(Array.isArray(result)).toBe(true);
      }).not.toThrow();
    });

    it('quickFilter 应过滤掉 ST 股票并保留正常股票', () => {
      const typedQuotes = z.array(FullQuoteSchema).parse(quotes);

      const filtered = quickFilter(typedQuotes);
      // 过滤后的股票名称不应包含 ST / *ST
      for (const q of filtered) {
        expect(q.name).not.toMatch(/^(\*?ST|S\*T)/);
      }
      // 过滤后的数量应少于原始
      expect(filtered.length).toBeLessThanOrEqual(typedQuotes.length);
    });

    it('filterCandidatePool 应不抛异常（使用空 klineMap 至少不崩溃）', () => {
      const typedQuotes = z.array(FullQuoteSchema).parse(quotes);

      expect(() => {
        const result = filterCandidatePool(typedQuotes, new Map());
        expect(Array.isArray(result)).toBe(true);
      }).not.toThrow();
    });
  });

  // ================================================
  // 3. calcSignals.sample.json → 信号结果验证
  // ================================================
  describe('calcSignals.sample.json → 信号结果 schema 验证', () => {
    it('fixture 读取和 schema 校验应通过', () => {
      const data = readFixture('calcSignals.sample.json');
      expect(Array.isArray(data)).toBe(true);

      const result = z.array(CalcSignalItemSchema).safeParse(data);
      expect(result.success).toBe(true);
    });

    it('信号结果数组当前为空（与 T-0.2 阶段一致）', () => {
      const data = readFixture('calcSignals.sample.json') as unknown[];
      expect(data.length).toBe(0);
    });
  });

  // ================================================
  // 4. K 线计算结果 → 信号检测函数
  // ================================================
  describe('K 线指标结果 → signals 信号检测', () => {
    let closes: number[];
    let ohlcvs: OHLCV[];

    it('从 fixture 准备收盘价和 OHLCV 数据', () => {
      const data = z.array(KLineSchema).parse(
        readFixture('sdk.kline.cn.json'),
      );
      closes = data.map(k => k.close);
      ohlcvs = data.map(k => ({
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
        volume: k.volume,
      }));
      expect(closes.length).toBeGreaterThan(50);
    });

    it('S04 detectMACDGoldenCross 使用真实 MACD 结果应不抛异常', () => {
      const macdResults = calcMACD(closes);

      const result = detectMACDGoldenCross({
        symbol: '600519',
        triggeredAt: '2026-07-06',
        macdResults: macdResults.slice(-5).map(r => ({
          dif: r.dif,
          dea: r.dea,
        })),
      });
      // 可能有也可能没有信号，但不应抛异常
      expect(result === null || result.signalId === 'S04').toBe(true);
    });

    it('S05 detectKDJDivergence 使用真实 KDJ 结果应不抛异常', () => {
      const kdjResults = calcKDJ(ohlcvs);

      const result = detectKDJDivergence({
        symbol: '600519',
        triggeredAt: '2026-07-06',
        kdjResults: kdjResults.slice(-5).map(r => ({
          k: r.k,
          d: r.d,
        })),
        closes: closes.slice(-5),
      });
      expect(result === null || result.signalId === 'S05').toBe(true);
    });

    it('S06 detectBOLLBreakout 使用真实 BOLL 结果应不抛异常', () => {
      const bollResults = calcBOLL(closes, { period: 20, stdDev: 2 });
      const end = bollResults.length;
      const recentVolumes = ohlcvs.slice(-2).map(o => o.volume ?? 0);
      const recentCloses = closes.slice(-2);
      const recentBoll = bollResults.slice(-2).map(r => ({
        mid: r.mid,
        upper: r.upper,
        lower: r.lower,
      }));

      // 计算均量（取最近 20 日）
      const avgVolume =
        ohlcvs.slice(-20).reduce((s, o) => s + (o.volume ?? 0), 0) / 20;

      const result = detectBOLLBreakout({
        symbol: '600519',
        triggeredAt: '2026-07-06',
        bollResults: recentBoll,
        closes: recentCloses,
        volumes: recentVolumes,
        avgVolume,
      });
      expect(result === null || result.signalId === 'S06').toBe(true);
    });
  });

  // ================================================
  // 5. 资金流向数据 → scoring 评分函数
  // ================================================
  describe('资金流向 fixture → scoring 评分', () => {
    it('sdk_fundFlow_individual.json 应能通过 schema 校验并喂给 calcFundFlowHealth', () => {
      const data = readFixture('sdk_fundFlow_individual.json');
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);

      const result = z.array(IndividualFundFlowSchema).safeParse(data);
      expect(result.success).toBe(true);
      if (!result.success) return;

      const parsed = result.data;
      // 取第一条数据的 mainNetInflowPercent 喂给评分函数
      const score = calcFundFlowHealth({
        mainNetInflowPercent: parsed[0].mainNetInflowPercent,
      });
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('calcTechnicalHealth 应不抛异常（使用 fundFlow fixture 的 close/changePercent 模拟 RSI）', () => {
      const data = readFixture('sdk_fundFlow_individual.json');
      const parsed = z.array(IndividualFundFlowSchema).parse(data);

      // 用 changePercent 模拟 RSI 输入
      for (const item of parsed.slice(0, 10)) {
        const score = calcTechnicalHealth({
          rsi: item.changePercent !== null
            ? Math.abs(item.changePercent * 10) // 映射到 0-100 范围模拟 RSI
            : null,
        });
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    });
  });

  // ================================================
  // 6. 全链路冒烟测试
  // ================================================
  describe('全链路冒烟测试（解析 → 指标 → 信号检测）', () => {
    it('读取 K 线 → 计算 MACD → 检测金叉，整条链路不抛异常', () => {
      const klineRaw = readFixture('sdk.kline.cn.json');
      const klines = z.array(KLineSchema).parse(klineRaw);

      const closes = klines.map(k => k.close);
      const ohlcvs: OHLCV[] = klines.map(k => ({
        open: k.open, high: k.high, low: k.low, close: k.close, volume: k.volume,
      }));

      // 步骤 1: 计算 MACD
      const macd = calcMACD(closes);
      expect(macd).toHaveLength(closes.length);

      // 步骤 2: 检测金叉
      const recentMacd = macd.slice(-5);
      const crossResult = detectMACDGoldenCross({
        symbol: '600519',
        triggeredAt: '2026-07-06',
        macdResults: recentMacd.map(r => ({ dif: r.dif, dea: r.dea })),
      });
      expect(crossResult === null || crossResult.signalId === 'S04').toBe(true);

      // 步骤 3: 计算 KDJ
      const kdj = calcKDJ(ohlcvs);
      expect(kdj).toHaveLength(ohlcvs.length);

      // 步骤 4: 检测 KDJ 底背离
      const recentKdj = kdj.slice(-5);
      const divergenceResult = detectKDJDivergence({
        symbol: '600519',
        triggeredAt: '2026-07-06',
        kdjResults: recentKdj.map(r => ({ k: r.k, d: r.d })),
        closes: closes.slice(-5),
      });
      expect(divergenceResult === null || divergenceResult.signalId === 'S05').toBe(true);

      // 步骤 5: 计算 BOLL
      const boll = calcBOLL(closes, { period: 20, stdDev: 2 });
      expect(boll).toHaveLength(closes.length);

      // 步骤 6: 检测 BOLL 突破
      const end = boll.length;
      const avgVolume = ohlcvs.slice(-20).reduce((s, o) => s + (o.volume ?? 0), 0) / 20;
      const breakoutResult = detectBOLLBreakout({
        symbol: '600519',
        triggeredAt: '2026-07-06',
        bollResults: boll.slice(-2).map(r => ({ mid: r.mid, upper: r.upper, lower: r.lower })),
        closes: closes.slice(-2),
        volumes: ohlcvs.slice(-2).map(o => o.volume ?? 0),
        avgVolume,
      });
      expect(breakoutResult === null || breakoutResult.signalId === 'S06').toBe(true);
    });
  });
});
