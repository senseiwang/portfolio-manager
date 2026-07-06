/**
 * 边界情况捕获工具测试
 *
 * 覆盖：
 * - captureEdgeCase 正常保存
 * - captureEdgeCase 目录不存在时自动创建
 * - generateTestCaseTemplate 生成包含正确导入路径的测试模板
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  captureEdgeCase,
  generateTestCaseTemplate,
} from '../../src/cli/capture-edge-case';

/* ==============================================
 * captureEdgeCase
 * ============================================== */
describe('captureEdgeCase', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'capture-edge-case-test-'));
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('正常保存边界情况数据', () => {
    const filePath = captureEdgeCase(
      {
        source: 'batch.cn',
        rawData: [{ code: '000001', price: 10.5 }],
        description: '股价为负的异常情况',
        params: { market: 'cn' },
      },
      tmpDir,
    );

    // 文件应存在
    expect(existsSync(filePath)).toBe(true);

    // 文件应在 edge-cases 子目录中
    expect(filePath).toContain('edge-cases');

    // 文件名应包含 source 前缀
    const fileName = filePath.split('/').pop()!;
    expect(fileName).toMatch(/^batch\.cn-\d+\.json$/);

    // 文件内容验证
    const content = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(content.source).toBe('batch.cn');
    expect(content.description).toBe('股价为负的异常情况');
    expect(content.params).toEqual({ market: 'cn' });
    expect(content.rawData).toEqual([{ code: '000001', price: 10.5 }]);
    expect(content.capturedAt).toBeDefined();
    expect(() => new Date(content.capturedAt)).not.toThrow();
  });

  it('目录不存在时自动创建', () => {
    // 使用深层不存在的路径
    const nestedDir = join(tmpDir, 'a', 'b', 'c');

    const filePath = captureEdgeCase(
      {
        source: 'kline.cn',
        rawData: [],
        description: '空 K 线数组',
      },
      nestedDir,
    );

    // 目录应被自动创建
    expect(existsSync(join(nestedDir, 'edge-cases'))).toBe(true);
    // 文件应存在
    expect(existsSync(filePath)).toBe(true);

    // 清理
    rmSync(join(tmpDir, 'a'), { recursive: true, force: true });
  });

  it('source 中的特殊字符会被替换', () => {
    const filePath = captureEdgeCase(
      {
        source: 'batch.cn/min?x=1',
        rawData: null,
        description: '特殊字符测试',
      },
      tmpDir,
    );

    const fileName = filePath.split('/').pop()!;
    // 特殊字符应被替换为下划线
    expect(fileName).toMatch(/^batch\.cn_min_x_1-\d+\.json$/);
  });

  it('多个调用生成不同文件名（时间戳不同）', async () => {
    const p1 = captureEdgeCase(
      { source: 'test', rawData: 'a', description: 'first' },
      tmpDir,
    );
    // 确保时间戳不同
    await new Promise((r) => setTimeout(r, 5));
    const p2 = captureEdgeCase(
      { source: 'test', rawData: 'b', description: 'second' },
      tmpDir,
    );

    expect(p1).not.toBe(p2);
  });
});

/* ==============================================
 * generateTestCaseTemplate
 * ============================================== */
describe('generateTestCaseTemplate', () => {
  let tmpDir: string;
  let fixturePath: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'generate-template-test-'));
    fixturePath = captureEdgeCase(
      {
        source: 'fundFlow.individual',
        rawData: [{ date: '2026-07-06', mainNetInflow: 1e8 }],
        description: '资金流数据异常大额',
        params: { symbol: '000001', days: 20 },
      },
      tmpDir,
    );
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('生成的模板包含正确的导入路径', () => {
    const template = generateTestCaseTemplate(fixturePath);

    // 应包含 vitest 导入
    expect(template).toContain("import { describe, it, expect } from 'vitest'");
    expect(template).toContain("import { readFileSync } from 'fs'");
    expect(template).toContain("import path from 'path'");
  });

  it('生成的模板引用正确的 fixture 文件名', () => {
    const template = generateTestCaseTemplate(fixturePath);
    const fixtureFileName = fixturePath.split('/').pop()!;

    // 应包含正确的 fixture 文件路径引用
    expect(template).toContain(fixtureFileName);
    expect(template).toContain('edge-cases');
  });

  it('生成的模板包含 describe 块和 TODO 占位', () => {
    const template = generateTestCaseTemplate(fixturePath);

    expect(template).toContain("describe('");
    expect(template).toContain("it('should match expected structure'");
    expect(template).toContain('// TODO: 补充具体断言');
  });

  it('生成的模板是合法的 TypeScript 代码片段', () => {
    const template = generateTestCaseTemplate(fixturePath);

    // 检查代码结构完整性
    const lines = template.split('\n');
    expect(lines.length).toBeGreaterThan(5);
    // import 语句应当在文件顶部
    expect(lines[0]).toContain('import');
  });
});
