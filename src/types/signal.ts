/** 信号结果 */
export interface SignalResult {
  /** 信号编号 "S01" ~ "S08" */
  signalId: string;
  /** 股票代码 */
  symbol: string;
  /** 触发日期 ISO 格式 */
  triggeredAt: string;
  /** 信号强度 1-5 星 */
  strength: 1 | 2 | 3 | 4 | 5;
  /** 触发时的具体数值 */
  detail: Record<string, unknown>;
}
