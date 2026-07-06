/**
 * 持仓监控模块测试
 *
 * 给定固定的持仓配置 + 固定的行情 mock，
 * 断言计算出的市值/盈亏与手工算好的期望值精确一致。
 *
 * T-6.5 测试：事件驱动提醒
 */
import { describe, it, expect } from 'vitest';
import { createMockSdkClient } from '../mocks/sdkMock';
import {
  getEnrichedHoldings,
  getEnrichedWatchlist,
  getHoldingEvents,
} from '../../src/pipeline/holdingsMonitor';
import type { PortfolioConfig } from '../../src/types/config';
import type { SdkClient } from '../../src/data/sdkClient';
import type { DividendDetail, MarginTarget } from '../../src/types/sdk';

describe('getEnrichedHoldings', () => {
  const mockClient = createMockSdkClient();

  // 使用已知价格的股票（来自 sdk.batch.cn.json fixture）：
  // 600519 (贵州茅台): price=1194.45
  // 000001 (平安银行):  price=10.29
  const testConfig: PortfolioConfig = {
    holdings: [
      { code: '600519', shares: 100, costPrice: 1500.50 },
      { code: '000001', shares: 500, costPrice: 10.20 },
    ],
    watchlist: [],
  };

  it('应正确计算市值', async () => {
    const result = await getEnrichedHoldings(mockClient, testConfig);

    // 600519: 1194.45 * 100 = 119445.00
    expect(result[0].marketValue).toBe(119445.00);
    // 000001: 10.29 * 500 = 5145.00
    expect(result[1].marketValue).toBe(5145.00);
  });

  it('应正确计算持仓成本', async () => {
    const result = await getEnrichedHoldings(mockClient, testConfig);

    // 600519: 1500.50 * 100 = 150050.00
    expect(result[0].costValue).toBe(150050.00);
    // 000001: 10.20 * 500 = 5100.00
    expect(result[1].costValue).toBe(5100.00);
  });

  it('应正确计算盈亏金额', async () => {
    const result = await getEnrichedHoldings(mockClient, testConfig);

    // 600519: 119445 - 150050 = -30605.00
    expect(result[0].pnl).toBe(-30605.00);
    // 000001: 5145 - 5100 = 45.00
    expect(result[1].pnl).toBe(45.00);
  });

  it('应正确计算盈亏百分比', async () => {
    const result = await getEnrichedHoldings(mockClient, testConfig);

    // 600519: (1194.45 - 1500.50) / 1500.50 * 100 = -20.40
    expect(result[0].pnlPercent).toBeCloseTo(-20.40, 1);
    // 000001: (10.29 - 10.20) / 10.20 * 100 = 0.88
    expect(result[1].pnlPercent).toBeCloseTo(0.88, 1);
  });

  it('空持仓应返回空数组', async () => {
    const result = await getEnrichedHoldings(mockClient, {
      holdings: [],
      watchlist: [],
    });
    expect(result).toEqual([]);
  });

  it('持仓名称应与行情数据一致', async () => {
    const result = await getEnrichedHoldings(mockClient, testConfig);
    expect(result[0].name).toBe('贵州茅台');
    expect(result[1].name).toBe('平安银行');
  });

  it('金额计算应精确到小数点后 2 位', async () => {
    const result = await getEnrichedHoldings(mockClient, testConfig);
    for (const item of result) {
      const amountFields = [item.marketValue, item.costValue, item.pnl] as const;
      for (const val of amountFields) {
        // 验证小数点后最多 2 位
        const decimalStr = val.toString().split('.')[1];
        if (decimalStr) {
          expect(decimalStr.length).toBeLessThanOrEqual(2);
        }
      }
    }
  });
});

describe('getEnrichedWatchlist', () => {
  const mockClient = createMockSdkClient();

  const testConfig: PortfolioConfig = {
    holdings: [],
    watchlist: ['600519', '000333'],
  };

  it('应返回 watchlist 条目的实时行情', async () => {
    const result = await getEnrichedWatchlist(mockClient, testConfig);
    expect(result).toHaveLength(2);
    expect(result[0].code).toBe('600519');
    expect(result[0].name).toBe('贵州茅台');
    expect(result[1].code).toBe('000333');
  });

  it('空 watchlist 应返回空数组', async () => {
    const result = await getEnrichedWatchlist(mockClient, {
      holdings: [],
      watchlist: [],
    });
    expect(result).toEqual([]);
  });
});

// ==================== T-6.5: 事件驱动提醒 ====================

