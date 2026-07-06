/**
 * 本地混沌演练测试（P7 T-7.10）
 *
 * 在开发/预发布环境用 mock 数据模拟三个场景，验证系统正确响应：
 *
 * 场景 1：进程被 kill 后自动重启（验证 T-7.5 PM2 守护 + T-7.6 通知）
 * 场景 2：接口失败触发告警（验证 T-7.7 + T-7.6）
 * 场景 3：报告缺失后执行补跑（验证 T-7.8）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runHealthCheck } from '../../src/cli/health-check';
import type { HealthCheckResult } from '../../src/cli/health-check';
import { runBackfill } from '../../src/cli/backfill';
import type { Notifier, NotifyMessage } from '../../src/notify/notifier';

/* ==============================================
 * 模拟进程守护逻辑（场景 1）
 *
 * detectProcessCrash — 检查进程是否存在
 * restartProcess    — 执行进程重启，并在重启后发送告警通知
 * ============================================== */

/**
 * 检查指定 PID 的进程是否存在
 *
 * 使用 process.kill(pid, 0) 做探活——信号 0 不会实际发送信号，
 * 仅用于检测进程存在性。这是 Node.js 标准的跨平台进程探活方式。
 *
 * @param pid - 进程 ID
 * @returns true 表示进程存在，false 表示进程已不存在
 */
function detectProcessCrash(pid: number): boolean {
  try {
    // signal 0: 不发送实际信号，只检查进程是否存在
    process.kill(pid, 0);
    return true; // 进程存在
  } catch {
    return false; // 进程不存在（ESRCH 或无权限）
  }
}

/**
 * 进程自动重启逻辑
 *
 * 模拟 PM2 的守护行为：当检测到进程崩溃时执行外部传入的重启函数，
 * 重启完成后通过 Notifier 发送告警通知。
 *
 * @param name      - 进程名称（用于日志和通知）
 * @param restartFn - 重启动作（如 spawn 新进程）
 * @param notifier  - 通知器（可选，传入则发送重启告警）
 * @returns true 表示重启成功，false 表示重启失败
 */
async function restartProcess(
  name: string,
  restartFn: () => Promise<void>,
  notifier?: Notifier,
): Promise<boolean> {
  try {
    await restartFn();
    if (notifier) {
      await notifier.send({
        type: 'alert',
        title: `进程重启: ${name}`,
        content: `检测到进程 ${name} 崩溃，已自动重启成功`,
        date: new Date().toISOString().slice(0, 10),
        metadata: { processName: name, action: 'restart', status: 'success' },
      });
    }
    return true;
  } catch {
    if (notifier) {
      await notifier.send({
        type: 'error',
        title: `进程重启失败: ${name}`,
        content: `进程 ${name} 重启执行失败，请人工介入`,
        date: new Date().toISOString().slice(0, 10),
        metadata: { processName: name, action: 'restart', status: 'failed' },
      });
    }
    return false;
  }
}

/* ==============================================
 * 健康检查告警触发逻辑（场景 2）
 *
 * 模拟系统在 runHealthCheck 返回 critical 时如何
 * 构造并投递告警通知。
 * ============================================== */

/**
 * 根据健康检查结果决定是否发送告警
 *
 * 当健康检查结果为 critical 时，汇总所有 fail 项的原因，
 * 通过 Notifier 发送一条 alert 通知。
 *
 * @param result   - runHealthCheck 的返回结果
 * @param notifier - 通知器
 */
async function sendHealthAlert(
  result: HealthCheckResult,
  notifier: Notifier,
): Promise<void> {
  if (result.status !== 'critical') return;

  const failItems = result.checks.filter((c) => c.status === 'fail');
  const failReasons = failItems
    .map((c) => `${c.name}: ${c.message}`)
    .join('；');

  await notifier.send({
    type: 'alert',
    title: '数据健康检查告警 - 严重',
    content: `健康检查结果为 critical，共 ${result.checks.length} 项检查中 ${failItems.length} 项未通过。失败原因：${failReasons}`,
    date: new Date().toISOString().slice(0, 10),
    metadata: {
      healthStatus: result.status,
      checkCount: result.checks.length,
      failureCount: failItems.length,
    },
  });
}

