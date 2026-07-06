/**
 * 推荐存证挂载模块
 *
 * 日报生成时，把当天所有触发的信号/策略推荐落盘到 data/tracking/{date}.json，
 * 用于后续复盘、归因分析、AI 微调数据积累。
 *
 * 纯函数（所有数据作为参数传入，不依赖外部状态）。
 */

import fs from 'node:fs';
import path from 'node:path';

// ==================== 类型定义 ====================

/** 单条信号记录 */
export interface SignalRecord {
  signalId: string;
  symbol: string;
  triggeredAt: string;
  strength: number;
  price: number;
  detail: Record<string, unknown>;
}

/** 单条策略记录 */
export interface StrategyRecord {
  strategyId: string;
  symbol: string;
  triggeredAt: string;
  confidence: number;
  price: number;
}

/** 推荐存证顶层结构 */
export interface RecommendationRecord {
  date: string;
  timestamp: string; // ISO 格式
  signals: SignalRecord[];
  strategies: StrategyRecord[];
}

// ==================== 核心函数 ====================

/**
 * 落盘当天所有触发的信号/策略推荐到 data/tracking/{date}.json。
 *
 * @param date     - 日期，YYYY-MM-DD 格式，同时也是文件名
 * @param signals  - 当天触发的信号列表
 * @param strategies - 当天触发的策略推荐列表
 * @param dataDir  - 跟目录，默认 'data/tracking'
 * @returns 写入的文件绝对路径
 */
export function recordDailyRecommendations(
  date: string,
  signals: SignalRecord[],
  strategies: StrategyRecord[],
  dataDir: string = 'data/tracking',
): string {
  // 构造存证对象
  const record: RecommendationRecord = {
    date,
    timestamp: new Date().toISOString(),
    signals,
    strategies,
  };

  // 确保目录存在
  fs.mkdirSync(dataDir, { recursive: true });

  // 写入文件
  const filePath = path.join(dataDir, `${date}.json`);
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');

  return path.resolve(filePath);
}

// ==================== 辅助函数 ====================

/**
 * 计算两个日期之间的天数差
 */
