# Phase 1-6 测试完整性审计

> 生成日期：2026-07-06
> 由 T-7.1 自动化审计产出

---

## 1. 模块覆盖率报告

来源：`pnpm test -- --coverage`

### 总体概览

| 指标 | 值 |
|------|-----|
| Statements | 76.23% |
| Branches | 73.83% |
| Functions | 93.93% |
| Lines | 76.23% |

### 各模块覆盖率明细

| 模块 | Statements | Branches | Functions | Lines | 达标(≥85%) |
|------|-----------|---------|----------|-------|------------|
| **engine/** | **96.91%** | **81.05%** | **100%** | **96.91%** | ✅ |
| engine/signals/ | 91.66% | 77.16% | 100% | 91.66% | ✅ |
| engine/strategies/ | **81.04%** | **64.47%** | **94.73%** | **81.04%** | ❌ |
| **pipeline/** | **96.33%** | **72.34%** | **95.45%** | **96.33%** | ✅ |
| cli/ | **8.36%** | **80%** | **50%** | **8.36%** | ❌ |
| config/ | **67.18%** | **77.77%** | **50%** | **67.18%** | ❌ |
| data/ | **48.8%** | **100%** | **95%** | **48.8%** | ❌ |

### 未达标模块详情

#### cli/ (8.36%)
- `run-backtest.ts` (0%)：CLI 入口，仅在集成测试中覆盖
- `run-daily-report.ts` (0%)：CLI 入口，仅在集成测试中覆盖
- `schedule.ts` (100%)：✅ 已覆盖

#### config/ (67.18%)
- `loadConfig.ts` (52.27%)：文件不存在和设备路径错误分支未覆盖

#### data/ (48.8%)
- `sdkClient.ts` (16.42%)：真实 SDK 实现代码通过 mock 测试，全链路仅在实际运行中覆盖
- `board.ts` (0%)：完全未被测试覆盖

#### engine/strategies/ (81.04%)
- `stg04-northbound.ts` (69.47%)：边界条件分支未覆盖充分

---

## 2. Engine 层隔离检查

来源：`pnpm lint` + `grep -r "import.*stock-sdk" src/engine/`

### 检查结果

| 检查项 | 结果 |
|--------|------|
| ESLint 引擎隔离规则已配置 | ✅ 已配置 `no-restricted-imports` 禁止 `src/engine/` 导入 `stock-sdk` 主包 |
| `pnpm lint` 报错数 | **0 个** |

### Engine 层实际导入清单

| 文件 | 导入源 | 是否允许 |
|------|--------|---------|
| `src/engine/backtestRunner.ts` | `stock-sdk/screener` | ✅ subpath 纯计算模块 |
| `src/engine/screener.ts` | `stock-sdk/screener` | ✅ subpath 纯计算模块 |

**结论**：零违规。所有 engine 层导入仅使用 `stock-sdk/screener` 等 subpath 纯计算模块。

---

## 3. Mock & Fixture 一致性检查

来源：`test/types/sdk-fixtures.test.ts`

### 检查结果

| 检查项 | 结果 |
|--------|------|
| Fixture 文件总数 | 43 |
| Schema 映射数 | 43 |
| 覆盖率 | 100% — 每个 fixture 文件都有对应 Zod schema 验证 |
| 覆盖检查测试 | ✅ 通过（`unmapped` 和 `extraMappings` 均为空数组） |
| 逐一验证测试 | ✅ 43/43 全部通过 |
| 数据完整性检查 | ✅ 通过 |

### 已验证的 Fixture 文件列表

```
标量：       sdk_calendar_isTradingDay, sdk_calendar_marketStatus,
            sdk_calendar_nextTradingDay, sdk_calendar_prevTradingDay
字符串数组：  sdk_codes_cn
行情：       sdk.batch.cn, sdk_batch_byCodes, sdk_quotes_cn,
            sdk_quotes_cnSimple, sdk_quotes_hk
K 线/分时：  sdk.kline.cn, sdk_kline_cnMinute, sdk_quotes_timeline
资金流向：   sdk_fundFlow_individual, sdk_fundFlow_market,
            sdk_fundFlow_sectorHistory
北向资金：   sdk_northbound_summary, sdk_northbound_minute,
            sdk_northbound_holdingRank, sdk_northbound_history,
            sdk_northbound_individual
市场事件：   sdk_marketEvent_ztPool, sdk_marketEvent_stockChanges,
            sdk_marketEvent_boardChanges
龙虎榜：     sdk_dragonTiger_detail, sdk_dragonTiger_seatDetail
大宗交易：   sdk_blockTrade_marketStat, sdk_blockTrade_detail
融资融券：   sdk_margin_accountInfo, sdk_margin_targetList
板块：       sdk_board_industry_list, sdk_board_concept_list,
            sdk_board_industry_spot, sdk_board_concept_spot,
            sdk_board_industry_constituents, sdk_board_industry_kline
基金：       sdk_fund_profile, sdk_fund_dividendList
参考数据：   sdk_reference_dividendDetail
搜索：       sdk_search
信号/回测：  calcSignals.sample, backtest.sample, screen.sample
```

---

## 总结

### 通过项
- ✅ Engine 层隔离规则：零违规
- ✅ Fixture 一致性：43/43 完全覆盖

### 待改进项
- ⚠️ cli/ 覆盖率低（8.36%）— CLI 文件将在 T-7.2 全链路测试中获得覆盖
- ⚠️ data/ 覆盖率低（48.8%）— sdkClient.ts 和 board.ts 缺少测试
- ⚠️ engine/strategies/ 低于 85%（81.04%）— 主要是 stg04-northbound.ts 边界分支
- ⚠️ config/ 低于 85%（67.18%）— loadConfig.ts 错误处理分支
