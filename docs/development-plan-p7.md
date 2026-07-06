# 组合管理工具 — 开发 Plan（面向 Coding Agent）

> 本文档面向自主编码 agent。每个任务都给出可由脚本/测试自动判定的验收标准，
> agent 应按顺序执行：**实现 → 自测 → 对照验收标准自检 → 标记完成 → 进入下一任务**。
> 除 Phase 0 中明确标注"需人工确认"的两项外，其余任务不需要人工介入即可完成开发与验收。

---

## 0. 使用说明（写给执行本 plan 的 agent）

1. **任务粒度**：每个任务（`T-x.y`）应作为一次独立提交完成，预期规模 0.5–3 小时人类工程师工作量。
2. **完成的定义（Definition of Done）**：一个任务只有同时满足以下条件才算完成：
   - 代码通过 `npm run typecheck`（TypeScript 严格模式无报错）
   - 代码通过 `npm run lint`
   - 该任务对应的测试文件全部通过 `npm run test -- <task-id>`
   - 任务的"验收标准"章节列出的每一条都能自动验证通过（脚本输出、断言、schema 校验等）
   - 如果任务修改了公共接口（`src/types/*.ts`），必须同步更新依赖该接口的下游任务的类型引用，且下游任务的测试仍然通过
3. **遇到验收标准无法达成时**：不允许放宽验收标准来"让测试过"。应在任务对应的 `docs/decisions/T-x.y.md` 中记录问题、尝试过的方案、以及为什么受阻，并将任务标记为 `BLOCKED`，继续执行不依赖它的其他任务。
4. **网络依赖的处理**：所有涉及真实行情接口调用的任务，都必须同时提供"离线/mock 模式"，测试默认跑离线模式（见第 12 节）。只有 Phase 0 的接口探测任务允许且必须联网执行一次，用于生成 fixture。
5. **不确定 SDK 细节时**：不允许凭经验猜测字段名后直接写死在业务代码里。必须先在 Phase 0 对应的探测任务中生成真实响应 fixture，再基于 fixture 编写 TypeScript 类型和解析逻辑。

---

## 1. 技术栈假设（已做出的默认选择，agent 不需要再询问）

| 决策点 | 选择 | 理由 |
|---|---|---|
| 语言/运行时 | TypeScript + Node.js ≥ 18 | 与 `stock-sdk`（Node/浏览器同构包）原生契合 |
| 包管理器 | pnpm | 项目无强依赖，pnpm/npm 均可；统一用 pnpm 避免 lockfile 冲突 |
| 配置存储 | YAML（`holdings.yaml` / `watchlist.yaml`）+ `zod` 做 schema 校验 | 需求文档 0.2 节已确定手动录入用 YAML |
| 测试框架 | Vitest | 原生 ESM/TS 支持好，速度快，mock 简单 |
| 定时任务 | `node-cron`（本地进程内调度），不引入外部消息队列 | MVP 阶段单机运行即可 |
| 报告输出 | Phase 1-2 只做「纯文本 + JSON」两种输出，HTML Dashboard 版本推迟到 Phase 5 之后 | 需求文档 4.3 节的可视化 Dashboard 是重 UI 工作，MVP 应先跑通数据链路 |
| 推送渠道 | 先做「输出到本地文件 + 控制台」，Telegram/企业微信等推送渠道作为 Phase 6 之后的可选任务 | 避免 MVP 阶段引入外部账号依赖 |
| 数据持久化 | 本地 JSON 文件（`data/` 目录），不引入数据库 | 单用户个人工具，数据量小 |

> 如果你（人类使用者）对以上任一项有不同偏好，请在开始 Phase 1 之前修改本节；一旦 Phase 1 开始，中途更换技术栈的成本会显著上升。

---

## 2. 已确认的技术基础（供 agent 直接引用，不需要重新验证）

### 2.1 SDK 命名空间 API（`stock-sdk@2.2.2`，来自 sdk.batch / sdk.fundFlow 等门面）

数据获取类方法一律走 `sdk.[namespace].[method]()`，返回 Promise，需要网络：

```
sdk.batch.cn()                          // 全市场 A 股批量行情
sdk.batch.byCodes(codes: string[])      // 按代码批量行情
sdk.kline.cn(symbol, options)           // A 股历史K线
sdk.quotes.timeline(code)               // 分时数据
sdk.fundFlow.individual(symbol, options)
sdk.fundFlow.market()
sdk.fundFlow.rank(options)
sdk.fundFlow.sectorRank(options)
sdk.fundFlow.sectorHistory(symbol, options)
sdk.northbound.individual(symbol, options)
sdk.northbound.holdingRank(options)
sdk.northbound.minute(direction?)
sdk.northbound.summary()
sdk.marketEvent.ztPool(type?, date?)
sdk.marketEvent.stockChanges(type?)
sdk.marketEvent.boardChanges()
sdk.dragonTiger.detail(options)
sdk.dragonTiger.seatDetail(symbol, date)
sdk.reference.dividendDetail(symbol)
sdk.calendar.isTradingDay(date?)
sdk.calendar.nextTradingDay(date?)
sdk.calendar.marketStatus(market?)      // 同步方法，非 Promise
sdk.margin.targetList(date?)
sdk.blockTrade.*
sdk.board.industry.spot(symbol)
sdk.board.industry.constituents(symbol)
sdk.board.industry.kline(symbol, options)
```

### 2.2 纯本地计算 API（无网络依赖，从 subpath 导入）

