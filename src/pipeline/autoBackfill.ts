/**
 * 全自动补跑升级模块
 *
 * 调度器每日启动时自检"前一交易日是否已有报告"，
 * 如果缺失则自动补跑，补跑完成后推送通知。
 *
 * 使用 T-7.8 的 runBackfill 函数执行实际补跑逻辑。
 */
import { existsSync } from 'fs';
import { join } from 'path';
import type { SdkClient } from '../data/sdkClient';
import type { Notifier } from '../notify/notifier';
import { runBackfill } from '../cli/backfill';
import type { PortfolioConfig } from '../types/config';

// ==================== 类型定义 ====================

export interface AutoBackfillConfig {
  /** 数据目录，用于检查报告文件是否存在 */
  dataDir: string;
  /** SDK 客户端，用于日历查询 */
  sdkClient: SdkClient;
  /** 通知器（可选），传递给 runBackfill */
  notifier?: Notifier;
  /** 组合配置（可选），供将来扩展 */
  portfolioConfig?: PortfolioConfig;
}

export interface AutoBackfillResult {
  /** 是否已完成自检 */
  checked: boolean;
  /** 检测到的前一交易日，未找到时为 null */
  previousTradingDay: string | null;
  /** 报告文件是否已存在 */
  reportExists: boolean;
  /** 是否执行了补跑 */
  backfillPerformed: boolean;
  /** 补跑是否成功（无需补跑时也为 true） */
  backfillSuccess: boolean;
  /** 错误信息，无错误时为 null */
  error: string | null;
}

// ==================== 工具函数 ====================

/**
 * 获取前一交易日
 *
 * 从 referenceDate 的前一天开始，逐日往前调用 isTradingDay，
 * 找到最近的交易日，最多查找 30 天。
 *
 * @param client   SDK 客户端
 * @param referenceDate  参考日期（默认当天），格式 YYYY-MM-DD
 * @returns 前一交易日字符串，未找到时返回 null
 */
export async function getPreviousTradingDay(
  client: SdkClient,
  referenceDate?: string,
): Promise<string | null> {
  const today = referenceDate ?? new Date().toISOString().slice(0, 10);
  const candidate = new Date(today);

  // 最多往前找 30 天
  for (let i = 0; i < 30; i++) {
    candidate.setDate(candidate.getDate() - 1);
    const dateStr = candidate.toISOString().slice(0, 10);
    const isTrading = await client.isTradingDay(dateStr);
    if (isTrading) return dateStr;
  }

  return null;
}

// ==================== 主函数 ====================

/**
 * 自检并补跑前一交易日的报告
 *
 * 流程：
 * 1. 使用 sdkClient 获取前一交易日
 * 2. 检查 data/reports/{date}.json 是否存在
 * 3. 如果缺失，调用 runBackfill 补跑（内部含通知）
 * 4. 返回检测和补跑结果
 *
 * @param config  自动补跑配置
 * @returns 检测和补跑结果
 */
export async function checkAndBackfill(
  config: AutoBackfillConfig,
): Promise<AutoBackfillResult> {
  const { dataDir, sdkClient, notifier } = config;

  // 1. 获取前一交易日
  const previousTradingDay = await getPreviousTradingDay(sdkClient);

  if (!previousTradingDay) {
    return {
      checked: true,
      previousTradingDay: null,
      reportExists: false,
      backfillPerformed: false,
      backfillSuccess: false,
      error: '未能找到前一交易日（30 天内无交易日）',
    };
  }

  // 2. 检查报告文件是否存在
  const reportPath = join(dataDir, 'reports', `${previousTradingDay}.json`);
  const reportExists = existsSync(reportPath);

  if (reportExists) {
    // 报告已存在，无需补跑
    return {
      checked: true,
      previousTradingDay,
      reportExists: true,
      backfillPerformed: false,
      backfillSuccess: true,
      error: null,
    };
  }

  // 3. 执行补跑
  try {
    await runBackfill(previousTradingDay, {
      dataDir,
      notifier,
    });

    return {
      checked: true,
      previousTradingDay,
      reportExists: false,
      backfillPerformed: true,
      backfillSuccess: true,
      error: null,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      checked: true,
      previousTradingDay,
      reportExists: false,
      backfillPerformed: true,
      backfillSuccess: false,
      error: errorMsg,
    };
  }
}