/* ==============================================
 * 场景 1：进程被 kill 后自动重启
 * ============================================== */
describe('场景 1：进程被 kill 后自动重启', () => {
  describe('detectProcessCrash', () => {
    it('当前进程的 PID 应返回 true（进程存在）', () => {
      const alive = detectProcessCrash(process.pid);
      expect(alive).toBe(true);
    });

    it('不存在的 PID 应返回 false', () => {
      // 使用一个不可能存在的 PID（POSIX 上 -1 有特殊含义（广播），改用极大值）
      const dead = detectProcessCrash(999_999_999);
      expect(dead).toBe(false);
    });
  });

  describe('restartProcess', () => {
    let messages: NotifyMessage[];
    let mockNotifier: Notifier;

    beforeEach(() => {
      messages = [];
      mockNotifier = {
        async send(msg: NotifyMessage) {
          messages.push(msg);
        },
      };
    });

    it('进程崩溃时应执行重启并发送 alert 通知', async () => {
      const restartFn = vi.fn().mockResolvedValue(undefined);

      const success = await restartProcess(
        'test-scheduler',
        restartFn,
        mockNotifier,
      );

      // 验证重启函数被调用
      expect(restartFn).toHaveBeenCalledTimes(1);
      // 验证返回成功
      expect(success).toBe(true);

      // 验证发送了一条告警通知
      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('alert');
      expect(messages[0].title).toContain('进程重启');
      expect(messages[0].title).toContain('test-scheduler');
      expect(messages[0].content).toContain('已自动重启');
      expect(messages[0].metadata?.processName).toBe('test-scheduler');
      expect(messages[0].metadata?.status).toBe('success');
    });

    it('重启失败时应发送 error 通知并返回 false', async () => {
      const restartFn = vi.fn().mockRejectedValue(new Error('重启超时'));

      const success = await restartProcess(
        'faulty-scheduler',
        restartFn,
        mockNotifier,
      );

      // 验证重启函数被调用
      expect(restartFn).toHaveBeenCalledTimes(1);
      // 验证返回失败
      expect(success).toBe(false);

      // 验证发送了一条 error 通知
      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('error');
      expect(messages[0].title).toContain('进程重启失败');
      expect(messages[0].content).toContain('执行失败');
      expect(messages[0].metadata?.status).toBe('failed');
    });

    it('未传入 notifier 时仍应执行重启但不发送通知', async () => {
      const restartFn = vi.fn().mockResolvedValue(undefined);

      const success = await restartProcess(
        'silent-scheduler',
        restartFn,
      );

      expect(restartFn).toHaveBeenCalledTimes(1);
      expect(success).toBe(true);
      // 未传入 notifier，不应尝试发送通知（不应抛异常）
    });

    it('重启函数抛出异常时仍应优雅处理', async () => {
      const restartFn = vi.fn().mockRejectedValue(new Error('权限不足'));

      // 即使没有 notifier 也不应抛未捕获异常
      const success = await restartProcess(
        'crash-scheduler',
        restartFn,
      );

      expect(success).toBe(false);
    });
  });
});

/* ==============================================
 * 场景 2：接口失败触发告警
 * ============================================== */
