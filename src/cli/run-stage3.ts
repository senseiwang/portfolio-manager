/**
 * Stage 3: 盘中稳定性测试框架
 *
 * 模拟完整交易日（9:30-15:00）内事件监听持续运行，
 * 定期拉取市场事件数据，监控内存使用，输出稳定性报告。
 *
 * 用法:
 *   tsx src/cli/run-stage3.ts --dry-run --max-rounds=5
 *   tsx src/cli/run-stage3.ts --stocks=600519,000858 --max-rounds=480
 *   tsx src/cli/run-stage3.ts --stocks=600519,000858 --poll-interval=30000 --max-rounds=480
 *   tsx src/cli/run-stage3.ts --stocks=600519,000858 --data-dir=./data --dry-run
 */
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createSdkClient, type SdkClient } from '../data/sdkClient';

// ==================== 类型定义 ====================

export interface Stage3Config {
  /** 数据目录 */
  dataDir: string;
  /** 轮询间隔（毫秒，默认 30000） */
  pollIntervalMs: number;
  /** 最大运行轮数（默认模拟 4 小时 = 480 轮 @ 30s） */
  maxRounds: number;
  /** 开启 dry-run 模式（快速迭代，不等待真实时间） */
  dryRun: boolean;
  /** 股票代码列表（用于校验事件命中） */
  stockCodes: string[];
}

export interface Stage3Round {
  roundNumber: number;
  timestamp: string;
  pollDurationMs: number;
  ztPoolCount: number;
  stockChangeCount: number;
  boardChangeCount: number;
  memoryMB: number;
  errors: string[];
}

export interface Stage3Summary {
  config: Stage3Config;
  startTime: string;
  endTime: string;
  totalRounds: number;
  rounds: Stage3Round[];
  memoryStartMB: number;
  memoryEndMB: number;
  memoryGrowthPercent: number;
  totalErrors: number;
  stable: boolean;
}

// ==================== 辅助函数 ====================

/** 获取当前进程内存占用（MB） */
function getMemoryMB(): number {
  return Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100;
}

// ==================== 参数解析 ====================

export interface Stage3Args {
  dataDir: string;
  pollIntervalMs: number;
  maxRounds: number;
  dryRun: boolean;
  stockCodes: string[];
}

/**
 * 解析命令行参数
 * 支持 --data-dir=./path, --poll-interval=30000, --max-rounds=480, --dry-run, --stocks=code1,code2,...
 */
export function parseStage3Args(args: string[]): Stage3Args {
  const result: Stage3Args = {
    dataDir: 'data',
    pollIntervalMs: 30000,
    maxRounds: 480,
    dryRun: false,
    stockCodes: [],
  };

  for (const arg of args) {
    if (arg.startsWith('--data-dir=')) {
      result.dataDir = arg.slice(11);
    } else if (arg.startsWith('--poll-interval=')) {
      const val = parseInt(arg.slice(16), 10);
      if (!isNaN(val) && val > 0) {
        result.pollIntervalMs = val;
      }
    } else if (arg.startsWith('--max-rounds=')) {
      const val = parseInt(arg.slice(13), 10);
      if (!isNaN(val) && val > 0) {
        result.maxRounds = val;
      }
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg.startsWith('--stocks=')) {
      const value = arg.slice(9);
      result.stockCodes = value.split(',').map(s => s.trim()).filter(Boolean);
    }
  }

  return result;
}

// ==================== 事件采集器 ====================

/** watcher 单轮返回值 */
export type WatcherResult = Pick<Stage3Round, 'ztPoolCount' | 'stockChangeCount' | 'boardChangeCount' | 'errors'>;

/**
 * 创建事件采集器
 *
 * 返回一个异步函数，每次调用时并发获取三个市场事件数据源。
 * 使用 Promise.allSettled 确保单点失败不影响整轮采集。
 */
