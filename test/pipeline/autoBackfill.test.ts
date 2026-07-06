/**
 * 全自动补跑升级模块测试
 *
 * 覆盖场景：
 * - 前一交易日无报告 → 自动检测并补跑
 * - 前一交易日已有报告 → 不补跑
 * - 补跑完成后推送通知
 * - 非交易日场景（周末/节假日）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { checkAndBackfill, getPreviousTradingDay } from '../../src/pipeline/autoBackfill';
import type { SdkClient } from '../../src/data/sdkClient';
import type { Notifier, NotifyMessage } from '../../src/notify/notifier';

// ==================== Mock 工厂 ====================

/**
 * 创建可配置的 Mock SdkClient
 *
 * 默认 isTradingDay 返回 false（模拟非交易日），
 * 调用方可通过 overrides 覆盖特定方法。
 */
function createMockSdkClient(overrides?: Partial<SdkClient>): SdkClient {
  return {
    async getAllQuotes() { return []; },
    async getQuotesByCodes(_codes: string[]) { return []; },
    async getKLine(_symbol: string, _from?: string, _to?: string) { return []; },
    async getFundFlow(_symbol: string, _days?: number) { return []; },
    async getMarketFundFlow() { return []; },
    async getNorthboundSummary() { return []; },
    async getNorthboundHoldingRank(_limit?: number) { return []; },
    async getZTPool() { return []; },
    async getStockChanges() { return []; },
    async getBoardChanges() { return []; },
    async getDragonTigerDetail(_date: string) { return []; },
    async getDragonTigerSeatDetail(_symbol: string, _date: string) { return []; },
    async getBlockTradeMarketStat(_date: string) { return []; },
    async getMarginAccountInfo() { return []; },
    async isTradingDay(_date: string): Promise<boolean> { return false; },
    async nextTradingDay(_date: string): Promise<string> { return '2026-07-07'; },
    getMarketStatus() { return 'closed' as const; },
    async search(_keyword: string) { return []; },
    async getFundFlowRank(_limit?: number) { return []; },
    async getSectorFundFlowRank(_limit?: number) { return []; },
    async getDividendDetail(_symbol: string) { return {} as never; },
    async getMarginTargetList(_date?: string) { return []; },
    ...overrides,
  };
}

// ==================== getPreviousTradingDay 测试 ====================

describe('getPreviousTradingDay', () => {
  it('应正确找到前一交易日（跳过周末）', async () => {
    // 2026-07-06（周一），往前：7/5(日)✗ 7/4(六)✗ 7/3(五)✓
    const client = createMockSdkClient({
      isTradingDay: async (date: string) => {
        return date === '2026-07-03';
      },
    });

    const result = await getPreviousTradingDay(client, '2026-07-06');
    expect(result).toBe('2026-07-03');
  });

  it('前一交易日为当天时也应返回正确日期', async () => {
    // 假设 2026-07-06 是交易日
    const client = createMockSdkClient({
      isTradingDay: async (date: string) => {
        return date === '2026-07-05';
      },
    });

    const result = await getPreviousTradingDay(client, '2026-07-06');
    expect(result).toBe('2026-07-05');
  });

  it('30 天内无交易日应返回 null', async () => {
    const client = createMockSdkClient({
      isTradingDay: async () => false,
    });

    const result = await getPreviousTradingDay(client, '2026-07-06');
    expect(result).toBeNull();
  });

  it('不传 referenceDate 时应使用当天日期', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-06T00:00:00+08:00'));

    const client = createMockSdkClient({
      isTradingDay: async (date: string) => {
        return date === '2026-07-03';
      },
    });

    const result = await getPreviousTradingDay(client);
    expect(result).toBe('2026-07-03');

    vi.useRealTimers();
  });
});

// ==================== checkAndBackfill 测试 ====================

