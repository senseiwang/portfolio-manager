/**
 * Stage 1: 单次收盘干跑 CLI
 *
 * 连接真实行情数据源，对指定股票列表运行完整的日报生成流程
 * （buildDailyReport + renderPlainTextReport），记录运行耗时和接口调用次数作为基线。
 *
 * 用法:
 *   tsx src/cli/run-stage1.ts --stocks=600519,000858,600036
 *   tsx src/cli/run-stage1.ts --stocks=600519,000858,600036 --data-dir=./data
 */
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createSdkClient, type SdkClient } from '../data/sdkClient';
import { buildDailyReport, renderPlainTextReport } from '../pipeline/reportBuilder';
import type { DailyReportInput } from '../pipeline/reportBuilder';
import type { FullQuote, MarketStatus } from '../types/sdk';
import type { EnrichedHolding, EnrichedWatchlistItem } from '../pipeline/holdingsMonitor';
import type { PortfolioHealthResult } from '../engine/scoring';
import type { CandidatePoolReport } from '../pipeline/candidatePool';
import type { RebalanceSuggestion } from '../pipeline/rebalance';

// ==================== 类型 ====================

export interface Stage1Result {
  date: string;
  stockCount: number;
  marketStatus: { isTradingDay: boolean; marketOpen: boolean };
  startTime: string;  // ISO
  endTime: string;    // ISO
  durationMs: number;
  apiCallCount: number;
  reportPath: string;
  textReportPath: string;
  reportValid: boolean;
}

// ==================== 参数解析 ====================

export interface Stage1Args {
  stocks: string[];
  dataDir: string;
}

/**
 * 解析命令行参数
 * 支持 --stocks=code1,code2,...  和 --data-dir=./path
 */
export function parseArgs(args: string[]): Stage1Args {
  const result: Stage1Args = {
    stocks: [],
    dataDir: 'data',
  };

  for (const arg of args) {
    if (arg.startsWith('--stocks=')) {
      const value = arg.slice(9);
      result.stocks = value.split(',').map(s => s.trim()).filter(Boolean);
    } else if (arg.startsWith('--data-dir=')) {
      result.dataDir = arg.slice(11);
    }
  }

  return result;
}

// ==================== API 调用计数包装 ====================

/**
 * 包装 SdkClient，计数每次 API 调用
 *
 * 使用 Proxy 劫持所有方法调用，自动递增计数器。
 * 返回 { client, count }，其中 count 为 getter 可实时读取。
 */
export function createApiCallCounter(client: SdkClient): { client: SdkClient; count: number } {
  const state = { count: 0 };

  const wrapped = new Proxy(client, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);
      if (typeof original === 'function') {
        return (...args: unknown[]) => {
          state.count++;
          return original.apply(target, args);
        };
      }
      return original;
    },
  });

  return {
    client: wrapped as SdkClient,
    get count() { return state.count; },
  };
}

// ==================== 日报构建辅助 ====================

/**
 * 从行情数据构建最小日报输入
 *
 * 由于 Stage 1 没有完整的管道数据，将股票列表映射为"零盈亏"持仓，
 * 其他板块使用默认值或空数据填充，确保 buildDailyReport 可正常执行。
 */
function buildMinimalDailyReportInput(
  date: string,
  quotes: FullQuote[],
  marketStatusVal: { isTradingDay: boolean; marketOpen: boolean },
): DailyReportInput {
  // --- 持仓概览：将股票列表映射为持仓（默认 100 股，成本=现价，PnL=0） ---
  const holdings: EnrichedHolding[] = quotes.map(q => {
    const marketValue = q.price * 100;
    const costValue = q.price * 100;
    return {
      code: q.code,
      shares: 100,
      costPrice: q.price,
      currentPrice: q.price,
      name: q.name,
      marketValue: Math.round(marketValue * 100) / 100,
      costValue: Math.round(costValue * 100) / 100,
      pnl: 0,
      pnlPercent: 0,
      changePercent: q.changePercent,
    };
  });

  // --- Watchlist：所有股票 ---
  const watchlist: EnrichedWatchlistItem[] = quotes.map(q => ({
    code: q.code,
    name: q.name,
    currentPrice: q.price,
    changePercent: q.changePercent,
  }));

  // --- 健康度：使用中间默认值 ---
  const healthScore: PortfolioHealthResult = {
    fundFlowHealth: 50,
    technicalHealth: 50,
    portfolioRisk: 50,
    sentiment: 50,
    eventSafety: 50,
    strategyOpportunity: 50,
    total: 50,
    colorBand: 'yellow',
    details: [],
  };

  // --- 候选池：空 ---
  const candidatePool: CandidatePoolReport = {
    date,
    totalQuotes: 0,
    afterQuickFilter: 0,
    afterKLineFilter: 0,
    candidates: [],
  };

  // --- 再平衡：空 ---
  const rebalance: RebalanceSuggestion = {
    date,
    holdings: [],
    replaceCandidates: [],
    overallHealthScore: 50,
  };

  return {
    date,
    holdings,
    watchlist,
    healthScore,
    candidatePool,
    rebalance,
    backtestResults: [],
    marketStatus: marketStatusVal,
  };
}

