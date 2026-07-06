/**
 * SDK 真实响应探测脚本
 * 依次调用 stock-sdk 的每个命名空间方法，将原始返回结果落盘到 test/fixtures/raw/
 *
 * 用法: npx tsx scripts/probe-sdk.ts
 *
 * 注意: 本脚本需要联网，且应在交易时段或临近交易日执行以获得真实数据。
 */
import { StockSDK } from 'stock-sdk';
import { calcSignals } from 'stock-sdk/signals';
import { backtest, screen } from 'stock-sdk/screener';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ===== 路径设置 =====
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FIXTURES_DIR = path.join(ROOT, 'test', 'fixtures', 'raw');
const DECISIONS_DIR = path.join(ROOT, 'docs', 'decisions');

// ===== 确保输出目录存在 =====
for (const dir of [FIXTURES_DIR, DECISIONS_DIR]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// ===== SDK 实例 =====
const sdk = new StockSDK();

// ===== 测试参数 =====
const STOCK_CODE = '600519';   // 贵州茅台
const STOCK_HK = '00700';      // 腾讯控股
const STOCK_US = 'AAPL';       // Apple
const INDEX_CODE = 'sh000001'; // 上证指数
const BOARD_CODE = 'BK0477';   // 酿酒行业板块
const CONCEPT_CODE = 'BK0896'; // 白酒概念
const TODAY = '2026-07-06';
const FUND_CODE = '000001';    // 混合基金

// ===== 统计 =====
interface ProbeResult {
  method: string;
  status: 'ok' | 'fail';
  file?: string;
  error?: string;
}
const results: ProbeResult[] = [];
let fieldReportLines: string[] = [];

// ===== 工具函数 =====
function saveFixture(name: string, data: unknown): string {
  const filePath = path.join(FIXTURES_DIR, `${name}.json`);
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  return filePath;
}

function recordOk(method: string, fixtureName: string) {
  results.push({ method, status: 'ok', file: fixtureName });
  console.log(`  ✅ ${method} → ${fixtureName}.json`);
}

function recordFail(method: string, error: unknown) {
  const msg = String(error instanceof Error ? error.message : error);
  results.push({ method, status: 'fail', error: msg });
  console.error(`  ❌ ${method}: ${msg}`);
}

/** 安全地执行探测，自动保存结果 */
async function probe(
  method: string,
  fn: () => Promise<unknown> | unknown,
): Promise<void> {
  try {
    const result = await fn();
    const fixtureName = method.replace(/\./g, '_');
    saveFixture(fixtureName, result);
    recordOk(method, fixtureName);
  } catch (err) {
    recordFail(method, err);
  }
}

// ===== 主探测流程 =====
async function main() {
  console.log('=== Stock SDK 真实响应探测 ===\n');
  console.log(`日期: ${TODAY}\n`);

  // ---- 1. 实时行情 ----
  console.log('\n--- sdk.quotes ---');
  // 注意：quotes.cn/cnSimple 需要带市场前缀的代码数组，如 ['sh600519']
  await probe('sdk.quotes.cn', () => sdk.quotes.cn(['sh600519', 'sz000001', 'sz000333']));
  await probe('sdk.quotes.cnSimple', () => sdk.quotes.cnSimple(['sh600519', 'sh000001']));
  await probe('sdk.quotes.hk', () => sdk.quotes.hk(['00700']));
  // await probe('sdk.quotes.us', () => sdk.quotes.us()); // US market may not work from CN
  await probe('sdk.quotes.timeline', () => sdk.quotes.timeline('sh600519'));

  // ---- 2. 代码列表 ----
  console.log('\n--- sdk.codes ---');
  await probe('sdk.codes.cn', () => sdk.codes.cn({ market: 'sh' }));

  // ---- 3. 批量行情 ----
  console.log('\n--- sdk.batch ---');
  const batchResult = await sdk.batch.cn();
  saveFixture('sdk.batch.cn', batchResult);
  recordOk('sdk.batch.cn', 'sdk.batch.cn');

  // 分析 batch.cn 的返回字段
  if (Array.isArray(batchResult) && batchResult.length > 0) {
    const firstItem = batchResult[0];
    const fields = Object.keys(firstItem as Record<string, unknown>);
    fieldReportLines.push('# sdk.batch.cn() 返回字段清单\n');
    fieldReportLines.push(`采样股票: ${(firstItem as Record<string, unknown>).code || 'unknown'}\n`);
    fieldReportLines.push(`返回数组长度: ${batchResult.length}\n`);
    fieldReportLines.push('| 字段名 | 示例值 | 类型 |\n');
    fieldReportLines.push('|--------|--------|------|\n');
    for (const key of fields) {
      const val = (firstItem as Record<string, unknown>)[key];
      const type = val === null ? 'null' : Array.isArray(val) ? 'array' : typeof val;
      const sample = val !== undefined && val !== null ? JSON.stringify(val).slice(0, 60) : 'null';
      fieldReportLines.push(`| ${key} | ${sample} | ${type} |\n`);
    }

    // 特别关注候选池过滤需要的字段
    const importantFields = ['pe', 'circulatingMarketCap', 'turnoverRate', 'avgAmount',
      'totalMarketCap', 'marketCap', 'circulating_cap', 'totalAmount', 'amount'];
    fieldReportLines.push('\n## 候选池关键字段检查\n\n');
    for (const f of importantFields) {
      if (f in (firstItem as Record<string, unknown>)) {
        fieldReportLines.push(`- ✅ \`${f}\` = ${JSON.stringify((firstItem as Record<string, unknown>)[f])}\n`);
      } else {
        fieldReportLines.push(`- ❌ \`${f}\` 不存在\n`);
      }
    }
  }

  await probe('sdk.batch.byCodes', () => sdk.batch.byCodes([STOCK_CODE, '000001', '000333']));

  // ---- 4. K 线 ----
  console.log('\n--- sdk.kline ---');
  const klineResult = await sdk.kline.cn(STOCK_CODE, { period: 'daily', from: '2026-06-01', to: TODAY });
  saveFixture('sdk.kline.cn', klineResult);
  recordOk('sdk.kline.cn', 'sdk.kline.cn');

  await probe('sdk.kline.cnMinute', () =>
    sdk.kline.cnMinute(STOCK_CODE, { period: '1' }));

  // ---- 5. 板块 ----
  console.log('\n--- sdk.board ---');
  await probe('sdk.board.industry.list', () => sdk.board.industry.list());
  await probe('sdk.board.industry.spot', () => sdk.board.industry.spot(BOARD_CODE));
  await probe('sdk.board.industry.constituents', () => sdk.board.industry.constituents(BOARD_CODE));
  await probe('sdk.board.industry.kline', () =>
    sdk.board.industry.kline(BOARD_CODE, { period: 'daily', from: '2026-06-01', to: TODAY }));

  await probe('sdk.board.concept.list', () => sdk.board.concept.list());
  await probe('sdk.board.concept.spot', () => sdk.board.concept.spot(CONCEPT_CODE));

  // ---- 6. 资金流向 ----
  console.log('\n--- sdk.fundFlow ---');
  await probe('sdk.fundFlow.individual', () =>
    sdk.fundFlow.individual(STOCK_CODE, { days: 20 }));
  await probe('sdk.fundFlow.market', () => sdk.fundFlow.market());
  await probe('sdk.fundFlow.rank', () => sdk.fundFlow.rank({ days: 5, limit: 50 }));
  await probe('sdk.fundFlow.sectorRank', () => sdk.fundFlow.sectorRank({ days: 5, limit: 10 }));
  await probe('sdk.fundFlow.sectorHistory', () =>
    sdk.fundFlow.sectorHistory(BOARD_CODE, { days: 20 }));

  // ---- 7. 北向资金 ----
  console.log('\n--- sdk.northbound ---');
  await probe('sdk.northbound.minute', () => sdk.northbound.minute());
  await probe('sdk.northbound.summary', () => sdk.northbound.summary());
  await probe('sdk.northbound.holdingRank', () => sdk.northbound.holdingRank({ limit: 20 }));
  await probe('sdk.northbound.history', () =>
    sdk.northbound.history('north', { from: '2026-06-01', to: TODAY }));
  await probe('sdk.northbound.individual', () =>
    sdk.northbound.individual(STOCK_CODE, { days: 20 }));

  // ---- 8. 市场事件（涨停/异动） ----
  console.log('\n--- sdk.marketEvent ---');
  await probe('sdk.marketEvent.ztPool', () => sdk.marketEvent.ztPool());
  await probe('sdk.marketEvent.stockChanges', () => sdk.marketEvent.stockChanges());
  await probe('sdk.marketEvent.boardChanges', () => sdk.marketEvent.boardChanges());

  // ---- 9. 龙虎榜 ----
  console.log('\n--- sdk.dragonTiger ---');
  await probe('sdk.dragonTiger.detail', () => sdk.dragonTiger.detail({ date: TODAY }));
  await probe('sdk.dragonTiger.seatDetail', () =>
    sdk.dragonTiger.seatDetail(STOCK_CODE, TODAY));

  // ---- 10. 大宗交易 ----
  console.log('\n--- sdk.blockTrade ---');
  await probe('sdk.blockTrade.marketStat', () => sdk.blockTrade.marketStat({ date: TODAY }));
  await probe('sdk.blockTrade.detail', () => sdk.blockTrade.detail({ date: TODAY, limit: 20 }));

  // ---- 11. 融资融券 ----
  console.log('\n--- sdk.margin ---');
  await probe('sdk.margin.targetList', () => sdk.margin.targetList());
  await probe('sdk.margin.accountInfo', () => sdk.margin.accountInfo(STOCK_CODE));

  // ---- 12. 交易日历 ----
  console.log('\n--- sdk.calendar ---');
  await probe('sdk.calendar.isTradingDay', () => sdk.calendar.isTradingDay(TODAY));
  await probe('sdk.calendar.nextTradingDay', () => sdk.calendar.nextTradingDay(TODAY));
  await probe('sdk.calendar.prevTradingDay', () => sdk.calendar.prevTradingDay(TODAY));
  // marketStatus 是同步方法
  await probe('sdk.calendar.marketStatus', () => sdk.calendar.marketStatus());

  // ---- 13. 参考数据 ----
  console.log('\n--- sdk.reference ---');
  await probe('sdk.reference.dividendDetail', () => sdk.reference.dividendDetail(STOCK_CODE));

  // ---- 14. 公募基金 ----
  console.log('\n--- sdk.fund ---');
  await probe('sdk.fund.profile', () => sdk.fund.profile(FUND_CODE));
  await probe('sdk.fund.dividendList', () => sdk.fund.dividendList(FUND_CODE));

  // ---- 15. 搜索 ----
  console.log('\n--- sdk.search ---');
  await probe('sdk.search', () => sdk.search(STOCK_CODE));

  // ===== 16. calcSignals 探测 =====
  console.log('\n--- calcSignals (stock-sdk/signals) ---');
  try {
    if (Array.isArray(klineResult) && klineResult.length > 20) {
      const signalsResult = calcSignals(klineResult as unknown as Parameters<typeof calcSignals>[0]);
      const fixtureName = 'calcSignals.sample';
      saveFixture(fixtureName, signalsResult);
      recordOk('calcSignals', fixtureName);

      // 描述返回结构
      const signalDesc: string[] = [];
      signalDesc.push('# calcSignals() 返回结构分析\n\n');
      if (Array.isArray(signalsResult)) {
        signalDesc.push(`返回类型: 数组，长度 ${signalsResult.length}\n\n`);
        if (signalsResult.length > 0) {
          signalDesc.push('### 第一个元素字段：\n\n');
          const first = signalsResult[0] as Record<string, unknown>;
          for (const key of Object.keys(first)) {
            const val = first[key];
            const t = Array.isArray(val) ? 'array' : typeof val;
            signalDesc.push(`- \`${key}\`: ${t} = ${JSON.stringify(val).slice(0, 80)}\n`);
          }
        }
      } else {
        signalDesc.push(`返回类型: ${typeof signalsResult}\n`);
        signalDesc.push(`值: ${JSON.stringify(signalsResult).slice(0, 200)}\n`);
      }
      writeFileSync(path.join(DECISIONS_DIR, 'T-0.2-calcSignals-fields.md'), signalDesc.join(''), 'utf-8');
      console.log('  📝 calcSignals 字段描述已写入 T-0.2-calcSignals-fields.md');
    } else {
      recordFail('calcSignals', 'K 线数据不足（需要 >20 根）');
    }
  } catch (err) {
    recordFail('calcSignals', err);
  }

  // ===== 17. backtest 探测 =====
  console.log('\n--- backtest (stock-sdk/screener) ---');
  try {
    if (Array.isArray(klineResult) && klineResult.length > 20) {
      // 用最简单的"永远持有"策略
      const btResult = backtest({
        klines: klineResult as unknown as Parameters<typeof backtest>[0]['klines'],
        strategy: () => ({ action: 'hold' as const }),
        initialCapital: 1000000,
        fee: 0.0003,
        getClose: (bar: unknown) => {
          const b = bar as Record<string, unknown>;
          return typeof b.close === 'number' ? b.close :
                 typeof b.close === 'string' ? parseFloat(b.close) : null;
        },
      });
      const fixtureName = 'backtest.sample';
      saveFixture(fixtureName, btResult);
      recordOk('backtest', fixtureName);

      // 描述返回结构
      const btDesc: string[] = [];
      btDesc.push('# backtest() 返回结构分析\n\n');
      const bt = btResult as Record<string, unknown>;
      for (const key of Object.keys(bt)) {
        const val = bt[key];
        const t = Array.isArray(val) ? 'array' : typeof val;
        const sample = t === 'array'
          ? `length=${(val as unknown[]).length}`
          : JSON.stringify(val).slice(0, 80);
        btDesc.push(`- \`${key}\`: ${t} = ${sample}\n`);
      }
      writeFileSync(path.join(DECISIONS_DIR, 'T-0.2-backtest-fields.md'), btDesc.join(''), 'utf-8');
      console.log('  📝 backtest 字段描述已写入 T-0.2-backtest-fields.md');
    } else {
      recordFail('backtest', 'K 线数据不足');
    }
  } catch (err) {
    recordFail('backtest', err);
  }

  // ===== 18. screen 探测 =====
  console.log('\n--- screen (stock-sdk/screener) ---');
  try {
    const testData = [
      { code: '600519', price: 1500, pe: 30 },
      { code: '000001', price: 10, pe: 5 },
      { code: '000333', price: 60, pe: 12 },
    ];
    // screen() 链式调用：.top(n) 返回 T[]（不是 builder），所以不能 .top().toArray()
    const screened = screen(testData)
      .where(item => item.pe < 15)
      .sortBy(item => item.price)
      .top(2);
    saveFixture('screen.sample', { input: testData, result: screened });
    recordOk('screen', 'screen.sample');
  } catch (err) {
    recordFail('screen', err);
  }

  // ===== 生成汇总报告 =====
  console.log('\n\n=== 探测汇总 ===\n');
  const successCount = results.filter(r => r.status === 'ok').length;
  const failCount = results.filter(r => r.status === 'fail').length;
  console.log(`总计: ${results.length} | ✅ 成功: ${successCount} | ❌ 失败: ${failCount}\n`);

  // 写入失败记录
  const failures = results.filter(r => r.status === 'fail');
  if (failures.length > 0) {
    const failDoc = ['# SDK 探测失败记录\n\n', '| 方法 | 错误 |\n', '|------|------|\n'];
    for (const f of failures) {
      failDoc.push(`| ${f.method} | ${f.error} |\n`);
    }
    writeFileSync(path.join(DECISIONS_DIR, 'T-0.2-failures.md'), failDoc.join(''), 'utf-8');
    console.log(`📝 失败记录已写入 T-0.2-failures.md`);
  } else {
    // 写入空失败记录
    writeFileSync(path.join(DECISIONS_DIR, 'T-0.2-failures.md'),
      '# SDK 探测失败记录\n\n所有方法调用均成功，无失败记录。\n', 'utf-8');
  }

  // 写入字段分析报告
  writeFileSync(path.join(DECISIONS_DIR, 'T-0.2-fields.md'), fieldReportLines.join(''), 'utf-8');
  console.log('📝 字段分析已写入 T-0.2-fields.md');

  console.log('\n=== 探测完成 ===');
}

main().catch(err => {
  console.error('探测脚本异常退出:', err);
  process.exit(1);
});
