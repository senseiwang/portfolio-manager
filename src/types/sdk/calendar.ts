/** 交易日历返回值类型 */
export type IsTradingDayResult = boolean;

export type MarketStatus = 'pre_market' | 'trading' | 'closed' | 'after_hours';

export type NextTradingDayResult = string; // ISO date string 'YYYY-MM-DD'
