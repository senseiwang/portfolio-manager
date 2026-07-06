/**
 * 信号检测函数单元测试
 *
 * 覆盖每个信号的三种场景：触发、不触发、边界/缺失数据。
 */
import { describe, it, expect } from 'vitest';

import { detectFundFlowRank } from '../../src/engine/signals/s01-fundFlowRank';
import { detectConduction } from '../../src/engine/signals/s02-conduction';
import { detectNorthbound } from '../../src/engine/signals/s03-northbound';
import { detectMACDGoldenCross } from '../../src/engine/signals/s04-macdGoldenCross';
import { detectKDJDivergence } from '../../src/engine/signals/s05-kdjDivergence';
import { detectBOLLBreakout } from '../../src/engine/signals/s06-bollBreakout';
import { detectLimitUpPullback } from '../../src/engine/signals/s07-limitUpPullback';
import { detectMultiResonance } from '../../src/engine/signals/s08-multiResonance';

import { SIGNAL_MAP } from '../../src/engine/signals';

// ===== S01: 资金流排名前 10% =====
describe('S01 - detectFundFlowRank', () => {
  it('排名前 10% 内应触发信号（触发场景）', () => {
    const result = detectFundFlowRank({
      symbol: '600519',
      triggeredAt: '2026-07-06',
      rank: 15,
      total: 200,
      mainNetInflowPercent: 3.5,
    });
    expect(result).not.toBeNull();
    expect(result!.signalId).toBe('S01');
    expect(result!.strength).toBeGreaterThanOrEqual(1);
    expect(result!.detail.percentile).toBeLessThanOrEqual(0.1);
  });

  it('排名在 10% 之外应返回 null（不触发场景）', () => {
    const result = detectFundFlowRank({
      symbol: '600519',
      triggeredAt: '2026-07-06',
      rank: 50,
      total: 200,
      mainNetInflowPercent: -1.2,
    });
    expect(result).toBeNull();
  });

  it('total 为 0 时应返回 null（边界/无效数据）', () => {
    const result = detectFundFlowRank({
      symbol: '600519',
      triggeredAt: '2026-07-06',
      rank: 1,
      total: 0,
      mainNetInflowPercent: 5,
    });
    expect(result).toBeNull();
  });

  it('排名前 3% 应得到 5 星强度', () => {
    const result = detectFundFlowRank({
      symbol: '600519',
      triggeredAt: '2026-07-06',
      rank: 3,
      total: 200,
      mainNetInflowPercent: 8,
    });
    expect(result).not.toBeNull();
    expect(result!.strength).toBe(5);
  });
});

// ===== S02: 三级传导共振 =====
describe('S02 - detectConduction', () => {
  it('大盘上涨 + 板块前 3 + 个股前 3% 应触发', () => {
    const result = detectConduction({
      symbol: '000858',
      triggeredAt: '2026-07-06',
      marketUp: true,
      sectorRank: 2,
      individualRank: 0.02,
    });
    expect(result).not.toBeNull();
    expect(result!.signalId).toBe('S02');
  });

  it('大盘下跌时应返回 null', () => {
    const result = detectConduction({
      symbol: '000858',
      triggeredAt: '2026-07-06',
      marketUp: false,
      sectorRank: 1,
      individualRank: 0.01,
    });
    expect(result).toBeNull();
  });

  it('板块排名超过 3 时应返回 null', () => {
    const result = detectConduction({
      symbol: '000858',
      triggeredAt: '2026-07-06',
      marketUp: true,
      sectorRank: 5,
      individualRank: 0.01,
    });
    expect(result).toBeNull();
  });

  it('个股排名超过 3% 时应返回 null', () => {
    const result = detectConduction({
      symbol: '000858',
      triggeredAt: '2026-07-06',
      marketUp: true,
      sectorRank: 1,
      individualRank: 0.05,
    });
    expect(result).toBeNull();
  });

  it('板块第 1 + 个股前 1% 应得 5 星', () => {
    const result = detectConduction({
      symbol: '000858',
      triggeredAt: '2026-07-06',
      marketUp: true,
      sectorRank: 1,
      individualRank: 0.008,
    });
    expect(result).not.toBeNull();
    expect(result!.strength).toBe(5);
  });
});