export function createLiveEventWatcher(client: SdkClient): () => Promise<WatcherResult> {
  return async (): Promise<WatcherResult> => {
    const [ztPoolResult, stockChangesResult, boardChangesResult] = await Promise.allSettled([
      client.getZTPool(),
      client.getStockChanges(),
      client.getBoardChanges(),
    ]);

    const errors: string[] = [];

    let ztPoolCount = 0;
    if (ztPoolResult.status === 'fulfilled') {
      ztPoolCount = ztPoolResult.value.length;
    } else {
      const reason = ztPoolResult.reason instanceof Error ? ztPoolResult.reason.message : String(ztPoolResult.reason);
      errors.push(`ztPool: ${reason}`);
    }

    let stockChangeCount = 0;
    if (stockChangesResult.status === 'fulfilled') {
      stockChangeCount = stockChangesResult.value.length;
    } else {
      const reason = stockChangesResult.reason instanceof Error ? stockChangesResult.reason.message : String(stockChangesResult.reason);
      errors.push(`stockChanges: ${reason}`);
    }

    let boardChangeCount = 0;
    if (boardChangesResult.status === 'fulfilled') {
      boardChangeCount = boardChangesResult.value.length;
    } else {
      const reason = boardChangesResult.reason instanceof Error ? boardChangesResult.reason.message : String(boardChangesResult.reason);
      errors.push(`boardChanges: ${reason}`);
    }

    return { ztPoolCount, stockChangeCount, boardChangeCount, errors };
  };
}

// ==================== 主函数 ====================

/**
 * Stage 3 主函数
 *
 * @param config    - 运行配置
 * @param sdkClient - 可选 SDK 客户端，用于测试时注入 mock
 * @returns Stage3Summary
 */
export async function runStage3(
  config: Stage3Config,
  sdkClient?: SdkClient,
): Promise<Stage3Summary> {
  const startTime = new Date().toISOString();
  const client = sdkClient ?? createSdkClient();
  const watcher = createLiveEventWatcher(client);
  const rounds: Stage3Round[] = [];
  const memoryStartMB = getMemoryMB();
  let totalErrors = 0;

  console.error(`[stage3] 开始 Stage 3 盘中稳定性测试`);
  console.error(`[stage3] 配置: dryRun=${config.dryRun}, maxRounds=${config.maxRounds}, pollIntervalMs=${config.pollIntervalMs}, stockCodes=${config.stockCodes.length}`);
  console.error(`[stage3] 初始内存: ${memoryStartMB} MB`);

  if (config.dryRun) {
    // Dry-run 模式：快速批量采集，不等待间隔
    console.error(`[stage3] dry-run 模式：快速采集 ${config.maxRounds} 轮...`);
    const promises = Array.from({ length: config.maxRounds }, async (_, i) => {
      const roundStart = Date.now();
      const result = await watcher();
      const pollDurationMs = Date.now() - roundStart;
      const memoryMB = getMemoryMB();

      const round: Stage3Round = {
        roundNumber: i + 1,
        timestamp: new Date().toISOString(),
        pollDurationMs,
        ...result,
        memoryMB,
      };

      totalErrors += result.errors.length;
      rounds.push(round);
      return round;
    });
    await Promise.all(promises);
  } else {
    // 真实模式：使用 setInterval 控制采集节奏
    console.error(`[stage3] 真实模式：每 ${config.pollIntervalMs}ms 采集一轮，共 ${config.maxRounds} 轮`);
    await new Promise<void>((resolve) => {
      let roundNumber = 0;
      const timer = setInterval(async () => {
        roundNumber++;
        const roundStart = Date.now();
        const result = await watcher();
        const pollDurationMs = Date.now() - roundStart;
        const memoryMB = getMemoryMB();

        const round: Stage3Round = {
          roundNumber,
          timestamp: new Date().toISOString(),
          pollDurationMs,
          ...result,
          memoryMB,
        };

        totalErrors += result.errors.length;
        rounds.push(round);

        console.error(`[stage3] 第 ${roundNumber}/${config.maxRounds} 轮完成: ztPool=${round.ztPoolCount}, stockChanges=${round.stockChangeCount}, boardChanges=${round.boardChangeCount}, 内存=${memoryMB}MB, 错误=${result.errors.length}`);

        if (roundNumber >= config.maxRounds) {
          clearInterval(timer);
          resolve();
        }
      }, config.pollIntervalMs);
    });
  }

  const endTime = new Date().toISOString();
  const memoryEndMB = getMemoryMB();
  const memoryGrowthPercent = memoryStartMB > 0
    ? Math.round(((memoryEndMB - memoryStartMB) / memoryStartMB) * 10000) / 100
    : 0;

  const summary: Stage3Summary = {
    config,
    startTime,
    endTime,
    totalRounds: rounds.length,
    rounds,
    memoryStartMB,
    memoryEndMB,
    memoryGrowthPercent,
    totalErrors,
    stable: memoryGrowthPercent < 20,
  };

  console.error(`[stage3] Stage 3 完成`);
  console.error(`[stage3] 总轮数: ${summary.totalRounds}`);
  console.error(`[stage3] 内存: ${memoryStartMB}MB → ${memoryEndMB}MB (${memoryGrowthPercent}% 增长)`);
  console.error(`[stage3] 总错误: ${totalErrors}`);
  console.error(`[stage3] 稳定性: ${summary.stable ? '稳定' : '不稳定（内存增长超过 20%）'}`);

  return summary;
}

