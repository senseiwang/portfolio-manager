import { z } from 'zod';

/**
 * 单个持仓条目 schema
 *
 * - code: 6 位数字代码
 * - shares: 正整数，> 0
 * - costPrice: 正数，> 0
 */
export const HoldingEntrySchema = z.object({
  code: z
    .string()
    .regex(/^\d{6}$/, '股票代码必须为 6 位数字'),
  shares: z
    .number()
    .int('股数必须为整数')
    .positive('股数必须大于 0'),
  costPrice: z
    .number()
    .positive('成本价必须大于 0'),
});

/** Watchlist 条目：6 位代码字符串 */
export const WatchlistItemSchema = z
  .string()
  .regex(/^\d{6}$/, '股票代码必须为 6 位数字');

/** 完整投资组合配置 schema */
export const PortfolioConfigSchema = z.object({
  holdings: z.array(HoldingEntrySchema).default([]),
  watchlist: z.array(WatchlistItemSchema).default([]),
});

/** 配置文件结构（YAML 根结构） */
export interface PortfolioConfigYaml {
  holdings?: Array<{
    code: string;
    shares: number;
    costPrice: number;
  }>;
  watchlist?: string[];
}