// ===== S03: 北向连续 5 日增持 =====
describe('S03 - detectNorthbound', () => {
  const baseHolding = (shares: number, day: number) => ({
    holdShares: shares,
    date: `2026-07-${String(day).padStart(2, '0')}`,
  });

  it('连续 5 日增持应触发', () => {
    const result = detectNorthbound({
      symbol: '600519',
      triggeredAt: '2026-07-06',
      dailyHoldings: [
        baseHolding(100, 1),
        baseHolding(105, 2),
        baseHolding(110, 3),
        baseHolding(120, 4),
        baseHolding(130, 5),
        baseHolding(140, 6),
      ],
    });
    expect(result).not.toBeNull();
    expect(result!.signalId).toBe('S03');
    expect(result!.detail.consecutiveDays).toBeGreaterThanOrEqual(5);
  });

  it('持股量未连续递增应返回 null', () => {
    const result = detectNorthbound({
      symbol: '600519',
      triggeredAt: '2026-07-06',
      dailyHoldings: [
        baseHolding(100, 1),
        baseHolding(105, 2),
        baseHolding(110, 3),
        baseHolding(105, 4), // 减持
        baseHolding(115, 5),
        baseHolding(120, 6),
      ],
    });
    expect(result).toBeNull();
  });

  it('数据不足 5 天时应返回 null', () => {
    const result = detectNorthbound({
      symbol: '600519',
      triggeredAt: '2026-07-06',
      dailyHoldings: [
        baseHolding(100, 1),
        baseHolding(105, 2),
        baseHolding(110, 3),
      ],
    });
    expect(result).toBeNull();
  });

  it('空数组应返回 null', () => {
    const result = detectNorthbound({
      symbol: '600519',
      triggeredAt: '2026-07-06',
      dailyHoldings: [],
    });
    expect(result).toBeNull();
  });
});

// ===== S04: MACD 金叉 =====
describe('S04 - detectMACDGoldenCross', () => {
  it('DIF 上穿 DEA 应触发金叉', () => {
    const result = detectMACDGoldenCross({
      symbol: '600519',
      triggeredAt: '2026-07-06',
      macdResults: [
        { dif: -0.3, dea: -0.2 },
        { dif: -0.1, dea: -0.15 }, // 金叉：-0.1 > -0.15
      ],
    });
    expect(result).not.toBeNull();
    expect(result!.signalId).toBe('S04');
  });

  it('DIF 未上穿 DEA 应返回 null', () => {
    const result = detectMACDGoldenCross({
      symbol: '600519',
      triggeredAt: '2026-07-06',
      macdResults: [
        { dif: -0.3, dea: -0.2 },
        { dif: -0.25, dea: -0.15 }, // 仍低于 DEA
      ],
    });
    expect(result).toBeNull();
  });

  it('数据不足 2 期时应返回 null', () => {
    const result = detectMACDGoldenCross({
      symbol: '600519',
      triggeredAt: '2026-07-06',
      macdResults: [
        { dif: -0.1, dea: -0.15 },
      ],
    });
    expect(result).toBeNull();
  });

  it('含 null 值时应返回 null', () => {
    const result = detectMACDGoldenCross({
      symbol: '600519',
      triggeredAt: '2026-07-06',
      macdResults: [
        { dif: null, dea: null },
        { dif: -0.1, dea: -0.15 },
      ],
    });
    expect(result).toBeNull();
  });
});