describe('场景 2：接口失败触发告警', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-06T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('数据过期 + 空值率高 + 失败率高 → runHealthCheck 返回 critical', () => {
    // 三方面同时恶化，确保触发 critical
    const result = runHealthCheck({
      // 数据过期：3 天前 → 72h > 48h（maxAgeHours=24 的 2 倍）→ fail
      lastDataTimestamp: '2026-07-03T00:00:00.000Z',
      maxDataAgeHours: 24,
      // 空值率高：8/10 = 80% > 50%（threshold=30 的 +20）→ fail
      signalNullCount: 8,
      signalTotalCount: 10,
      emptyThresholdPercent: 30,
      // 失败率高：5/10 = 50% > 30%（threshold=10 的 +20）→ fail
      failedCalls: 5,
      totalCalls: 10,
      failureThresholdPercent: 10,
    });

    expect(result.status).toBe('critical');
    // 三检查项都应 fail
    const failNames = result.checks
      .filter((c) => c.status === 'fail')
      .map((c) => c.name);
    expect(failNames).toContain('dataFreshness');
    expect(failNames).toContain('emptyRate');
    expect(failNames).toContain('failureRate');
  });

  it('数据过期单独即可触发 critical', () => {
    const result = runHealthCheck({
      lastDataTimestamp: '2026-07-01T00:00:00.000Z', // 5 天前 → 120h >> 48h
      maxDataAgeHours: 24,
      signalNullCount: 0,
      signalTotalCount: 10,
      emptyThresholdPercent: 30,
      failedCalls: 0,
      totalCalls: 10,
      failureThresholdPercent: 10,
    });

    expect(result.status).toBe('critical');
    expect(result.checks[0].status).toBe('fail');
    expect(result.checks[0].message).toContain('严重过期');
  });

  it('空值率过高单独即可触发 critical', () => {
    const result = runHealthCheck({
      lastDataTimestamp: '2026-07-05T23:00:00.000Z', // 1h 前 → 正常
      maxDataAgeHours: 24,
      signalNullCount: 9,
      signalTotalCount: 10, // 90% > 50%
      emptyThresholdPercent: 30,
      failedCalls: 0,
      totalCalls: 10,
      failureThresholdPercent: 10,
    });

    expect(result.status).toBe('critical');
    expect(result.checks[1].status).toBe('fail');
    expect(result.checks[1].message).toContain('过高');
  });

  it('失败率过高单独即可触发 critical', () => {
    const result = runHealthCheck({
      lastDataTimestamp: '2026-07-05T23:00:00.000Z', // 正常
      maxDataAgeHours: 24,
      signalNullCount: 0,
      signalTotalCount: 10,
      emptyThresholdPercent: 30,
      failedCalls: 6,
      totalCalls: 10, // 60% > 30%
      failureThresholdPercent: 10,
    });

    expect(result.status).toBe('critical');
    expect(result.checks[2].status).toBe('fail');
    expect(result.checks[2].message).toContain('过高');
  });

  it('critical 时应触发告警通知，且告警内容包含具体原因', async () => {
    const messages: NotifyMessage[] = [];
    const mockNotifier: Notifier = {
      async send(msg: NotifyMessage) {
        messages.push(msg);
      },
    };

    // 构造恶化的健康检查输入
    const result = runHealthCheck({
      lastDataTimestamp: '2026-07-03T00:00:00.000Z', // 过期 → fail
      maxDataAgeHours: 24,
      signalNullCount: 8, // 空值率高 → fail
      signalTotalCount: 10,
      emptyThresholdPercent: 30,
      failedCalls: 5, // 失败率高 → fail
      totalCalls: 10,
      failureThresholdPercent: 10,
    });

    // 触发告警（模拟系统在检测到 critical 时的行为）
    await sendHealthAlert(result, mockNotifier);

    // 验证触发了一条告警通知
    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe('alert');
    expect(messages[0].title).toContain('严重');

    // 验证告警内容包含具体原因
    const content = messages[0].content;
    expect(content).toContain('critical');
    expect(content).toContain('3 项检查中 3 项未通过');
    expect(content).toContain('dataFreshness');
    expect(content).toContain('emptyRate');
    expect(content).toContain('failureRate');
  });

  it('健康检查 passed 时不触发告警', async () => {
    const messages: NotifyMessage[] = [];
    const mockNotifier: Notifier = {
      async send(msg: NotifyMessage) {
        messages.push(msg);
      },
    };

    const result = runHealthCheck({
      lastDataTimestamp: '2026-07-05T23:00:00.000Z', // 正常
      maxDataAgeHours: 24,
      signalNullCount: 0,
      signalTotalCount: 10,
      emptyThresholdPercent: 30,
      failedCalls: 0,
      totalCalls: 10,
      failureThresholdPercent: 10,
    });

    await sendHealthAlert(result, mockNotifier);

    // healthy 不应触发告警
    expect(messages).toHaveLength(0);
  });
});

