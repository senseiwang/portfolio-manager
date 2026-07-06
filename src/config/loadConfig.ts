import { readFileSync, existsSync } from 'fs';
import { load } from 'js-yaml';
import { PortfolioConfigSchema } from './schema';
import type { PortfolioConfig } from '../types/config';

/** 默认配置路径（相对于项目根目录） */
export const DEFAULT_HOLDINGS_PATH = 'data/holdings.yaml';
export const DEFAULT_WATCHLIST_PATH = 'data/watchlist.yaml';

/**
 * 从单个 YAML 文件加载投资组合配置
 *
 * 文件格式：
 * ```yaml
 * holdings:
 *   - code: "600519"
 *     shares: 100
 *     costPrice: 1500
 * watchlist:
 *   - "000001"
 *   - "000333"
 * ```
 */
export function loadConfigFromYaml(filePath: string): PortfolioConfig {
  if (!existsSync(filePath)) {
    throw new Error(`配置文件不存在: ${filePath}`);
  }

  const raw = readFileSync(filePath, 'utf-8');
  let parsed: unknown;

  try {
    parsed = load(raw);
  } catch (err) {
    throw new Error(
      `YAML 解析失败: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // YAML 可能返回 null（空文件）或非对象
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`配置文件格式错误: ${filePath}，期望 YAML 对象`);
  }

  const result = PortfolioConfigSchema.safeParse(parsed);
  if (!result.success) {
    const fieldErrors = result.error.issues
      .map(issue => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`配置校验失败:\n${fieldErrors}`);
  }

  return result.data;
}

/**
 * 从两个独立文件加载投资组合配置
 *
 * 持有记录从 `holdings.yaml` 加载，watchlist 从 `watchlist.yaml` 加载。
 * 两个文件可以独立存在，缺失则使用默认值。
 */
export function loadPortfolioConfig(options?: {
  holdingsPath?: string;
  watchlistPath?: string;
}): PortfolioConfig {
  const holdingsPath = options?.holdingsPath ?? DEFAULT_HOLDINGS_PATH;
  const watchlistPath = options?.watchlistPath ?? DEFAULT_WATCHLIST_PATH;

  let holdings: PortfolioConfig['holdings'] = [];
  if (existsSync(holdingsPath)) {
    const config = loadConfigFromYaml(holdingsPath);
    holdings = config.holdings;
  }

  let watchlist: PortfolioConfig['watchlist'] = [];
  if (existsSync(watchlistPath)) {
    const config = loadConfigFromYaml(watchlistPath);
    watchlist = config.watchlist;
  }

  return { holdings, watchlist };
}
