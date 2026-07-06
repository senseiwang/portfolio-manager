/**
 * run-daily-report CLI（T-5.5）
 *
 * 运行全部管道，生成日报 JSON 与纯文本文件。
 *
 * 用法:
 *   tsx src/cli/run-daily-report.ts [--data-dir=./data] [--from=2025-01-01] [--to=2026-07-06]
 *
 * 输出:
 *   data/reports/{date}.json  — 日报结构化数据
 *   data/reports/{date}.txt   — 纯文本日报
 */
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { createSdkClient } from '../data/sdkClient';
import { loadPortfolioConfig } from '../config/loadConfig';
import { getEnrichedHoldings, getEnrichedWatchlist } from '../pipeline/holdingsMonitor';
import { runDailyBatch } from '../pipeline/candidatePool';
import { evaluateRebalance } from '../pipeline/rebalance';
import { buildDailyReport, renderPlainTextReport } from '../pipeline/reportBuilder';
import type { DailyReport } from '../pipeline/reportBuilder';
import type { EnrichedHolding, EnrichedWatchlistItem } from '../pipeline/holdingsMonitor';
import type { SignalResult } from '../types/signal';
import { calcPortfolioHealthScore } from '../engine/scoring';
import type { PortfolioHealthInput, PortfolioHealthResult } from '../engine/scoring';
import type { BacktestResult } from '../engine/backtestRunner';

interface CliOptions {
  dataDir: string;
  fromDate: string;
  toDate: string;
}

function parseArgs(args: string[]): CliOptions {
  const opts: CliOptions = {
    dataDir: 'data',
    fromDate: '',
    toDate: '',
  };

  for (const arg of args) {
    if (arg.startsWith('--data-dir=')) {
      opts.dataDir = arg.slice(11);
    } else if (arg.startsWith('--from=')) {
      opts.fromDate = arg.slice(7);
    } else if (arg.startsWith('--to=')) {
      opts.toDate = arg.slice(5);
    }
  }

  if (!opts.toDate) {
    opts.toDate = new Date().toISOString().slice(0, 10);
  }
  if (!opts.fromDate) {
    const d = new Date(opts.toDate);
    d.setFullYear(d.getFullYear() - 1);
    opts.fromDate = d.toISOString().slice(0, 10);
  }

  return opts;
}

// 构造 mock 健康度输入（当真实数据不足时使用合理的默认值）
function buildHealthInput(
  holdings: EnrichedHolding[],
  rebalanceScore: number,
): PortfolioHealthInput {
  // 从持仓计算风险指标
  const pnlPercents = holdings.map(h => h.pnlPercent);
  const maxDrawdown =
    pnlPercents.length > 0
      ? Math.abs(Math.min(...pnlPercents, 0)) / 100 // 转为小数
      : null;

  // 平均涨跌幅作为情绪指标
  const avgChange =
    holdings.length > 0
      ? holdings.reduce((s, h) => s + h.changePercent, 0) / holdings.length
      : null;

  return {
    fundFlowHealth: null,
    technicalHealth: null,
    portfolioRisk: maxDrawdown !== null ? maxDrawdown * 100 : null,
    sentiment: avgChange,
    eventSafety: 100,
    strategyOpportunity: rebalanceScore,
  };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const client = createSdkClient();
  const date = opts.toDate;

  console.error(`[daily-report] 开始生成日报: ${date}`);

  // 1. 读取配置
  const config = loadPortfolioConfig();

  // 2. 获取持仓和 watchlist 数据
  console.error('[daily-report] 获取持仓数据...');
  const holdings: EnrichedHolding[] = await getEnrichedHoldings(client, config);
  const watchlist: EnrichedWatchlistItem[] = await getEnrichedWatchlist(client, config);

  // 3. 市场状态
  console.error('[daily-report] 获取市场状态...');
  let isTradingDay = false;
  let marketOpen = false;
  try {
    isTradingDay = await client.isTradingDay(date);
    const status = client.getMarketStatus();
    marketOpen = status === 'trading';
  } catch {
    isTradingDay = false;
    marketOpen = false;
  }

  // 4. 候选池批处理
  console.error('[daily-report] 运行候选池批处理...');
  const candidatePool = await runDailyBatch(client, {
    dataDir: opts.dataDir,
    fromDate: opts.fromDate,
    toDate: date,
  });

  // 5. 构建信号 map（code → signals）
  const signalMap = new Map<string, SignalResult[]>();
  for (const c of candidatePool.candidates) {
    if (c.signals.length > 0) {
      signalMap.set(c.code, c.signals);
    }
  }

  // 6. 再平衡建议
  console.error('[daily-report] 计算再平衡建议...');
  const fundFlowMap = new Map<string, number | null>();
  // 尽量获取持仓的资金流数据
  for (const h of holdings) {
    try {
      const flows = await client.getFundFlow(h.code, 20);
      if (flows.length > 0) {
        const avgInflow = flows.reduce((s, f) => {
          // 根据资金流数据结构的实际字段计算净流入占比
          const netAmount = 'netInflow' in f
            ? (f as unknown as Record<string, number>).netInflow
            : 0;
          const amount = 'amount' in f
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

  // 7. 综合健康度评分
  console.error('[daily-report] 计算健康度评分...');
  const healthInput = buildHealthInput(holdings, rebalance.overallHealthScore);
  const healthScore: PortfolioHealthResult = calcPortfolioHealthScore(healthInput);

  // 8. 回测（mock 实现，有行情时才运行）
  const backtestResults: BacktestResult[] = [];

  // 9. 构建日报
  console.error('[daily-report] 构建日报...');
  const report: DailyReport = buildDailyReport({
    date,
    holdings,
    watchlist,
    healthScore,
    candidatePool,
    rebalance,
    backtestResults,
    marketStatus: { isTradingDay, marketOpen },
  });

  // 10. 输出
  const reportsDir = path.resolve(opts.dataDir, 'reports');
  mkdirSync(reportsDir, { recursive: true });

  const jsonPath = path.join(reportsDir, `${date}.json`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
  console.error(`[daily-report] JSON 报告已写入: ${jsonPath}`);

  const txtPath = path.join(reportsDir, `${date}.txt`);
  const text = renderPlainTextReport(report);
  writeFileSync(txtPath, text, 'utf-8');
  console.error(`[daily-report] 纯文本报告已写入: ${txtPath}`);

  // 11. 同时输出到控制台
  console.log(text);
}

main().catch((err) => {
  console.error('[daily-report] 错误:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});