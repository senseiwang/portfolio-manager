/**
 * 通知模块测试
 *
 * 覆盖：
 * 1. report_complete 类型消息包含日期
 * 2. alert 类型消息包含告警原因
 * 3. error 类型消息包含异常堆栈
 * 4. 空消息/空字段边界处理
 * 5. ConsoleNotifier 能正常输出
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConsoleNotifier, createNotifier } from '../../src/notify/notifier';
import type { NotifyMessage } from '../../src/notify/notifier';

describe('ConsoleNotifier', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('report_complete 类型消息包含日期', async () => {
    const notifier = new ConsoleNotifier();
    const message: NotifyMessage = {
      type: 'report_complete',
      title: '日报完成',
      content: '今日报告已生成',
      date: '2026-07-06',
    };

    await notifier.send(message);

    // 验证 console.log 被调用且输出中包含日期
    const calls = consoleSpy.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const allOutput = calls.map((c) => c.join(' ')).join('\n');
    expect(allOutput).toContain('2026-07-06');
    expect(allOutput).toContain('REPORT_COMPLETE');
    expect(allOutput).toContain('日报完成');
  });

  it('alert 类型消息包含告警原因', async () => {
    const notifier = new ConsoleNotifier();
    const message: NotifyMessage = {
      type: 'alert',
      title: '持仓预警',
      content: '贵州茅台跌破 200 日均线，当前跌幅 -3.5%',
      date: '2026-07-06',
    };

    await notifier.send(message);

    const calls = consoleSpy.mock.calls;
    const allOutput = calls.map((c) => c.join(' ')).join('\n');
    expect(allOutput).toContain('ALERT');
    expect(allOutput).toContain('持仓预警');
    expect(allOutput).toContain('-3.5%');
  });

  it('error 类型消息包含异常堆栈', async () => {
    const notifier = new ConsoleNotifier();
    const errorStack = 'Error: 数据获取失败\n    at fetchData (src/data/sdkClient.ts:42)';
    const message: NotifyMessage = {
      type: 'error',
      title: '接口异常',
      content: errorStack,
      date: '2026-07-06',
    };

    await notifier.send(message);

    const calls = consoleSpy.mock.calls;
    const allOutput = calls.map((c) => c.join(' ')).join('\n');
    expect(allOutput).toContain('ERROR');
    expect(allOutput).toContain('接口异常');
    expect(allOutput).toContain('fetchData');
    expect(allOutput).toContain('src/data/sdkClient.ts:42');
  });

  it('空消息/空字段边界处理', async () => {
    const notifier = new ConsoleNotifier();

    // 空字段消息不应抛出异常
    const emptyTitleMsg: NotifyMessage = {
      type: 'report_complete',
      title: '',
      content: '正常内容',
      date: '2026-07-06',
    };
    await expect(notifier.send(emptyTitleMsg)).resolves.toBeUndefined();

    const emptyContentMsg: NotifyMessage = {
      type: 'report_complete',
      title: '正常标题',
      content: '',
      date: '2026-07-06',
    };
    await expect(notifier.send(emptyContentMsg)).resolves.toBeUndefined();

    // metadata 为 undefined 也应正常
    const noMetaMsg: NotifyMessage = {
      type: 'report_complete',
      title: '无元数据',
      content: '内容',
      date: '2026-07-06',
    };
    await expect(notifier.send(noMetaMsg)).resolves.toBeUndefined();

    // 空 metadata 对象
    const emptyMetaMsg: NotifyMessage = {
      type: 'report_complete',
      title: '空元数据',
      content: '内容',
      date: '2026-07-06',
      metadata: {},
    };
    await expect(notifier.send(emptyMetaMsg)).resolves.toBeUndefined();

    expect(consoleSpy.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it('ConsoleNotifier 能正常输出', async () => {
    const notifier = new ConsoleNotifier();
    const message: NotifyMessage = {
      type: 'report_complete',
      title: '测试输出',
      content: '验证控制台输出功能',
      date: '2026-07-06',
    };

    // 恢复原始 console.log 以验证真实输出
    consoleSpy.mockRestore();

    // 使用 spy 重新捕获
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await notifier.send(message);

    expect(logSpy).toHaveBeenCalled();
    const calls = logSpy.mock.calls;
    expect(calls[0][0]).toContain('测试输出');
  });
});

describe('createNotifier 工厂函数', () => {
  it('应返回 Notifier 实例', () => {
    const notifier = createNotifier();
    expect(notifier).toBeInstanceOf(ConsoleNotifier);

    // 验证接口类型兼容
    const message: NotifyMessage = {
      type: 'alert',
      title: '工厂测试',
      content: 'createNotifier 返回的实例可用',
      date: '2026-07-06',
    };
    expect(() => notifier.send(message)).not.toThrow();
  });
});
