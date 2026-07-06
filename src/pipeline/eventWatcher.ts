/**
 * 盘中事件监听（T-3.2）
 *
 * 轮询涨停池 / 盘口异动 / 板块异动，将新增股票追加进当日候选池文件。
 * 同一只股票一天内多次命中只记录一次（按 code 去重）。
 */
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import type { SdkClient } from '../data/sdkClient';

/** 盘中事件条目 */
export interface IntradayEvent {
  code: string;
  name: string;
  eventType: 'limit_up' | 'stock_change' | 'board_change';
  eventLabel: string;
  time: string;
}

/** 盘中事件文件结构 */
export interface IntradayEventFile {
  date: string;
  events: IntradayEvent[];
}

/** 监听结果 */
export interface PollResult {
  date: string;
  newEvents: IntradayEvent[];
  totalEvents: number;
}

/**
 * 执行一次盘中事件轮询
 *
 * 1. 通过 client 获取涨停池、盘口异动、板块异动
 * 2. 提取事件中的股票
 * 3. 与已存文件去重合并
 * 4. 写回文件
 */
export async function pollMarketEvents(
  client: SdkClient,
  dataDir?: string,
): Promise<PollResult> {
  const resolvedDir = path.resolve(dataDir ?? 'data');
  const date = new Date().toISOString().slice(0, 10);
  const filePath = path.join(resolvedDir, `intraday-events-${date}.json`);

  // 1. 并发拉取三个数据源
  const [ztPool, stockChanges, boardChanges] = await Promise.all([
    client.getZTPool().catch(() => []),
    client.getStockChanges().catch(() => []),
    client.getBoardChanges().catch(() => []),
  ]);

  // 2. 提取事件
  const newRaw: IntradayEvent[] = [
    ...ztPool.map((s) => ({
      code: s.code,
      name: s.name,
      eventType: 'limit_up' as const,
      eventLabel: `涨停(${s.continuousBoardCount}连板)`,
      time: s.firstBoardTime,
    })),
    ...stockChanges.map((s) => ({
      code: s.code,
      name: s.name,
      eventType: 'stock_change' as const,
      eventLabel: s.changeTypeLabel,
      time: s.time,
    })),
    ...boardChanges.map((s) => ({
      code: s.topStockCode,
      name: s.topStockName,
      eventType: 'board_change' as const,
      eventLabel: s.topStockDirection,
      time: '',
    })),
  ];

  // 过滤无效条目（部分板块异动 topStockCode 可能为空）
  const valid = newRaw.filter((e) => e.code && e.code.length >= 6);

  // 3. 读取已存文件，按 code 去重
  let existing: IntradayEvent[] = [];
  if (existsSync(filePath)) {
    try {
      const raw = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as IntradayEventFile;
      existing = parsed.events ?? [];
    } catch {
      // 文件损坏则重新开始
    }
  }

  const existingCodes = new Set(existing.map((e) => e.code));
  const newEvents = valid.filter((e) => !existingCodes.has(e.code));
  const merged = [...existing, ...newEvents];

  // 4. 写回文件
  const file: IntradayEventFile = { date, events: merged };
  if (!existsSync(resolvedDir)) {
    mkdirSync(resolvedDir, { recursive: true });
  }
  writeFileSync(filePath, JSON.stringify(file, null, 2), 'utf-8');

  return {
    date,
    newEvents,
    totalEvents: merged.length,
  };
}

/**
 * 读取指定日期的盘中事件文件
 */
export function readIntradayEvents(
  date: string,
  dataDir?: string,
): IntradayEvent[] {
  const resolvedDir = path.resolve(dataDir ?? 'data');
  const filePath = path.join(resolvedDir, `intraday-events-${date}.json`);

  if (!existsSync(filePath)) return [];

  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as IntradayEventFile;
    return parsed.events ?? [];
  } catch {
    return [];
  }
}