// ==================== 报告生成 ====================

/**
 * 生成 Stage 3 报告文本
 */
export function generateStage3Report(summary: Stage3Summary): string {
  const lines: string[] = [
    '='.repeat(60),
    '  Stage 3 盘中稳定性测试报告',
    '='.repeat(60),
    '',
    `  开始时间: ${summary.startTime}`,
    `  结束时间: ${summary.endTime}`,
    `  总轮数:   ${summary.totalRounds}`,
    `  总错误:   ${summary.totalErrors}`,
    '',
    `  初始内存: ${summary.memoryStartMB} MB`,
    `  最终内存: ${summary.memoryEndMB} MB`,
    `  内存增长: ${summary.memoryGrowthPercent}%`,
    `  稳定性:   ${summary.stable ? '✅ 稳定（内存增长 < 20%）' : '❌ 不稳定（内存增长 >= 20%）'}`,
    '',
    '-'.repeat(60),
    '  轮次明细',
    '-'.repeat(60),
    '',
    '  轮次 | 时间戳                  | ztPool | stockChanges | boardChanges | 内存(MB) | 耗时(ms) | 错误',
    '  -----|--------------------------|--------|--------------|--------------|----------|----------|------',
  ];

  for (const round of summary.rounds) {
    const ts = round.timestamp.slice(11, 19);
    const errCount = round.errors.length;
    lines.push(
      `  ${String(round.roundNumber).padStart(5)} | ${ts.padEnd(24)} | ${String(round.ztPoolCount).padStart(6)} | ${String(round.stockChangeCount).padStart(12)} | ${String(round.boardChangeCount).padStart(12)} | ${String(round.memoryMB).padStart(8)} | ${String(round.pollDurationMs).padStart(8)} | ${errCount}`,
    );
    for (const err of round.errors) {
      lines.push(`        ${' '.repeat(24)}  └─ ${err}`);
    }
  }

  lines.push('');
  lines.push('='.repeat(60));

  return lines.join('\n');
}

// ==================== CLI 入口 ====================

export async function main(): Promise<void> {
  const args = parseStage3Args(process.argv.slice(2));

  const config: Stage3Config = {
    dataDir: args.dataDir,
    pollIntervalMs: args.pollIntervalMs,
    maxRounds: args.maxRounds,
    dryRun: args.dryRun,
    stockCodes: args.stockCodes,
  };

  console.error('用法: tsx src/cli/run-stage3.ts [选项]');
  console.error('   --data-dir=./data      数据输出目录（默认 data）');
  console.error('   --poll-interval=30000  轮询间隔毫秒（默认 30000）');
  console.error('   --max-rounds=480       最大轮数（默认 480）');
  console.error('   --dry-run              快速迭代模式');
  console.error('   --stocks=600519,000858 关注股票列表');
  console.error('');

  const summary = await runStage3(config);

  // 写入报告文件
  const stageDir = path.resolve(config.dataDir, 'stage3');
  mkdirSync(stageDir, { recursive: true });

  const reportText = generateStage3Report(summary);
  const reportPath = path.join(stageDir, `${new Date().toISOString().slice(0, 10)}.txt`);
  writeFileSync(reportPath, reportText, 'utf-8');
  console.error(`[stage3] 报告已写入: ${reportPath}`);

  // 输出报告到控制台
  console.log(reportText);
}

// CLI 入口：仅在直接执行时检测
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && (
  process.argv[1] === __filename ||
  process.argv[1].replace(/\\/g, '/').endsWith('run-stage3.ts')
)) {
  main().catch((err) => {
    console.error('[stage3] 错误:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
