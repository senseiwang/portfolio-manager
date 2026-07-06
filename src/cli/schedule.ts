/**
 * 调度器（T-3.3）
 *
 * 使用 node-cron 注册定时任务：
 * - 盘后批处理：每日 15:30 执行（T-3.1, runDailyBatch）
 * - 盘中事件监听：交易时段内每 5 分钟执行（T-3.2, pollMarketEvents）
 *
 * 依赖注入设计：调度器接受函数引用而非直接导入 pipeline，
 * 便于测试时注入 mock 函数并用 vi.useFakeTimers() 快进时间。
 */
import cron from 'node-cron';

/** 调度器配置 */
export interface SchedulerConfig {
  /** 盘后批处理 cron 表达式，默认 '30 15 * * 1-5'（交易日 15:30） */
  dailyBatchCron?: string;
  /**
   * 盘中轮询 cron 表达式，默认 '/5 9-15 * * 1-5'（星号/5，交易时段每 5 分钟）
   */
  intradayPollCron?: string;
}

/** 调度器实例，包含注册的任务引用（可取消） */
export interface SchedulerInstance {
  /** 停止所有已注册的定时任务 */
  stop(): void;
  /** 盘后批处理任务引用 */
  dailyBatchTask: cron.ScheduledTask;
  /** 盘中轮询任务引用 */
  intradayPollTask: cron.ScheduledTask;
}

/** 默认 cron 表达式 */
export const DEFAULT_DAILY_BATCH_CRON = '30 15 * * 1-5'; // 交易日 15:30
export const DEFAULT_INTRADAY_POLL_CRON = '*/5 9-15 * * 1-5'; // 交易日 9:00-15:59 每 5 分钟

/**
 * 创建并启动调度器
 *
 * @param dailyBatchFn - 盘后批处理函数（如 runDailyBatch 封装）
 * @param intradayPollFn - 盘中轮询函数（如 pollMarketEvents 封装）
 * @param config - 可选 cron 表达式覆盖
 * @returns SchedulerInstance
 */
export function createScheduler(
  dailyBatchFn: () => void | Promise<void>,
  intradayPollFn: () => void | Promise<void>,
  config?: SchedulerConfig,
): SchedulerInstance {
  const dailyBatchCron = config?.dailyBatchCron ?? DEFAULT_DAILY_BATCH_CRON;
  const intradayPollCron = config?.intradayPollCron ?? DEFAULT_INTRADAY_POLL_CRON;

  const dailyBatchTask = cron.schedule(dailyBatchCron, () => {
    dailyBatchFn();
  });

  const intradayPollTask = cron.schedule(intradayPollCron, () => {
    intradayPollFn();
  });

  return {
    stop(): void {
      dailyBatchTask.stop();
      intradayPollTask.stop();
    },
    dailyBatchTask,
    intradayPollTask,
  };
}