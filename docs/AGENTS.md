# Portfolio Manager — Agent Handoff Document

> 本文档用于在 AI 对话之间传递项目上下文。
> 新对话的 agent 阅读本文档后应能快速理解项目所有重要信息并接手开发。

---

## 1. 项目身份

| 属性 | 值 |
|------|-----|
| 项目名称 | portfolio-manager |
| 物理路径 | `/Users/simon/myLocalProjects/portfolio-manager` |
| 语言 | TypeScript 5.x |
| 运行时 | Node.js 18+ |
| 包管理器 | pnpm 10.x |
| 测试框架 | Vitest 2.x |
| SDK 依赖 | `stock-sdk`（本地 monorepo 引用 `file:../stock-sdk`，v2 命名空间 API） |
| 关键外部依赖 | `zod`（schema 校验）、`js-yaml`（配置）、`node-cron`（调度） |
| 当前阶段 | **全部 9 个 Phase 已完成，处于生产就绪状态** |

---

## 2. 核心架构

### 三层分层（严格禁止跨层调用）

```
src/data/      唯一允许调用 stock-sdk 的层 → 网络请求
src/engine/    纯计算层，禁止 import stock-sdk 主包 → 指标/信号/策略/回测/评分
src/pipeline/  编排层，组合 data + engine 为业务流程
```

**ESLint 规则**（`eslint.config.js`）强制执行：`src/engine/` 下任何文件导入 `stock-sdk` 主包（非 subpath）会报 error。

### 目录全景

```
src/
├── config/           YAML配置读取 + zod schema (schema.ts, loadConfig.ts)
├── data/             唯一允许调用 stock-sdk 的层
│   ├── sdkClient.ts  SdkClient 接口 + 真实/工厂函数 + 限流/重试配置
│   ├── quotes.ts / fundFlow.ts / northbound.ts / marketEvent.ts
│   ├── dragonTiger.ts / reference.ts / board.ts
├── engine/           纯计算层
│   ├── indicators.ts       8种指标封装 (MA/MACD/BOLL/KDJ/RSI/ATR/SAR/等)
│   ├── signals/            8种信号 (S01-S08, 每种独立文件)
│   ├── strategies/         5种策略 (STG01-STG05, 每种独立文件)
│   ├── screener.ts         候选池过滤器 (封装 stock-sdk/screener)
│   ├── backtestRunner.ts   回测引擎 (封装 stock-sdk/screener backtest)
│   └── scoring.ts          评分公式 (6维度 + 组合健康度)
├── pipeline/         编排层
│   ├── candidatePool.ts    候选池批处理 (runDailyBatch)
│   ├── eventWatcher.ts     盘中事件监听
│   ├── holdingsMonitor.ts  持仓监控 (getEnrichedHoldings)
│   ├── watchlistScanner.ts Watchlist 扫描
│   ├── recommendation.ts   系统推荐 (反向推荐/相似度/情绪/资金流传导)
│   ├── rebalance.ts        再平衡建议
│   ├── reportBuilder.ts    日报构建 (buildDailyReport) + 文本渲染
│   ├── forwardTracking.ts  推荐存证 + 策略复盘 + 健康度评估
│   └── autoBackfill.ts     自动补跑
├── notify/           通知渠道
│   ├── notifier.ts    Notifier 接口 + ConsoleNotifier + 工厂函数
│   └── index.ts
├── cli/              命令行入口
│   ├── run-daily-report.ts   日报生成 CLI
│   ├── run-backtest.ts       回测 CLI
│   ├── schedule.ts           cron 调度器
│   ├── backfill.ts           手动补跑 CLI
│   ├── health-check.ts       数据健康检查
│   ├── cleanup.ts            数据清理/归档
│   ├── run-stage1.ts         Phase 8 Stage 1
│   ├── run-stage2.ts         Phase 8 Stage 2
│   ├── run-stage3.ts         Phase 8 Stage 3
│   └── capture-edge-case.ts  边界情况捕获
├── types/            类型定义
│   ├── config.ts / candidate.ts / signal.ts / strategy.ts / score.ts
│   └── sdk/          13 个文件对应 SDK 各命名空间的精确类型
└── index.ts
```

### 完整数据流（日报生成管线）

