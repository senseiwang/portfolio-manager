/**
 * Stage 2: 多交易日调度运行器
 *
 * 管理连续多个交易日的实盘运行。
 * 每日运行完整的日报流程（复用 T-8.1 的 runStage1）。
 * 候选池规模逐步扩大（Day 1: 20 → Day 2: 50 → Day 3: 100 → Day 4: 200 → Day 5+: 全市场）。
 * 自动跳过非交易日（不计数）。
 *
 * 用法:
 *   tsx src/cli/run-stage2.ts --stocks=600519,000858,600036
 *   tsx src/cli/run-stage2.ts --stocks=600519,000858,600036 --data-dir=./data --max-days=5
 *   tsx src/cli/run-stage2.ts --stocks=600519,000858,600036 --start-date=2026-07-06 --dry-run
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createSdkClient, type SdkClient } from '../data/sdkClient';
import { runStage1, type Stage1Result } from './run-stage1';

// ==================== 类型定义 ====================

export interface Stage2Config {
  /** 基准股票列表（Day 1 使用） */
  baseStocks: string[];
  /** 数据目录 */
  dataDir: string;
  /** 最大运行天数（默认 5） */
  maxDays: number;
  /** 启动日期（默认今天） */
  startDate?: string;
  /** Dry-run 模式：跳过等待，仅用于测试 */
  dryRun?: boolean;
}

export interface Stage2DailyLog {
  dayNumber: number;
  date: string;
  stockCount: number;
  success: boolean;
  durationMs: number;
  apiCallCount: number;
  reportPath: string | null;
  error: string | null;
  isTradingDay: boolean;
}

export interface Stage2Summary {
  config: Stage2Config;
  startDate: string;
  endDate: string;
  totalDays: number;
  tradingDays: number;
  successDays: number;
  failedDays: number;
  avgDurationMs: number;
  avgApiCalls: number;
  dailyLogs: Stage2DailyLog[];
}

// ==================== 参数解析 ====================

export interface Stage2Args {
  baseStocks: string[];
  dataDir: string;
  maxDays: number;
  startDate?: string;
  dryRun: boolean;
}

/**
 * 解析命令行参数
 * 支持 --stocks=, --data-dir=, --max-days=, --start-date=, --dry-run
 */
export function parseStage2Args(args: string[]): Stage2Args {
  const result: Stage2Args = {
    baseStocks: [],
    dataDir: 'data',
    maxDays: 5,
    dryRun: false,
  };

  for (const arg of args) {
    if (arg.startsWith('--stocks=')) {
      const value = arg.slice(9);
      result.baseStocks = value.split(',').map(s => s.trim()).filter(Boolean);
    } else if (arg.startsWith('--data-dir=')) {
      result.dataDir = arg.slice(11);
    } else if (arg.startsWith('--max-days=')) {
      const parsed = parseInt(arg.slice(11), 10);
      result.maxDays = Number.isFinite(parsed) && parsed >= 1 ? parsed : 5;
    } else if (arg.startsWith('--start-date=')) {
      result.startDate = arg.slice(13);
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    }
  }

  return result;
}

// ==================== 股票池选择 ====================

/**
 * 根据当前天数选择股票池规模
 *
 * Day 1:  20 只
 * Day 2:  50 只
 * Day 3:  100 只
 * Day 4:  200 只
 * Day 5+: 全市场（'auto'）
 */
function selectPoolSize(dayNumber: number): number | 'auto' {
  switch (dayNumber) {
    case 1: return 20;
    case 2: return 50;
    case 3: return 100;
    case 4: return 200;
    default: return 'auto';
  }
}

// ==================== 日期工具 ====================

/** 给 YYYY-MM-DD 字符串加指定天数 */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ==================== 日志管理 ====================

const DAILY_LOG_FILENAME = 'daily-log.json';
const DEFAULT_REPORT_PATH = path.join('docs', 'audit', 'live-stage2-report.md');

