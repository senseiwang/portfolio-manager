/**
 * 调度器测试（T-3.3）
 *
 * 覆盖：
 * - cron 表达式解析正确（无效表达式应抛异常）
 * - 到达触发时间时正确的函数被调用一次（vi.useFakeTimers 快进时间）
 * - stop() 停止所有任务
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createScheduler } from '../../src/cli/schedule';

describe('createScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('默认 cron 表达式应合法（非空、无冲突）', () => {
    const dailyBatchFn = vi.fn();
    const intradayPollFn = vi.fn();

    const scheduler = createScheduler(dailyBatchFn, intradayPollFn);

    expect(scheduler).toHaveProperty('dailyBatchTask');
    expect(scheduler).toHaveProperty('intradayPollTask');
    expect(scheduler).toHaveProperty('stop');

    scheduler.stop();
  });

  it('无效 cron 表达式应抛异常', () => {
    const dailyBatchFn = vi.fn();
    const intradayPollFn = vi.fn();

    expect(() =>
      createScheduler(dailyBatchFn, intradayPollFn, {
        dailyBatchCron: 'invalid-cron',
      }),
    ).toThrow();
  });

  it('到达盘后批处理时间应调用 dailyBatchFn（15:30 触发，10:00 不触发）', async () => {
    const dailyBatchFn = vi.fn();
    const intradayPollFn = vi.fn();

    const scheduler = createScheduler(
      dailyBatchFn,
      intradayPollFn,
      {
        dailyBatchCron: '30 15 * * 1-5',
        intradayPollCron: '0 10 * * 1-5', // 只在 10:00 触发，不与 15:30 冲突
      },
    );

    // 快进到 15:29:30（周五 2026-07-10 是交易日）
    vi.setSystemTime(new Date('2026-07-10T15:29:30+08:00'));
    // 前进 60 秒到 15:30:30，触发 15:30 的 cron
    await vi.advanceTimersByTimeAsync(60_000);

    expect(dailyBatchFn).toHaveBeenCalledTimes(1);
    expect(intradayPollFn).not.toHaveBeenCalled();

    scheduler.stop();
  });

  it('到达盘中轮询时间应调用 intradayPollFn（10:00 触发，15:30 不触发）', async () => {
    const dailyBatchFn = vi.fn();
    const intradayPollFn = vi.fn();

    const scheduler = createScheduler(
      dailyBatchFn,
      intradayPollFn,
      {
        dailyBatchCron: '30 15 * * 1-5', // 只在 15:30 触发
        intradayPollCron: '0 10 * * 1-5', // 只在 10:00 触发
      },
    );

    // 快进到 09:59:30（周五 2026-07-10 是交易日）
    vi.setSystemTime(new Date('2026-07-10T09:59:30+08:00'));
    // 前进 60 秒到 10:00:30，触发 10:00 的 cron
    await vi.advanceTimersByTimeAsync(60_000);

    expect(intradayPollFn).toHaveBeenCalledTimes(1);
    expect(dailyBatchFn).not.toHaveBeenCalled();

    scheduler.stop();
  });

  it('stop() 应停止所有任务，后续不再触发', async () => {
    const dailyBatchFn = vi.fn();
    const intradayPollFn = vi.fn();

    const scheduler = createScheduler(
      dailyBatchFn,
      intradayPollFn,
      {
        dailyBatchCron: '30 15 * * 1-5',
        intradayPollCron: '*/5 * * * 1-5',
      },
    );

    // 停止任务
    scheduler.stop();

    // 快进到 15:30
    vi.setSystemTime(new Date('2026-07-10T15:30:00+08:00'));
    await vi.advanceTimersByTimeAsync(1000);

    // stop 后不应触发任何函数
    expect(dailyBatchFn).not.toHaveBeenCalled();
    expect(intradayPollFn).not.toHaveBeenCalled();
  });
});