```
YAML配置 → loadPortfolioConfig()
  → SdkClient.getAllQuotes() / byCodes()
    → quickFilter() + klineFilter()  (screener.ts)
      → detectSignals()              (signals/)  ← calc* indicators
        → runDailyBatch()            (candidatePool.ts)
          → buildDailyReport()       (reportBuilder.ts)
            → renderPlainTextReport()
              → 写入 data/reports/{date}.json + .txt
```

---

## 3. 关键命令

```bash
pnpm typecheck           # TypeScript 严格模式类型检查
pnpm lint                # ESLint（含 engine 层隔离规则）
pnpm test                # 全量测试（475 个，全部走 mock，不联网）
pnpm test -- --coverage  # 覆盖率报告
pnpm test <pattern>      # 指定测试：pnpm test test/cli/run-stage1.test.ts

# CLI（构建后使用）
npx tsx src/cli/run-daily-report.ts       # 生成当日日报
npx tsx src/cli/run-backtest.ts           # 运行回测
npx tsx src/cli/backfill.ts --date=...    # 补跑指定日期
npx tsx src/cli/health-check.ts           # 数据健康检查
npx tsx src/cli/cleanup.ts --force        # 数据清理归档
npx tsx src/cli/schedule.ts               # 启动调度器

# Phase 8 实盘验证
npx tsx src/cli/run-stage1.ts --stocks=600519,000858
npx tsx src/cli/run-stage2.ts --stocks=600519,000858
npx tsx src/cli/run-stage3.ts --dry-run --max-rounds=5
```

---

## 4. Phase 0-9 开发历史

| Phase | 名称 | 核心产出 |
|-------|------|---------|
| 0 | 地基与接口验证 | 项目骨架、ESLint 引擎隔离规则、SDK 探测(43 fixture)、Zod 类型 schema、Mock 层、评分 TDD |
| 1 | 数据获取层 | YAML 配置 + zod 校验、SdkClient 接口(限流/重试)、7 个数据模块、持仓/Watchlist 监控 |
| 2 | 指标与信号引擎 | 8 指标封装、8 种 MVP 信号(资金流排名/传导/北向/MACD/KDJ/布林/涨停/共振)、选股器 |
| 3 | 调度与扫描管道 | 盘后批处理(runDailyBatch)、盘中事件监听(eventWatcher)、cron 调度器(schedule.ts) |
| 4 | 策略引擎与回测 | 5 种策略(强势回调/资金流/突破/北向/机构)、回测引擎封装、CLI |
| 5 | 评分体系与日报 | 6 维评分 + 组合健康度、日报数据聚合、纯文本渲染、CLI 入口 |
| 6 | 系统推荐与联动 | 反向推荐(错过板块)、相似度(同板块低估值)、情绪量化(涨跌停比)、资金流三级传导、事件提醒 |
| 7 | 测试收尾与运维基座 | 测试审计(覆盖率/隔离/fixture)、全链路E2E、CI流水线、PM2守护、通知、健康检查、补跑、存证、混沌演练 |
| 8 | 分级实盘验证 | Stage 1(20股干跑)/Stage 2(多日渐进)/Stage 3(盘中监控) CLI、边界情况捕获工具 |
| 9 | 生产级增强 | 数据清理(90天归档)、自动补跑(自检+通知)、策略复盘(收益率/健康度)、阈值调优模板 |

---

## 5. 当前状态（截至 2026-07-06）

### 验证结果
- `pnpm typecheck`: ✅ 通过
- `pnpm lint`: ✅ 0 errors, 0 warnings
- `pnpm test`: **34 个测试文件, 475 个测试, 全部通过**
- 覆盖率: Statements 76.23%, 详情见 [docs/audit/phase-1-6-audit.md](phase-1-6-audit.md)

### 已知的覆盖率缺口
| 模块 | 覆盖率 | 原因 |
|------|--------|------|
| cli/ | 8.36% | CLI 入口文件仅通过集成测试覆盖 |
| data/ | 48.8% | sdkClient.ts 真实实现通过 mock 测试 |
| config/ | 67.18% | loadConfig.ts 错误处理分支 |
| engine/strategies/ | 81.04% | stg04-northbound.ts 边界分支 |

### 测试基础设施
- 所有测试**默认走 mock**，不发起真实网络请求
- Mock 实现在 `test/mocks/sdkMock.ts`，使用 43 个 fixture（`test/fixtures/raw/`）
- Fixture 数据结构通过 Zod schema 校验（`test/types/sdk-fixtures.test.ts`）
- 集成测试: `test/integration/full-pipeline.test.ts`（全链路）+ `live-data-replay.test.ts`（数据回放）