```
// stock-sdk/indicators
calcMA / calcSMA / calcEMA / calcWMA
calcMACD / calcBOLL / calcKDJ / calcRSI
calcWR / calcBIAS / calcCCI / calcATR
calcOBV / calcROC / calcDMI / calcSAR / calcKC
addIndicators(klines)                  // 组合多个指标写回K线数组

// stock-sdk/signals
calcSignals(klines, options)           // SDK 内置的通用信号检测

// stock-sdk/screener   —— 重要：定位是"本地链式筛选器"，不拉取数据
screen(items: T[])
  .where(predicate)
  .sortBy(keyFn)
  .top(n)
// 用法示例：screen(candidateQuotes).where(q => q.pe < 15).sortBy(q => q.amount).top(20)
// 注意：items 必须由调用方先通过 sdk.batch.cn() 等方法拿到，screen 本身不发请求。

// stock-sdk/screener —— backtest：单标的全仓多头回测引擎，纯本地计算
backtest({ klines, strategy, initialCapital, fee })
// klines 必须由调用方先通过 sdk.kline.cn() 拿到；strategy 是调用方编写的策略函数。
// 输出：收益曲线、胜率、回撤等统计量，不涉及外部数据获取。
```

**架构含义（写进设计里，避免任务间职责混淆）**：
- 所有"拉数据"的代码只能出现在 `src/data/` 层。
- `screen`/`backtest`/`calc*`/`calcSignals` 全部是纯函数式计算，只能出现在 `src/engine/` 层，**不允许在 `src/engine/` 里直接 import 或调用 `sdk.*`**（用依赖注入把数据作为参数传入）。这条规则本身会在 T-0.4 中落地为一条 ESLint 规则，防止后续任务违反分层。

### 2.3 已知但尚未验证的细节（全部转化为 Phase 0 的探测任务，见第 4 节）

- `sdk.batch.cn()` 返回的行情对象是否包含 `pe`（市盈率）、`circulatingMarketCap`（流通市值）、`turnoverRate`（换手率）等候选池过滤需要的字段，具体字段名是什么
- `calcSignals` 的输出 schema（返回的是信号名称数组，还是带强度分数的对象数组）
- `backtest()` 返回对象的具体字段（是否含夏普比率、最大回撤等 2.2 节要求的指标）
- `sdk.margin.targetList()` / `sdk.blockTrade.*` 的具体参数与返回结构

---

## 3. 系统架构与目录结构

```
portfolio-manager/
├── src/
│   ├── config/                 # 配置读取与 schema 校验（zod）
│   │   ├── schema.ts
│   │   └── loadConfig.ts
│   ├── data/                   # 唯一允许调用 sdk.* 的层
│   │   ├── sdkClient.ts        # StockSDK 单例 + rateLimit/retry 配置
│   │   ├── quotes.ts
│   │   ├── fundFlow.ts
│   │   ├── northbound.ts
│   │   ├── marketEvent.ts
│   │   ├── dragonTiger.ts
│   │   ├── reference.ts        # calendar / dividend / margin / blockTrade
│   │   └── board.ts
│   ├── engine/                 # 纯计算层，禁止 import sdk.*
│   │   ├── indicators.ts       # 封装 calc* / addIndicators
│   │   ├── signals/            # 8 种 MVP 信号判断逻辑（每种一个文件）
│   │   ├── strategies/         # 5 种 MVP 策略规则（每种一个文件）
│   │   ├── screener.ts         # 候选池过滤器（基于 screen()）
│   │   ├── backtestRunner.ts   # 封装 backtest()
│   │   └── scoring.ts          # 4.2 节评分公式实现
│   ├── pipeline/                # 编排层：把 data + engine 组合成业务流程
│   │   ├── candidatePool.ts     # 候选池构建与更新（盘后批处理）
│   │   ├── eventWatcher.ts      # 盘中事件监听
│   │   ├── holdingsMonitor.ts   # 1.1 节持仓监控
│   │   ├── watchlistScanner.ts  # 1.2 节 Watchlist 扫描
│   │   ├── recommendation.ts    # 1.3 节系统推荐
│   │   ├── rebalance.ts         # 1.4.3 节组合再平衡
│   │   └── reportBuilder.ts     # 第4节 日报生成
│   ├── types/                   # 全局类型定义（各层共享）
│   ├── cli/                     # 命令行入口（run-daily-report.ts 等）
│   └── index.ts
├── test/
│   ├── fixtures/                 # Phase 0 生成的真实响应快照
│   ├── mocks/                    # sdk.* 的 mock 实现
│   └── **/*.test.ts
├── data/                          # 运行时数据（holdings.yaml, 候选池缓存等）
├── docs/decisions/                # 每个受阻任务的记录
└── package.json
```

---

## 4. 核心类型约定（Phase 0 必须先落地，后续任务直接复用）

以下类型是各任务之间的"契约"，任何任务修改这些类型都必须同步跑一遍全量测试。

```typescript
// src/types/config.ts
interface HoldingEntry {
  code: string;        // 6位代码，不含市场前缀，如 "600519"
  shares: number;
  costPrice: number;
}
interface PortfolioConfig {
  holdings: HoldingEntry[];
  watchlist: string[];  // 代码数组
}

// src/types/candidate.ts
interface CandidatePoolFilterCriteria {
  minCirculatingMarketCap: number;   // 50亿
  minAvgAmount20d: number;           // 1亿
  excludeST: boolean;
  minListedTradingDays: number;      // 60
  maxLimitUpDaysIn5: number;         // 3
  maxAvgAmplitude20d: number;        // 10%
}

// src/types/signal.ts
interface SignalResult {
  signalId: string;          // 对应需求文档 1.2.1 的编号，如 "S01"
  symbol: string;
  triggeredAt: string;       // ISO 日期
  strength: 1 | 2 | 3 | 4 | 5; // 对应星级
  detail: Record<string, unknown>; // 触发时的具体数值，用于日报展示和后续复盘
}

// src/types/strategy.ts
interface StrategySignal {
  strategyId: string;        // "STG01" ~ "STG05"
  symbol: string;
  triggeredAt: string;
  confidence: number;        // 0-100，日报里"信号强度 85%"这类展示用
}

// src/types/score.ts
interface HoldingScore {
  code: string;
  fundFlowScore: number;     // 0-100
  technicalScore: number;
  riskScore: number;
  totalScore: number;        // 加权后
  recommendation: "hold" | "watch" | "replace";
}
interface PortfolioHealthScore {
  fundFlowHealth: number;
  technicalHealth: number;
  portfolioRisk: number;
  sentiment: number;
  eventSafety: number;
  strategyOpportunity: number;
  total: number;   // 0-100
  colorBand: "green" | "yellow" | "orange" | "red";
}
```