/** 市场状态枚举可读描述 */
function describeMarketStatus(status: MarketStatus): string {
  switch (status) {
    case 'pre_market': return '盘前';
    case 'trading': return '交易中';
    case 'closed': return '已收盘';
    case 'after_hours': return '盘后';
    default: return status;
  }
}

// ==================== 主函数 ====================

/**
 * Stage 1 主函数
 *
 * @param stocks     - 股票代码列表（如 ['600519', '000858']）
 * @param dataDir    - 数据输出目录（默认为 'data'）
 * @param sdkClient  - 可选 SDK 客户端，用于测试时注入 mock
 * @returns Stage1Result
 */
export async function runStage1(
  stocks: string[],
  dataDir?: string,
  sdkClient?: SdkClient,
): Promise<Stage1Result> {
  const startTime = new Date().toISOString();
  const startMs = Date.now();

  const resolvedDataDir = dataDir ?? 'data';

  // 创建真实客户端（测试时可注入 mock）
  const realClient = sdkClient ?? createSdkClient();
  const counter = createApiCallCounter(realClient);
  const client = counter.client;

  const date = new Date().toISOString().slice(0, 10);

  console.error(`[stage1] 开始 Stage 1 干跑，日期: ${date}`);
  console.error(`[stage1] 股票列表: ${stocks.join(', ')}`);

  // 1. 检查市场状态
  console.error('[stage1] 检查市场状态...');
  const marketStatusResult = client.getMarketStatus();
  const marketOpen = marketStatusResult === 'trading' || marketStatusResult === 'pre_market';
  const isTradingDay = marketStatusResult !== 'closed' && marketStatusResult !== 'after_hours';

  console.error(`[stage1] 市场状态: ${describeMarketStatus(marketStatusResult)}`);

  // 2. 获取行情数据
  console.error('[stage1] 获取行情数据...');
  let quotes: FullQuote[] = [];
  try {
    quotes = await client.getQuotesByCodes(stocks);
    console.error(`[stage1] 成功获取 ${quotes.length} 只股票行情`);
  } catch (err) {
    console.error('[stage1] 获取行情失败:', err instanceof Error ? err.message : String(err));
  }

  // 3. 构建日报
  console.error('[stage1] 构建日报...');
  const marketStatusVal = { isTradingDay, marketOpen };
  const reportInput = buildMinimalDailyReportInput(date, quotes, marketStatusVal);
  const report = buildDailyReport(reportInput);

  // 4. 渲染文本
  const textReport = renderPlainTextReport(report);

  // 5. 写入文件
  const stageDir = path.resolve(resolvedDataDir, 'stage1');
  mkdirSync(stageDir, { recursive: true });

  const jsonPath = path.join(stageDir, `${date}.json`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
  console.error(`[stage1] JSON 报告已写入: ${jsonPath}`);

  const txtPath = path.join(stageDir, `${date}.txt`);
  writeFileSync(txtPath, textReport, 'utf-8');
  console.error(`[stage1] 纯文本报告已写入: ${txtPath}`);

  // 6. 输出文本到控制台
  console.log(textReport);

  const endTime = new Date().toISOString();
  const durationMs = Date.now() - startMs;
  const apiCallCount = counter.count;

  console.error(`[stage1] Stage 1 完成，耗时 ${durationMs}ms，API 调用 ${apiCallCount} 次`);

  return {
    date,
    stockCount: stocks.length,
    marketStatus: marketStatusVal,
    startTime,
    endTime,
    durationMs,
    apiCallCount,
    reportPath: jsonPath,
    textReportPath: txtPath,
    reportValid: quotes.length > 0,
  };
}

// ==================== CLI 入口 ====================

export async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.stocks.length === 0) {
    console.error('用法: tsx src/cli/run-stage1.ts --stocks=600519,000858,600036');
    console.error('       tsx src/cli/run-stage1.ts --stocks=600519,000858,600036 --data-dir=./data');
    process.exit(1);
  }

  if (args.stocks.length > 20) {
    console.error(`[stage1] 股票数量 ${args.stocks.length} 超过建议上限 20，继续执行...`);
  }

  const result = await runStage1(args.stocks, args.dataDir);

  // 输出汇总
  console.error('');
  console.error('='.repeat(50));
  console.error('Stage 1 干跑完成');
  console.error('='.repeat(50));
  console.error(`  日期:       ${result.date}`);
  console.error(`  股票数:     ${result.stockCount}`);
  console.error(`  市场状态:   ${result.marketStatus.isTradingDay ? '交易日' : '非交易日'}, ${result.marketStatus.marketOpen ? '交易中' : '已收盘'}`);
  console.error(`  耗时:       ${result.durationMs}ms`);
  console.error(`  API 调用:   ${result.apiCallCount} 次`);
  console.error(`  JSON:       ${result.reportPath}`);
  console.error(`  文本:       ${result.textReportPath}`);
  console.error(`  报告有效:   ${result.reportValid ? '是' : '否（无行情数据）'}`);
  console.error('='.repeat(50));
}

// CLI 入口：仅在直接执行时调用
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && (
  process.argv[1] === __filename ||
  process.argv[1].replace(/\\/g, '/').endsWith('run-stage1.ts')
)) {
  main().catch((err) => {
    console.error('[stage1] 错误:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