---

## 6. 关键类型与接口

### SdkClient（数据层核心接口）
位置: `src/data/sdkClient.ts`

```typescript
interface SdkClient {
  getAllQuotes(): Promise<FullQuote[]>;
  getQuotesByCodes(codes: string[]): Promise<FullQuote[]>;
  getKLine(symbol: string, from: string, to: string): Promise<KLine[]>;
  getFundFlow(symbol: string, days?: number): Promise<IndividualFundFlow[]>;
  getMarketFundFlow(): Promise<MarketFundFlow[]>;
  getNorthboundSummary(): Promise<NorthboundSummary[]>;
  getNorthboundHoldingRank(limit?: number): Promise<NorthboundHoldingRank[]>;
  getZTPool(): Promise<ZTPoolItem[]>;
  getStockChanges(): Promise<StockChange[]>;
  getBoardChanges(): Promise<BoardChange[]>;
  getDragonTigerDetail(date: string): Promise<DragonTigerDetail[]>;
  getDragonTigerSeatDetail(symbol: string, date: string): Promise<DragonTigerSeat[]>;
  getBlockTradeMarketStat(date: string): Promise<BlockTradeMarketStat[]>;
  getMarginAccountInfo(): Promise<MarginAccountInfo[]>;
  isTradingDay(date: string): Promise<boolean>;
  nextTradingDay(date: string): Promise<string>;
  getMarketStatus(): MarketStatus;
  search(keyword: string): Promise<SearchResult[]>;
  getFundFlowRank(limit?: number): Promise<FundFlowRankItem[]>;
  getSectorFundFlowRank(limit?: number): Promise<SectorFundFlowItem[]>;
  getDividendDetail(symbol: string): Promise<DividendDetail>;
  getMarginTargetList(date?: string): Promise<MarginTarget[]>;
}
```

工厂函数: `createSdkClient()`（真实）、`createMockSdkClient()`（测试，位于 `test/mocks/sdkMock.ts`）

### DailyReport（日报结构）
位置: `src/pipeline/reportBuilder.ts`

```typescript
interface DailyReport {
  date: string;
  holdingsOverview: { totalMarketValue, totalPnl, totalPnlPercent, holdings };
  watchlistOverview: { totalStocks, items };
  healthScore: PortfolioHealthResult;
  candidatePool: { totalCandidates, topSignals };
  rebalance: RebalanceSuggestion;
  backtestSummary: { totalResults, bestStrategy, results };
  marketStatus: { isTradingDay, marketOpen, date };
}
```

### 信号/策略/评分类型
- `SignalResult`: `{ signalId, symbol, triggeredAt, strength(1-5), detail }` → `src/types/signal.ts`
- `StrategySignal`: `{ strategyId, symbol, triggeredAt, confidence(0-100) }` → `src/types/strategy.ts`
- `HoldingScore`: `{ code, fundFlowScore, technicalScore, riskScore, totalScore, recommendation }` → `src/types/score.ts`
- `PortfolioHealthResult`: `{ fundFlowHealth, technicalHealth, portfolioRisk, sentiment, eventSafety, strategyOpportunity, total, colorBand }` → `src/engine/scoring.ts`

---

## 7. 数据目录约定

```
data/
├── reports/         日报输出 ({date}.json + {date}.txt) — 永久保留
├── tracking/        推荐存证 ({date}.json) — 永久保留
├── stage1/          Stage 1 结果 ({date}.json + {date}.txt)
├── stage2/          多日运行日志 (daily-log.json)
└── candidate-pool-{date}.json  候选池缓存 — 90天后自动归档压缩
```

---

## 8. 重要技术决策（详细见 docs/decisions/）

| 决策 | 结论 | 文档 |
|------|------|------|
| 市场前缀 | 6位纯数字代码，不含市场前缀 | T-0.4 |
| SDK 命名空间 | 通过 `sdkClient.ts` 统一封装 | T-0.2 |
| 回测字段 | backtest() 返回包含夏普比率/最大回撤 | T-0.2-backtest-fields |
| calcSignals | 返回数组，含 signalId/symbol/strength/detail | T-0.2-calcSignals-fields |
| 候选池过滤 | 从 batch.cn 获取 pe/circulatingMarketCap/turnoverRate | T-0.4 |
| 定时任务 | node-cron 本地进程内调度 | — |
| 配置文件 | YAML + zod 校验 | — |
| 推送渠道 | 先做 ConsoleNotifier，后期可扩展 | T-7.6 |
| 数据持久化 | 本地 JSON 文件 | — |