function readDailyLogs(logDir: string): Stage2DailyLog[] {
  const logPath = path.join(logDir, DAILY_LOG_FILENAME);
  if (existsSync(logPath)) {
    try {
      const raw = readFileSync(logPath, 'utf-8');
      const parsed = JSON.parse(raw) as Stage2DailyLog[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function writeDailyLogs(logDir: string, logs: Stage2DailyLog[]): void {
  mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, DAILY_LOG_FILENAME);
  writeFileSync(logPath, JSON.stringify(logs, null, 2), 'utf-8');
}

// ==================== 报告生成 ====================

/**
 * 生成 Stage 2 Markdown 运行报告
 */
export function buildStage2Report(summary: Stage2Summary): string {
  const lines: string[] = [];
  const SEP = '='.repeat(60);

  lines.push(SEP);
  lines.push('  Stage 2 实盘运行报告');
  lines.push(SEP);
  lines.push('');
  lines.push(`**运行周期**: ${summary.startDate} → ${summary.endDate}`);
  lines.push(`**最大天数配置**: ${summary.config.maxDays}`);
  lines.push(`**总天数（含非交易日）**: ${summary.totalDays}`);
  lines.push(`**实际交易日**: ${summary.tradingDays}`);
  lines.push(`**成功天数**: ${summary.successDays}`);
  lines.push(`**失败天数**: ${summary.failedDays}`);
  lines.push(`**平均耗时**: ${summary.avgDurationMs}ms`);
  lines.push(`**平均 API 调用**: ${summary.avgApiCalls} 次`);
  lines.push('');

  lines.push(SEP);
  lines.push('  每日明细');
  lines.push(SEP);
  lines.push('');
  lines.push('| Day | 日期 | 股票数 | 结果 | 耗时(ms) | API 调用 | 错误 |');
  lines.push('|-----|------|--------|------|----------|----------|------|');

  for (const log of summary.dailyLogs) {
    let status: string;
    if (!log.isTradingDay) {
      status = '⏭️ 跳过';
    } else if (log.success) {
      status = '✅ 成功';
    } else {
      status = '❌ 失败';
    }
    const errorMsg = log.error ? log.error.slice(0, 40).replace(/\n/g, ' ') : '-';
    lines.push(
      `| ${log.dayNumber} | ${log.date} | ${log.stockCount} | ${status} | ${log.durationMs} | ${log.apiCallCount} | ${errorMsg} |`,
    );
  }
  lines.push('');

  if (summary.failedDays > 0) {
    lines.push(SEP);
    lines.push('  失败详情');
    lines.push(SEP);
    lines.push('');
    for (const log of summary.dailyLogs) {
      if (!log.success && log.isTradingDay && log.error) {
        lines.push(`- **Day ${log.dayNumber} (${log.date})**: ${log.error}`);
      }
    }
    lines.push('');
  }

  lines.push(SEP);
  lines.push('  -- Stage 2 运行报告结束');
  lines.push(SEP);

  return lines.join('\n');
}

// ==================== 主函数 ====================

/**
 * Stage 2 主函数
 *
 * 管理连续 maxDays 个交易日的运行。
 * 每日运行完整的日报流程，候选池规模逐步扩大。
 * 自动跳过非交易日（不计数）。
 *
 * @param config    - 运行配置
 * @param sdkClient - 可选 SDK 客户端（测试时注入 mock）
 * @returns Stage2Summary
 */
export async function runStage2(
  config: Stage2Config,
  sdkClient?: SdkClient,
): Promise<Stage2Summary> {
  const { baseStocks, dataDir, maxDays, dryRun } = config;
  const startDate = config.startDate ?? new Date().toISOString().slice(0, 10);

  // 创建 SDK 客户端（测试时可注入 mock）
  const client = sdkClient ?? createSdkClient();

  const stage2Dir = path.resolve(dataDir, 'stage2');
  const dailyLogs = readDailyLogs(stage2Dir);

  // 支持断点续跑：从已有日志恢复已完成的交易日计数
  const completedTradingDays = dailyLogs.filter(l => l.isTradingDay).length;

  let currentDate = startDate;
  let tradingDayCount = completedTradingDays;

  console.error(`[stage2] 开始 Stage 2 运行`);
  console.error(`[stage2] 基准股票数: ${baseStocks.length}`);
  console.error(`[stage2] 最大运行天数: ${maxDays}`);
  console.error(`[stage2] 启动日期: ${startDate}`);
  console.error(`[stage2] 已完成的交易日: ${completedTradingDays}`);
  console.error(`[stage2] Dry-run 模式: ${dryRun ? '是' : '否'}`);

  while (tradingDayCount < maxDays) {
    const currentDayNumber = tradingDayCount + 1;

    // --- 1. 检查是否为交易日 ---
    const isTradingDay = await client.isTradingDay(currentDate);

    if (!isTradingDay) {
      console.error(`[stage2] Day ${currentDayNumber} 跳过非交易日: ${currentDate}`);

      const skipLog: Stage2DailyLog = {
        dayNumber: currentDayNumber,
        date: currentDate,
        stockCount: 0,
        success: false,
        durationMs: 0,
        apiCallCount: 0,
        reportPath: null,
        error: null,
        isTradingDay: false,
      };
      dailyLogs.push(skipLog);
      writeDailyLogs(stage2Dir, dailyLogs);

      // 前进到下一日
      currentDate = addDays(currentDate, 1);
      continue;
    }

    // --- 2. 选择股票池 ---
    const poolSize = selectPoolSize(currentDayNumber);
    let stocks: string[];

    if (poolSize === 'auto') {
      console.error(`[stage2] Day ${currentDayNumber} 使用全市场模式`);
      const allQuotes = await client.getAllQuotes();
      stocks = allQuotes.map(q => q.code);
      console.error(`[stage2] Day ${currentDayNumber} 全市场共 ${stocks.length} 只股票`);
    } else {
      stocks = baseStocks.slice(0, poolSize);
      console.error(`[stage2] Day ${currentDayNumber} 使用 ${stocks.length} 只股票（池大小: ${poolSize}）`);
    }

    // --- 3. 运行日报流程（复用 runStage1） ---
    const dayStartMs = Date.now();
    let stage1Result: Stage1Result | null = null;
    let success = false;
    let error: string | null = null;

    try {
      const s1 = await runStage1(stocks, dataDir, client);
      stage1Result = s1;
      success = s1.reportValid;
      console.error(`[stage2] Day ${currentDayNumber} (${currentDate}) 运行成功, 耗时 ${s1.durationMs}ms`);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      console.error(`[stage2] Day ${currentDayNumber} (${currentDate}) 运行失败: ${error}`);
    }

    const dayDurationMs = Date.now() - dayStartMs;

    // --- 4. 记录日志 ---
    const dailyLog: Stage2DailyLog = {
      dayNumber: currentDayNumber,
      date: currentDate,
      stockCount: stage1Result?.stockCount ?? stocks.length,
      success,
      durationMs: dayDurationMs,
      apiCallCount: stage1Result?.apiCallCount ?? 0,
      reportPath: stage1Result?.reportPath ?? null,
      error,
      isTradingDay: true,
    };
    dailyLogs.push(dailyLog);
    writeDailyLogs(stage2Dir, dailyLogs);

    tradingDayCount++;

    // --- 5. 前进到下一个日期 ---
    if (tradingDayCount >= maxDays) {
      // 已达目标天数，退出循环
      break;
    }

    if (dryRun) {
      // Dry-run 模式：简单加一天，用于测试
      currentDate = addDays(currentDate, 1);
    } else {
      // 真实模式：跳转到下一交易日
      const nextDate = await client.nextTradingDay(currentDate);
      console.error(`[stage2] 下一交易日: ${nextDate}`);
      currentDate = nextDate;
    }
  }

  // --- 6. 生成统计摘要 ---
  const tradingDayLogs = dailyLogs.filter(l => l.isTradingDay);
  const successLogs = tradingDayLogs.filter(l => l.success);
  const failedLogs = tradingDayLogs.filter(l => !l.success);

  const totalDuration = tradingDayLogs.reduce((sum, l) => sum + l.durationMs, 0);
  const totalApiCalls = tradingDayLogs.reduce((sum, l) => sum + l.apiCallCount, 0);

  const summary: Stage2Summary = {
    config,
    startDate,
    endDate: dailyLogs.length > 0 ? dailyLogs[dailyLogs.length - 1].date : startDate,
    totalDays: dailyLogs.length,
    tradingDays: tradingDayLogs.length,
    successDays: successLogs.length,
    failedDays: failedLogs.length,
    avgDurationMs: tradingDayLogs.length > 0 ? Math.round(totalDuration / tradingDayLogs.length) : 0,
    avgApiCalls: tradingDayLogs.length > 0
      ? Math.round((totalApiCalls / tradingDayLogs.length) * 10) / 10
      : 0,
    dailyLogs,
  };

  // --- 7. 生成报告文件（dry-run 模式跳过文件写入） ---
  const reportContent = buildStage2Report(summary);

  if (!dryRun) {
    const reportAbsPath = path.resolve(DEFAULT_REPORT_PATH);
    mkdirSync(path.dirname(reportAbsPath), { recursive: true });
    writeFileSync(reportAbsPath, reportContent, 'utf-8');
    console.error(`[stage2] 运行报告已写入: ${reportAbsPath}`);
  } else {
    // dry-run 模式仅输出报告到控制台
    console.log(reportContent);
  }

  // --- 8. 输出摘要 ---
  console.error('');
  console.error('='.repeat(50));
  console.error('Stage 2 运行完成');
  console.error('='.repeat(50));
  console.error(`  总天数（含非交易日）: ${summary.totalDays}`);
  console.error(`  实际交易日: ${summary.tradingDays}`);
  console.error(`  成功天数: ${summary.successDays}`);
  console.error(`  失败天数: ${summary.failedDays}`);
  console.error(`  平均耗时: ${summary.avgDurationMs}ms`);
  console.error(`  平均 API 调用: ${summary.avgApiCalls} 次`);
  console.error(`  日志目录: ${stage2Dir}`);
  console.error('='.repeat(50));

  return summary;
}

// ==================== CLI 入口 ====================

export async function main(): Promise<void> {
  const args = parseStage2Args(process.argv.slice(2));

  if (args.baseStocks.length === 0) {
    console.error('用法: tsx src/cli/run-stage2.ts --stocks=600519,000858,600036');
    console.error('       tsx src/cli/run-stage2.ts --stocks=600519,000858,600036 --data-dir=./data');
    console.error('       tsx src/cli/run-stage2.ts --stocks=600519,000858,600036 --max-days=5 --start-date=2026-07-06');
    console.error('       tsx src/cli/run-stage2.ts --stocks=600519,000858,600036 --dry-run');
    process.exit(1);
  }

  const config: Stage2Config = {
    baseStocks: args.baseStocks,
    dataDir: args.dataDir,
    maxDays: args.maxDays,
    startDate: args.startDate,
    dryRun: args.dryRun,
  };

  const summary = await runStage2(config);

  // 输出汇总 JSON 供管道使用
  const output = {
    status: summary.failedDays === 0 ? 'success' : 'partial',
    tradingDays: summary.tradingDays,
    successDays: summary.successDays,
    failedDays: summary.failedDays,
    avgDurationMs: summary.avgDurationMs,
    avgApiCalls: summary.avgApiCalls,
  };
  console.log(JSON.stringify(output));
}

// CLI 入口：仅在直接执行时调用
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && (
  process.argv[1] === __filename ||
  process.argv[1].replace(/\\/g, '/').endsWith('run-stage2.ts')
)) {
  main().catch((err) => {
    console.error('[stage2] 错误:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