---

## 5. Phase 0：地基与接口验证（无这一步，后面全部返工）

> Phase 0 的每个任务产出都是"事实性文档 + fixture 文件"，不是业务功能。
> 这是唯一允许（且必须）联网执行的阶段。

### T-0.1　初始化项目骨架
- **输出**：`package.json`、`tsconfig.json`（strict: true）、`.eslintrc`（含"engine 层禁止 import sdk"规则）、`vitest.config.ts`、第 3 节目录结构的空文件占位
- **验收标准**：
  - `pnpm install && pnpm typecheck` 无报错退出码为 0
  - `pnpm lint` 无报错
  - 在 `src/engine/` 下任意文件写一行 `import { StockSDK } from 'stock-sdk'`，`pnpm lint` 必须报错（用于验证分层规则真实生效，测试完删除这行）

### T-0.2　SDK 真实响应探测（联网，仅执行一次，生成 fixture）
- **前置**：安装 `stock-sdk@2.2.2`
- **任务**：编写一次性脚本 `scripts/probe-sdk.ts`，依次调用第 2.1 节列出的**每一个**命名空间方法（用少量真实代码如 `600519`、`sh000001` 作参数），把原始返回结果落盘到 `test/fixtures/raw/<namespace>.<method>.json`
- **验收标准**（全部自动判定，不依赖人工看数据是否"合理"）：
  - 43 个方法调用中，每个都必须落盘一个非空 JSON 文件，或者在 `docs/decisions/T-0.2-failures.md` 中记录该方法调用失败的具体报错（不允许静默跳过）
  - 针对 `sdk.batch.cn()` 的返回，脚本必须打印并写入 `docs/decisions/T-0.2-fields.md`：返回数组第一个元素的全部字段名列表，并显式标注 `pe` / `circulatingMarketCap`(或等价字段) / `turnoverRate`(或等价字段) / `avgAmount`(或等价字段) 是否存在
  - 针对 `calcSignals()`（用 T-0.2 里已获取的某只股票K线跑一次），把返回结果原样落盘为 `test/fixtures/raw/calcSignals.sample.json`，并在决策文档中写出其字段结构描述
  - 针对 `backtest()`，用一个最简单的策略函数（如"永远持有"）跑一次，把返回对象落盘为 `test/fixtures/raw/backtest.sample.json`，并在决策文档中列出返回对象包含哪些统计字段（尤其确认是否含最大回撤、夏普比率，因为 2.2 节的回测场景需要这些）

### T-0.3　基于 fixture 定义精确 TypeScript 类型
- **输入**：T-0.2 产出的所有 fixture
- **任务**：为每个 fixture 对应的返回值，在 `src/types/sdk/` 下写出精确的 TypeScript interface（禁止用 `any`，可选字段必须标 `| null` 而不是假设一定存在）
- **验收标准**：
  - 写一个测试 `test/types/sdk-fixtures.test.ts`，用 `zod` schema 去 parse 每一个 fixture 文件，parse 失败即测试失败（这样类型定义和真实数据的一致性是可自动回归验证的，而不是"写完就不管"）
  - 所有 fixture 文件都必须有对应的 schema 校验测试，一一对应，不能有遗漏（用脚本检查 `test/fixtures/raw/` 目录下文件数 === schema 测试数）

### T-0.4　候选池过滤字段可行性确认
- **依赖**：T-0.2 的字段清单
- **任务**：对照第 4 节 `CandidatePoolFilterCriteria`，确认每个过滤条件能否从已探测到的字段直接算出。如果 `sdk.batch.cn()` 没有流通市值/日均成交额字段，评估是否可以从 `sdk.kline.cn()` 历史数据自行计算日均成交额
- **验收标准**：产出 `docs/decisions/T-0.4-candidate-pool-feasibility.md`，其中每一条过滤条件必须标注：`✅ 直接可用字段: xxx` 或 `⚠️ 需要自行计算，方法: xxx` 或 `❌ 无法实现，需要降级方案: xxx`，三种状态必须二选一，不能空缺

### T-0.5　评分公式定义与单元测试先行
- **任务**：把第 4.2 节评分体系的 6 个维度，每个都写成一个纯函数并**先写测试用例**（给定构造好的输入，断言输出的分数），再实现函数本身（TDD 方式，保证公式的边界行为——比如"当日净流入为 0 应该是多少分"——在写代码前就已经用测试固化下来）
- **验收标准**：`src/engine/scoring.ts` 中 6 个维度评分函数 + 1 个总分加权函数，对应的 `scoring.test.ts` 覆盖：正常值、极端值（全 0、全满分）、`null`/`undefined` 输入（比如某只股票当天没有资金流数据）三类用例，全部通过

### T-0.6　Mock 数据层搭建
- **任务**：为 `src/data/` 下每个模块编写对应的 mock 实现（读取 T-0.2 的 fixture 返回，而不是真实发请求），通过 `NODE_ENV=test` 或依赖注入切换
- **验收标准**：`test/mocks/sdkMock.ts` 导出的 mock 客户端，其方法签名必须和真实 `src/data/sdkClient.ts` 完全一致（用 TypeScript 的 `satisfies` 或接口约束强制），保证后续任务写业务逻辑测试时可以无缝替换


---

## 6. Phase 1：数据获取层

### T-1.1　配置读取与校验
- **输出**：`src/config/schema.ts`（zod schema 对应 `PortfolioConfig`）、`src/config/loadConfig.ts`
- **验收标准**：
  - 提供 3 个测试 fixture：合法 `holdings.yaml`、缺少必填字段的、`shares` 为负数的
  - 合法文件加载后返回的对象与 `PortfolioConfig` 类型完全匹配（测试里用 `expect(result).toEqual(...)`，不是"能跑就行"）
  - 非法文件必须抛出包含具体字段名的错误（不能是笼统的 "invalid config"）