// ===== S05: KDJ 超卖 + 底背离 =====
describe('S05 - detectKDJDivergence', () => {
  it('K < 20 且价格新低但 K 未新低应触发', () => {
    const result = detectKDJDivergence({
      symbol: '000858',
      triggeredAt: '2026-07-06',
      kdjResults: [
        { k: 25, d: 30 },
        { k: 22, d: 28 },
        { k: 18, d: 25 }, // K < 20, 但相比前两个周期中的最低 K(22) 更低
      ],
      closes: [50, 48, 45],
    });
    // 这里 K=18 < 最低前K=22, 所以 K 也创新低了，不满足底背离条件
    expect(result).toBeNull();
  });

  it('K < 20 且价格新低但 K 抬高应触发底背离', () => {
    const result = detectKDJDivergence({
      symbol: '000858',
      triggeredAt: '2026-07-06',
      kdjResults: [
        { k: 15, d: 20 },
        { k: 12, d: 18 },
        { k: 18, d: 22 }, // K=18 < 20, 但高于前低 12
      ],
      closes: [50, 48, 45], // 价格持续新低
    });
    expect(result).not.toBeNull();
    expect(result!.signalId).toBe('S05');
  });

  it('K >= 20 时应返回 null', () => {
    const result = detectKDJDivergence({
      symbol: '000858',
      triggeredAt: '2026-07-06',
      kdjResults: [
        { k: 30, d: 35 },
        { k: 28, d: 33 },
        { k: 25, d: 30 },
      ],
      closes: [50, 48, 45],
    });
    expect(result).toBeNull();
  });

  it('数据不足 3 期时应返回 null', () => {
    const result = detectKDJDivergence({
      symbol: '000858',
      triggeredAt: '2026-07-06',
      kdjResults: [
        { k: 15, d: 20 },
        { k: 18, d: 22 },
      ],
      closes: [50, 48],
    });
    expect(result).toBeNull();
  });

  it('长度不匹配时应返回 null', () => {
    const result = detectKDJDivergence({
      symbol: '000858',
      triggeredAt: '2026-07-06',
      kdjResults: [
        { k: 15, d: 20 },
        { k: 12, d: 18 },
        { k: 18, d: 22 },
      ],
      closes: [50, 48], // 少一个
    });
    expect(result).toBeNull();
  });
});

// ===== S06: 放量突破 BOLL 中轨 =====
describe('S06 - detectBOLLBreakout', () => {
  it('收盘价突破中轨且放量应触发', () => {
    const result = detectBOLLBreakout({
      symbol: '600519',
      triggeredAt: '2026-07-06',
      bollResults: [
        { mid: 200, upper: 220, lower: 180 },
        { mid: 202, upper: 222, lower: 182 },
      ],
      closes: [198, 205], // 前收 <= 中轨(198<=200)，现收 > 中轨(205>202)
      volumes: [10000, 25000],
      avgVolume: 10000,
    });
    expect(result).not.toBeNull();
    expect(result!.signalId).toBe('S06');
  });

  it('收盘价未突破中轨应返回 null', () => {
    const result = detectBOLLBreakout({
      symbol: '600519',
      triggeredAt: '2026-07-06',
      bollResults: [
        { mid: 200, upper: 220, lower: 180 },
        { mid: 201, upper: 221, lower: 181 },
      ],
      closes: [198, 200], // 200 < 201, 未突破
      volumes: [10000, 25000],
      avgVolume: 10000,
    });
    expect(result).toBeNull();
  });

  it('成交量不足 1.5 倍时应返回 null', () => {
    const result = detectBOLLBreakout({
      symbol: '600519',
      triggeredAt: '2026-07-06',
      bollResults: [
        { mid: 200, upper: 220, lower: 180 },
        { mid: 202, upper: 222, lower: 182 },
      ],
      closes: [198, 205],
      volumes: [10000, 12000], // 1.2 倍，不足 1.5
      avgVolume: 10000,
    });
    expect(result).toBeNull();
  });

  it('数据不足 2 期时应返回 null', () => {
    const result = detectBOLLBreakout({
      symbol: '600519',
      triggeredAt: '2026-07-06',
      bollResults: [
        { mid: 200, upper: 220, lower: 180 },
      ],
      closes: [200],
      volumes: [10000],
      avgVolume: 10000,
    });
    expect(result).toBeNull();
  });
});

// ===== S07: 涨停后机构买入回调 =====
describe('S07 - detectLimitUpPullback', () => {
  it('涨停且有机构买入应触发', () => {
    const result = detectLimitUpPullback({
      symbol: '600519',
      triggeredAt: '2026-07-06',
      isLimitUp: true,
      hasInstitutionBuy: true,
      changePercent: 10,
    });
    expect(result).not.toBeNull();
    expect(result!.signalId).toBe('S07');
    expect(result!.strength).toBe(5); // 10% 涨停
  });

  it('未涨停时应返回 null', () => {
    const result = detectLimitUpPullback({
      symbol: '600519',
      triggeredAt: '2026-07-06',
      isLimitUp: false,
      hasInstitutionBuy: true,
      changePercent: 5,
    });
    expect(result).toBeNull();
  });

  it('无机构买入时应返回 null', () => {
    const result = detectLimitUpPullback({
      symbol: '600519',
      triggeredAt: '2026-07-06',
      isLimitUp: true,
      hasInstitutionBuy: false,
      changePercent: 10,
    });
    expect(result).toBeNull();
  });

  it('创业板涨停（20%）应得 5 星', () => {
    const result = detectLimitUpPullback({
      symbol: '300750',
      triggeredAt: '2026-07-06',
      isLimitUp: true,
      hasInstitutionBuy: true,
      changePercent: 20,
    });
    expect(result).not.toBeNull();
    expect(result!.strength).toBe(5);
  });
});

