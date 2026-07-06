/**
 * 边界情况捕获工具
 *
 * 在实盘运行中遇到 mock 未覆盖的异常数据时，
 * 用此工具快速保存原始响应到 fixture 目录。
 */
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';

export interface EdgeCaseCaptureInput {
  /** 数据来源方法名，如 batch.cn、kline.cn */
  source: string;
  /** 原始响应数据 */
  rawData: unknown;
  /** 问题描述 */
  description: string;
  /** 触发参数 */
  params?: Record<string, unknown>;
}

/**
 * 保存边界情况到 fixture 目录
 *
 * 文件名自动生成：edge-cases/{source}-{timestamp}.json
 *
 * @param input        - 边界情况捕获输入
 * @param fixturesDir  - fixture 根目录，默认 'test/fixtures/raw'
 * @returns 写入的文件绝对路径
 */
export function captureEdgeCase(
  input: EdgeCaseCaptureInput,
  fixturesDir?: string,
): string {
  const dir = fixturesDir ?? 'test/fixtures/raw';
  const edgeCasesDir = path.resolve(dir, 'edge-cases');

  // 确保目录存在
  if (!existsSync(edgeCasesDir)) {
    mkdirSync(edgeCasesDir, { recursive: true });
  }

  // 生成唯一文件名
  const timestamp = Date.now();
  const safeSource = input.source.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const fileName = `${safeSource}-${timestamp}.json`;
  const filePath = path.join(edgeCasesDir, fileName);

  // 写入 JSON
  const payload = {
    capturedAt: new Date().toISOString(),
    source: input.source,
    description: input.description,
    params: input.params ?? {},
    rawData: input.rawData,
  };

  writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');

  return filePath;
}

/**
 * 从捕获的 fixture 创建单元测试模板
 *
 * @param fixturePath - 捕获的 fixture 文件绝对路径
 * @returns 可复制到测试文件的 vitest 测试代码模板字符串
 */
export function generateTestCaseTemplate(fixturePath: string): string {
  const fixtureFileName = path.basename(fixturePath);

  // 推断测试名：移除后缀 + 驼峰转空格
  const testName = fixtureFileName
    .replace(/\.json$/, '')
    .replace(/[-_]/g, ' ');

  return [
    `import { describe, it, expect } from 'vitest';`,
    `import { readFileSync } from 'fs';`,
    `import path from 'path';`,
    ``,
    `const FIXTURE = path.resolve(__dirname, '..', 'fixtures', 'raw', 'edge-cases', '${fixtureFileName}');`,
    ``,
    `describe('${testName}', () => {`,
    `  it('should match expected structure', () => {`,
    `    const raw = JSON.parse(readFileSync(FIXTURE, 'utf-8'));`,
    `    expect(raw.source).toBeDefined();`,
    `    expect(raw.rawData).toBeDefined();`,
    `    // TODO: 补充具体断言`,
    `  });`,
    `});`,
    ``,
  ].join('\n');
}