### T-1.2　SDK 客户端封装（限流/重试落地）
- **输出**：`src/data/sdkClient.ts`
- **任务**：按附录 A"限流与缓存策略"配置 `rateLimit`（并发 5-7，间隔 200ms）、`retry`、`circuitBreaker`
- **验收标准**：
  - 单元测试用 mock 制造"连续 3 次超时"场景，断言 `retry` 配置生效（重试次数与真实调用次数一致）
  - 单元测试制造"短时间内发起 50 次请求"场景，断言实际并发数不超过配置值（通过 mock 记录时间戳数组，计算任意时刻并发数）

### T-1.3　按命名空间封装数据获取函数
- **输出**：`src/data/quotes.ts` / `fundFlow.ts` / `northbound.ts` / `marketEvent.ts` / `dragonTiger.ts` / `reference.ts` / `board.ts`
- **任务**：每个文件对 T-0.3 中定义的 SDK 方法做一层业务语义包装（比如 `getFundFlowAnomalyCandidates()` 内部调用 `sdk.fundFlow.rank()`），返回值统一用 T-0.3 的精确类型，而不是原始 SDK 类型
- **验收标准**：每个导出函数都有对应测试，测试全部走 T-0.6 的 mock，断言返回值 schema 与 T-0.3 类型一致；覆盖率要求该文件 100%（因为是薄封装层，没有理由有未测分支）

### T-1.4　持仓/Watchlist 实时行情合并
- **输出**：`src/pipeline/holdingsMonitor.ts` 中的 `getEnrichedHoldings()`
- **任务**：读取 `holdings.yaml` → `sdk.batch.byCodes()` 拿现价 → 计算市值、盈亏金额、盈亏比例
- **验收标准**：给定固定的持仓配置 fixture + 固定的行情 mock，断言计算出的市值/盈亏与手工算好的期望值（写在测试里的常量）逐位精确相等（金额类计算用小数点后 2 位比较，避免浮点误差导致测试 flaky）


---

## 7. Phase 2：指标与信号引擎

### T-2.1　指标计算封装
- **输出**：`src/engine/indicators.ts`，封装 `calcMA/calcMACD/calcBOLL/calcKDJ/calcRSI/calcATR/calcSAR` 等为统一签名 `calc(closes/ohlcv, params) => IndicatorSeries`
- **验收标准**：用一组**手算过的**已知 K 线序列（比如 10 根收盘价固定数字，MA5 手工算出确定值）做测试，断言函数输出与手算结果完全一致，而不是只断言"返回了数组"

### T-2.2　MVP 8 种信号 —— 逐个实现（每种信号一个独立任务，互不阻塞）

> 编号对应需求文档 1.2.1 节的 MVP 清单。每个信号任务模板相同，逐条列出验收标准的关键差异点。

**T-2.2.1　信号1：个股资金流排名前 10%**
- 输入：`sdk.fundFlow.rank()` 结果
- 验收：构造"资金流排名数组，长度100，目标股排名第5"的 mock，断言判定为触发；排名第50的断言判定为不触发；边界值（恰好第10名，10%边界）需要有专门测试用例

**T-2.2.2　信号2：三级传导共振**（大盘翻红 + 板块前3 + 个股前3%）
- 验收：三个条件设计为独立可注入的 mock，测试矩阵覆盖"三个都满足→触发"、"任意一个不满足→不触发"共 4 组用例（不能只测全真的情况）

**T-2.2.3　信号3：北向连续5日增持**
- 验收：mock 5天数据"逐日递增"→触发；"第3天出现下降"→不触发；数据不足5天（比如新股）→明确返回"数据不足"而不是误判为不触发或抛异常

**T-2.2.4　信号4：MACD 金叉**
- 验收：构造"DIF 从下方穿过 DEA"的 K 线序列断言触发；"DIF 一直在 DEA 上方（没有穿越动作，只是持续为正）"断言不触发（这是最容易写错的边界，金叉是"穿越"事件不是"状态"）

**T-2.2.5　信号5：KDJ 超卖 + 底背离**
- 验收：需要同时满足"K<20"和"价格新低但K不新低"，测试矩阵覆盖 2×2 四种组合

**T-2.2.6　信号6：放量突破 BOLL 中轨**
- 验收：价格站上中轨 + 量能条件，同样用 2×2 矩阵测试

**T-2.2.7　信号7：涨停后机构买入回调**
- 验收：需要组合 `marketEvent.ztPool` 和 `dragonTiger.detail` 两个数据源的 mock，覆盖"涨停但机构未买入"、"机构买入但未涨停"两种不应触发的场景

**T-2.2.8　信号8：多维共振（综合信号）**
- **依赖**：T-2.2.1、T-2.2.3、T-2.2.4 必须先完成（复用而不是重新实现判断逻辑）
- 验收：断言该函数是"组合调用信号1/3/4的判断结果 + 独立的RSI<65和未创新高判断"，而不是重新写一套逻辑（测试里可以用 spy 断言底层信号函数被调用）

**统一验收标准（适用于以上全部8个）**：
- 每个信号函数签名统一：`(input: SignalInput) => SignalResult | null`（未触发返回 `null`，不是返回 `{triggered: false}`，保持接口简洁一致）
- 每个信号必须有至少 3 个测试用例：触发、不触发、边界/数据缺失
- 所有信号注册进 `src/engine/signals/index.ts` 的统一导出表，写一个测试断言"信号编号与文件一一对应，没有遗漏也没有多余"

### T-2.3　候选池过滤器（基于 `screen()`）
- **输出**：`src/engine/screener.ts`
- **任务**：按 T-0.4 确认的可用字段，用 `screen(quotes).where(...).sortBy(...).top(n)` 实现需求文档 1.2.2 的硬性过滤条件
- **验收标准**：给定 100 只股票的 mock 数据（人为构造几只明确应该被过滤掉的，比如 ST 股、市值49亿的、上市30天的），断言过滤后的候选池**恰好**不包含这几只，且包含所有应保留的（不能只断言"数量减少了"）