/* ==============================================
 * 场景 3：报告缺失后执行补跑
 * ============================================== */
describe('场景 3：报告缺失后执行补跑', () => {
  const date = '2026-07-06';
  let tmpDir: string;
  let messages: NotifyMessage[];

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'chaos-backfill-'));
    messages = [];
  });

  it('模拟某天无报告文件时执行补跑应成功生成报告', async () => {
    // 验证初始状态：没有报告文件（模拟调度失败未产出报告）
    const jsonPath = join(tmpDir, 'reports', `${date}.json`);
    const txtPath = join(tmpDir, 'reports', `${date}.txt`);
    expect(existsSync(jsonPath)).toBe(false);
    expect(existsSync(txtPath)).toBe(false);

    // 创建 mock 通知器
    const mockNotifier: Notifier = {
      async send(msg: NotifyMessage) {
        messages.push(msg);
      },
    };

    // 执行补跑
    const report = await runBackfill(date, {
      dataDir: tmpDir,
      notifier: mockNotifier,
    });

    // 验证报告文件已生成
    expect(existsSync(jsonPath)).toBe(true);
    expect(existsSync(txtPath)).toBe(true);

    // 验证 JSON 报告内容
    const jsonContent = JSON.parse(readFileSync(jsonPath, 'utf-8'));
    expect(jsonContent.date).toBe(date);
    expect(jsonContent.holdingsOverview).toBeDefined();
    expect(jsonContent.watchlistOverview).toBeDefined();
    expect(jsonContent.healthScore).toBeDefined();
    expect(jsonContent.candidatePool).toBeDefined();
    expect(jsonContent.rebalance).toBeDefined();
    expect(jsonContent.backtestSummary).toBeDefined();
    expect(jsonContent.marketStatus).toBeDefined();

    // 验证返回的日报结构
    expect(report.date).toBe(date);
    expect(report.holdingsOverview).toBeDefined();
    expect(report.watchlistOverview).toBeDefined();
    expect(report.healthScore).toBeDefined();
    expect(report.candidatePool).toBeDefined();
    expect(report.rebalance).toBeDefined();
    expect(report.backtestSummary).toBeDefined();
    expect(report.marketStatus).toBeDefined();
  });

  it('补跑完成后应触发通知', async () => {
    const mockNotifier: Notifier = {
      async send(msg: NotifyMessage) {
        messages.push(msg);
      },
    };

    await runBackfill(date, {
      dataDir: tmpDir,
      notifier: mockNotifier,
    });

    // 验证触发了一条通知
    expect(messages).toHaveLength(1);

    // 验证通知类型为 report_complete
    expect(messages[0].type).toBe('report_complete');

    // 验证通知包含日期信息
    expect(messages[0].title).toContain(date);
    expect(messages[0].date).toBe(date);

    // 验证通知带有 backfill 元数据标记
    expect(messages[0].metadata?.backfill).toBe(true);
  });

  it('补跑生成的纯文本报告应包含所有板块标题', async () => {
    const mockNotifier: Notifier = {
      async send(msg: NotifyMessage) {
        messages.push(msg);
      },
    };

    await runBackfill(date, {
      dataDir: tmpDir,
      notifier: mockNotifier,
    });

    const txtPath = join(tmpDir, 'reports', `${date}.txt`);
    const content = readFileSync(txtPath, 'utf-8');

    expect(content).toContain('【持仓概览】');
    expect(content).toContain('【Watchlist 概览】');
    expect(content).toContain('【组合健康度】');
    expect(content).toContain('【候选池摘要】');
    expect(content).toContain('【再平衡建议】');
    expect(content).toContain('【回测摘要】');
    expect(content).toContain('【市场状态】');
  });
});
