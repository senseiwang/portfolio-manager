/**
 * 数据与日志留存策略模块
 *
 * 清理 dataDir 下超过保留期的候选池缓存文件：
 * - 日报（reports/）永久保留
 * - 跟踪文件（tracking/）永久保留
 * - 候选池缓存（candidate-pool-*.json）超过 retentionDays 后归档压缩为 .json.gz
 * - 原始探测 fixture 等其他文件不清理
 * - 已归档的 .json.gz 文件不被重复处理
 *
 * 用法:
 *   npx tsx src/cli/cleanup.ts --data-dir=./data --dry-run
 *   npx tsx src/cli/cleanup.ts --data-dir=./data --force
 *   npx tsx src/cli/cleanup.ts --data-dir=./data --force --retention-days=60
 */
import { readdirSync, statSync, unlinkSync, existsSync } from 'fs';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { gzipSync } from 'zlib';
import { fileURLToPath } from 'url';

// ==================== 类型定义 ====================

export interface CleanupConfig {
  dataDir: string;
  /** 候选池缓存保留天数（默认 90） */
  candidatePoolRetentionDays: number;
  /** dry-run 模式：只报告不执行 */
  dryRun: boolean;
}

export interface CleanupResult {
  totalFilesScanned: number;
  filesArchived: number;
  filesDeleted: number;
  sizeFreedBytes: number;
  archivedFiles: string[];
  errors: string[];
  dryRun: boolean;
}

export interface ParsedArgs {
  dataDir: string;
  dryRun: boolean;
  force: boolean;
  retentionDays: number;
}

// ==================== CLI 参数解析 ====================

/**
 * 解析 CLI 参数
 */
export function parseCleanupArgs(args: string[]): ParsedArgs {
  let dataDir = 'data';
  let dryRun = false;
  let force = false;
  let retentionDays = 90;

  for (const arg of args) {
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--force') {
      force = true;
    } else if (arg.startsWith('--data-dir=')) {
      dataDir = arg.slice(11);
    } else if (arg.startsWith('--retention-days=')) {
      retentionDays = parseInt(arg.slice(17), 10);
      if (isNaN(retentionDays) || retentionDays < 1) {
        console.error('错误: --retention-days 必须为正整数');
        process.exit(1);
      }
    }
  }

  return { dataDir, dryRun, force, retentionDays };
}

// ==================== 工具函数 ====================

/**
 * 判断文件是否超过保留期
 *
 * 从文件名解析日期（格式：candidate-pool-YYYY-MM-DD.json），
 * 计算与当前日期的天数差，若超过 retentionDays 则返回 true。
 */
export function isExpired(filePath: string, retentionDays: number): boolean {
  const baseName = path.basename(filePath);
  const match = baseName.match(/^candidate-pool-(\d{4}-\d{2}-\d{2})\.json$/);
  if (!match) return false;

  const fileDate = new Date(match[1] + 'T00:00:00+08:00');
  const now = new Date();
  const diffMs = now.getTime() - fileDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays > retentionDays;
}

/**
 * 归档并压缩单个文件
 *
 * 1. 读取文件内容
 * 2. 用 gzipSync 压缩
 * 3. 写入 .json.gz 文件
 * 4. 删除原文件
 *
 * @returns 是否成功归档及释放的空间大小（原文件大小）
 */
export function archiveAndDelete(filePath: string): { archived: boolean; sizeSaved: number } {
  if (!existsSync(filePath)) {
    return { archived: false, sizeSaved: 0 };
  }

  const content = readFileSync(filePath);
  const compressed = gzipSync(content);
  const gzPath = filePath + '.gz';

  writeFileSync(gzPath, compressed);

  const stats = statSync(filePath);
  const sizeSaved = stats.size;

  unlinkSync(filePath);

  return { archived: true, sizeSaved };
}

/** 永久保留的子目录名 */
const PERMANENT_DIRS = ['reports', 'tracking'];

// ==================== 核心清理函数 ====================