---

## 8. Phase 3：调度与扫描管道

### T-3.1　盘后批处理任务编排
- **输出**：`src/pipeline/candidatePool.ts` 中的 `runDailyBatch()`
- **任务**：串联 —— 拉全市场行情 → T-2.3 过滤 → 对候选池逐个拉K线 → T-2.1 算指标 → T-2.2 跑8种信号 → 落盘到 `data/candidate-pool-{date}.json`
- **验收标准**：
  - 全流程用 mock 数据跑一遍，断言产出的 JSON 文件符合 schema，且信号命中数与手工构造的 mock 期望值一致
  - 显式测试"候选池为空（比如全市场都不满足过滤条件）"这个边界，断言流程不抛异常，产出空数组而不是崩溃
  - 显式测试"某只股票拉K线失败（网络错误）"，断言该股票被跳过并记录日志，**不影响其余股票的处理**（单点失败不能拖垮整批）

### T-3.2　盘中事件监听任务
- **输出**：`src/pipeline/eventWatcher.ts`
- **任务**：轮询 `marketEvent.ztPool/stockChanges/boardChanges`，命中事件的股票追加进当日候选池
- **验收标准**：mock 一次轮询返回新增涨停股票，断言该股票被追加进候选池文件且不产生重复（同一只股票多次轮询命中只应出现一次）

### T-3.3　调度器接入
- **输出**：`src/cli/schedule.ts`，用 `node-cron` 注册 T-3.1（每日 15:30 后）和 T-3.2（交易时段内每 N 分钟）
- **验收标准**：不测试真实定时触发（太慢），而是测试"cron 表达式解析正确"+"到达触发时间时正确的函数被调用一次"（用 `vi.useFakeTimers()` 快进时间）


---

## 9. Phase 4：策略引擎与回测

### T-4.1　MVP 5 种策略规则实现
- 拆分方式与 T-2.2 相同：`T-4.1.1` ~ `T-4.1.5` 分别对应策略1（强势回调）~策略5（机构打板回调），每个独立任务、独立测试文件
- **验收标准模板**（每个策略共用）：给定构造好的 K 线/资金流/龙虎榜 mock，触发条件里的每一个子条件都要有单独测试用例验证"缺了这一个条件就不触发"（避免逻辑用 `||` 误写成"任一满足即触发"）

### T-4.2　回测引擎封装
- **输出**：`src/engine/backtestRunner.ts`，封装 `backtest({ klines, strategy, initialCapital, fee })`
- **任务**：把 T-4.1 中的 5 个策略函数转成 `backtest()` 要求的 `strategy` 函数签名
- **验收标准**：
  - 用一个已知答案的极简策略（比如"第10天买入，第20天卖出，中间无其他操作"）和固定 K 线，手工算出期望的收益率，断言 `backtest()` 输出与手算值一致（这是验证"我们对 backtest 的用法理解是对的"的关键测试，不能省略）
  - 显式测试初始资金不足以买入最小交易单位（100股）的边界情况
  - 断言返回结果中夏普比率/最大回撤字段存在且数值类型正确（对应 T-0.2 中已确认的返回字段，如果 T-0.2 发现没有这些字段，本任务需要自行基于收益曲线计算，并在此注明）

### T-4.3　策略回测 CLI
- **输出**：`src/cli/run-backtest.ts`，支持 `--strategy=STG01 --symbol=600519 --from=2025-01-01 --to=2026-01-01`
- **验收标准**：端到端测试（走 mock 数据）验证 CLI 输出的 JSON 报告包含策略名、区间、收益率、胜率、最大回撤


---

## 10. Phase 5：评分体系与日报生成

### T-5.1　持仓评分与再平衡建议
- **输出**：`src/pipeline/rebalance.ts`
- **任务**：实现需求文档 1.4.3 的打分流程（近20日资金流 + 信号汇总 → 打分 → 排序 → 找出最低分 1-2 只）
- **验收标准**：给定 5 只持仓的 mock 数据（人为设计好排名），断言输出的"建议替换"列表就是分数最低的1-2只，且分数计算复用 T-0.5 的评分函数（不是重新写一套）

### T-5.2　组合健康度总分
- **输出**：`src/engine/scoring.ts` 中的 `calculatePortfolioHealthScore()`（T-0.5 已经写好6个维度的子函数，这里做加权汇总）
- **验收标准**：用 6 个维度的已知输入值，手算加权总分，断言函数输出与手算值精确一致；同时测试"总分落在哪个颜色区间"的边界值（84分/85分分界线两侧都要测）

### T-5.3　日报数据聚合
- **输出**：`src/pipeline/reportBuilder.ts` 中的 `buildDailyReport()`
- **任务**：把 Phase 1-5 所有管道的产出，聚合成第 4.1 节报告结构的完整数据对象（不含渲染，先出结构化数据）
- **验收标准**：定义 `DailyReport` 类型（对应 4.1 节 7 大板块），写测试断言：给定 Phase 1-5 各管道的 mock 输出，`buildDailyReport()` 产出的对象每个字段都被正确填充，且没有 `undefined` 泄漏到最终结构里（用 zod schema 做一次运行时校验，schema 校验不通过测试就失败）

### T-5.4　纯文本报告渲染
- **输出**：`src/pipeline/reportBuilder.ts` 中的 `renderPlainTextReport()`，对照需求文档 4.2 节格式
- **验收标准**：给定固定的 `DailyReport` 对象，断言渲染出的字符串**逐行**匹配预期模板（用 snapshot 测试，`toMatchSnapshot()`），后续任何格式调整都会被 snapshot diff 捕获，防止无意间破坏格式

