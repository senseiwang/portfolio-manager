/**
 * 实盘连接快速测试
 * 验证 stock-sdk 是否能成功获取持仓股票的最新行情
 */
import { StockSDK } from 'stock-sdk';
import { createSdkClient } from '../src/data/sdkClient';

async function main() {
  // 测试 1：直接 SDK 调用
  console.log('=== 测试 1: 直接 SDK 行情查询 ===');
  const sdk = new StockSDK();
  const codes = ['518880', '513300', '159915', '588080', '159325', '600226', '601288', '513390', '002600'];
  const data = await sdk.batch.byCodes(codes);
  console.log(`成功获取 ${data.length} 只股票行情`);
  for (const q of data) {
    console.log(`  ${q.code} ${q.name}  现价: ${q.price}  涨幅: ${q.changePercent}%  换手: ${q.turnoverRate}%`);
  }

  // 测试 2：通过 sdkClient 封装
  console.log('\n=== 测试 2: 通过 SdkClient 封装 ===');
  const client = createSdkClient();
  const allQuotes = await client.getAllQuotes();
  console.log(`全市场 A 股: ${allQuotes.length} 只`);

  const hkQuotes = await client.getQuotesByCodes(codes);
  console.log(`按代码查询: ${hkQuotes.length} 只`);

  // 测试 3：资金流
  console.log('\n=== 测试 3: 市场资金流 ===');
  const marketFlow = await client.getMarketFundFlow();
  if (marketFlow.length > 0) {
    const m = marketFlow[marketFlow.length - 1];
    console.log(`大盘主力净流入: ${(m.mainNetInflow / 1e8).toFixed(2)} 亿`);
  }

  // 测试 4：日历
  console.log('\n=== 测试 4: 交易日历 ===');
  const isTrading = await client.isTradingDay('2026-07-06');
  const prevDay = await client.nextTradingDay('2026-07-03');
  console.log(`2026-07-06 是否交易日: ${isTrading}`);
  console.log(`2026-07-03 下一交易日: ${prevDay}`);

  // 测试 5：K 线（上周五 = 2026-07-03）
  console.log('\n=== 测试 5: 个股 K 线 ===');
  const kline = await client.getKLine('518880', '2026-06-01', '2026-07-03');
  console.log(`518880 黄金ETF K线数: ${kline.length}`);
  if (kline.length > 0) {
    const last = kline[kline.length - 1];
    console.log(`  最新 K 线: ${last.date} O:${last.open} C:${last.close} H:${last.high} L:${last.low} V:${last.volume}`);
  }

  // 测试 6：代码格式探测
  console.log('\n=== 测试 6: 代码格式探测 ===');
  const testCodes = [
    '518880', 'sh518880',
    '600519', 'sh600519',
    '513300', 'sh513300',
    '159915', 'sz159915',
    '588080', 'sh588080',
    '159325', 'sz159325',
    '513390', 'sh513390',
    '601288', 'sh601288',
    '600226', 'sh600226',
    '002600', 'sz002600',
  ];
  for (const code of testCodes) {
    try {
      const d = await sdk.batch.byCodes([code]);
      if (d.length > 0) {
        console.log(`  ${code} → ${d[0].name} 价格:${d[0].price}`);
      } else {
        console.log(`  ${code} → 无数据`);
      }
    } catch {
      console.log(`  ${code} → 请求失败`);
    }
  }

  // === 调试：K 线字段值 ===
  console.log('\n=== 调试: K 线字段值 ===');
  const klines2 = await sdk.kline.cn('sh600519', { period: 'daily', startDate: '2026-06-01', endDate: '2026-07-06' });
  console.log('K线数:', klines2.length);
  if (klines2.length > 0) {
    const k = klines2[klines2.length - 1] as any;
    console.log('最近K线字段:', Object.keys(k).join(', '));
    console.log('amount:', k.amount, '(元)');
    console.log('amplitude:', k.amplitude);
    console.log('changePercent:', k.changePercent);
    const recent5 = klines2.slice(-5) as any[];
    console.log('近5日amount:', recent5.map((k: any) => k.amount));
    console.log('近5日amplitude:', recent5.map((k: any) => k.amplitude));
    const avgAmount = recent5.reduce((s: number, k: any) => s + k.amount, 0) / recent5.length / 10000;
    const avgAmp = recent5.reduce((s: number, k: any) => s + (k.amplitude ?? 0), 0) / recent5.length;
    console.log('avgAmount(万元):', avgAmount, '(需>=1亿即10000万)');
    console.log('avgAmplitude:', avgAmp, '(需<=10)');
    console.log('minListedDays(≥60):', klines2.length >= 60);
    console.log('minAvgAmount(≥1):', avgAmount >= 1);
    console.log('maxAmplitude(≤10):', avgAmp <= 10);
  }

  console.log('\n=== 全部测试通过 ===');
}

main().catch(err => {
  console.error('实盘连接失败:', err.message);
  process.exit(1);
});