---

## 9. 扩展指南

### 添加新的数据源方法
1. 在 `src/data/sdkClient.ts` 的 `SdkClient` 接口添加方法签名
2. 在 `createSdkClient()` 工厂函数中实现真实调用
3. 在 `test/mocks/sdkMock.ts` 的 `createMockSdkClient()` 中添加 mock 实现 + fixture
4. 在 `src/types/sdk/` 添加对应类型 + Zod schema
5. 在 `test/types/sdk-fixtures.test.ts` 的 `FIXTURE_MAP` 注册 schema
6. 更新业务层调用

### 添加新的技术指标
1. 在 `src/engine/indicators.ts` 中添加计算函数
2. 若需要信号检测，在 `src/engine/signals/` 下创建新文件

### 添加新的 CLI 命令
1. 在 `src/cli/` 下创建文件
2. `main()` 函数用 `fileURLToPath(import.meta.url)` + `process.argv[1]` 判断是否为 CLI 入口
3. 核心逻辑导出为独立函数，方便测试

---

## 10. 常见问题

### test 文件无法 import `test/mocks/`
由于 `tsconfig.json` 的 `rootDir: "./src"` 限制，`src/` 下的代码不能导入 `test/` 目录。
解决方案：在 CLI/业务代码中使用内联 mock 或依赖注入（`runStage1` 接受可选的 `sdkClient` 参数）。

### Engine 层不能直接使用 stock-sdk
ESLint 规则 `no-restricted-imports` 禁止 `src/engine/**/*.ts` 导入 `stock-sdk` 主包（含网络请求）。
允许导入 `stock-sdk/indicators`、`stock-sdk/signals`、`stock-sdk/screener` 等纯计算 subpath。

### 测试 fixture 的维护
所有 mock 返回数据源自 `test/fixtures/raw/` 下的真实响应快照。修改 fixture 后必须同步更新对应的 Zod schema。`test/types/sdk-fixtures.test.ts` 会自动校验一致性。

### 模拟交易日
测试中使用 `vi.useFakeTimers()` 固定系统时间。`nextTradingDay` 的 mock 实现跳过周末，直接返回下一个日期。

---

## 11. 关键文件速查表

| 文件 | 功能 |
|------|------|
| `src/data/sdkClient.ts` | SdkClient 接口定义 + 真实/工厂实现 |
| `src/engine/indicators.ts` | 8 种技术指标计算函数 |
| `src/engine/signals/index.ts` | 8 种信号统一导出表 |
| `src/engine/strategies/index.ts` | 5 种策略统一导出表 |
| `src/engine/scoring.ts` | 6 维评分 + 组合健康度 |
| `src/engine/backtestRunner.ts` | 回测引擎封装 |
| `src/engine/screener.ts` | 候选池过滤器 (quickFilter + klineFilter) |
| `src/pipeline/candidatePool.ts` | 盘后批处理 (runDailyBatch) |
| `src/pipeline/reportBuilder.ts` | 日报构建 + 文本渲染 |
| `src/pipeline/recommendation.ts` | 系统推荐纯函数 |
| `src/pipeline/holdingsMonitor.ts` | 持仓/Watchlist 监控 + 事件提醒 |
| `src/pipeline/forwardTracking.ts` | 推荐存证 + 策略复盘 + 健康度评估 |
| `src/pipeline/autoBackfill.ts` | 自动补跑检测 |
| `src/notify/notifier.ts` | 通知接口 + ConsoleNotifier |
| `test/mocks/sdkMock.ts` | Mock SDK 客户端（用于所有测试） |
| `test/types/sdk-fixtures.test.ts` | 43 个 fixture 的 Zod schema 校验 |
| `test/integration/full-pipeline.test.ts` | 全链路 E2E 冒烟测试（13 tests）|
| `eslint.config.js` | ESLint 配置 + engine 层隔离规则 |
| `vitest.config.ts` | Vitest 配置 + 覆盖率配置 |
| `ecosystem.config.js` | PM2 进程守护配置 |
| `.github/workflows/ci.yml` | CI 流水线（Node 18/20/22 矩阵） |