### T-5.5　JSON 报告输出与 CLI 入口
- **输出**：`src/cli/run-daily-report.ts`
- **验收标准**：端到端测试（全走 mock）：运行 CLI → 断言 `data/reports/{date}.json` 和 `data/reports/{date}.txt` 两个文件都生成，且 JSON 能被 `DailyReport` 的 zod schema 成功 parse


---

## 11. Phase 6：系统推荐与跨池联动（在 Phase 1-5 稳定后再做）

> 这一阶段功能都是"锦上添花"，依赖 Phase 1-5 已经建好的数据获取和信号框架，
> 每个子功能都可以独立开发、独立验收，互不阻塞。

| 任务 | 输出 | 验收要点 |
|---|---|---|
| T-6.1 反向推荐（你错过的板块） | `src/pipeline/recommendation.ts` | mock 行业涨跌幅数据，断言"连续3日涨幅前3且零持仓"的行业被正确识别 |
| T-6.2 相似度推荐 | 同上 | mock 同板块股票估值数据，断言"同板块估值更低"的候选被正确排序 |
| T-6.3 情绪面量化（大盘温度计） | 同上 | 给定涨跌停家数 mock，断言"贪婪/恐惧/正常"三态判定边界正确 |
| T-6.4 资金流三级传导 | `src/pipeline/candidatePool.ts` 扩展 | mock 大盘→板块→个股三层数据，断言自动加入 watchlist 的股票就是最终一层筛出的股票 |
| T-6.5 事件驱动提醒（除权/解禁/两融） | `src/pipeline/holdingsMonitor.ts` 扩展 | mock 分红/两融数据，断言"提前N天"的提醒逻辑（日期计算，注意跨月/跨年边界） |

---

## 12. 测试与 Mock 策略（贯穿所有 Phase）

1. **默认测试模式 = 离线**：`pnpm test` 不应发起任何真实网络请求。`src/data/sdkClient.ts` 通过环境变量或依赖注入，在测试环境下自动替换为 T-0.6 的 mock 实现。
2. **Fixture 即真理来源**：所有 mock 返回的数据结构必须源自 T-0.2 探测到的真实响应（或其手工构造的变体），不允许凭空编造一个"看起来合理"的 mock 结构——这正是本项目第一版 TODO 踩过的坑（凭经验猜测 API 形态），测试数据也不能重蹈覆辙。
3. **Snapshot 测试的使用边界**：只用于"渲染类"输出（如 T-5.4 的纯文本报告），不用于业务逻辑判断（信号触发与否必须用显式 `expect(result).toBe(...)` 断言，不能靠 snapshot diff 去发现逻辑错误）。
4. **每个 Phase 结束后跑一次集成测试**：`test/integration/phase-N.test.ts`，用 mock 数据跑通该 Phase 的完整链路（不是单元测试的重复，是验证"模块之间接得上"）。

---

## 13. 全局 Definition of Done 检查清单（agent 在标记任何任务完成前自查）

- [ ] `pnpm typecheck` 通过
- [ ] `pnpm lint` 通过（含"engine 层禁止 import sdk"规则）
- [ ] 新增/修改代码对应的测试全部通过，且新增了覆盖"边界/异常/数据缺失"场景的用例（不能只测 happy path）
- [ ] 没有使用 `any` 类型（如确实需要，必须加注释说明原因并使用 `unknown` + 类型收窄代替）
- [ ] 涉及金额/百分比的计算，测试里用精确数值断言，不是模糊的"大于0"之类
- [ ] 如果任务依赖 Phase 0 的探测结果，已在代码注释或 PR 描述中引用了对应的 `docs/decisions/T-0.x-*.md` 文件
- [ ] 本任务引入的新公共接口/类型，已同步检查是否影响下游任务的类型引用

---

## 14. Phase 7-9 总览（面向 coding agent 的线性任务队列）

> **给 agent 的重要说明**：本节起，所有任务按 **Phase 编号 = 实际执行顺序** 排列，不存在"先做 Phase 8 再回头做 Phase 7 剩余部分"这种交叉情况。每个任务都标注了 `前置任务` 字段，agent 只需要检查前置任务是否已全部标记 `DONE`，即可判断当前任务能否开始，不需要理解任何叙述性的"为什么这样排序"的背景（背景说明仅供人类阅读，agent 可以跳过不读）。

三个 Phase 各自的角色：

| Phase | 角色 | 是否需要联网/实盘 |
|---|---|---|
| Phase 7 | 测试收尾 + 运维基座代码建设 | 否，全部可在 mock/CI 环境完成 |
| Phase 8 | 分级实盘验证 | 是，本 plan 中唯一需要接入真实数据源的 Phase |
| Phase 9 | 生产级增强 | 部分任务需要用到 Phase 8 产生的真实数据，其余不需要 |

**任务队列一览（agent 按此顺序逐条执行，同一 Phase 内若"前置任务"列没有互相指向，可并行）**：

| 任务ID | 名称 | 前置任务 |
|---|---|---|
| T-7.1 | 测试完整性审计 | Phase 1-6 全部任务 |
| T-7.2 | 全链路端到端冒烟测试（mock） | T-7.1 |
| T-7.3 | 真实数据回放一致性测试（用 T-0.2 fixture，不联网） | T-7.2 |
| T-7.4 | CI 流水线 | T-7.1 |
| T-7.5 | 进程守护（自动重启） | 无（可与 T-7.4 并行） |
| T-7.6 | 通知/告警渠道 | 无（可与 T-7.4/T-7.5 并行） |
| T-7.7 | 数据健康检查（health-check 代码本体） | 无（可并行） |
| T-7.8 | 手动补跑 | T-7.6（补跑结果需要能通知） |
| T-7.9 | 推荐存证挂载 | T-5.5（挂载点），可与其他 T-7.x 并行 |
| T-7.10 | 本地混沌演练（验证 T-7.4~T-7.9 真实生效） | T-7.3, T-7.4, T-7.5, T-7.6, T-7.7, T-7.8, T-7.9 全部完成 |
| T-8.1 | Stage 1：单次收盘干跑 | T-7.10 |
| T-8.2 | Stage 2：连续多交易日调度运行 | T-8.1 |
| T-8.3 | Stage 3：盘中长稳定性测试 | T-8.2 |
| T-8.4 | 边界情况回灌 | 与 T-8.1/8.2/8.3 同步进行，随时触发 |
| T-9.1 | 数据与日志留存策略 | T-8.3（Phase 8 全部完成） |
| T-9.2 | 全自动补跑升级 | T-7.8, T-8.3 |
| T-9.3 | 策略前瞻跟踪复盘 | T-7.9（存证数据已积累）, T-8.3 |
| T-9.4 | 告警阈值调优 | T-8.2（需要真实告警记录） |