// ===== S08: 多维共振 =====
describe('S08 - detectMultiResonance', () => {
  it('S01 + S03 触发 + RSI < 65 + 未创新高应触发', () => {
    const result = detectMultiResonance({
      symbol: '600519',
      triggeredAt: '2026-07-06',
      signal1Input: {
        symbol: '600519',
        triggeredAt: '2026-07-06',
        rank: 10,
        total: 200,
        mainNetInflowPercent: 5,
      },
      signal3Input: {
        symbol: '600519',
        triggeredAt: '2026-07-06',
        dailyHoldings: [
          { holdShares: 100, date: '2026-07-02' },
          { holdShares: 105, date: '2026-07-03' },
          { holdShares: 110, date: '2026-07-04' },
          { holdShares: 115, date: '2026-07-05' },
          { holdShares: 120, date: '2026-07-06' },
        ],
      },
      signal4Input: {
        symbol: '600519',
        triggeredAt: '2026-07-06',
        macdResults: [
          { dif: -0.3, dea: -0.2 },
          { dif: -0.1, dea: -0.15 },
        ],
      },
      rsi: 45,
      closes: [100, 102, 101, 103, 102],
    });
    expect(result).not.toBeNull();
    expect(result!.signalId).toBe('S08');
  });

  it('S01 + S04 触发 + RSI < 65 + 未创新高也应触发', () => {
    const result = detectMultiResonance({
      symbol: '600519',
      triggeredAt: '2026-07-06',
      signal1Input: {
        symbol: '600519',
        triggeredAt: '2026-07-06',
        rank: 10,
        total: 200,
        mainNetInflowPercent: 5,
      },
      signal3Input: {
        symbol: '600519',
        triggeredAt: '2026-07-06',
        dailyHoldings: [
          { holdShares: 100, date: '2026-07-02' },
          { holdShares: 95, date: '2026-07-03' }, // 减持，S03 不触发
          { holdShares: 100, date: '2026-07-04' },
          { holdShares: 105, date: '2026-07-05' },
          { holdShares: 110, date: '2026-07-06' },
        ],
      },
      signal4Input: {
        symbol: '600519',
        triggeredAt: '2026-07-06',
        macdResults: [
          { dif: -0.3, dea: -0.2 },
          { dif: -0.1, dea: -0.15 }, // 金叉
        ],
      },
      rsi: 50,
      closes: [100, 102, 101, 103, 102],
    });
    expect(result).not.toBeNull();
    expect(result!.signalId).toBe('S08');
  });

  it('S01 未触发时应返回 null', () => {
    const result = detectMultiResonance({
      symbol: '600519',
      triggeredAt: '2026-07-06',
      signal1Input: {
        symbol: '600519',
        triggeredAt: '2026-07-06',
        rank: 100, // 排名 100/200 = 50%，不触发
        total: 200,
        mainNetInflowPercent: -2,
      },
      signal3Input: {
        symbol: '600519',
        triggeredAt: '2026-07-06',
        dailyHoldings: [
          { holdShares: 100, date: '2026-07-02' },
          { holdShares: 105, date: '2026-07-03' },
          { holdShares: 110, date: '2026-07-04' },
          { holdShares: 115, date: '2026-07-05' },
          { holdShares: 120, date: '2026-07-06' },
        ],
      },
      signal4Input: {
        symbol: '600519',
        triggeredAt: '2026-07-06',
        macdResults: [
          { dif: -0.3, dea: -0.2 },
          { dif: -0.1, dea: -0.15 },
        ],
      },
      rsi: 45,
      closes: [100, 102, 101, 103, 102],
    });
    expect(result).toBeNull();
  });

  it('RSI >= 65（超买）时应返回 null', () => {
    const result = detectMultiResonance({
      symbol: '600519',
      triggeredAt: '2026-07-06',
      signal1Input: {
        symbol: '600519',
        triggeredAt: '2026-07-06',
        rank: 10,
        total: 200,
        mainNetInflowPercent: 5,
      },
      signal3Input: {
        symbol: '600519',
        triggeredAt: '2026-07-06',
        dailyHoldings: [
          { holdShares: 100, date: '2026-07-02' },
          { holdShares: 105, date: '2026-07-03' },
          { holdShares: 110, date: '2026-07-04' },
          { holdShares: 115, date: '2026-07-05' },
          { holdShares: 120, date: '2026-07-06' },
        ],
      },
      signal4Input: {
        symbol: '600519',
        triggeredAt: '2026-07-06',
        macdResults: [
          { dif: -0.3, dea: -0.2 },
          { dif: -0.1, dea: -0.15 },
        ],
      },
      rsi: 70, // 超买
      closes: [100, 102, 101, 103, 102],
    });
    expect(result).toBeNull();
  });

  it('价格创新高时应返回 null', () => {
    const result = detectMultiResonance({
      symbol: '600519',
      triggeredAt: '2026-07-06',
      signal1Input: {
        symbol: '600519',
        triggeredAt: '2026-07-06',
        rank: 10,
        total: 200,
        mainNetInflowPercent: 5,
      },
      signal3Input: {
        symbol: '600519',
        triggeredAt: '2026-07-06',
        dailyHoldings: [
          { holdShares: 100, date: '2026-07-02' },
          { holdShares: 105, date: '2026-07-03' },
          { holdShares: 110, date: '2026-07-04' },
          { holdShares: 115, date: '2026-07-05' },
          { holdShares: 120, date: '2026-07-06' },
        ],
      },
      signal4Input: {
        symbol: '600519',
        triggeredAt: '2026-07-06',
        macdResults: [
          { dif: -0.3, dea: -0.2 },
          { dif: -0.1, dea: -0.15 },
        ],
      },
      rsi: 45,
      closes: [100, 102, 103, 104, 105], // 持续创新高
    });
    expect(result).toBeNull();
  });

  it('S03 和 S04 都未触发时应返回 null', () => {
    const result = detectMultiResonance({
      symbol: '600519',
      triggeredAt: '2026-07-06',
      signal1Input: {
        symbol: '600519',
        triggeredAt: '2026-07-06',
        rank: 10,
        total: 200,
        mainNetInflowPercent: 5,
      },
      signal3Input: {
        symbol: '600519',
        triggeredAt: '2026-07-06',
        dailyHoldings: [
          { holdShares: 100, date: '2026-07-02' },
          { holdShares: 95, date: '2026-07-03' },
          { holdShares: 100, date: '2026-07-04' },
          { holdShares: 105, date: '2026-07-05' },
          { holdShares: 110, date: '2026-07-06' },
        ],
      },
      signal4Input: {
        symbol: '600519',
        triggeredAt: '2026-07-06',
        macdResults: [
          { dif: -0.3, dea: -0.2 },
          { dif: -0.25, dea: -0.15 },
        ],
      },
      rsi: 45,
      closes: [100, 102, 101, 103, 102],
    });
    expect(result).toBeNull();
  });
});

// ===== SIGNAL_MAP 注册表完整性 =====
describe('SIGNAL_MAP 注册表', () => {
  it('应包含 S01~S08 共 8 个信号', () => {
    expect(Object.keys(SIGNAL_MAP)).toEqual(['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08']);
  });

  it('每个信号函数调用后应返回正确结构', () => {
    // S01
    const r1 = SIGNAL_MAP.S01({
      symbol: '600519',
      triggeredAt: '2026-07-06',
      rank: 5,
      total: 100,
      mainNetInflowPercent: 5,
    });
    expect(r1).not.toBeNull();
    expect(r1!.signalId).toBe('S01');
    expect(r1!.symbol).toBe('600519');

    // S02
    const r2 = SIGNAL_MAP.S02({
      symbol: '000858',
      triggeredAt: '2026-07-06',
      marketUp: true,
      sectorRank: 1,
      individualRank: 0.01,
    });
    expect(r2).not.toBeNull();
    expect(r2!.signalId).toBe('S02');
  });
});
