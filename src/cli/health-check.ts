/**
 * 数据健康检查模块
 *
 * 提供三类独立的数据健康判定函数以及组合检查，用于监控数据时效性、
 * 空值比例和调用失败率。
 */

/** 健康检查单项结果 */
export interface HealthCheckItem {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  detail?: Record<string, unknown>;
}

/** 健康检查总体结果 */
export interface HealthCheckResult {
  status: 'healthy' | 'warning' | 'critical';
  checks: HealthCheckItem[];
  summary: string;
}

/** 组合健康检查输入 */
export interface HealthCheckInput {
  lastDataTimestamp: string;
  maxDataAgeHours: number;
  signalNullCount: number;
  signalTotalCount: number;
  emptyThresholdPercent: number;
  failedCalls: number;
  totalCalls: number;
  failureThresholdPercent: number;
}

/**
 * 检查数据新鲜度（基于时间戳与当前时间的差值）
 *
 * @param dataTimestamp - 数据时间戳（ISO 8601 字符串）
 * @param maxAgeHours  - 最大容忍时效（小时）
 * @returns HealthCheckItem
 */
export function checkDataFreshness(
  dataTimestamp: string,
  maxAgeHours: number,
): HealthCheckItem {
  const now = Date.now();
  const dataTime = new Date(dataTimestamp).getTime();
  const ageHours = (now - dataTime) / (1000 * 60 * 60);

  const name = 'dataFreshness';
  const detail: Record<string, unknown> = {
    dataTimestamp,
    ageHours: Math.round(ageHours * 100) / 100,
    maxAgeHours,
  };

  if (ageHours < maxAgeHours) {
    return {
      name,
      status: 'pass',
      message: `数据时效正常（${Math.round(ageHours * 100) / 100}小时 < ${maxAgeHours}小时）`,
      detail,
    };
  }

  if (ageHours < maxAgeHours * 2) {
    return {
      name,
      status: 'warn',
      message: `数据已偏旧（${Math.round(ageHours * 100) / 100}小时 ≥ ${maxAgeHours}小时）`,
      detail,
    };
  }

  return {
    name,
    status: 'fail',
    message: `数据已严重过期（${Math.round(ageHours * 100) / 100}小时 ≥ ${maxAgeHours * 2}小时）`,
    detail,
  };
}

/**
 * 检查信号结果中的空值占比
 *
 * @param signalResults    - 信号结果数组（null 表示无信号）
 * @param thresholdPercent - 空值比例阈值（百分比）
 * @returns HealthCheckItem
 */
export function checkEmptyRate(
  signalResults: (string | null)[],
  thresholdPercent: number,
): HealthCheckItem {
  const total = signalResults.length;
  const nullCount = signalResults.filter((r) => r === null).length;
  const ratePercent = total > 0 ? (nullCount / total) * 100 : 0;

  const name = 'emptyRate';
  const detail: Record<string, unknown> = {
    nullCount,
    total,
    ratePercent: Math.round(ratePercent * 100) / 100,
    thresholdPercent,
  };

  if (ratePercent < thresholdPercent) {
    return {
      name,
      status: 'pass',
      message: `空值比例正常（${Math.round(ratePercent * 100) / 100}% < ${thresholdPercent}%）`,
      detail,
    };
  }

  if (ratePercent < thresholdPercent + 20) {
    return {
      name,
      status: 'warn',
      message: `空值比例偏高（${Math.round(ratePercent * 100) / 100}% ≥ ${thresholdPercent}%）`,
      detail,
    };
  }

  return {
    name,
    status: 'fail',
    message: `空值比例过高（${Math.round(ratePercent * 100) / 100}% ≥ ${thresholdPercent + 20}%）`,
    detail,
  };
}

/**
 * 检查调用失败率
 *
 * @param callResults      - 调用结果数组
 * @param thresholdPercent - 失败率阈值（百分比）
 * @returns HealthCheckItem
 */
export function checkFailureRate(
  callResults: { success: boolean }[],
  thresholdPercent: number,
): HealthCheckItem {
  const total = callResults.length;
  const failedCount = callResults.filter((r) => !r.success).length;
  const ratePercent = total > 0 ? (failedCount / total) * 100 : 0;

  const name = 'failureRate';
  const detail: Record<string, unknown> = {
    failedCount,
    total,
    ratePercent: Math.round(ratePercent * 100) / 100,
    thresholdPercent,
  };

  if (ratePercent < thresholdPercent) {
    return {
      name,
      status: 'pass',
      message: `失败率正常（${Math.round(ratePercent * 100) / 100}% < ${thresholdPercent}%）`,
      detail,
    };
  }

  if (ratePercent < thresholdPercent + 20) {
    return {
      name,
      status: 'warn',
      message: `失败率偏高（${Math.round(ratePercent * 100) / 100}% ≥ ${thresholdPercent}%）`,
      detail,
    };
  }

  return {
    name,
    status: 'fail',
    message: `失败率过高（${Math.round(ratePercent * 100) / 100}% ≥ ${thresholdPercent + 20}%）`,
    detail,
  };
}

/**
 * 运行组合健康检查
 *
 * 将 HealthCheckInput 拆解后分别调用三个判定函数，并综合汇总结果。
 *
 * @param data - 健康检查输入
 * @returns HealthCheckResult
 */
export function runHealthCheck(data: HealthCheckInput): HealthCheckResult {
  // 从 input 构造三个判定函数所需的参数
  const freshnessItem = checkDataFreshness(
    data.lastDataTimestamp,
    data.maxDataAgeHours,
  );

  // 构造 signalResults 数组
  const signalResults: (string | null)[] = [];
  const nonNullCount = data.signalTotalCount - data.signalNullCount;
  for (let i = 0; i < data.signalNullCount; i++) {
    signalResults.push(null);
  }
  for (let i = 0; i < nonNullCount; i++) {
    signalResults.push('signal');
  }

  const emptyRateItem = checkEmptyRate(
    signalResults,
    data.emptyThresholdPercent,
  );

  // 构造 callResults 数组
  const callResults: { success: boolean }[] = [];
  const successCount = data.totalCalls - data.failedCalls;
  for (let i = 0; i < data.failedCalls; i++) {
    callResults.push({ success: false });
  }
  for (let i = 0; i < successCount; i++) {
    callResults.push({ success: true });
  }

  const failureRateItem = checkFailureRate(
    callResults,
    data.failureThresholdPercent,
  );

  const checks = [freshnessItem, emptyRateItem, failureRateItem];

  // 汇总状态：取最严重的那个
  const hasFail = checks.some((c) => c.status === 'fail');
  const hasWarn = checks.some((c) => c.status === 'warn');

  let overallStatus: 'healthy' | 'warning' | 'critical';
  let summary: string;

  if (hasFail) {
    overallStatus = 'critical';
    const failNames = checks
      .filter((c) => c.status === 'fail')
      .map((c) => c.name)
      .join('、');
    summary = `数据健康检查未通过（${failNames} 状态为 fail）`;
  } else if (hasWarn) {
    overallStatus = 'warning';
    const warnNames = checks
      .filter((c) => c.status === 'warn')
      .map((c) => c.name)
      .join('、');
    summary = `数据健康检查存在警告（${warnNames} 状态为 warn）`;
  } else {
    overallStatus = 'healthy';
    summary = '数据健康检查全部通过';
  }

  return {
    status: overallStatus,
    checks,
    summary,
  };
}
