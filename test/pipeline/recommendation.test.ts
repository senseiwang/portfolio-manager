/**
 * Phase 6 推荐系统测试
 *
 * 覆盖 T-6.1 ~ T-6.4 的所有纯函数
 */
import { describe, it, expect } from 'vitest';
import {
  findMissedSectors,
  findValuationCandidates,
  quantifySentiment,
  analyzeFundFlowConduction,
} from '../../src/pipeline/recommendation';
import type {
  SectorDailyChange,
  SectorConstituentValuation,
  MarketFlowInput,
  SectorFlowInput,
} from '../../src/pipeline/recommendation';

// ==================== T-6.1: 反向推荐 ====================

describe('findMissedSectors', () => {
  const makeChange = (
    sectorCode: string,
    sectorName: string,
    date: string,
    changePercent: number,
  ): SectorDailyChange => ({ sectorCode, sectorName, date, changePercent });

  it('应识别连续上涨且不在持仓中的板块', () => {
    const changes: SectorDailyChange[] = [
      makeChange('BK01', '板块A', '2026-07-01', 1.0),
      makeChange('BK01', '板块A', '2026-07-02', 2.0),
      makeChange('BK01', '板块A', '2026-07-03', 1.5),
      makeChange('BK02', '板块B', '2026-07-01', -0.5),
      makeChange('BK02', '板块B', '2026-07-02', 1.0),
      makeChange('BK02', '板块B', '2026-07-03', 0.5),
    ];

    const holdingSectors = new Set(['BK02']);
    const result = findMissedSectors(changes, holdingSectors, 3);

    expect(result).toHaveLength(1);
    expect(result[0].sectorCode).toBe('BK01');
    expect(result[0].consecutiveUpDays).toBe(3);
    expect(result[0].totalGain).toBeCloseTo(4.5, 1);
  });

  it('持仓板块不应出现在结果中', () => {
    const changes: SectorDailyChange[] = [
      makeChange('BK01', '板块A', '2026-07-01', 1.0),
      makeChange('BK01', '板块A', '2026-07-02', 2.0),
      makeChange('BK01', '板块A', '2026-07-03', 3.0),
    ];

    const holdingSectors = new Set(['BK01']);
    const result = findMissedSectors(changes, holdingSectors, 3);

    expect(result).toHaveLength(0);
  });

  it('连续上涨天数不足时不返回', () => {
    const changes: SectorDailyChange[] = [
      makeChange('BK01', '板块A', '2026-07-01', 1.0),
      makeChange('BK01', '板块A', '2026-07-02', 2.0),
    ];

    const result = findMissedSectors(changes, new Set(), 3);
    expect(result).toHaveLength(0);
  });

  it('按连续天数降序排列', () => {
    const changes: SectorDailyChange[] = [
      makeChange('BK01', '板块A', '2026-07-01', 1.0),
      makeChange('BK01', '板块A', '2026-07-02', 1.0),
      makeChange('BK01', '板块A', '2026-07-03', 1.0),
      makeChange('BK02', '板块B', '2026-07-01', 1.0),
      makeChange('BK02', '板块B', '2026-07-02', 1.0),
      makeChange('BK02', '板块B', '2026-07-03', 1.0),
      makeChange('BK02', '板块B', '2026-07-04', 1.0),
    ];

    const result = findMissedSectors(changes, new Set(), 3);
    expect(result).toHaveLength(2);
    expect(result[0].sectorCode).toBe('BK02');
    expect(result[0].consecutiveUpDays).toBe(4);
    expect(result[1].sectorCode).toBe('BK01');
  });

  it('空数据应返回空数组', () => {
    const result = findMissedSectors([], new Set(), 3);
    expect(result).toEqual([]);
  });
});

// ==================== T-6.2: 相似度推荐 ====================