---

## 15. Phase 7：测试收尾与运维基座

> 本 Phase 全部任务都不需要接入真实行情/交易数据，可以完全在开发/CI 环境中完成并自验收。这是 Phase 8 实盘验证能够安全进行的前提，因此必须先于 Phase 8 全部完成。

### T-7.1　测试完整性审计
- **前置任务**：Phase 1-6 全部任务
- **输出**：`docs/audit/phase-1-6-audit.md`（自动生成，不是人工撰写）
- **验收标准**：
  - `pnpm test -- --coverage` 覆盖率报告按模块列出，低于 85% 的模块必须列出清单
  - 扫描 `src/engine/` 目录，确认无任何文件 `import` `stock-sdk`（复用 T-0.1 的 lint 规则），零违规
  - 扫描测试文件里的 mock 数据字面量，与 `test/fixtures/raw/` 的真实响应结构做字段级 diff，标出不一致项
  - 以上三项各自有一个测试断言"结果达标"，CI 中任意一项不达标即视为本任务未完成

### T-7.2　全链路端到端冒烟测试（mock）
- **前置任务**：T-7.1
- **输出**：`test/integration/full-pipeline.test.ts`
- **验收标准**：从 CLI 入口 `run-daily-report` 到磁盘产出报告文件全程走通（全部 mock），产出文件通过 `DailyReport` zod schema 校验，且 7 大板块数组长度均 > 0

### T-7.3　真实数据回放一致性测试
- **前置任务**：T-7.2
- **输出**：`test/integration/live-data-replay.test.ts`
- **任务**：把 T-0.2 生成的原始 fixture 喂给 `src/data/sdkClient.ts` 的生产代码路径（而非 test mock），验证解析和后续计算不抛异常
- **验收标准**：解析结果通过 T-0.3 类型 schema 校验，全链路跑通无异常

### T-7.4　CI 流水线
- **前置任务**：T-7.1
- **输出**：`.github/workflows/ci.yml`（或等价 CI 配置）：每次 push/PR 自动执行 `typecheck` + `lint` + `test --coverage`
- **验收标准**：
  - 故意提交一个类型错误的分支，验证 CI 标红
  - 故意提交一个覆盖率不达标的分支，验证 CI 标红
  - 正常分支验证 CI 标绿

### T-7.5　进程守护（自动重启）
- **前置任务**：无（可与 T-7.4 并行）
- **输出**：`ecosystem.config.js`（pm2）或 systemd unit 文件 + `scripts/deploy.sh`
- **验收标准**：
  - 手动 `kill -9` 调度器进程，断言在设定时间内（如 10 秒）自动重启，且日志记录"异常重启"事件
  - 模拟宿主机重启（systemd `enable` 生效），断言开机自启无需人工介入

### T-7.6　通知/告警渠道
- **前置任务**：无（可并行）
- **输出**：`src/notify/notifier.ts`（统一接口）+ 一个具体实现（企业微信群机器人或 Telegram bot，二选一）
- **接入点**：① 日报生成完成推送摘要 ② health-check 判定异常时推送告警 ③ 调度任务未捕获异常时推送告警
- **验收标准**：mock webhook 端点，构造"日报完成""三类告警各一次""任务抛异常"共 5 种场景，断言每种场景都发出内容正确（含日期、具体原因）的通知

### T-7.7　数据健康检查
- **前置任务**：无（可并行）
- **输出**：`src/cli/health-check.ts`，包含三类独立判定函数：
  - `checkDataFreshness()`：行情/资金流时间戳与当前时间差值超过阈值 → `STALE_DATA`
  - `checkEmptyRate()`：候选池中信号全为 `null` 的股票占比超过阈值 → `SUSPICIOUS_EMPTY`
  - `checkFailureRate()`：接口调用失败比例超过阈值 → `HIGH_FAILURE_RATE`
- **验收标准**：三个函数各自用构造好的边界值（新鲜/过期时间戳、正常/异常比例）做单元测试，覆盖阈值两侧

### T-7.8　手动补跑
- **前置任务**：T-7.6（补跑完成需要能发通知）
- **输出**：`src/cli/backfill.ts --date=YYYY-MM-DD`
- **验收标准**：mock"某天调度失败未产出报告"场景，手动执行 backfill，断言产出报告与"假设当天正常运行"应得报告完全一致；执行完成后必须触发一条通知（复用 T-7.6）

### T-7.9　推荐存证挂载
- **前置任务**：T-5.5（挂载点：报告生成 CLI 流程末尾）
- **输出**：`src/pipeline/forwardTracking.ts` 中的 `recordDailyRecommendations()`
- **任务**：日报生成时，把当天所有触发的信号/策略推荐（含触发价、日期）落盘到 `data/tracking/{date}.json`
- **验收标准**：给定一份日报数据，断言存证文件包含且仅包含当天实际触发的信号/推荐，字段完整
- **为什么现在做**：Phase 9 的策略复盘（T-9.3）需要"N 天前的记录"，越早开始积累样本，Phase 9 能用的真实数据越多

### T-7.10　本地混沌演练（Phase 7 收尾自检）
- **前置任务**：T-7.3, T-7.4, T-7.5, T-7.6, T-7.7, T-7.8, T-7.9 全部完成
- **任务**：在开发/预发布环境（不接真实数据源，用 mock 数据跑着）依次执行：随机 `kill` 进程一次、模拟接口失败触发一次告警、模拟报告缺失后执行补跑
- **验收标准**：三件事全部在无人工修改代码的情况下，系统自己（或收到通知后一条命令）恢复正常

