/**
 * 手动补跑 CLI — backfill
 *
 * 模拟当天运行 run-daily-report 的简化版本，使用 mock SDK 客户端。
 * 用于某天调度失败后手动补跑日报。
 *
 * 用法:
 *   npx tsx src/cli/backfill.ts --date=YYYY-MM-DD [--data-dir=./data]
 *
 * 输出:
 *   data/reports/{date}.json  — 日报结构化数据
 *   data/reports/{date}.txt   — 纯文本日报
 */
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { SdkClient } from '../data/sdkClient';
import { loadPortfolioConfig } from '../config/loadConfig';
import type { PortfolioConfig } from '../types/config';
import { getEnrichedHoldings, getEnrichedWatchlist } from '../pipeline/holdingsMonitor';
import type { EnrichedHolding } from '../pipeline/holdingsMonitor';
import { runDailyBatch } from '../pipeline/candidatePool';
import { evaluateRebalance } from '../pipeline/rebalance';
import { buildDailyReport, renderPlainTextReport } from '../pipeline/reportBuilder';
import type { DailyReport } from '../pipeline/reportBuilder';
import { calcPortfolioHealthScore } from '../engine/scoring';
import type { PortfolioHealthInput } from '../engine/scoring';
import type { SignalResult } from '../types/signal';
import type { BacktestResult } from '../engine/backtestRunner';
import { createNotifier } from '../notify/notifier';
import type { Notifier } from '../notify/notifier';

// ==================== 类型定义 ====================

/** runBackfill 选项 */
export interface BackfillOptions {
  /** 数据目录，默认 'data' */
  dataDir?: string;
  /** 通知器，默认 createNotifier() */
  notifier?: Notifier;
}

// ==================== CLI 参数解析 ====================

export interface ParsedArgs {
  date: string;
  dataDir: string;
}

/**
 * 解析命令行参数
 */
export function parseArgs(args: string[]): ParsedArgs {
  let date = '';
  let dataDir = 'data';

  for (const arg of args) {
    if (arg.startsWith('--date=')) {
      date = arg.slice(7);
    } else if (arg.startsWith('--data-dir=')) {
      dataDir = arg.slice(11);
    }
  }

  if (!date) {
    console.error('错误: 必须指定 --date=YYYY-MM-DD');
    process.exit(1);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error('错误: --date 格式必须为 YYYY-MM-DD');
    process.exit(1);
  }

  return { date, dataDir };
}

// ==================== Mock SDK 客户端 ====================

/**
 * 创建 backfill 专用的 mock SDK 客户端
 *
 * 所有方法返回空数据，不发起真实网络请求。
 * 足够让管道流程完整跑通，同时保持零网络依赖。
 */
function createBackfillMockClient(): SdkClient {
  return {
    async getAllQuotes() { return []; },
    async getQuotesByCodes(_codes: string[]) { return []; },
    async getKLine(_symbol: string, _from?: string, _to?: string) { return []; },
    async getFundFlow(_symbol: string, _days?: number) { return []; },
    async getMarketFundFlow() { return []; },
    async getNorthboundSummary() { return []; },
    async getNorthboundHoldingRank(_limit?: number) { return []; },
    async getZTPool() { return []; },
    async getStockChanges() { return []; },
    async getBoardChanges() { return []; },
    async getDragonTigerDetail(_date: string) { return []; },
    async getDragonTigerSeatDetail(_symbol: string, _date: string) { return []; },
    async getBlockTradeMarketStat(_date: string) { return []; },
    async getMarginAccountInfo() { return []; },
    async isTradingDay(_date: string) { return true; },
    async nextTradingDay(_date: string) { return '2026-07-07'; },
    getMarketStatus() { return 'closed' as const; },
    async search(_keyword: string) { return []; },
    async getFundFlowRank(_limit?: number) { return []; },
    async getSectorFundFlowRank(_limit?: number) { return []; },
    async getDividendDetail(_symbol: string) {
      return {} as never;
    },
    async getMarginTargetList(_date?: string) { return []; },
  };
}

// ==================== 健康度输入构建 ====================

/**
 * 构造 mock 健康度输入（当真实数据不足时使用合理的默认值）
 */