describe('checkAndBackfill 自动补跑', () => {
  let tmpDir: string;
  let messages: NotifyMessage[];

  beforeEach(() => {
    // 固定系统时间，确保测试确定性
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-06T00:00:00+08:00'));

    tmpDir = mkdtempSync(join(tmpdir(), 'autoBackfill-test-'));
    messages = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ===== 场景 1: 前一交易日无报告 =====

  it('前一交易日无报告时，应自动检测并补跑', async () => {
    // 模拟只有 2026-07-03（周五）是交易日
    const mockClient = createMockSdkClient({
      isTradingDay: async (date: string) => {
        return date === '2026-07-03';
      },
    });

    const mockNotifier: Notifier = {
      async send(msg: NotifyMessage) {
        messages.push(msg);
      },
    };

    // 执行自检与补跑
    const result = await checkAndBackfill({
      dataDir: tmpDir,
      sdkClient: mockClient,
      notifier: mockNotifier,
    });

    // 验证业务逻辑
    expect(result.checked).toBe(true);
    expect(result.previousTradingDay).toBe('2026-07-03');
    expect(result.reportExists).toBe(false);
    expect(result.backfillPerformed).toBe(true);
    expect(result.backfillSuccess).toBe(true);
    expect(result.error).toBeNull();

    // 验证报告文件已生成（runBackfill 会写入文件）
    const jsonPath = join(tmpDir, 'reports', '2026-07-03.json');
    const txtPath = join(tmpDir, 'reports', '2026-07-03.txt');
    expect(existsSync(jsonPath)).toBe(true);
    expect(existsSync(txtPath)).toBe(true);

    // 验证 JSON 报告内容
    const reportContent = JSON.parse(readFileSync(jsonPath, 'utf-8'));
    expect(reportContent.date).toBe('2026-07-03');
  });

  // ===== 场景 2: 前一交易日已有报告 =====

  it('前一交易日已有报告时，不应补跑', async () => {
    // 模拟只有 2026-07-03 是交易日
    const mockClient = createMockSdkClient({
      isTradingDay: async (date: string) => {
        return date === '2026-07-03';
      },
    });

    // 预先创建报告文件（模拟调度器已成功产出）
    const reportsDir = join(tmpDir, 'reports');
    mkdirSync(reportsDir, { recursive: true });
    writeFileSync(
      join(reportsDir, '2026-07-03.json'),
      JSON.stringify({ date: '2026-07-03' }),
      'utf-8',
    );

    const mockNotifier: Notifier = {
      async send(msg: NotifyMessage) {
        messages.push(msg);
      },
    };

    const result = await checkAndBackfill({
      dataDir: tmpDir,
      sdkClient: mockClient,
      notifier: mockNotifier,
    });

    // 验证未补跑
    expect(result.checked).toBe(true);
    expect(result.previousTradingDay).toBe('2026-07-03');
    expect(result.reportExists).toBe(true);
    expect(result.backfillPerformed).toBe(false);
    expect(result.backfillSuccess).toBe(true);
    expect(result.error).toBeNull();

    // 不应有通知（runBackfill 未被调用）
    expect(messages).toHaveLength(0);
  });

  // ===== 场景 3: 补跑完成后推送通知 =====

  it('补跑完成后应推送通知', async () => {
    const mockClient = createMockSdkClient({
      isTradingDay: async (date: string) => {
        return date === '2026-07-03';
      },
    });

    const mockNotifier: Notifier = {
      async send(msg: NotifyMessage) {
        messages.push(msg);
      },
    };

    await checkAndBackfill({
      dataDir: tmpDir,
      sdkClient: mockClient,
      notifier: mockNotifier,
    });

    // runBackfill 内部发送通知
    expect(messages).toHaveLength(1);

    const msg = messages[0];
    expect(msg.type).toBe('report_complete');
    expect(msg.title).toContain('2026-07-03');
    expect(msg.date).toBe('2026-07-03');
    expect(msg.metadata?.backfill).toBe(true);
  });

  // ===== 场景 4: 非交易日（周末/节假日） =====

  it('所有日期均为非交易日时，不应补跑并返回错误信息', async () => {
    // 所有日期都不是交易日（如长假期间）
    const mockClient = createMockSdkClient({
      isTradingDay: async () => false,
    });

    const mockNotifier: Notifier = {
      async send(msg: NotifyMessage) {
        messages.push(msg);
      },
    };

    const result = await checkAndBackfill({
      dataDir: tmpDir,
      sdkClient: mockClient,
      notifier: mockNotifier,
    });

    // 验证自检完成，但未补跑
    expect(result.checked).toBe(true);
    expect(result.previousTradingDay).toBeNull();
    expect(result.reportExists).toBe(false);
    expect(result.backfillPerformed).toBe(false);
    expect(result.backfillSuccess).toBe(false);
    expect(result.error).toContain('未能找到前一交易日');

    // 不应有通知（补跑未执行）
    expect(messages).toHaveLength(0);
  });

  // ===== 边界: 报告目录不存在 =====

  it('reports 目录不存在时也应正确处理', async () => {
    const mockClient = createMockSdkClient({
      isTradingDay: async (date: string) => {
        return date === '2026-07-03';
      },
    });

    const mockNotifier: Notifier = {
      async send(msg: NotifyMessage) { messages.push(msg); },
    };

    // reports 目录尚不存在
    const result = await checkAndBackfill({
      dataDir: tmpDir,
      sdkClient: mockClient,
      notifier: mockNotifier,
    });

    expect(result.reportExists).toBe(false);
    expect(result.backfillPerformed).toBe(true);
    expect(result.backfillSuccess).toBe(true);

    // runBackfill 会创建 reports 目录并写入文件
    const jsonPath = join(tmpDir, 'reports', '2026-07-03.json');
    expect(existsSync(jsonPath)).toBe(true);
  });
});