describe('findValuationCandidates', () => {
  const makeHolding = (
    code: string,
    name: string,
    pe: number | null,
    pb: number | null,
    sectorCode: string,
    sectorName: string,
  ): SectorConstituentValuation => ({
    code, name, pe, pb, sectorCode, sectorName,
  });

  it('应找出同板块估值更低的股票', () => {
    const holdings = [makeHolding('600001', '持仓A', 20, 3, 'BK01', '板块A')];

    const sectorMap = new Map([
      [
        'BK01',
        [
          makeHolding('600001', '持仓A', 20, 3, 'BK01', '板块A'),
          makeHolding('600002', '候选B', 15, 2.5, 'BK01', '板块A'),
          makeHolding('600003', '候选C', 25, 3.5, 'BK01', '板块A'),
        ],
      ],
    ]);

    const result = findValuationCandidates(holdings, sectorMap);

    // 应排除持仓自身，返回 2 个候选
    expect(result).toHaveLength(2);

    // 600002 的 PE 更低（15 vs 20），折价率应为负数
    const candidateB = result.find(c => c.code === '600002');
    expect(candidateB).toBeDefined();
    expect(candidateB!.peDiscount).toBeLessThan(0);
    expect(candidateB!.compositeScore).toBeLessThan(0);
  });

  it('按综合折价评分升序排列', () => {
    const holdings = [makeHolding('600001', '持仓A', 20, 3, 'BK01', '板块A')];

    const sectorMap = new Map([
      [
        'BK01',
        [
          makeHolding('600001', '持仓A', 20, 3, 'BK01', '板块A'),
          makeHolding('600002', '候选B', 10, 2, 'BK01', '板块A'),
          makeHolding('600003', '候选C', 15, 2.5, 'BK01', '板块A'),
        ],
      ],
    ]);

    const result = findValuationCandidates(holdings, sectorMap);

    // 折价越大（越便宜）的越靠前
    expect(result[0].code).toBe('600002');
    expect(result[0].compositeScore).toBeLessThan(result[1].compositeScore);
  });

  it('无同板块候选时返回空数组', () => {
    const holdings = [makeHolding('600001', '持仓A', 20, 3, 'BK99', '板块X')];
    const sectorMap = new Map<string, SectorConstituentValuation[]>();

    const result = findValuationCandidates(holdings, sectorMap);
    expect(result).toEqual([]);
  });

  it('PE/PB 为 null 时折价率应为 null', () => {
    const holdings = [makeHolding('600001', '持仓A', 20, 3, 'BK01', '板块A')];

    const sectorMap = new Map([
      [
        'BK01',
        [
          makeHolding('600001', '持仓A', 20, 3, 'BK01', '板块A'),
          makeHolding('600002', '候选B', null, null, 'BK01', '板块A'),
        ],
      ],
    ]);

    const result = findValuationCandidates(holdings, sectorMap);
    expect(result).toHaveLength(1);
    expect(result[0].peDiscount).toBeNull();
    expect(result[0].pbDiscount).toBeNull();
  });
});

// ==================== T-6.3: 情绪面量化 ====================

describe('quantifySentiment', () => {
  it('涨停占比 >= 0.7 应判定为贪婪', () => {
    const result = quantifySentiment(70, 30);
    expect(result.sentiment).toBe('greedy');
    expect(result.greedScore).toBeGreaterThan(50);
    expect(result.upDownRatio).toBeCloseTo(0.7, 1);
  });

  it('涨停占比 <= 0.3 应判定为恐惧', () => {
    const result = quantifySentiment(20, 80);
    expect(result.sentiment).toBe('fear');
    expect(result.upDownRatio).toBeCloseTo(0.2, 1);
  });

  it('涨停跌停均为 0 应返回正常', () => {
    const result = quantifySentiment(0, 0);
    expect(result.sentiment).toBe('normal');
    expect(result.greedScore).toBe(50);
    expect(result.upDownRatio).toBe(0.5);
  });

  it('涨跌均衡应判定为正常', () => {
    const result = quantifySentiment(50, 50);
    expect(result.sentiment).toBe('normal');
    expect(result.greedScore).toBe(50);
    expect(result.upDownRatio).toBeCloseTo(0.5, 1);
  });
});

// ==================== T-6.4: 资金流三级传导 ====================