function buildHealthInput(
  holdings: EnrichedHolding[],
  rebalanceScore: number,
): PortfolioHealthInput {
  const pnlPercents = holdings.map(h => h.pnlPercent);
  const maxDrawdown =
    pnlPercents.length > 0
      ? Math.abs(Math.min(...pnlPercents, 0)) / 100
      : null;

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

// ==================== 核心补跑函数 ====================

/**
 * 手动补跑某天的日报
 *
 * 使用 mock SDK 客户端（不连真实网络），完整走一遍日报构建流程：
 * 创建 mock client → 加载配置 → 获取数据 → 候选池 → 信号 → 评分 →
 * 再平衡 → 构建报告 → 写入磁盘 → 发送通知。
 *
 * @param date  日期 YYYY-MM-DD
 * @param options 可选配置
 * @returns 构建的日报对象
 */
export async function runBackfill(
  date: string,
  options?: BackfillOptions,
): Promise<DailyReport> {
  const dataDir = options?.dataDir ?? 'data';
  const notifier = options?.notifier ?? createNotifier();

  console.error(`[backfill] 开始补跑日报: ${date}`);

  // 1. 创建 mock SDK 客户端（不连真实网络）
  const client = createBackfillMockClient();

  // 2. 加载配置（文件不存在时返回空配置）
  let config: PortfolioConfig;
  try {
    config = loadPortfolioConfig();
  } catch {
    config = { holdings: [], watchlist: [] };
  }

  // 3. 获取持仓和 watchlist（可能为空）
  console.error('[backfill] 获取持仓数据...');
  const holdings = await getEnrichedHoldings(client, config);
  const watchlist = await getEnrichedWatchlist(client, config);

  // 4. 市场状态
  console.error('[backfill] 获取市场状态...');
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

  // 5. 候选池批处理（默认拉取前一年的 K 线数据）
  const fromDate = new Date(date);
  fromDate.setFullYear(fromDate.getFullYear() - 1);
  const fromDateStr = fromDate.toISOString().slice(0, 10);

  console.error('[backfill] 运行候选池批处理...');
  const candidatePool = await runDailyBatch(client, {
    dataDir,
    fromDate: fromDateStr,
    toDate: date,
  });

  // 6. 构建信号映射 code → SignalResult[]
  const signalMap = new Map<string, SignalResult[]>();
  for (const c of candidatePool.candidates) {
    if (c.signals.length > 0) {
      signalMap.set(c.code, c.signals);
    }
  }

  // 7. 再平衡建议
  console.error('[backfill] 计算再平衡建议...');
  const fundFlowMap = new Map<string, number | null>();
  for (const h of holdings) {
    try {
      const flows = await client.getFundFlow(h.code, 20);
      if (flows.length > 0) {
        const avgInflow =
          flows.reduce((s, f) => {
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

  // 8. 综合健康度评分
  console.error('[backfill] 计算健康度评分...');
  const healthInput = buildHealthInput(holdings, rebalance.overallHealthScore);
  const healthScore = calcPortfolioHealthScore(healthInput);

  // 9. 回测（暂用空结果）
  const backtestResults: BacktestResult[] = [];

  // 10. 构建日报
  console.error('[backfill] 构建日报...');
  const report = buildDailyReport({
    date,
    holdings,
    watchlist,
    healthScore,
    candidatePool,
    rebalance,
    backtestResults,
    marketStatus: { isTradingDay, marketOpen },
  });

  // 11. 写入磁盘
  const reportsDir = path.resolve(dataDir, 'reports');
  mkdirSync(reportsDir, { recursive: true });

  const jsonPath = path.join(reportsDir, `${date}.json`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
  console.error(`[backfill] JSON 报告已写入: ${jsonPath}`);

  const txtPath = path.join(reportsDir, `${date}.txt`);
  const text = renderPlainTextReport(report);
  writeFileSync(txtPath, text, 'utf-8');
  console.error(`[backfill] 纯文本报告已写入: ${txtPath}`);

  // 12. 发送通知
  await notifier.send({
    type: 'report_complete',
    title: `日报补跑完成: ${date}`,
    content: `已成功补跑 ${date} 的投资组合日报，报告已写入 ${reportsDir}`,
    date,
    metadata: { backfill: true },
  });

  console.error(`[backfill] 补跑完成: ${date}`);
  return report;
}

// ==================== CLI 入口 ====================

const __filename = fileURLToPath(import.meta.url);
const isMain =
  process.argv[1] === __filename ||
  process.argv[1]?.endsWith('/backfill.ts') ||
  process.argv[1]?.endsWith('\\backfill.ts');

if (isMain) {
  const args = parseArgs(process.argv.slice(2));

  runBackfill(args.date, { dataDir: args.dataDir })
    .then(() => {
      process.exit(0);
    })
    .catch((err: unknown) => {
      console.error(
        '[backfill] 错误:',
        err instanceof Error ? err.message : String(err),
      );
      process.exit(1);
    });
}
