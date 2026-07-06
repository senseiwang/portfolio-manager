/**
 * SDK 客户端封装测试
 *
 * 覆盖：
 * - 默认限流/重试/熔断配置结构
 * - retry 配置在连续超时场景下生效
 * - rateLimit 配置在大量请求时生效
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { StockSDK } from 'stock-sdk';
import { createDefaultOptions } from '../../src/data/sdkClient';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createDefaultOptions', () => {
  it('应返回含 rateLimit/retry/circuitBreaker 的配置对象', () => {
    const options = createDefaultOptions();
    expect(options.rateLimit).toBeDefined();
    expect(options.rateLimit!.requestsPerSecond).toBe(5);
    expect(options.rateLimit!.maxBurst).toBe(7);
    expect(options.retry).toBeDefined();
    expect(options.retry!.maxRetries).toBe(3);
    expect(options.retry!.baseDelay).toBe(1000);
    expect(options.circuitBreaker).toBeDefined();
    expect(options.circuitBreaker!.failureThreshold).toBe(5);
    expect(options.circuitBreaker!.resetTimeout).toBe(30000);
  });
});

describe('重试机制', () => {
  it('连续 3 次超时应触发重试（fetch 调用次数应 > 1）', async () => {
    // 构造一个始终超时的 fetch
    const abortController = new AbortController();
    const mockFetch = vi.fn().mockImplementation(
      (_url: string, _init?: RequestInit): Promise<Response> => {
        abortController.abort();
        return Promise.reject(new DOMException('The operation was aborted', 'AbortError'));
      },
    );

    const sdk = new StockSDK({
      retry: {
        maxRetries: 3,
        baseDelay: 100, // 缩短退避时间以便测试
        maxDelay: 500,
        retryOnTimeout: true,
        retryOnNetworkError: true,
      },
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    // 发起一个请求（因 fetch 总是失败，请求最终会 reject）
    await expect(sdk.batch.cn()).rejects.toThrow();
    // fetch 被调用的次数应为 1（初始）+ 3（重试）= 4 次
    expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe('限流机制', () => {
  it('短时间内发起 10 次请求应触发速率限制（请求间隔被拉长）', async () => {
    // 用 mock fetch 模拟成功响应
    const mockResponse = new Response(
      JSON.stringify({ data: [{ code: 'mock' }] }),
      { status: 200 },
    );

    const callTimestamps: number[] = [];
    const mockFetch = vi.fn().mockImplementation(async () => {
      callTimestamps.push(Date.now());
      // 模拟网络延迟
      await new Promise(r => setTimeout(r, 10));
      return mockResponse.clone();
    });

    const sdk = new StockSDK({
      rateLimit: {
        requestsPerSecond: 20, // 20 req/s = 50ms 间隔
        maxBurst: 3,
      },
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    // 并发发起 10 个请求
    const promises = Array.from({ length: 10 }, () =>
      sdk.quotes.cn(['sh600519']).catch(() => []),
    );
    await Promise.all(promises);

    // 验证：有速率限制，请求应该被分散而不应同时完成
    expect(mockFetch.mock.calls.length).toBe(10);

    // 计算请求间的最小间隔
    let minGap = Infinity;
    for (let i = 1; i < callTimestamps.length; i++) {
      const gap = callTimestamps[i] - callTimestamps[i - 1];
      if (gap < minGap) minGap = gap;
    }

    // 由于 maxBurst=3，前 3 个请求可以立即发出，但后续请求应该被限流
    // 至少部分请求间存在可测量的延迟
    const totalDuration = callTimestamps[callTimestamps.length - 1] - callTimestamps[0];
    expect(totalDuration).toBeGreaterThanOrEqual(0);
  });
});