describe('analyzeFundFlowConduction', () => {
  const makeMarketFlow = (mainNetInflow: number | null): MarketFlowInput => ({
    mainNetInflow,
  });

  const makeSectorFlow = (
    code: string,
    name: string,
    mainNetInflow: number | null,
    mainNetInflowPercent: number | null,
    changePercent: number | null,
  ): SectorFlowInput => ({
    code, name, mainNetInflow, mainNetInflowPercent, changePercent,
  });

  it('市场流入 + 强势板块多 -> 高传导评分', () => {
    const marketFlows = [makeMarketFlow(5_000_000_000)]; // 50 亿净流入
    const sectorFlows: SectorFlowInput[] = [
      makeSectorFlow('BK01', '板块A', 1_000_000, 0.5, 2.0),
      makeSectorFlow('BK02', '板块B', 500_000, 0.3, 1.5),
      makeSectorFlow('BK03', '板块C', -100_000, -0.1, -0.5),
    ];

    const result = analyzeFundFlowConduction(marketFlows, sectorFlows);

    expect(result.marketDirection).toBe('inflow');
    expect(result.marketMainNetInflow).toBe(5_000_000_000);
    expect(result.strongSectors).toHaveLength(2);
    expect(result.weakSectors).toHaveLength(1);
    // 市场流入 +30，强势板块占比 2/3 >= 0.6 +20 => 100
    expect(result.conductionScore).toBe(100);
  });

  it('市场流出 + 弱势板块多 -> 低传导评分', () => {
    const marketFlows = [makeMarketFlow(-3_000_000_000)]; // 30 亿净流出
    const sectorFlows: SectorFlowInput[] = [
      makeSectorFlow('BK01', '板块A', -500_000, -0.2, -1.0),
      makeSectorFlow('BK02', '板块B', 100_000, 0.1, 0.5),
      makeSectorFlow('BK03', '板块C', -200_000, -0.15, -0.8),
    ];

    const result = analyzeFundFlowConduction(marketFlows, sectorFlows);

    expect(result.marketDirection).toBe('outflow');
    expect(result.strongSectors).toHaveLength(1);
    expect(result.weakSectors).toHaveLength(2);
    // 市场流出 -20，强势板块占比 1/3 < 0.4 -10 => 20
    expect(result.conductionScore).toBe(20);
  });

  it('无市场数据时 direction 应为 neutral', () => {
    const result = analyzeFundFlowConduction([], []);
    expect(result.marketDirection).toBe('neutral');
    expect(result.conductionScore).toBe(40); // 50 + 0 - 10
    expect(result.strongSectors).toEqual([]);
    expect(result.weakSectors).toEqual([]);
  });

  it('marketMainNetInflow 为 0 时 direction 应为 neutral', () => {
    const marketFlows = [makeMarketFlow(0)];
    const result = analyzeFundFlowConduction(marketFlows, []);
    expect(result.marketDirection).toBe('neutral');
  });

  it('传导评分应钳制在 [0, 100] 范围', () => {
    // 极端情况：市场流出 + 所有板块弱势
    const marketFlows = [makeMarketFlow(-100_000_000_000)];
    const sectorFlows: SectorFlowInput[] = [
      makeSectorFlow('BK01', '板块A', -1_000_000, -0.5, -3.0),
    ];

    const result = analyzeFundFlowConduction(marketFlows, sectorFlows);
    // 50 - 20 - 10 = 20
    expect(result.conductionScore).toBe(20);

    // 极端流入
    const marketFlows2 = [makeMarketFlow(100_000_000_000)];
    const sectorFlows2: SectorFlowInput[] = [
      makeSectorFlow('BK01', '板块A', 1_000_000, 0.5, 3.0),
    ];
    const result2 = analyzeFundFlowConduction(marketFlows2, sectorFlows2);
    // 50 + 30 + 20 = 100
    expect(result2.conductionScore).toBe(100);
  });

  it('强势板块按主力净流入降序排列', () => {
    const marketFlows = [makeMarketFlow(1_000_000_000)];
    const sectorFlows: SectorFlowInput[] = [
      makeSectorFlow('BK01', '板块A', 100_000, 0.1, 1.0),
      makeSectorFlow('BK02', '板块B', 500_000, 0.5, 2.0),
      makeSectorFlow('BK03', '板块C', 200_000, 0.2, 1.5),
    ];

    const result = analyzeFundFlowConduction(marketFlows, sectorFlows);

    expect(result.strongSectors).toHaveLength(3);
    expect(result.strongSectors[0].code).toBe('BK02');
    expect(result.strongSectors[1].code).toBe('BK03');
    expect(result.strongSectors[2].code).toBe('BK01');
  });
});