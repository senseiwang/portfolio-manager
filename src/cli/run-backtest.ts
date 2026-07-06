/**
 * run-backtest CLI
 *
 * 对指定股票运行回测并输出 JSON 报告。
 *
 * 用法:
 *   tsx src/cli/run-backtest.ts --code=600519 --from=2025-01-01 --to=2026-01-01
 *   tsx src/cli/run-backtest.ts --config=data/watchlist.yaml --from=2025-01-01 --to=2026-01-01
 *   tsx src/cli/run-backtest.ts --code=600519 --strategy=stg01-pullback
 *
 * 选项:
 *   --code       股票代码（可重复，如 --code=600519 --code=000001）
 *   --config     从 YAML 配置读取代码列表（与 --code 二选一）
 *   --from       开始日期，默认一年前
 *   --to         结束日期，默认今天
 *   --strategy   策略标识（可选，不传则运行所有适用策略）
 *   --capital    初始资金，默认 100000
 *   --fee        单边费率，默认 0
 */
import { existsSync } from 'fs';
import { createSdkClient } from '../data/sdkClient';
import type { KLine } from '../types/sdk';
import { loadPortfolioConfig } from '../config/loadConfig';
import { runBacktestAll } from '../engine/backtestRunner';
import type { BacktestInput } from '../engine/backtestRunner';

interface CliOptions {
  codes: string[];
  from: string;
  to: string;
  strategy?: string;
  capital: number;
  fee: number;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    codes: [],
    from: '',
    to: '',
    capital: 100000,
    fee: 0,
  };

  for (const arg of args) {
    if (arg.startsWith('--code=')) {
      options.codes.push(arg.slice(7));
    } else if (arg.startsWith('--config=')) {
      const configPath = arg.slice(9);
      if (!existsSync(configPath)) {
        console.error(`配置文件不存在: ${configPath}`);
        process.exit(1);
      }
      const config = loadPortfolioConfig({ watchlistPath: configPath });
      const watchlistCodes = config.watchlist;
      if (watchlistCodes.length === 0) {
        console.error(`配置文件中没有 watchlist 条目`);
        process.exit(1);
      }
      options.codes.push(...watchlistCodes);
    } else if (arg.startsWith('--from=')) {
      options.from = arg.slice(7);
    } else if (arg.startsWith('--to=')) {
      options.to = arg.slice(5);
    } else if (arg.startsWith('--strategy=')) {
      options.strategy = arg.slice(11);
    } else if (arg.startsWith('--capital=')) {
      options.capital = Number(arg.slice(10));
    } else if (arg.startsWith('--fee=')) {
      options.fee = Number(arg.slice(6));
    }
  }

  // 默认时间范围：过去一年至今
  if (!options.from) {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    options.from = d.toISOString().slice(0, 10);
  }
  if (!options.to) {
    options.to = new Date().toISOString().slice(0, 10);
  }

  if (options.codes.length === 0) {
    console.error(
      '请指定股票代码（--code=600519）或配置文件（--config=data/watchlist.yaml）',
    );
    process.exit(1);
  }

  return options;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const client = createSdkClient();

  console.error(
    `[backtest] 加载 ${opts.codes.length} 只股票数据...`,
  );

  // 批量获取行情（用于提取名称等辅助信息）
  const quotes = await client.getQuotesByCodes(opts.codes);
  const nameMap = new Map<string, string>(
    quotes.map(q => [q.code, q.name ?? q.code]),
  );

  // 逐只股票获取 K 线
  const inputs: BacktestInput[] = [];
  for (const code of opts.codes) {
    console.error(`[backtest] 获取 ${code}(${nameMap.get(code) ?? code}) K 线...`);
    const klines = (await client.getKLine(
      code,
      opts.from,
      opts.to,
    )) as KLine[];

    if (klines.length === 0) {
      console.error(`[backtest] ${code} 无 K 线数据，跳过`);
      continue;
    }

    inputs.push({
      code,
      klines,
    });
  }

  if (inputs.length === 0) {
    console.error('[backtest] 无可用数据');
    process.exit(1);
  }

  console.error(
    `[backtest] 运行回测（${inputs.length} 只股票，策略: ${opts.strategy ?? '全部'}）...`,
  );

  // 运行回测
  const allResults = runBacktestAll(inputs, {
    initialCapital: opts.capital,
    fee: opts.fee,
  });

  // 按策略过滤（如果指定了）
  const results = opts.strategy
    ? allResults.filter(r => r.strategy === opts.strategy)
    : allResults;

  // 输出 JSON 报告
  const output = {
    from: opts.from,
    to: opts.to,
    capital: opts.capital,
    fee: opts.fee,
    strategy: opts.strategy ?? 'all',
    totalStocks: inputs.length,
    totalResults: results.length,
    results: results.map(r => ({
      code: r.code,
      name: nameMap.get(r.code) ?? r.code,
      strategy: r.strategy,
      totalReturn: r.report.totalReturn.toFixed(2) + '%',
      winRate: r.report.winRate.toFixed(2) + '%',
      maxDrawdown: r.report.maxDrawdown.toFixed(2) + '%',
      tradeCount: r.report.tradeCount,
      initialCapital: r.report.initialCapital,
      finalEquity: r.report.finalEquity.toFixed(2),
      trades: r.report.trades.map(t => ({
        entryIndex: t.entryIndex,
        exitIndex: t.exitIndex,
        entryPrice: t.entryPrice.toFixed(2),
        exitPrice: t.exitPrice.toFixed(2),
        returnPercent: t.returnPercent.toFixed(2) + '%',
      })),
    })),
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error('[backtest] 错误:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});