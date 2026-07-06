/**
 * 指标计算测试
 *
 * 用一组手算过的已知 K 线序列（固定收盘价，MA5 手工算出确定值）做测试。
 */
import { describe, it, expect } from 'vitest';
import {
  calcMA,
  calcMACD,
  calcBOLL,
  calcKDJ,
  calcRSI,
  calcATR,
  calcSAR,
  calcIndicator,
} from '../../src/engine/indicators';

// ===== 手算序列 =====
// 收盘价: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]
// MA5 手算:
//   idx 0-3: null (不足 5 期)
//   idx 4: (10+11+12+13+14)/5 = 12.0
//   idx 5: (11+12+13+14+15)/5 = 13.0
//   idx 6: (12+13+14+15+16)/5 = 14.0
//   idx 7: (13+14+15+16+17)/5 = 15.0
//   idx 8: (14+15+16+17+18)/5 = 16.0
//   idx 9: (15+16+17+18+19)/5 = 17.0
const CLOSES = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

describe('calcMA', () => {
  it('MA5 应与手算结果完全一致', () => {
    const result = calcMA(CLOSES, { periods: [5] });

    expect(result).toHaveLength(10);

    // 前 4 个为 null
    for (let i = 0; i < 4; i++) {
      expect(result[i].ma5).toBeNull();
    }

    // idx 4-9: 手算值
    expect(result[4].ma5).toBe(12);
    expect(result[5].ma5).toBe(13);
    expect(result[6].ma5).toBe(14);
    expect(result[7].ma5).toBe(15);
    expect(result[8].ma5).toBe(16);
    expect(result[9].ma5).toBe(17);
  });

  it('多周期 MA 应返回正确周期数', () => {
    const result = calcMA(CLOSES, { periods: [5, 10] });
    expect(result[0]).toHaveProperty('ma5');
    expect(result[0]).toHaveProperty('ma10');
  });
});

describe('calcMACD', () => {
  it('应返回与输入等长的数组', () => {
    const result = calcMACD(CLOSES);
    expect(result).toHaveLength(CLOSES.length);
  });

  it('每个元素应包含 dif/dea/macd 字段', () => {
    const result = calcMACD(CLOSES);
    expect(result[0]).toHaveProperty('dif');
    expect(result[0]).toHaveProperty('dea');
    expect(result[0]).toHaveProperty('macd');
  });

  it('前几项应为 null（lookback 期内）', () => {
    const result = calcMACD(CLOSES, { short: 12, long: 26, signal: 9 });
    // 12+26+9=47 > 10, 所以全部为 null
    for (const r of result) {
      expect(r.dif).toBeNull();
    }
  });
});

describe('calcRSI', () => {
  it('应返回与输入等长的数组', () => {
    const result = calcRSI(CLOSES, { periods: [6] });
    expect(result).toHaveLength(CLOSES.length);
  });

  it('前几项应为 null', () => {
    const result = calcRSI(CLOSES, { periods: [6] });
    for (let i = 0; i < 6; i++) {
      expect(result[i].rsi6).toBeNull();
    }
  });

  it('后续 RSI 值应在 [0, 100] 区间', () => {
    const result = calcRSI(CLOSES, { periods: [6] });
    for (let i = 6; i < result.length; i++) {
      const val = result[i].rsi6;
      if (val !== null) {
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('calcBOLL', () => {
  const closes = [
    20, 21, 22, 21, 20, 19, 20, 21, 22, 23,
    24, 23, 22, 21, 20, 19, 18, 19, 20, 21,
  ];

  it('应返回与输入等长的数组', () => {
    const result = calcBOLL(closes, { period: 5, stdDev: 2 });
    expect(result).toHaveLength(closes.length);
  });

  it('每个元素应包含 mid/upper/lower', () => {
    const result = calcBOLL(closes, { period: 5 });
    expect(result[10]).toHaveProperty('mid');
    expect(result[10]).toHaveProperty('upper');
    expect(result[10]).toHaveProperty('lower');
  });

  it('upper 应 >= mid >= lower', () => {
    const result = calcBOLL(closes, { period: 5, stdDev: 2 });
    for (const r of result) {
      if (r.mid !== null && r.upper !== null && r.lower !== null) {
        expect(r.upper).toBeGreaterThanOrEqual(r.mid);
        expect(r.mid).toBeGreaterThanOrEqual(r.lower);
      }
    }
  });
});

describe('calcKDJ', () => {
  // 构造 OHLCV 数据
  const ohlcv = CLOSES.map((c, i) => ({
    open: c - 1,
    high: c + 2,
    low: c - 2,
    close: c,
    volume: 10000 + i * 1000,
  }));

  it('应返回与输入等长的数组', () => {
    const result = calcKDJ(ohlcv);
    expect(result).toHaveLength(ohlcv.length);
  });

  it('每个元素应包含 k/d/j 字段', () => {
    const result = calcKDJ(ohlcv);
    expect(result[result.length - 1]).toHaveProperty('k');
    expect(result[result.length - 1]).toHaveProperty('d');
    expect(result[result.length - 1]).toHaveProperty('j');
  });

  it('KDJ 值应在 [0, 100] 区间', () => {
    const result = calcKDJ(ohlcv);
    for (const r of result) {
      if (r.k !== null) expect(r.k).toBeGreaterThanOrEqual(0);
      if (r.k !== null) expect(r.k).toBeLessThanOrEqual(100);
      if (r.d !== null) expect(r.d).toBeGreaterThanOrEqual(0);
      if (r.d !== null) expect(r.d).toBeLessThanOrEqual(100);
    }
  });
});

describe('calcATR', () => {
  const ohlcv = CLOSES.map((c) => ({
    open: c - 1,
    high: c + 3,
    low: c - 3,
    close: c,
  }));

  it('应返回与输入等长的数组', () => {
    const result = calcATR(ohlcv);
    expect(result).toHaveLength(ohlcv.length);
  });

  it('每个元素应包含 tr/atr 字段', () => {
    const result = calcATR(ohlcv);
    expect(result[result.length - 1]).toHaveProperty('tr');
    expect(result[result.length - 1]).toHaveProperty('atr');
  });
});

describe('calcSAR', () => {
  const ohlcv = CLOSES.map((c) => ({
    open: c - 1,
    high: c + 2,
    low: c - 2,
    close: c,
  }));

  it('应返回与输入等长的数组', () => {
    const result = calcSAR(ohlcv);
    expect(result).toHaveLength(ohlcv.length);
  });

  it('每个元素应包含 sar/trend/ep/af 字段', () => {
    const result = calcSAR(ohlcv);
    expect(result[result.length - 1]).toHaveProperty('sar');
    expect(result[result.length - 1]).toHaveProperty('trend');
    expect(result[result.length - 1]).toHaveProperty('ep');
    expect(result[result.length - 1]).toHaveProperty('af');
  });
});

describe('calcIndicator (统一入口)', () => {
  it('calcIndicator("MA", closes) 应与 calcMA 结果一致', () => {
    const direct = calcMA(CLOSES, { periods: [5] });
    const unified = calcIndicator('MA', CLOSES, { periods: [5] });
    expect(unified).toEqual(direct);
  });

  it('calcIndicator("RSI", closes) 应与 calcRSI 结果一致', () => {
    const direct = calcRSI(CLOSES, { periods: [14] });
    const unified = calcIndicator('RSI', CLOSES, { periods: [14] });
    expect(unified).toEqual(direct);
  });
});
