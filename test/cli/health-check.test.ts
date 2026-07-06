/**
 * 数据健康检查模块测试
 *
 * 覆盖：
 * - checkDataFreshness 阈值边界（pass / warn / fail）
 * - checkEmptyRate 阈值边界
 * - checkFailureRate 阈值边界
 * - runHealthCheck 对三种总体状态的汇总
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkDataFreshness,
  checkEmptyRate,
  checkFailureRate,
  runHealthCheck,
} from '../../src/cli/health-check';

/* ==============================================
 * checkDataFreshness
 * ============================================== */
describe('checkDataFreshness', () => {
  const maxAgeHours = 24;

  beforeEach(() => {
    vi.useFakeTimers();
    // 固定"当前时间"为 2026-07-06T00:00:00.000Z
    vi.setSystemTime(new Date('2026-07-06T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('age < maxAgeHours → pass', () => {
    // 23 小时前 → age = 23h < 24h
    const result = checkDataFreshness('2026-07-05T01:00:00.000Z', maxAgeHours);
    expect(result.status).toBe('pass');
    expect(result.name).toBe('dataFreshness');
    expect(result.detail?.ageHours).toBeLessThan(maxAgeHours);
  });

  it('age === 0（最新数据）→ pass', () => {
    const result = checkDataFreshness('2026-07-06T00:00:00.000Z', maxAgeHours);
    expect(result.status).toBe('pass');
  });

  it('age === maxAgeHours → warn', () => {
    // 24 小时前 → age = 24h
    const result = checkDataFreshness('2026-07-05T00:00:00.000Z', maxAgeHours);
    expect(result.status).toBe('warn');
    expect(result.detail?.ageHours).toBe(maxAgeHours);
  });

  it('maxAgeHours <= age < maxAgeHours * 2 → warn', () => {
    // 47 小时前 → age = 47h（24 <= 47 < 48）
    const result = checkDataFreshness('2026-07-04T01:00:00.000Z', maxAgeHours);
    expect(result.status).toBe('warn');
  });

  it('age === maxAgeHours * 2 → fail', () => {
    // 48 小时前 → age = 48h
    const result = checkDataFreshness('2026-07-04T00:00:00.000Z', maxAgeHours);
    expect(result.status).toBe('fail');
    expect(result.detail?.ageHours).toBe(maxAgeHours * 2);
  });

  it('age > maxAgeHours * 2 → fail', () => {
    // 72 小时前 → age = 72h > 48h
    const result = checkDataFreshness('2026-07-03T00:00:00.000Z', maxAgeHours);
    expect(result.status).toBe('fail');
  });
});

/* ==============================================
 * checkEmptyRate
 * ============================================== */
describe('checkEmptyRate', () => {
  const threshold = 30; // 30%

  it('rate = 0% → pass', () => {
    const results: (string | null)[] = ['sig1', 'sig2', 'sig3'];
    const item = checkEmptyRate(results, threshold);
    expect(item.status).toBe('pass');
    expect(item.detail?.ratePercent).toBe(0);
  });

  it('rate < threshold → pass', () => {
    // 2 / 10 = 20% < 30%
    const results: (string | null)[] = [
      null, null, 'sig1', 'sig2', 'sig3',
      'sig4', 'sig5', 'sig6', 'sig7', 'sig8',
    ];
    const item = checkEmptyRate(results, threshold);
    expect(item.status).toBe('pass');
  });

  it('rate === threshold → warn', () => {
    // 3 / 10 = 30%
    const results: (string | null)[] = [
      null, null, null, 'sig1', 'sig2',
      'sig3', 'sig4', 'sig5', 'sig6', 'sig7',
    ];
    const item = checkEmptyRate(results, threshold);
    expect(item.status).toBe('warn');
  });

  it('threshold <= rate < threshold + 20 → warn', () => {
    // 4 / 10 = 40%（30 <= 40 < 50）
    const results: (string | null)[] = [
      null, null, null, null, 'sig1',
      'sig2', 'sig3', 'sig4', 'sig5', 'sig6',
    ];
    const item = checkEmptyRate(results, threshold);
    expect(item.status).toBe('warn');
  });

  it('rate === threshold + 20 → fail', () => {
    // 5 / 10 = 50%
    const results: (string | null)[] = [
      null, null, null, null, null,
      'sig1', 'sig2', 'sig3', 'sig4', 'sig5',
    ];
    const item = checkEmptyRate(results, threshold);
    expect(item.status).toBe('fail');
  });

  it('rate > threshold + 20 → fail', () => {
    // 8 / 10 = 80% > 50%
    const results: (string | null)[] = [
      null, null, null, null, null,
      null, null, null, 'sig1', 'sig2',
    ];
    const item = checkEmptyRate(results, threshold);
    expect(item.status).toBe('fail');
  });

  it('空数组应视为 rate = 0% → pass', () => {
    const results: (string | null)[] = [];
    const item = checkEmptyRate(results, threshold);
    expect(item.status).toBe('pass');
    expect(item.detail?.ratePercent).toBe(0);
  });
});

/* ==============================================
 * checkFailureRate
 * ============================================== */
describe('checkFailureRate', () => {
  const threshold = 10; // 10%

  it('rate = 0% → pass', () => {
    const results = [
      { success: true },
      { success: true },
      { success: true },
    ];
    const item = checkFailureRate(results, threshold);
    expect(item.status).toBe('pass');
    expect(item.detail?.ratePercent).toBe(0);
  });

  it('rate < threshold → pass', () => {
    // 1 / 20 = 5% < 10%
    const results = Array.from({ length: 19 }, () => ({ success: true }));
    results.push({ success: false });
    const item = checkFailureRate(results, threshold);
    expect(item.status).toBe('pass');
  });

  it('rate === threshold → warn', () => {
    // 1 / 10 = 10%
    const results = Array.from({ length: 9 }, () => ({ success: true }));
    results.push({ success: false });
    const item = checkFailureRate(results, threshold);
    expect(item.status).toBe('warn');
  });

  it('threshold <= rate < threshold + 20 → warn', () => {
    // 2 / 10 = 20%（10 <= 20 < 30）
    const results = Array.from({ length: 8 }, () => ({ success: true }));
    results.push({ success: false }, { success: false });
    const item = checkFailureRate(results, threshold);
    expect(item.status).toBe('warn');
  });

  it('rate === threshold + 20 → fail', () => {
    // 3 / 10 = 30%
    const results = Array.from({ length: 7 }, () => ({ success: true }));
    results.push(
      { success: false },
      { success: false },
      { success: false },
    );
    const item = checkFailureRate(results, threshold);
    expect(item.status).toBe('fail');
  });

  it('rate > threshold + 20 → fail', () => {
    // 5 / 10 = 50% > 30%
    const results = Array.from({ length: 5 }, () => ({ success: true }));
    results.push(
      { success: false },
      { success: false },
      { success: false },
      { success: false },
      { success: false },
    );
    const item = checkFailureRate(results, threshold);
    expect(item.status).toBe('fail');
  });

  it('空数组应视为 rate = 0% → pass', () => {
    const results: { success: boolean }[] = [];
    const item = checkFailureRate(results, threshold);
    expect(item.status).toBe('pass');
    expect(item.detail?.ratePercent).toBe(0);
  });
});

/* ==============================================
 * runHealthCheck
 * ============================================== */
describe('runHealthCheck', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-06T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('全部 pass → healthy', () => {
    const result = runHealthCheck({
      lastDataTimestamp: '2026-07-05T23:00:00.000Z', // age = 1h < 24h
      maxDataAgeHours: 24,
      signalNullCount: 0,
      signalTotalCount: 10,
      emptyThresholdPercent: 30,
      failedCalls: 0,
      totalCalls: 10,
      failureThresholdPercent: 10,
    });

    expect(result.status).toBe('healthy');
    expect(result.summary).toBe('数据健康检查全部通过');
    expect(result.checks.every((c) => c.status === 'pass')).toBe(true);
  });

  it('有 warn 无 fail → warning', () => {
    const result = runHealthCheck({
      lastDataTimestamp: '2026-07-05T00:00:00.000Z', // age = 24h = maxAgeHours → warn
      maxDataAgeHours: 24,
      signalNullCount: 0,
      signalTotalCount: 10,
      emptyThresholdPercent: 30,
      failedCalls: 0,
      totalCalls: 10,
      failureThresholdPercent: 10,
    });

    expect(result.status).toBe('warning');
    expect(result.summary).toContain('警告');
    expect(result.checks.some((c) => c.status === 'warn')).toBe(true);
    expect(result.checks.some((c) => c.status === 'fail')).toBe(false);
  });

  it('有 fail → critical', () => {
    const result = runHealthCheck({
      lastDataTimestamp: '2026-07-03T00:00:00.000Z', // age = 72h > 48h → fail
      maxDataAgeHours: 24,
      signalNullCount: 8,
      signalTotalCount: 10,
      emptyThresholdPercent: 30,
      failedCalls: 5,
      totalCalls: 10,
      failureThresholdPercent: 10,
    });

    expect(result.status).toBe('critical');
    expect(result.summary).toContain('未通过');
    expect(result.checks.some((c) => c.status === 'fail')).toBe(true);
  });

  it('返回结果包含全部 3 项检查', () => {
    const result = runHealthCheck({
      lastDataTimestamp: '2026-07-05T23:00:00.000Z',
      maxDataAgeHours: 24,
      signalNullCount: 0,
      signalTotalCount: 10,
      emptyThresholdPercent: 30,
      failedCalls: 0,
      totalCalls: 10,
      failureThresholdPercent: 10,
    });

    expect(result.checks).toHaveLength(3);
    const names = result.checks.map((c) => c.name);
    expect(names).toContain('dataFreshness');
    expect(names).toContain('emptyRate');
    expect(names).toContain('failureRate');
  });
});
