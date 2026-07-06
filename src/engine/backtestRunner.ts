/**
 * 回测引擎封装
 *
 * 将 T-4.1 中的 5 个策略函数适配到 stock-sdk/screener 的 backtest()，
 * 并提供统一的批量执行接口。
 */
import { backtest } from 'stock-sdk/screener';
import type {
  BacktestReport,
  BacktestOptions,
} from 'stock-sdk/screener';
import type { KLine } from '../types/sdk';
import {
  createPullbackStrategy,
  createFundFlowStrategy,
  createBreakoutStrategy,
  createNorthboundStrategy,
  createInstitutionStrategy,
} from './strategies/index';
import type { LimitUpEvent } from './strategies/stg05-institution';

// 重新导出以便 CLI 和其他模块使用
export type { BacktestReport };

/** 单只股票的回测输入 */
export interface BacktestInput {
  /** 股票代码 */
  code: string;
  /** K 线数据（决定回测时间范围） */
  klines: KLine[];
  /** STG02 所需：按日期索引的主力净流入占比（%），key 为 "YYYY-MM-DD" */
  fundFlowMap?: Map<string, number>;
  /** STG04 所需：按日期索引的北向增持比例（%），key 为 "YYYY-MM-DD" */
  northboundMap?: Map<string, number>;
  /** STG05 所需：涨停事件列表 */
  limitUpEvents?: LimitUpEvent[];
}

/** 单只股票单策略的回测结果 */
export interface BacktestResult {
  /** 股票代码 */
  code: string;
  /** 策略标识，如 "stg01-pullback" */
  strategy: string;
  /** 回测报告 */
  report: BacktestReport;
}

/** 回测选项 */
export interface BacktestOptionsInput {
  /** 初始资金，默认 100000 */
  initialCapital?: number;
  /** 单边费率（如 0.0003），默认 0 */
  fee?: number;
}

/**
 * 对单只股票运行所有适用策略的回测。
 *
 * 自动跳过因缺少外部数据（资金流 / 北向 / 龙虎榜）而无法运行的策略。
 *
 * @param input 单只股票的回测输入
 * @param options 回测选项
 * @returns 所有适用策略的回测结果
 */
export function runBacktest(
  input: BacktestInput,
  options?: BacktestOptionsInput,
): BacktestResult[] {
  const { klines } = input;
  const initialCapital = options?.initialCapital ?? 100000;
  const fee = options?.fee ?? 0;
  const results: BacktestResult[] = [];

  // STG01: 强势回调（仅需 K 线）
  {
    const strategy = createPullbackStrategy(klines);
    const report = backtest({
      klines,
      strategy,
      initialCapital,
      fee,
    } satisfies BacktestOptions<KLine>);
    results.push({
      code: input.code,
      strategy: 'stg01-pullback',
      report,
    });
  }

  // STG02: 资金流驱动（需要 fundFlowMap）
  if (input.fundFlowMap && input.fundFlowMap.size > 0) {
    const strategy = createFundFlowStrategy(klines, input.fundFlowMap);
    const report = backtest({
      klines,
      strategy,
      initialCapital,
      fee,
    } satisfies BacktestOptions<KLine>);
    results.push({
      code: input.code,
      strategy: 'stg02-fundFlow',
      report,
    });
  }

  // STG03: 突破跟进（仅需 K 线）
  {
    const strategy = createBreakoutStrategy(klines);
    const report = backtest({
      klines,
      strategy,
      initialCapital,
      fee,
    } satisfies BacktestOptions<KLine>);
    results.push({
      code: input.code,
      strategy: 'stg03-breakout',
      report,
    });
  }

  // STG04: 北向共振（需要 northboundMap）
  if (input.northboundMap && input.northboundMap.size > 0) {
    const strategy = createNorthboundStrategy(klines, input.northboundMap);
    const report = backtest({
      klines,
      strategy,
      initialCapital,
      fee,
    } satisfies BacktestOptions<KLine>);
    results.push({
      code: input.code,
      strategy: 'stg04-northbound',
      report,
    });
  }

  // STG05: 机构打板回调（需要 limitUpEvents）
  if (input.limitUpEvents && input.limitUpEvents.length > 0) {
    const strategy = createInstitutionStrategy(klines, input.limitUpEvents);
    const report = backtest({
      klines,
      strategy,
      initialCapital,
      fee,
    } satisfies BacktestOptions<KLine>);
    results.push({
      code: input.code,
      strategy: 'stg05-institution',
      report,
    });
  }

  return results;
}

/**
 * 对多只股票批量运行回测。
 *
 * @param inputs 多只股票的回测输入
 * @param options 回测选项
 * @returns 所有结果平铺排列
 */
export function runBacktestAll(
  inputs: BacktestInput[],
  options?: BacktestOptionsInput,
): BacktestResult[] {
  return inputs.flatMap(input => runBacktest(input, options));
}