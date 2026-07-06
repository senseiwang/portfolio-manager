/**
 * backfill CLI 测试
 *
 * 覆盖场景：
 * - Mock 某天调度失败未产出报告场景
 * - 手动执行 backfill 后产出报告与预期一致
 * - 执行完成后触发一条通知
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runBackfill } from '../../src/cli/backfill';
import type { Notifier, NotifyMessage } from '../../src/notify/notifier';
import type { DailyReport } from '../../src/pipeline/reportBuilder';

describe('backfill 手动补跑', () => {
  const date = '2026-07-06';
  let tmpDir: string;
  let report: DailyReport;
  let messages: NotifyMessage[];

  beforeAll(async () => {
    // 创建临时目录，避免污染实际数据
    tmpDir = mkdtempSync(join(tmpdir(), 'backfill-test-'));

    // 验证初始状态：没有报告文件（模拟调度失败未产出报告的场景）
    const initialJsonPath = join(tmpDir, 'reports', `${date}.json`);
    const initialTxtPath = join(tmpDir, 'reports', `${date}.txt`);
    expect(existsSync(initialJsonPath)).toBe(false);
    expect(existsSync(initialTxtPath)).toBe(false);

    // 创建 mock 通知器，记录所有通知消息
    messages = [];
    const mockNotifier: Notifier = {
      async send(message: NotifyMessage): Promise<void> {
        messages.push(message);
      },
    };

    // 执行补跑
    report = await runBackfill(date, {
      dataDir: tmpDir,
      notifier: mockNotifier,
    });
  });

  // ===== 产出报告验证 =====

  it('应产出 JSON 报告文件', () => {
    const jsonPath = join(tmpDir, 'reports', `${date}.json`);
    expect(existsSync(jsonPath)).toBe(true);

    const content = JSON.parse(readFileSync(jsonPath, 'utf-8'));
    expect(content.date).toBe(date);
    // 验证 7 大板块完整
    expect(content.holdingsOverview).toBeDefined();
    expect(content.watchlistOverview).toBeDefined();
    expect(content.healthScore).toBeDefined();
    expect(content.candidatePool).toBeDefined();
    expect(content.rebalance).toBeDefined();
    expect(content.backtestSummary).toBeDefined();
    expect(content.marketStatus).toBeDefined();
  });

  it('应产出纯文本日报文件', () => {
    const txtPath = join(tmpDir, 'reports', `${date}.txt`);
    expect(existsSync(txtPath)).toBe(true);

    const content = readFileSync(txtPath, 'utf-8');
    expect(content).toContain(date);
    expect(content).toContain('【持仓概览】');
    expect(content).toContain('【Watchlist 概览】');
    expect(content).toContain('【组合健康度】');
    expect(content).toContain('【候选池摘要】');
    expect(content).toContain('【再平衡建议】');
    expect(content).toContain('【回测摘要】');
    expect(content).toContain('【市场状态】');
  });

  // ===== 返回值结构验证 =====

  it('返回的日报 date 字段应与 backfill 日期一致', () => {
    expect(report.date).toBe(date);
  });

  it('返回的日报应包含所有 7 个板块', () => {
    expect(report.holdingsOverview).toBeDefined();
    expect(report.holdingsOverview.holdings).toBeDefined();

    expect(report.watchlistOverview).toBeDefined();
    expect(report.watchlistOverview.items).toBeDefined();

    expect(report.healthScore).toBeDefined();
    expect(report.healthScore.total).toBeGreaterThanOrEqual(0);
    expect(report.healthScore.total).toBeLessThanOrEqual(100);

    expect(report.candidatePool).toBeDefined();
    expect(report.candidatePool.totalCandidates).toBeGreaterThanOrEqual(0);

    expect(report.rebalance).toBeDefined();
    expect(report.rebalance.holdings).toBeDefined();

    expect(report.backtestSummary).toBeDefined();
    expect(report.backtestSummary.totalResults).toBeGreaterThanOrEqual(0);

    expect(report.marketStatus).toBeDefined();
    expect(report.marketStatus.date).toBe(date);
  });

  it('序列化后不应包含 undefined', () => {
    const json = JSON.stringify(report);
    expect(json).not.toContain('undefined');
  });

  // ===== 通知验证 =====

  it('应触发一条通知', () => {
    expect(messages.length).toBe(1);
  });

  it('通知类型应为 report_complete', () => {
    expect(messages[0].type).toBe('report_complete');
  });

  it('通知标题应包含日期信息', () => {
    expect(messages[0].title).toContain(date);
    expect(messages[0].date).toBe(date);
  });

  it('通知应带有 backfill 元数据标记', () => {
    expect(messages[0].metadata?.backfill).toBe(true);
  });
});
