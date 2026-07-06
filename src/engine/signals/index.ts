/**
 * 信号检测注册表
 *
 * 所有信号检测函数统一注册在此处，通过 SIGNAL_MAP 按信号编号索引。
 * 外部模块通过此入口调用信号检测。
 */
import type { SignalResult } from '../../types/signal';

import { detectFundFlowRank } from './s01-fundFlowRank';
import type { FundFlowRankInput } from './s01-fundFlowRank';

import { detectConduction } from './s02-conduction';
import type { ConductionInput } from './s02-conduction';

import { detectNorthbound } from './s03-northbound';
import type { NorthboundInput } from './s03-northbound';

import { detectMACDGoldenCross } from './s04-macdGoldenCross';
import type { MACDGoldenCrossInput } from './s04-macdGoldenCross';

import { detectKDJDivergence } from './s05-kdjDivergence';
import type { KDJDivergenceInput } from './s05-kdjDivergence';

import { detectBOLLBreakout } from './s06-bollBreakout';
import type { BOLLBreakoutInput } from './s06-bollBreakout';

import { detectLimitUpPullback } from './s07-limitUpPullback';
import type { LimitUpPullbackInput } from './s07-limitUpPullback';

import { detectMultiResonance } from './s08-multiResonance';
import type { MultiResonanceInput } from './s08-multiResonance';

/** 所有信号检测函数的输入类型联合 */
export type SignalInput =
  | FundFlowRankInput
  | ConductionInput
  | NorthboundInput
  | MACDGoldenCrossInput
  | KDJDivergenceInput
  | BOLLBreakoutInput
  | LimitUpPullbackInput
  | MultiResonanceInput;

/** 信号检测函数签名 */
export type SignalDetector = (input: SignalInput) => SignalResult | null;

/** 信号编号到检测函数的映射 */
export const SIGNAL_MAP: Record<string, SignalDetector> = {
  S01: detectFundFlowRank as SignalDetector,
  S02: detectConduction as SignalDetector,
  S03: detectNorthbound as SignalDetector,
  S04: detectMACDGoldenCross as SignalDetector,
  S05: detectKDJDivergence as SignalDetector,
  S06: detectBOLLBreakout as SignalDetector,
  S07: detectLimitUpPullback as SignalDetector,
  S08: detectMultiResonance as SignalDetector,
};

/** 信号编号 → 人类可读描述 */
export const SIGNAL_DESCRIPTIONS: Record<string, { name: string; summary: string }> = {
  S01: { name: '资金流排名前10%', summary: '个股主力净流入排名市场前10%' },
  S02: { name: '三级传导共振', summary: '大盘翻红 + 板块资金流入前3 + 个股前3%' },
  S03: { name: '北向连续增持', summary: '北向资金连续5日增持该股' },
  S04: { name: 'MACD金叉', summary: 'DIF上穿DEA，短期趋势转强' },
  S05: { name: 'KDJ超卖底背离', summary: 'K<20且价格新低但K值未同步新低' },
  S06: { name: '放量突破BOLL中轨', summary: '收盘价站上布林带中轨且成交量放大' },
  S07: { name: '涨停机构买入回调', summary: '涨停后龙虎榜显示机构买入，回调企稳' },
  S08: { name: '多维共振', summary: '同时满足资金流/北向/MACD等多个条件' },
};

export type {
  FundFlowRankInput,
  ConductionInput,
  NorthboundInput,
  MACDGoldenCrossInput,
  KDJDivergenceInput,
  BOLLBreakoutInput,
  LimitUpPullbackInput,
  MultiResonanceInput,
};