function daysBetween(from: string, to: string): number {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const diffMs = toDate.getTime() - fromDate.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

// ==================== 子任务 1：滚动复盘计算 ====================

export interface RollingReturnInput {
  /** 记录日期 YYYY-MM-DD */
  recordDate: string;
  /** 记录时的价格 */
  entryPrice: number;
  /** 当前价格 */
  currentPrice: number;
}

export interface RollingReturnResult {
  recordDate: string;
  daysHeld: number;
  returnPercent: number;
  annualizedReturn: number | null;  // 持有不足 1 年返回 null
}

/**
 * 计算单条推荐的跟随收益率
 *
 * @param recordDate 记录日期
 * @param entryPrice 记录时的价格（触发价）
 * @param currentPrice 当前价格
 * @param today       - 基准日期（默认为当天），用于测试可预测性
 * @returns 收益率结果
 */
export function calculateRollingReturn(
  recordDate: string,
  entryPrice: number,
  currentPrice: number,
  today: string = new Date().toISOString().slice(0, 10),
): RollingReturnResult {
  const daysHeld = daysBetween(recordDate, today);
  const returnPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
  const annualizedReturn = daysHeld >= 365
    ? ((Math.pow(currentPrice / entryPrice, 365 / daysHeld) - 1) * 100)
    : null;
  return { recordDate, daysHeld, returnPercent, annualizedReturn };
}

/**
 * 批量计算滚动复盘结果
 */
export function calculateRollingReturns(
  inputs: RollingReturnInput[],
): RollingReturnResult[] {
  return inputs.map(i => calculateRollingReturn(i.recordDate, i.entryPrice, i.currentPrice));
}

// ==================== 子任务 2：策略健康度告警 ====================

export interface StrategyHealthInput {
  strategyId: string;
  /** 近期实际收益率序列（如最近 20 笔推荐） */
  recentReturns: number[];
  /** 回测阶段的预期收益率（年化） */
  expectedAnnualReturn: number;
  /** 回测阶段的预期胜率 */
  expectedWinRate: number;
}

export type HealthStatus = 'healthy' | 'warning' | 'critical' | 'insufficient_data';

export interface StrategyHealthResult {
  strategyId: string;
  status: HealthStatus;
  actualWinRate: number;
  actualAvgReturn: number;
  expectedWinRate: number;
  expectedAnnualReturn: number;
  sampleCount: number;
  message: string;
  details: string[];
}

function getHealthMessage(status: HealthStatus, strategyId: string): string {
  switch (status) {
    case 'healthy':
      return `策略 ${strategyId} 健康度良好，无需干预`;
    case 'warning':
      return `策略 ${strategyId} 出现偏离，建议关注`;
    case 'critical':
      return `策略 ${strategyId} 严重偏离预期，建议暂停或调整`;
    case 'insufficient_data':
      return `策略 ${strategyId} 数据不足，暂不评估`;
  }
}

/**
 * 评估单个策略的健康度
 *
 * 规则：
 * - 样本数 < 5: insufficient_data
 * - 胜率下降超过 20% 或 平均收益率转负: critical
 * - 胜率下降 10-20%: warning
 * - 其他: healthy
 */
export function assessStrategyHealth(
  input: StrategyHealthInput,
): StrategyHealthResult {
  const { strategyId, recentReturns, expectedAnnualReturn, expectedWinRate } = input;
  const sampleCount = recentReturns.length;

  if (sampleCount < 5) {
    return {
      strategyId,
      status: 'insufficient_data',
      actualWinRate: 0,
      actualAvgReturn: 0,
      expectedWinRate,
      expectedAnnualReturn,
      sampleCount,
      message: `样本不足（${sampleCount}/5），无法评估`,
      details: [`仅有 ${sampleCount} 条推荐记录，需要至少 5 条才能评估`],
    };
  }

  const winCount = recentReturns.filter(r => r > 0).length;
  const actualWinRate = (winCount / sampleCount) * 100;
  const actualAvgReturn = recentReturns.reduce((a, b) => a + b, 0) / sampleCount;

  const winRateDrop = expectedWinRate - actualWinRate;
  const details: string[] = [];

  let status: HealthStatus;
  if (winRateDrop > 20 || actualAvgReturn < 0) {
    status = 'critical';
    details.push(actualAvgReturn < 0 ? '平均收益率为负' : `胜率下降 ${winRateDrop.toFixed(1)}%`);
  } else if (winRateDrop > 10) {
    status = 'warning';
    details.push(`胜率下降 ${winRateDrop.toFixed(1)}%`);
  } else {
    status = 'healthy';
    details.push('表现与回测预期一致');
  }

  return {
    strategyId,
    status,
    actualWinRate,
    actualAvgReturn,
    expectedWinRate,
    expectedAnnualReturn,
    sampleCount,
    message: getHealthMessage(status, strategyId),
    details,
  };
}

/**
 * 批量评估所有策略健康度
 */
export function assessAllStrategiesHealth(
  inputs: StrategyHealthInput[],
): StrategyHealthResult[] {
  return inputs.map(assessStrategyHealth);
}

/**
 * 生成策略健康度报告（Markdown）
 */
export function generateStrategyHealthReport(
  results: StrategyHealthResult[],
  date: string,
): string {
  const lines: string[] = [];

  lines.push(`# 策略健康度报告`);
  lines.push('');
  lines.push(`**生成日期**: ${date}`);
  lines.push('');
  lines.push(`| 策略ID | 状态 | 实际胜率 | 实际平均收益率 | 预期胜率 | 预期年化收益 | 样本数 | 详情 |`);
  lines.push(`|--------|------|----------|----------------|----------|--------------|--------|------|`);

  for (const r of results) {
    const statusBadge = r.status === 'healthy' ? '✅ healthy' : r.status === 'warning' ? '⚠️ warning' : r.status === 'critical' ? '🔴 critical' : '⬜ insufficient_data';
    lines.push(
      `| ${r.strategyId} | ${statusBadge} | ${r.actualWinRate.toFixed(1)}% | ${r.actualAvgReturn.toFixed(2)}% | ${r.expectedWinRate}% | ${r.expectedAnnualReturn}% | ${r.sampleCount} | ${r.details.join('; ')} |`,
    );
  }

  lines.push('');
  lines.push('---');
  lines.push('');

  const criticalCount = results.filter(r => r.status === 'critical').length;
  const warningCount = results.filter(r => r.status === 'warning').length;
  const healthyCount = results.filter(r => r.status === 'healthy').length;
  const insufficientCount = results.filter(r => r.status === 'insufficient_data').length;

  lines.push(`**总计**: ${results.length} 个策略 — ✅ ${healthyCount} 健康 / ⚠️ ${warningCount} 警告 / 🔴 ${criticalCount} 严重 / ⬜ ${insufficientCount} 数据不足`);

  return lines.join('\n');
}
