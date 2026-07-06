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
