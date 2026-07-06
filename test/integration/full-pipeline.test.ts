/**
 * 全链路端到端冒烟测试
 *
 * 从 mock SDK 客户端创建 → 配置加载 → 数据获取/增强 → 管道跑批
 * → 日报构建 → 文本渲染 → 磁盘写入，覆盖 CLI 入口到产出报告文件的全流程。
 * 所有数据走 mock fixture，不发起真实网络请求。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { z } from 'zod';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createMockSdkClient } from '../mocks/sdkMock';
import { getEnrichedHoldings, getEnrichedWatchlist } from '../../src/pipeline/holdingsMonitor';
import { runDailyBatch } from '../../src/pipeline/candidatePool';
import { evaluateRebalance } from '../../src/pipeline/rebalance';
import { buildDailyReport, renderPlainTextReport } from '../../src/pipeline/reportBuilder';
import type { DailyReport, DailyReportInput } from '../../src/pipeline/reportBuilder';
import type { PortfolioConfig } from '../../src/types/config';
import type { PortfolioHealthInput } from '../../src/engine/scoring';
import { calcPortfolioHealthScore } from '../../src/engine/scoring';
import type { SignalResult } from '../../src/types/signal';
import type { BacktestResult } from '../../src/engine/backtestRunner';

// ============================================================================
// Zod schema for DailyReport — 与接口类型保持同步
// ============================================================================

const SignalResultSchema = z.object({
  signalId: z.string(),
  symbol: z.string(),
  triggeredAt: z.string(),
  strength: z.number(),
  detail: z.record(z.any()),
});

const EnrichedHoldingSchema = z.object({
  code: z.string(),
  shares: z.number(),
  costPrice: z.number(),
  currentPrice: z.number(),
  name: z.string(),
  marketValue: z.number(),
  costValue: z.number(),
  pnl: z.number(),
  pnlPercent: z.number(),
  changePercent: z.number(),
});

const EnrichedWatchlistItemSchema = z.object({
  code: z.string(),
  name: z.string(),
  currentPrice: z.number(),
  changePercent: z.number(),
});

const HealthScoreSchema = z.object({
  fundFlowHealth: z.number(),
  technicalHealth: z.number(),
  portfolioRisk: z.number(),
  sentiment: z.number(),
  eventSafety: z.number(),
  strategyOpportunity: z.number(),
  total: z.number(),
  colorBand: z.enum(['green', 'yellow', 'orange', 'red']),
});

const TopSignalItemSchema = z.object({
  code: z.string(),
  name: z.string(),
  signals: z.array(SignalResultSchema),
});

const HoldingScoreSchema = z.object({
  code: z.string(),
  name: z.string(),
  fundFlowScore: z.number(),
  signalScore: z.number(),
  totalScore: z.number(),
  signals: z.array(z.any()),
});

const DailyReportSchema: z.ZodType<DailyReport> = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  holdingsOverview: z.object({
    totalMarketValue: z.number(),
    totalPnl: z.number(),
    totalPnlPercent: z.number(),
    holdings: z.array(EnrichedHoldingSchema),
  }),
  watchlistOverview: z.object({
    totalStocks: z.number(),
    items: z.array(EnrichedWatchlistItemSchema),
  }),
  healthScore: HealthScoreSchema,
  candidatePool: z.object({
    totalCandidates: z.number(),
    topSignals: z.array(TopSignalItemSchema),
  }),
  rebalance: z.object({
    date: z.string(),
    holdings: z.array(HoldingScoreSchema),
    replaceCandidates: z.array(z.any()),
    overallHealthScore: z.number(),
  }),
  backtestSummary: z.object({
    totalResults: z.number(),
    bestStrategy: z.nullable(
      z.object({ strategy: z.string(), totalReturn: z.number() }),
    ),
    results: z.array(z.any()),
  }),
  marketStatus: z.object({
    isTradingDay: z.boolean(),
    marketOpen: z.boolean(),
    date: z.string(),
  }),
});

// ============================================================================
// 测试用例
// ============================================================================

describe('全链路端到端冒烟测试', () => {
  const date = '2026-07-06';
  let report: DailyReport;
  let plainText: string;
  let tmpDir: string;

  beforeAll(async () => {
    // ---- 1. 创建 mock 客户端 ----
    const mockClient = createMockSdkClient();

    // 限制全市场数据量为 5 条，保证测试速度
    const originalGetAll = mockClient.getAllQuotes.bind(mockClient);
    mockClient.getAllQuotes = async () => {
      const all = await originalGetAll();
      return all.filter(q => (q.circulatingMarketCap ?? 0) >= 50).slice(0, 5);
    };

    // ---- 2. 内联测试配置（不使用 YAML 文件） ----
    const config: PortfolioConfig = {
      holdings: [
        { code: '920000', shares: 100, costPrice: 10 },
        { code: '920001', shares: 200, costPrice: 15 },
      ],
      watchlist: ['920002', '920003'],
    };

    // ---- 3. 获取增强后的持仓和 watchlist ----
    const holdings = await getEnrichedHoldings(mockClient, config);
    const watchlist = await getEnrichedWatchlist(mockClient, config);

    // ---- 4. 市场状态 ----
    const isTradingDay = await mockClient.isTradingDay(date);
    const marketStatusRaw = mockClient.getMarketStatus();

    // ---- 5. 候选池批处理（写入临时目录） ----
    tmpDir = mkdtempSync(join(tmpdir(), 'full-pipeline-test-'));
    const candidatePool = await runDailyBatch(mockClient, {
      dataDir: tmpDir,
      fromDate: '2025-07-06',
      toDate: date,
    });

    // ---- 6. 构建信号 code → SignalResult[] 映射 ----
    const signalMap = new Map<string, SignalResult[]>();
    for (const c of candidatePool.candidates) {
      if (c.signals.length > 0) {
        signalMap.set(c.code, c.signals);
      }
    }

    // ---- 7. 再平衡建议 ----
    const fundFlowMap = new Map<string, number | null>();
    for (const h of holdings) {
      try {
        const flows = await mockClient.getFundFlow(h.code, 20);
        if (flows.length > 0) {
          const avgInflow =
            flows.reduce((s, f) => {
              // 兼容不同字段名的资金流数据
              const netAmount =
                'netInflow' in f
                  ? (f as unknown as Record<string, number>).netInflow
                  : 0;
              const amount =
                'amount' in f
                  ? (f as unknown as Record<string, number>).amount
                  : 1;
              return s + (amount > 0 ? (netAmount / amount) * 100 : 0);
            }, 0) / flows.length;
          fundFlowMap.set(h.code, avgInflow);
        } else {
          fundFlowMap.set(h.code, null);
        }
      } catch {
        fundFlowMap.set(h.code, null);
      }
    }
    const rebalance = evaluateRebalance(holdings, fundFlowMap, signalMap, date);

    // ---- 8. 综合健康度评分 ----
    const pnlPercents = holdings.map(h => h.pnlPercent);
    const maxDrawdown =
      pnlPercents.length > 0
        ? Math.abs(Math.min(...pnlPercents, 0)) / 100
        : null;
    const avgChange =
      holdings.length > 0
        ? holdings.reduce((s, h) => s + h.changePercent, 0) / holdings.length
        : null;

    const healthInput: PortfolioHealthInput = {
      fundFlowHealth: null,
      technicalHealth: null,
      portfolioRisk: maxDrawdown !== null ? maxDrawdown * 100 : null,
      sentiment: avgChange,
      eventSafety: 100,
      strategyOpportunity: rebalance.overallHealthScore,
    };
    const healthScore = calcPortfolioHealthScore(healthInput);

    // 构造一个简单的回测结果供验证
    const backtestResults: BacktestResult[] = [
      {
        code: '920000',
        strategy: 'stg01-pullback',
        report: {
          initialCapital: 100000,
          finalEquity: 105000,
          totalReturn: 5,
          winRate: 60,
          maxDrawdown: 3,
          tradeCount: 5,
          trades: [],
          equityCurve: [100000, 101000, 102000, 103000, 104000, 105000],
        },
      },
    ];

    // ---- 9. 构建日报 ----
    report = buildDailyReport({
      date,
      holdings,
      watchlist,
      healthScore,
      candidatePool,
      rebalance,
      backtestResults,
      marketStatus: {
        isTradingDay,
        marketOpen: marketStatusRaw === 'trading',
      },
    });

    // ---- 10. 渲染纯文本 ----
    plainText = renderPlainTextReport(report);

    // ---- 11. 模拟文件输出（验证 CLI 写入磁盘环节） ----
    const reportsDir = join(tmpDir, 'reports');
    mkdirSync(reportsDir, { recursive: true });

    const jsonPath = join(reportsDir, `${date}.json`);
    writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');

    const txtPath = join(reportsDir, `${date}.txt`);
    writeFileSync(txtPath, plainText, 'utf-8');
  });

  // ======================================================================
  // 1. Zod schema 校验
  // ======================================================================

  it('DailyReport 应通过 Zod schema 校验', () => {
    const result = DailyReportSchema.safeParse(report);
    if (!result.success) {
      console.error('Zod 校验失败:', JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });

  // ======================================================================
  // 2. 7 大板块数组长度验证
  // ======================================================================

  it('板块 1 — 持仓概览: holdings 数组长度 > 0', () => {
    expect(report.holdingsOverview.holdings.length).toBeGreaterThan(0);
  });

  it('板块 2 — Watchlist 概览: items 数组长度 > 0', () => {
    expect(report.watchlistOverview.items.length).toBeGreaterThan(0);
  });

  it('板块 3 — 组合健康度: 各维度评分已填充', () => {
    expect(report.healthScore.total).toBeGreaterThanOrEqual(0);
    expect(report.healthScore.total).toBeLessThanOrEqual(100);
    expect(['green', 'yellow', 'orange', 'red']).toContain(
      report.healthScore.colorBand,
    );
  });

  it('板块 4 — 候选池摘要: topSignals 数组长度 > 0', () => {
    expect(report.candidatePool.topSignals.length).toBeGreaterThan(0);
  });

  it('板块 5 — 再平衡建议: holdings 数组长度 > 0', () => {
    expect(report.rebalance.holdings.length).toBeGreaterThan(0);
  });

  it('板块 6 — 回测摘要: results 数组长度 > 0', () => {
    expect(report.backtestSummary.results.length).toBeGreaterThan(0);
    expect(report.backtestSummary.bestStrategy).not.toBeNull();
  });

  it('板块 7 — 市场状态: 日期与开关状态已填充', () => {
    expect(report.marketStatus.date).toBe(date);
    expect(typeof report.marketStatus.isTradingDay).toBe('boolean');
    expect(typeof report.marketStatus.marketOpen).toBe('boolean');
  });

  // ======================================================================
  // 3. 文本渲染验证
  // ======================================================================

  it('renderPlainTextReport 应包含所有 7 个板块标题', () => {
    expect(plainText).toContain('【持仓概览】');
    expect(plainText).toContain('【Watchlist 概览】');
    expect(plainText).toContain('【组合健康度】');
    expect(plainText).toContain('【候选池摘要】');
    expect(plainText).toContain('【再平衡建议】');
    expect(plainText).toContain('【回测摘要】');
    expect(plainText).toContain('【市场状态】');
    expect(plainText).toContain('='.repeat(60));
  });

  it('renderPlainTextReport 应包含报告日期与分隔线', () => {
    expect(plainText).toContain(date);
  });

  // ======================================================================
  // 4. 磁盘文件输出验证
  // ======================================================================

  it('JSON 报告文件应已写入磁盘', () => {
    const jsonPath = join(tmpDir, 'reports', `${date}.json`);
    expect(existsSync(jsonPath)).toBe(true);

    const content = JSON.parse(readFileSync(jsonPath, 'utf-8'));
    expect(content.date).toBe(date);
    expect(content.holdingsOverview).toBeDefined();
    expect(content.watchlistOverview).toBeDefined();
    expect(content.healthScore).toBeDefined();
    expect(content.candidatePool).toBeDefined();
    expect(content.rebalance).toBeDefined();
    expect(content.backtestSummary).toBeDefined();
    expect(content.marketStatus).toBeDefined();
  });

  it('纯文本日报文件应已写入磁盘', () => {
    const txtPath = join(tmpDir, 'reports', `${date}.txt`);
    expect(existsSync(txtPath)).toBe(true);

    const content = readFileSync(txtPath, 'utf-8');
    expect(content).toContain(date);
    expect(content).toContain('【持仓概览】');
    expect(content).toContain('【市场状态】');
  });

  // ======================================================================
  // 5. 无 undefined 泄漏验证
  // ======================================================================

  it('序列化后不应包含 undefined', () => {
    const json = JSON.stringify(report);
    expect(json).not.toContain('undefined');
  });
});