describe('getHoldingEvents', () => {
  function createMockWithDividend(
    dividend: Partial<DividendDetail>,
    marginTargets: MarginTarget[] = [],
  ): SdkClient {
    const mock = createMockSdkClient();

    // 覆盖 getDividendDetail 返回一个包含未来除权日的分红详情
    mock.getDividendDetail = async () => ({
      code: '600519',
      name: '贵州茅台',
      reportDate: '2025-12-31',
      planNoticeDate: '2026-04-17',
      disclosureDate: '2026-04-17',
      assignTransferRatio: null,
      bonusRatio: null,
      transferRatio: null,
      dividendPretax: 280.2423,
      dividendDesc: '10派280.2423元(含税)',
      dividendYield: 0.023,
      eps: 65.66,
      bps: 195.36,
      capitalReserve: 0.001,
      unassignedProfit: 153.25,
      netProfitYoy: -4.53,
      totalShares: 1250081601,
      equityRecordDate: null,
      exDividendDate: null,
      payDate: null,
      assignProgress: '实施分配',
      noticeDate: '2026-06-22',
      ...dividend,
    });

    // 覆盖 getMarginTargetList
    mock.getMarginTargetList = async () => marginTargets;

    return mock;
  }

  const testConfig: PortfolioConfig = {
    holdings: [{ code: '600519', shares: 100, costPrice: 1500.50 }],
    watchlist: [],
  };

  it('应检测到未来 30 天内的除权除息日', async () => {
    // 除权日在 10 天后
    const futureDate = '2026-07-16';
    const client = createMockWithDividend({ exDividendDate: futureDate });

    const events = await getHoldingEvents(client, testConfig);

    const exDateEvents = events.filter(e => e.type === 'dividend_ex_date');
    expect(exDateEvents).toHaveLength(1);
    expect(exDateEvents[0].code).toBe('600519');
    expect(exDateEvents[0].date).toBe(futureDate);
    expect(exDateEvents[0].daysFromNow).toBe(10);
    // 10 天 > 7 天，应为 medium 优先级
    expect(exDateEvents[0].priority).toBe('medium');
  });

  it('7 天内的除权除息日应为 high 优先级', async () => {
    const futureDate = '2026-07-08'; // 2 天后
    const client = createMockWithDividend({ exDividendDate: futureDate });

    const events = await getHoldingEvents(client, testConfig);

    const exDateEvents = events.filter(e => e.type === 'dividend_ex_date');
    expect(exDateEvents).toHaveLength(1);
    expect(exDateEvents[0].priority).toBe('high');
  });

  it('应检测到未来 30 天内的派息日', async () => {
    const futureDate = '2026-07-20';
    const client = createMockWithDividend({ payDate: futureDate });

    const events = await getHoldingEvents(client, testConfig);

    const payDateEvents = events.filter(e => e.type === 'dividend_pay_date');
    expect(payDateEvents).toHaveLength(1);
    expect(payDateEvents[0].date).toBe(futureDate);
  });

  it('应检测到近 7 天内的除权除息日已过', async () => {
    // 除权日在 3 天前
    const pastDate = '2026-07-03';
    const client = createMockWithDividend({ exDividendDate: pastDate });

    const events = await getHoldingEvents(client, testConfig);

    const passedEvents = events.filter(e => e.type === 'ex_dividend_passed');
    expect(passedEvents).toHaveLength(1);
    expect(passedEvents[0].date).toBe(pastDate);
    expect(passedEvents[0].daysFromNow).toBe(-3);
  });

  it('30 天前的除权除息日不应触发提醒', async () => {
    const pastDate = '2026-06-01'; // 35 天前
    const client = createMockWithDividend({ exDividendDate: pastDate });

    const events = await getHoldingEvents(client, testConfig);

    const passedEvents = events.filter(e => e.type === 'ex_dividend_passed');
    expect(passedEvents).toHaveLength(0);
  });

  it('应检测到融资融券标的', async () => {
    const marginTargets: MarginTarget[] = [
      { code: '600519', name: '贵州茅台', market: '1' },
    ];
    const client = createMockWithDividend({}, marginTargets);

    const events = await getHoldingEvents(client, testConfig);

    const marginEvents = events.filter(e => e.type === 'margin_target');
    expect(marginEvents).toHaveLength(1);
    expect(marginEvents[0].code).toBe('600519');
    expect(marginEvents[0].priority).toBe('low');
  });

  it('空持仓应返回空数组', async () => {
    const client = createMockWithDividend({});
    const events = await getHoldingEvents(client, {
      holdings: [],
      watchlist: [],
    });
    expect(events).toEqual([]);
  });
});