/**
 * 执行数据清理
 *
 * 扫描 dataDir 下的所有文件，按策略分类处理：
 * - candidate-pool-*.json: 超过 retentionDays 的归档压缩并删除原文件
 * - reports/*.json, reports/*.txt: 永久保留（计数但不清理）
 * - tracking/*.json: 永久保留（计数但不清理）
 * - 其他文件（原始探测 fixture 等）: 跳过
 * - 已归档的 .json.gz: 跳过（不重复归档）
 *
 * @returns CleanupResult
 */
export function runCleanup(config: CleanupConfig): CleanupResult {
  const result: CleanupResult = {
    totalFilesScanned: 0,
    filesArchived: 0,
    filesDeleted: 0,
    sizeFreedBytes: 0,
    archivedFiles: [],
    errors: [],
    dryRun: config.dryRun,
  };

  if (!existsSync(config.dataDir)) {
    return result;
  }

  const entries = readdirSync(config.dataDir, { withFileTypes: true });

  // 第一遍：处理永久保留的子目录，计入扫描计数
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (PERMANENT_DIRS.includes(entry.name)) {
      const dirPath = path.join(config.dataDir, entry.name);
      try {
        const dirEntries = readdirSync(dirPath, { withFileTypes: true });
        for (const dirEntry of dirEntries) {
          if (dirEntry.isFile()) {
            result.totalFilesScanned++;
          }
        }
      } catch {
        // 无法读取的子目录跳过
      }
    }
  }

  // 第二遍：处理 dataDir 根目录下的文件
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    result.totalFilesScanned++;

    const filePath = path.join(config.dataDir, entry.name);

    // 跳过已归档的 .gz 文件（不被重复归档）
    if (entry.name.endsWith('.json.gz')) {
      continue;
    }

    // 只处理 candidate-pool-*.json
    if (entry.name.startsWith('candidate-pool-') && entry.name.endsWith('.json')) {
      if (isExpired(entry.name, config.candidatePoolRetentionDays)) {
        result.archivedFiles.push(entry.name);
        result.filesArchived++;
        result.filesDeleted++;

        if (!config.dryRun) {
          try {
            const { sizeSaved } = archiveAndDelete(filePath);
            result.sizeFreedBytes += sizeSaved;
          } catch (err) {
            result.errors.push(
              `归档失败 ${entry.name}: ${err instanceof Error ? err.message : String(err)}`,
            );
            // 回滚计数
            result.filesArchived--;
            result.filesDeleted--;
            result.archivedFiles.pop();
          }
        } else {
          // dry-run 模式下只估算大小
          try {
            const stats = statSync(filePath);
            result.sizeFreedBytes += stats.size;
          } catch {
            // 无法 stat 则跳过
          }
        }
      }
      // 未过期文件不做处理
      continue;
    }

    // 其他文件（原始探测 fixture 等）跳过
  }

  return result;
}

// ==================== CLI 入口 ====================

export function main(): void {
  const args = parseCleanupArgs(process.argv.slice(2));

  if (!args.force && !args.dryRun) {
    console.error('[cleanup] 请使用 --force 确认执行，或使用 --dry-run 预览');
    process.exit(1);
  }

  const config: CleanupConfig = {
    dataDir: args.dataDir,
    candidatePoolRetentionDays: args.retentionDays,
    dryRun: args.dryRun,
  };

  console.error(
    `[cleanup] dataDir: ${config.dataDir}, retention: ${config.candidatePoolRetentionDays}天, dryRun: ${config.dryRun}`,
  );

  const result = runCleanup(config);

  console.log(JSON.stringify(result, null, 2));

  if (result.errors.length > 0) {
    console.error('[cleanup] 清理完成，但有错误:');
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
  }

  process.exit(result.errors.length > 0 ? 1 : 0);
}

const __filename = fileURLToPath(import.meta.url);
const isMain =
  process.argv[1] === __filename ||
  process.argv[1]?.endsWith('/cleanup.ts') ||
  process.argv[1]?.endsWith('\\cleanup.ts');

if (isMain) {
  main();
}
