/**
 * 指标计算封装
 *
 * 将 stock-sdk/indicators 的 calc* 函数封装为统一签名，
 * 方便在信号检测和策略中调用。
 */
import {
  calcMA as sdkCalcMA,
  calcMACD as sdkCalcMACD,
  calcBOLL as sdkCalcBOLL,
  calcKDJ as sdkCalcKDJ,
  calcRSI as sdkCalcRSI,
  calcATR as sdkCalcATR,
  calcSAR as sdkCalcSAR,
  addIndicators as sdkAddIndicators,
} from 'stock-sdk/indicators';

import type {
  MAOptions,
  MACDOptions,
  BOLLOptions,
  KDJOptions,
  RSIOptions,
  ATROptions,
  SAROptions,
  MAResult,
  MACDResult,
  BOLLResult,
  KDJResult,
  RSIResult,
  ATRResult,
  SARResult,
} from 'stock-sdk/indicators';

// ===== 统一重导出 =====

export {
  sdkCalcMA as calcMA,
  sdkCalcMACD as calcMACD,
  sdkCalcBOLL as calcBOLL,
  sdkCalcKDJ as calcKDJ,
  sdkCalcRSI as calcRSI,
  sdkCalcATR as calcATR,
  sdkCalcSAR as calcSAR,
  sdkAddIndicators as addIndicators,
};

export type {
  MAOptions,
  MACDOptions,
  BOLLOptions,
  KDJOptions,
  RSIOptions,
  ATROptions,
  SAROptions,
  MAResult,
  MACDResult,
  BOLLResult,
  KDJResult,
  RSIResult,
  ATRResult,
  SARResult,
};

// ===== OHLCV 类型 =====
export interface OHLCV {
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

// ===== 统一计算函数 =====

export type IndicatorType =
  | 'MA' | 'MACD' | 'BOLL' | 'KDJ' | 'RSI' | 'ATR' | 'SAR';

export type IndicatorOptions =
  | MAOptions
  | MACDOptions
  | BOLLOptions
  | KDJOptions
  | RSIOptions
  | ATROptions
  | SAROptions;

export type IndicatorResult =
  | MAResult
  | MACDResult
  | BOLLResult
  | KDJResult
  | RSIResult
  | ATRResult
  | SARResult;

/**
 * 统一指标计算入口
 *
 * @param type 指标类型
 * @param data OHLCV 数据数组（用于 KDJ/ATR/SAR）或收盘价数组
 * @param options 指标参数
 */
export function calcIndicator(
  type: 'MA' | 'MACD' | 'BOLL' | 'RSI',
  data: (number | null)[],
  options?: MAOptions | MACDOptions | BOLLOptions | RSIOptions,
): IndicatorResult[];
export function calcIndicator(
  type: 'KDJ' | 'ATR' | 'SAR',
  data: OHLCV[],
  options?: KDJOptions | ATROptions | SAROptions,
): IndicatorResult[];
export function calcIndicator(
  type: IndicatorType,
  data: (number | null)[] | OHLCV[],
  options: IndicatorOptions = {},
): IndicatorResult[] {
  switch (type) {
    case 'MA':
      return sdkCalcMA(data as (number | null)[], options as MAOptions);
    case 'MACD':
      return sdkCalcMACD(data as (number | null)[], options as MACDOptions);
    case 'BOLL':
      return sdkCalcBOLL(data as (number | null)[], options as BOLLOptions);
    case 'KDJ':
      return sdkCalcKDJ(data as OHLCV[], options as KDJOptions);
    case 'RSI':
      return sdkCalcRSI(data as (number | null)[], options as RSIOptions);
    case 'ATR':
      return sdkCalcATR(data as OHLCV[], options as ATROptions);
    case 'SAR':
      return sdkCalcSAR(data as OHLCV[], options as SAROptions);
    default:
      throw new Error(`未知指标类型: ${type}`);
  }
}