### Phase 7 Definition of Done
- [ ] T-7.1 ~ T-7.10 全部通过各自验收标准
- [ ] `docs/audit/phase-1-6-audit.md` 中的覆盖率/分层规则/fixture一致性三项均已达标

---

## 16. Phase 8：分级实盘验证

> 本 Phase 是全 plan 中唯一需要真实联网、接入真实数据源的部分。三个 Stage 必须按顺序执行，前一个 Stage 未通过其验收标准，不得进入下一个 Stage。

### T-8.1　Stage 1：单次收盘干跑
- **前置任务**：T-7.10
- **任务**：交易日收盘后（`sdk.calendar.marketStatus()` 确认已收盘），对小规模候选池（手动指定 20 只股票）跑一次完整 `run-daily-report`
- **验收标准**：命令退出码为 0；报告通过 schema 校验；日志无未捕获异常；记录本次运行耗时和接口调用次数作为基线数据

### T-8.2　Stage 2：连续多交易日调度运行
- **前置任务**：T-8.1
- **任务**：调度器在真实环境连续运行 5 个交易日，候选池规模从 20 只逐步放大到全市场
- **验收标准**（产出 `docs/audit/live-stage2-report.md`）：
  - 5 个交易日报告生成成功率 = 100%（非交易日跳过不计入失败）
  - 每份报告通过 T-7.7 的数据新鲜度、空值率检查
  - 未出现限流/重试熔断记录（如触发，需调整 T-1.2 限流参数后重新计入观察期，不得无视继续放量）

### T-8.3　Stage 3：单交易日盘中长稳定性测试
- **前置任务**：T-8.2
- **任务**：事件监听在一个完整交易日（9:30-15:00）内持续运行不重启
- **验收标准**：进程内存收盘时相较开盘时增长不超过 20%；捕获到的真实盘中事件（涨停/异动）与人工抽样核对至少 90% 一致（本 plan 唯一允许少量人工核对的一步，因为"盘中是否发生某事件"是外部事实，无法用代码自证）

### T-8.4　边界情况回灌
- **前置任务**：与 T-8.1/T-8.2/T-8.3 同步进行，任意时刻发现问题即触发
- **任务**：Stage 1-3 期间如遇到 mock 未覆盖的真实情况（停牌、退市、字段缺失等），必须：① 存为新 fixture（`test/fixtures/raw/edge-cases/`）② 补充对应单元测试 ③ 记录到 `docs/decisions/T-8.4-live-findings.md`
- **验收标准**：`docs/decisions/T-8.4-live-findings.md` 不能为空文件；若 Phase 8 全程未发现任何 mock 未覆盖情况，需在文档中说明是"覆盖已足够完善"还是"恰好没有撞上边界事件"，后者应考虑延长观察期

### Phase 8 Definition of Done
- [ ] T-8.1、T-8.2、T-8.3 依次通过，无跳步
- [ ] T-8.4 的边界情况记录与回灌已完成
- [ ] `docs/audit/live-stage2-report.md` 中记录的所有告警已逐条分类（真实问题 / 待 T-9.4 判断阈值合理性）

---

## 17. Phase 9：生产级增强

> 依赖 Phase 8 完成。本 Phase 各任务彼此独立，除依赖关系外可并行。

### T-9.1　数据与日志留存策略
- **前置任务**：T-8.3
- **输出**：`src/cli/cleanup.ts`
- **策略**：日报永久保留；候选池缓存保留 90 天后归档压缩；原始探测 fixture 不清理
- **验收标准**：构造超过/未超过保留期的文件 mock，断言精确清理，不误删

### T-9.2　全自动补跑升级
- **前置任务**：T-7.8, T-8.3
- **任务**：调度器每日启动时自检"前一交易日是否已有报告"，缺失则自动补跑，无需人工发现
- **验收标准**：mock"前一交易日无报告"场景，断言自动检测并补跑，同时推送通知（补跑不能悄悄发生）

### T-9.3　策略前瞻跟踪复盘
- **前置任务**：T-7.9（存证数据已从 Phase 7/8 期间持续积累）, T-8.3
- **输出**：`src/pipeline/forwardTracking.ts` 中的复盘逻辑

**子任务 1：滚动复盘计算**
- 对 N 天前记录的每条推荐，用当前实际价格计算"跟随收益率"
- 验收：用构造好的历史价格序列手算期望收益率，断言函数输出精确一致

**子任务 2：策略健康度告警**
- 聚合每个信号/策略近期实际表现，与 Phase 4 回测阶段的历史预期对比，显著劣化则标记提醒
- 验收：构造"历史优异+近期连续失败"序列断言告警触发；"表现一致"序列断言不告警；"样本不足"场景标注"数据不足"而非过早下结论

- **验收标准（Phase 9 范围内）**：完成单元测试后，立即用 T-7.9 从 Phase 7/8 期间积累的真实数据跑一次首次复盘，产出 `docs/audit/strategy-health-{date}.md`

### T-9.4　告警阈值调优
- **前置任务**：T-8.2（需要 Stage 2 期间真实告警记录）
- **任务**：回顾 Stage 2 五个交易日所有真实告警，逐条判断真实问题 vs 阈值不合理导致的误报
- **验收标准**：产出 `docs/decisions/T-9.4-threshold-tuning.md`，逐条记录"告警内容 → 真实/误报判定 → 调整后阈值 → 依据"；调整后的阈值需同步更新 T-7.7 对应的测试用例

### Phase 9 Definition of Done
- [ ] T-9.1 ~ T-9.4 全部通过各自验收标准
- [ ] 至少完成一轮"信号触发 → 复盘 → 健康度报告"闭环，结论写入 `docs/audit/strategy-health-{date}.md`
