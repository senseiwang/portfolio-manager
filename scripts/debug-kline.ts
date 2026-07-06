/**
 * 候选池过滤问题调试
 * 检查 klineFilter 为什么过滤掉所有股票
 */
import { createSdkClient } from '../src/data/sdkClient';
import { StockSDK } from 'stock-sdk';
import { quickFilter, klineFilter } from '../src/engine/screener';
import type { CandidateWithKLine } from '../src/engine/screener';

async function main() {
  const client = createSdkClient();

  // 1. 获取行情
  const allQuotes = await client.getAllQuotes();
  console.log('全市场:', allQuotes.length);

  // 2. quickFilter
  const stage1 = quickFilter(allQuotes);
  console.log('quickFilter后:', stage1.length);

  // 3. 取前 10 只测试 K 线
  const samples = stage1.slice(0, 10);
  const withKlines: CandidateWithKLine[] = [];

  for (const q of samples) {
    const klines = await client.getKLine(q.code, '2026-01-01', '2026-07-06');
    console.log(`${q.code} ${q.name}: K线=${klines.length}`);
    withKlines.push({ quote: q, klines });
  }

  // 4. 测试 klineFilter
  const passed = klineFilter(withKlines);
  console.log('\nklineFilter通过:', passed.length, '/', withKlines.length);

  // 5. 分析每只被过滤的原因
  for (const { quote, klines } of withKlines) {
    const reasons: string[] = [];
    if (klines.length < 60) reasons.push(`K线不足(${klines.length}<60)`);

    if (klines.length >= 20) {
      const recent20 = klines.slice(-20);
      const avgAmount = recent20.reduce((s, k) => s + k.amount, 0) / recent20.length / 10000;
      const avgAmp = recent20.reduce((s, k) => s + (k.amplitude ?? 0), 0) / recent20.length;

      if (avgAmount < 1) reasons.push(`成交额低(${(avgAmount).toFixed(2)}万<1亿)`);
      if (avgAmp > 10) reasons.push(`振幅大(${avgAmp.toFixed(2)}>10)`);
    }

    if (klines.length >= 5) {
      const recent5 = klines.slice(-5);
      const limitUp = recent5.filter(k => (k.changePercent ?? 0) >= 9.5).length;
      if (limitUp > 3) reasons.push(`涨停多(${limitUp}>3)`);
    }

    console.log(`  ${quote.code} ${quote.name}: ${reasons.length > 0 ? reasons.join('; ') : '通过'}`);
  }

  // 6. 测试日期格式
  console.log('\n=== 测试日期格式 ===');
  const sdk = new StockSDK();
  const k1 = await sdk.kline.cn('600519', { period: 'daily', startDate: '20260101', endDate: '20260706' });
  console.log('YYYYMMDD格式 K线:', k1.length);
  const k2 = await sdk.kline.cn('600519', { period: 'daily', startDate: '2026-01-01', endDate: '2026-07-06' });
  console.log('YYYY-MM-DD格式 K线:', k2.length);
  const k3 = await sdk.kline.cn('sh600519', { period: 'daily', startDate: '20260101', endDate: '20260706' });
  console.log('sh+YYYYMMDD K线:', k3.length);
}

main().catch(err => { console.error(err); process.exit(1); });
