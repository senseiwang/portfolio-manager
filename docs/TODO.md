# 组合管理工具 — 需求文档

> 基于 Stock SDK v2（命名空间 API）构建的个人 A 股组合管理系统。
> 核心思路：将数据分为 **持仓 / Watchlist / 系统推荐** 三个池子，分别对应防御、进攻、拓新三个目标。

---

## 0. 数据源接入

> 持仓数据、Watchlist 初始数据来自用户实盘账户。

### 0.1 方案对比

> 券商 App（同花顺/中金财富等）无公开 API，HTTPS 证书绑定 + 私有协议，个人无法接入。

| 方案 | 实现难度 | 维护成本 | 实时性 | 可靠性 | 应用阶段 |
|------|---------|---------|:-----:|:-----:|---------|
| **手动录入** | 零 | 低（调仓后改一次） | 即时 | 最高 | **MVP（首选）** |
| **截图 OCR** | 低 | 低（仅截图） | 盘后 | 中 | 二期可选 |
| **条件单生成** | 中 | 低 | 盘中 | 高 | 高级功能 |

### 0.2 MVP 方案：手动录入

```yaml
# holdings.yaml
holdings:
  - code: "600519"    # 贵州茅台
    shares: 100
    costPrice: 1850.00
  - code: "300750"    # 宁德时代
    shares: 500
    costPrice: 220.00

watchlist:
  - "000858"   # 五粮液
  - "002415"   # 海康威视
```

日常运行时用 `sdk.batch.byCodes(codes)` 实时更新现价，自动计算市值/盈亏。**调仓后手动更新一次 YAML 即可**。

### 0.3 OCR（二期，本文档不展开）

> 仅记录方案方向，不纳入 MVP 排期。如后期需要，可接入硅基流动 API：
> 首选 Qwen3.5-35B-A3B 直接出 JSON，降级 PaddleOCR-VL-1.5 文字识别 + 本地后处理。

### 0.4 增量更新策略

| 频率 | 数据 | 方式 |
|:----:|------|------|
| **每日盘后** | 行情、K 线、信号 | SDK 自动获取 |
| **调仓后** | 持仓数量、成本价 | 手动改 YAML |
| **每周** | Watchlist 调整 | 用户主动维护 |
| **每月** | 组合再平衡 | 系统生成 + 用户决策 |

---

## 1. 数据展示

### 1.1 已有持仓

> 核心目标：**别出事**。防御型监控，关注持仓组合的风险暴露和异常信号。

#### 1.1.1 组合层面分析

| 维度 | 功能 | SDK 调用 |
|------|------|---------|
| **组合暴露分析** | 持仓行业归属 → 看板块资金流向，暴露在流出行业的占比 | `sdk.board.industry.spot(code)` |
| **组合与大盘背离** | 组合加权涨幅 vs 全市场平均涨幅，连续 N 日跑输 | `sdk.batch.cn()` |
| **个股风险贡献** | ATR/价格 × 仓位占比，排名最高的考虑减仓 | `calcATR(closes, { period: 14 })` |
| **流动性预警** | 持仓量 > 近 5 日日均成交量 20% → 小盘股预警 | `sdk.batch.byCodes(codes)` |
| **对标指数偏离** | 组合行业分布 vs 沪深 300，偏离过大 → 未意识到的赌注 | `sdk.board.industry.spot(code)` |

#### 1.1.2 事件驱动提醒

| 维度 | 功能 | SDK 调用 |
|------|------|---------|
| **除权除息提醒** | 提前知道除权日 | `sdk.reference.dividendDetail(symbol)` |
| **节假日休市** | 提前 N 天提醒长假休市 | `sdk.calendar.nextTradingDay()` / `isTradingDay()` |
| **两融标的调整** | 持仓是否被调出 | `sdk.margin.targetList(date?)` |
| **解禁提醒** | 提前 30 天预警 | 东方财富 datacenter API（直调） |
| **业绩预告窗口** | 财报季前 2 周提醒 | 日历推算 |

---

### 1.2 Watchlist

> 核心目标：**找到入场点**。比持仓更主动，需要多因子交叉信号。

#### 1.2.1 MVP 信号（一期实现 8 种，非 33 种）

> 33 种信号作为"信号百科全书"记录，但 **MVP 只实现下面 8 种**——覆盖资金流、技术面、情绪面三个维度，足以验证全链路。
> 其余 25 种作为二期扩展，逻辑复用同一套指标 + 判断框架，扩展成本是线性的。

**MVP 一期信号清单：**

| # | 类别 | 信号 | 判断逻辑 | 数据源 |
|---|------|------|---------|--------|
| 1 | 资金流 | 个股资金流排名前 10% | `sdk.fundFlow.rank()` → 取前 10% | SDK |
| 2 | 资金流 | 三级传导共振 | `sdk.fundFlow.market()` 翻红 + `sdk.fundFlow.sectorRank()` 前 3 + `sdk.fundFlow.rank()` 前 3% | SDK |
| 3 | 北向 | 北向连续 5 日增持 | `sdk.northbound.individual(symbol)` 近 5 日数据逐日比较 | SDK |
| 4 | 技术 | MACD 金叉 | `calcMACD(closes)` → dif 上穿 dea | `stock-sdk/indicators` |
| 5 | 技术 | KDJ 超卖 + 底背离 | `calcKDJ(ohlcv)` → K < 20 且价格新低但 K 值不新低 | `stock-sdk/indicators` |
| 6 | 技术 | 放量突破 BOLL 中轨 | `calcBOLL(closes)` → 价格站上 mid + 量 > 5 日均量 × 1.5 | `stock-sdk/indicators` |
| 7 | 情绪 | 涨停后机构买入回调 | `sdk.marketEvent.ztPool()` 涨停 + `sdk.dragonTiger.detail()` 机构净买入 | SDK |
| 8 | 综合 | 多维共振（最难） | 信号 1 + 信号 3 + 信号 4 + RSI < 65 + 价格未创新高 | SDK + indicators |

**二期扩展（仅记录，不排期）：**

全部 33 种信号清单见附录 B。扩展时复用 MVP 的 `calcMA/MACD/BOLL/KDJ/RSI/SAR/ATR` 等指标函数 + `sdk.fundFlow.*` / `sdk.northbound.*` / `sdk.marketEvent.*` / `sdk.dragonTiger.*` 数据源，只需新增判断逻辑文件，不涉及架构改动。

#### 1.2.2 扫描范围限定

> 全市场 5000+ 只逐一算 K 线 + 指标不现实。所有扫描限制在**候选池**内。

**硬性过滤条件：**

| 维度 | 条件 | 目的 |
|------|------|------|
| 流通市值 | > 50 亿 | 剔除微盘股 |
| 日均成交额 | > 1 亿（近 20 日） | 保证流动性，排除庄股 |
| 指数成分 | 沪深 300 / 中证 500 / 中证 1000 | 锁定大体量标的 |
| ST | 排除 | 退市风险 |
| 新股 | 上市 > 60 日 | 避免次新股异常波动 |
| 连续涨停 | 近 5 日 ≤ 3 天 | 排除纯情绪连板妖股 |
| 日均振幅 | < 10%（近 20 日） | 排除极端波动 |

**扫描范围划分：**

| 池子 | 规模 | 更新节奏 |
|------|:----:|---------|
| **Watchlist** | ≤ 50 只 | 用户控制，全量计算 |
| **候选池自动** | 200-500 只 | **盘后批处理**，每日更新一次 |
| **事件临时入池** | 当日 | **盘中事件驱动**，实时追加（涨停/龙虎榜/异动触发） |

> 两条独立的执行链路：**盘后批处理任务**（候选池全量扫描）+ **盘中事件监听任务**（实时入池 + 推送）。

#### 1.2.3 候选池动态更新

| 功能 | 扫描范围 | 数据源 |
|------|---------|--------|
| **板块龙头识别** | 候选池 | `sdk.board.industry.constituents` → 过滤器 → `sdk.batch.byCodes` |
| **强势股回调** | 候选池 | `sdk.kline.cn` 拿 K 线 → `calcMA` + 涨幅/回调过滤 |
| **底部放量启动** | 候选池 | `sdk.kline.cn` + `calcMA`（均量）+ 价格站上 MA20 |
| **大单异动** | 事件入池 | `sdk.marketEvent.stockChanges` |
| **涨停首次开板** | 事件入池 | `sdk.marketEvent.ztPool` + 过滤器 |
| **北向增持交叉** | Watchlist | `sdk.northbound.holdingRank` 前 50 ∩ Watchlist |

#### 1.2.4 行业轮动信号

| 功能 | 数据源 |
|------|--------|
| 板块资金流向排名 | `sdk.fundFlow.sectorRank()` |
| 行业指数技术面突破 | `sdk.board.industry.kline` → `calcBOLL` / `calcMACD` |
| 板块强度排序 | `sdk.batch.cn()` 按行业汇总涨跌幅 |

---

### 1.3 系统推荐（候选池主动扫描）

> 核心目标：**发现盲区**。在限定候选池（200-500 只）内主动挖掘，不含微盘妖股。

| 功能 | 逻辑 | 数据源 |
|------|------|--------|
| **你不在的地方在涨** | 行业涨跌幅排名 → 连续 3 日涨幅前 3 但零持仓 | `sdk.batch.cn()` 按行业聚合 |
| **风格暴露盲区** | 按市值分大盘/中盘/小盘，看组合偏哪个风格 | `sdk.batch.cn()` |
| **持仓股的"同行"** | 同板块、市值相近但估值更低 | `sdk.board.industry.constituents` + `sdk.batch.byCodes` |
| **龙虎榜席位追踪** | 知名营业部近期买入标的 | `sdk.dragonTiger.seatDetail` |
| **龙虎榜净买入排名** | 机构席位净买入 Top 10 | `sdk.dragonTiger.detail` |
| **涨停板块线索** | 多个涨停同属一行业 → 板块效应 | `sdk.marketEvent.ztPool` |
| **大盘情绪温度计** | 涨跌家数比 + 涨停/跌停比 → 贪婪/恐惧 | `sdk.batch.cn()` + `sdk.marketEvent.ztPool` |
| **北向风格切换** | 对比上周/本周前 10 持仓 | `sdk.northbound.holdingRank` |

---

### 1.4 跨池子联动

**资金流向三级传导：**

```
sdk.fundFlow.market() → sdk.fundFlow.sectorRank() → sdk.fundFlow.rank()
```

大盘流入 → 找流入最多的板块 → 找板块内流入最多的个股 → 自动加入 watchlist

**相关性预警：** 持仓股 A 与 watchlist 中的 B 同板块，B 出现资金异动 → 间接影响 A。

**组合再平衡（每月 1 日）：**

1. 各持仓 `sdk.fundFlow.individual` 近 20 日累计资金流
2. 各持仓 `calcSignals` 信号检测结果
3. 打分公式（见 4.5）→ 分数最低的 1-2 只替换为 watchlist 高分股

---

## 2. 策略设计工作区

### 2.1 MVP 策略（一期实现 5 种）

> 15 种预设策略作为知识库记录（见附录 B），**MVP 只实现下面 5 种**，覆盖趋势、反转、形态、资金四大类。

#### 趋势跟踪型

```
策略 1：强势回调
  近 20 日涨幅 > 15%  &&  今日回调 > -2%  &&  成交量缩量
  → 均线: calcMA(closes)  → 信号: 手动判断
```

#### 反转抄底型

```
策略 2：底部启动
  成交量 > 5 日均量 × 2  &&  价格站上 MA20  &&  MACD 金叉
  → 指标: calcMA + calcMACD
```

#### 形态突破型

```
策略 3：箱体突破
  突破 60 日最高价(前 60 日箱体)  &&  成交量倍量  &&  BOLL 开口扩张
  → 指标: calcBOLL + 价格极值比较
```

#### 资金共振型

```
策略 4：资金共振
  北向连续 3 日增持(northbound.individual)
  + 个股资金流排名前 10%(fundFlow.rank)
  + 板块资金流前 5(fundFlow.sectorRank)
```

```
策略 5：机构打板回调
  涨停后回调 3-5 日  &&  龙虎榜机构净买入 > 5000 万
  &&  回调不破涨停日收盘价
  → 数据: marketEvent.ztPool + dragonTiger.detail
```

### 2.2 策略回测

| 场景 | 实现方式 |
|------|---------|
| MA5 金叉 MA20 买入胜率？ | `sdk.kline.cn()` → `calcMA` + `calcMACD` → `backtest()` |
| 底部启动策略年化收益？ | 同上，策略逻辑用 `Strategy<T>` 函数封装 |
| 资金共振策略夏普比率？ | `backtest()` 返回报告含收益曲线和逐笔交易 |

> `backtest()` 函数从 `stock-sdk/screener` subpath 导入，不是 StockSDK 门面方法。

---

## 3. 盘后扫描与日报

### 3.1 资金面预警

| 场景 | 数据源 |
|------|--------|
| 主力净流出异常 | `sdk.fundFlow.individual(symbol)` → 当日净流出 > 近 20 日均值 × 2 |
| 北向连续减持 | `sdk.northbound.individual(symbol)` → 连续 3 日减持 |
| 持仓板块内垫底 | `sdk.fundFlow.sectorRank()` → 持仓股在板块内资金流排名后 10% |

### 3.2 市场情绪面

| 场景 | 数据源 |
|------|--------|
| 板块异动 | `sdk.marketEvent.boardChanges()` |
| 盘口异动 | `sdk.marketEvent.stockChanges()` |
| 涨停家数异常 | `sdk.marketEvent.ztPool()` → 涨停/跌停比骤变 |

### 3.3 盘后复盘

| 场景 | 数据源 |
|------|--------|
| 扫便宜货 | `sdk.batch.cn()` → 数组过滤（pe < 15 && 股息率 > 3%）|
| 持仓龙虎榜 | `sdk.dragonTiger.detail()` |
| 北向重仓方向 | `sdk.northbound.holdingRank()` |
| 涨停连板龙头 | `sdk.marketEvent.ztPool()` |

---

## 4. 组合日报（综合报告）

> 综合 Sections 1-3 的扫描成果生成报告。报告结构如下。

### 4.1 报告结构

```
📊 组合日报 | YYYY-MM-DD
├── 持仓概览（当日收益、本月收益、仓位、回撤）
├── 持仓预警
│   ├── 资金面预警（主力/北向）
│   ├── 技术面预警（金叉/死叉/超买/超卖）
│   └── 事件提醒（除权/休市）
├── Watchlist 信号（按优先级排列）
├── 系统推荐（反向/相似度/情绪）
├── 策略触发（MVP 5 策略命中列表）
├── 再平衡建议（评分最低的 1-2 只）
└── 综合评分（0-100 分）
```

### 4.2 评分体系（需定义公式）

> 以下只定义了维度和权重，**未定义评分函数**。实现在 Phase 0 中完成公式设计。

| 维度 | 权重 | 评分因子 |
|------|:----:|---------|
| 资金面健康度 | 25% | 主力净流入评分 + 北向净流入评分 |
| 技术面健康度 | 20% | 金叉/死叉信号 + 超买/超卖 |
| 组合风险 | 20% | 行业集中度 + 流动性 + ATR 风险 |
| 情绪面 | 15% | 板块异动 + 涨停温度 |
| 事件安全 | 10% | 解禁/除权预警 |
| 策略机会 | 10% | Watchlist 信号强度 |

> **需要定义的评分函数示例**：
> - 主力净流入评分 = `clip(当日净流入 / 近 20 日均值, -1, 1)` 映射到 0-100
> - 行业集中度 = `max(各行业仓位占比) - 25%` 映射到 0-100（越低越好）
> - 金叉/死叉评分 = 金叉 +10 分，死叉 -20 分，累计求和
>
> 具体公式在 Phase 0 中与数据源核对后确定，避免"开发时反复返工"。

| 分数区间 | 颜色 | 含义 |
|:--------:|:----:|------|
| 85-100 | 🟢 | 健康 |
| 65-84 | 🟡 | 关注 |
| 40-64 | 🟠 | 警惕 |
| 0-39 | 🔴 | 危险 |

---

## 5. 技术实现计划

### Phase 0：SDK 接口映射与缺失模块设计（先决条件）

> ✅ 本项目的 SDK 已是 v2 命名空间 API（非扁平风格），TODO.md 中的 `sdk.fundFlow.individual()`、
>   `sdk.batch.byCodes()` 等调用风格与当前代码库匹配。
>   `screen`、`backtest`、`calcSignals`、`addIndicators` 全部经 npm 安装验证（`stock-sdk@2.2.2`）真实存在。

但仍需完成以下**核对与设计**工作，否则后面一定会卡住：

- [ ] **逐一核对 TODO 中所有 SDK 方法名**（对照 `src/sdk.ts` 门面 + `src/index.ts` 导出 + subpath 导出），输出真实接口映射表
- [ ] **定义评分公式**（4.2 的 6 个维度各自怎么算出 0-100 分，要有明确数学公式）
- [ ] **设计自研信号判断模块**（8 种 MVP 信号的判断逻辑代码结构，基于 `stock-sdk/indicators` 的 calc* 函数）
- [ ] **明确数据缓存与限流策略**（免费接口频率限制：单次扫描 200-500 只股票，需控制并发数，SDK 的 rateLimit/circuitBreaker 配置项要落地）
- [ ] **设计盘后批处理与盘中监听的调度架构**（两条独立的执行链路）
- [ ] **确认 `batch.cn()` 返回字段**（特别是 `pe` 字段是否存在及其类型）

**只有 Phase 0 完成后，Phase 1 的估时才准确。**

### 5.1 Phase 1：数据获取层

- [ ] 持仓/Watchlist 配置读取（YAML/JSON）
- [ ] 封装每日盘后批量数据获取模块（候选池全量扫描）
- [ ] 封装盘中事件监听模块（涨停/龙虎榜/异动实时入池）
- [ ] 实现 MVP 8 种信号的判断逻辑（基于 `calcMA/MACD/BOLL/KDJ/RSI...` + SDK 数据）

### 5.2 Phase 2：日报生成

- [ ] 资金面扫描模块
- [ ] 技术面扫描模块
- [ ] 情绪面扫描模块
- [ ] 日历提醒模块
- [ ] 日报渲染引擎（纯文本 + HTML）
- [ ] 评分引擎（公式落地）

### 5.3 Phase 3：策略引擎

- [ ] MVP 5 种策略的规则引擎（非 15 种）
- [ ] 策略回测集成（`backtest()`）
- [ ] 策略定时执行 + 推送

### 5.4 Phase 4：联动功能

- [ ] 三级资金传导监控
- [ ] 组合再平衡建议
- [ ] 相似度/反向推荐

---

## 6. SDK 接口映射表（真实，非推测）

### 6.1 调用约定

```
数据获取类方法：sdk.[namespace].[method]()     ← StockSDK 门面命名空间
计算类方法：    calcMACD(closes), backtest()  ← 独立函数，从 subpath 导入
```

### 6.2 命名空间数据 API

| 数据 | 调用方式 | 验证状态 |
|------|---------|:-------:|
| A 股批量行情 | `sdk.batch.cn()` | ✅ `sdk.ts:130` |
| 按代码批量行情 | `sdk.batch.byCodes(codes)` | ✅ `sdk.ts:133` |
| A 股分时 | `sdk.quotes.timeline(code)` | ✅ `sdk.ts:107` |
| A 股 K 线 | `sdk.kline.cn(symbol, options)` | ✅ `sdk.ts:145` |
| 个股资金流 | `sdk.fundFlow.individual(symbol, options)` | ✅ `sdk.ts:227` |
| 大盘资金流 | `sdk.fundFlow.market()` | ✅ `sdk.ts:228` |
| 资金流排名 | `sdk.fundFlow.rank(options)` | ✅ `sdk.ts:229` |
| 板块资金流排名 | `sdk.fundFlow.sectorRank(options)` | ✅ `sdk.ts:230` |
| 板块历史资金流 | `sdk.fundFlow.sectorHistory(symbol, options)` | ✅ `sdk.ts:231` |
| 北向持仓历史 | `sdk.northbound.individual(symbol, options)` | ✅ `sdk.ts:245` |
| 北向排行 | `sdk.northbound.holdingRank(options)` | ✅ `sdk.ts:243` |
| 北向分时 | `sdk.northbound.minute(direction?)` | ✅ `sdk.ts:241` |
| 北向汇总 | `sdk.northbound.summary()` | ✅ `sdk.ts:242` |
| 涨停股池 | `sdk.marketEvent.ztPool(type?, date?)` | ✅ `sdk.ts:255` |
| 盘口异动 | `sdk.marketEvent.stockChanges(type?)` | ✅ `sdk.ts:256` |
| 板块异动 | `sdk.marketEvent.boardChanges()` | ✅ `sdk.ts:257` |
| 龙虎榜 | `sdk.dragonTiger.detail(options)` | ✅ `sdk.ts:267` |
| 龙虎榜席位 | `sdk.dragonTiger.seatDetail(symbol, date)` | ✅ `sdk.ts:271` |
| 分红详情 | `sdk.reference.dividendDetail(symbol)` | ✅ `sdk.ts:332` |
| 交易日历 | `sdk.calendar.isTradingDay(date?)` | ✅ `sdk.ts:319` |
| 下一交易日 | `sdk.calendar.nextTradingDay(date?)` | ✅ `sdk.ts:320` |
| 市场状态 | `sdk.calendar.marketStatus(market?)` | ✅ `sdk.ts:322`（同步方法） |
| 两融标的 | `sdk.margin.targetList(date?)` | ✅ `sdk.ts:294` |
| 大宗交易 | `sdk.blockTrade.*` | ✅ `sdk.ts:277-285` |
| 行业板块实时 | `sdk.board.industry.spot(symbol)` | ✅ `sdk.ts:163` |
| 行业板块成分股 | `sdk.board.industry.constituents(symbol)` | ✅ `sdk.ts:164` |
| 行业板块 K 线 | `sdk.board.industry.kline(symbol, options)` | ✅ `sdk.ts:165` |

### 6.3 subpath 计算 API

| 函数 | 导入路径 | 验证状态 |
|------|---------|:-------:|
| `calcMA` / `calcSMA` / `calcEMA` / `calcWMA` | `stock-sdk/indicators` | ✅ |
| `calcMACD` / `calcBOLL` / `calcKDJ` / `calcRSI` | `stock-sdk/indicators` | ✅ |
| `calcWR` / `calcBIAS` / `calcCCI` / `calcATR` | `stock-sdk/indicators` | ✅ |
| `calcOBV` / `calcROC` / `calcDMI` / `calcSAR` / `calcKC` | `stock-sdk/indicators` | ✅ |
| `addIndicators` | `stock-sdk/indicators` | ✅ `src/indicators/addIndicators.ts` |
| `calcSignals` | `stock-sdk/signals` | ✅ `src/signals/index.ts` |
| `screen` | `stock-sdk/screener` | ✅ npm 2.2.2 验证；链式 `.where()/.sortBy()/.top()/.toArray()` |
| `backtest` | `stock-sdk/screener` | ✅ npm 2.2.2 验证；单标的全仓多头回测引擎 |

### 6.4 待确认项

> 以下为 Phase 0 中需要实际运行验证的字段，不能仅靠类型声明确认。

- [ ] `sdk.batch.cn()` 返回的 `FullQuote` 是否确实包含 `pe`（市盈率 TTM）字段？
- [ ] `batch.byCodes` 是否接受字符串数组？是否需要市场前缀？
- [ ] 候选池过滤条件中的"流通市值""日均成交额"能从哪个 SDK 接口拿到？
- [ ] `calcSignals` 输出格式与日报预警系统对接的具体字段名

---

## 附录 A：设计原则与约束

### 范围控制

| 项目 | MVP 数量 | 总清单数量 | 理由 |
|------|:--------:|:---------:|------|
| Watchlist 信号 | 8 种 | 33 种 | MVP 验证全链路，其余二期线性扩展 |
| 预设策略 | 5 种 | 15 种 | 覆盖趋势/反转/形态/资金四大类即可 |
| 候选池 | 200-500 只 | — | 超过需评估接口限流预算 |

### 执行链路分离

```
盘后批处理任务（每日收盘后运行）
  ├── 更新候选池（过过滤器）
  ├── 拉取候选池 K 线 + 计算指标
  ├── 运行 8 种信号判断
  ├── 运行 5 种策略规则
  ├── 生成评分 + 再平衡建议
  └── 输出日报

盘中事件监听任务（实时运行）
  ├── marketEvent.boardChanges → 判断板块异动
  ├── marketEvent.stockChanges → 判断盘口异动
  ├── dragonTiger.detail → 龙虎榜净买入
  └── marketEvent.ztPool → 涨停/开板
```

### 限流与缓存策略（需 Phase 0 细化）

- SDK 已内置 `rateLimit` / `circuitBreaker` / `retry` 配置
- 候选池 200-500 只，日均拉取 K 线约需 200-500 次 API 调用
- 建议配置：并发 5-7，间隔 200ms，超过需要评估接口承受能力
- 不同接口分属不同 host（`push2.eastmoney.com` / `qt.gtimg.cn`），限流独立计算

---

## 附录 B：完整信号与策略清单（知识库，非 MVP 范围）

> 以下仅作为知识库记录，不纳入 MVP 排期。
> MVP 实现 8 种信号 + 5 种策略，其余所有信号/策略的逻辑框架已确定：
> 数据源（SDK）+ 指标计算（`stock-sdk/indicators`）+ 判断逻辑（`if-else`），
> 扩展时只需新增判断逻辑文件，不涉及架构改动。

### B.1 33 种多因子交叉信号（完整版）

#### 资金流主导（4 种）

| # | 信号组合 | 星级 |
|---|---------|:----:|
| 1 | 个股资金流排名前 5% + 近 5 日主力净流入持续递增 + 价格未大涨（< 3%） | ⭐⭐⭐ |
| 2 | 大盘资金流翻红 + 板块资金流排名前 3 + 个股资金流排名前 3% | ⭐⭐⭐⭐ |
| 3 | 资金流排名前 10% + 超大单净流入占比 > 20% + 散户净流出 | ⭐⭐⭐ |
| 4 | 板块资金流连续 5 日净流入 + 板块指数放量突破 MA60 | ⭐⭐⭐⭐ |

#### 北向资金主导（3 种）

| # | 信号组合 | 星级 |
|---|---------|:----:|
| 5 | 北向连续 5 日增持 + 持股占流通比创 60 日新高 + 股价仍在 MA60 下方 | ⭐⭐⭐⭐ |
| 6 | 北向单日增持 > 3 亿 + 个股当日放量突破前高 | ⭐⭐⭐ |
| 7 | 北向连续 3 日减持同类股 + 你的持仓同板块 → 间接预警 | ⭐⭐ |

#### 技术面主导（18 种）

| # | 信号组合 | 星级 |
|---|---------|:----:|
| 8 | 周线 MACD 金叉 + 日线 BOLL 缩口后放量 + 成交量 > 5 日均量 × 2 | ⭐⭐⭐ |
| 9 | 日线 KDJ 超卖（< 20）+ RSI 底背离 + 放量阳线确认 | ⭐⭐⭐⭐ |
| 10 | 月线 MA 多头排列 + 周线 MACD > 0 + 日线放量突破 BOLL 中轨 | ⭐⭐⭐⭐ |
| 11 | 股价回调至 BOLL 下轨 + 缩量至 60 日均量 50% 以下 + KDJ 超卖 | ⭐⭐⭐ |
| 12 | SAR 由空转多 + MA5 上穿 MA10 + 当日收阳 | ⭐⭐ |
| 13 | 股价创 60 日新高 + RSI < 70 + 成交量温和放大 | ⭐⭐⭐ |
| 14 | 沿 MA5 上行 + MACD 红柱持续放大 + 成交量温和 | ⭐⭐ |
| 15 | 突破 60 日箱体上沿 + 倍量 + BOLL 开口扩张 | ⭐⭐⭐ |
| 16 | MA5/MA10/MA20 三线粘合后向上发散 + 放量阳线 | ⭐⭐⭐ |
| 17 | 新高缩量回调 + RSI 拒绝死叉（> 50）+ 再次放量 | ⭐⭐⭐⭐ |
| 18 | MA60 走平/上行 + 站上 MA60 + MA5 上穿 MA60 | ⭐⭐⭐ |
| 19 | 量连增 3 日 + 价格稳步推升 + MACD 零轴上方金叉 | ⭐⭐ |
| 20 | 跳空高开不回补 + 放量涨停 + 封单比 > 0.5% | ⭐⭐⭐ |
| 21 | BOLL 中轨获支撑 + KD 金叉 + MACD 零轴上方 | ⭐⭐ |
| 22 | VCP：波动率收缩 + 缩量至 40% + 窄幅整理后放量突破 | ⭐⭐⭐⭐ |
| 23 | 长下影（> 实体 2 倍）+ 放量 + KDJ 超卖区金叉 | ⭐⭐⭐ |
| 24 | ABC 调整结束 + 地量后放量 + 站上 MA20 | ⭐⭐ |
| 25 | 创历史新高 + RSI 未超买 + 均线多头 + MACD 红柱 | ⭐⭐⭐ |

#### 情绪面主导（4 种）

| # | 信号组合 | 星级 |
|---|---------|:----:|
| 26 | 涨停后回调 3-5 日 + 龙虎榜机构买入 > 5000 万 + 不破涨停日收盘价 | ⭐⭐⭐⭐ |
| 27 | 盘口"火箭发射" + 当日量 > 昨日 × 2 + 突破日内均线 | ⭐⭐ |
| 28 | 龙虎榜净买入前 10 + 机构占比 > 50% + 未涨停 | ⭐⭐⭐ |
| 29 | 全市场涨停 > 50 + 某板块涨停占比 > 30% → 板块效应 | ⭐⭐ |

#### 事件驱动 + 基本面（3 种）

| # | 信号组合 | 星级 |
|---|---------|:----:|
| 30 | 除权后贴权 > 10% + 资金流流入 + 北向增持 | ⭐⭐⭐ |
| 31 | 大宗溢价 > 5% + 占日成交 > 10% + 买方机构席位 | ⭐⭐⭐ |
| 32 | 融资余额连增 5 日 + 融券减少 + 股价横盘 | ⭐⭐ |

#### 综合（1 种）

| # | 信号组合 | 星级 |
|---|---------|:----:|
| 33 | 北向连续 5 日增持 + 资金流前 5% + 周线 MACD 金叉 + 板块资金流前 3 + RSI < 65 + 价格未创新高 | ⭐⭐⭐⭐⭐ |

### B.2 15 种预设策略（完整版）

| # | 策略名 | 类型 | 核心因子 |
|---|--------|------|---------|
| 1 | 强势回调 | 趋势跟踪 | 涨幅 > 15% + 回调 > -2% + 缩量 |
| 2 | 趋势加速 | 趋势跟踪 | 沿 MA5 + MACD 红柱放大 + 温和量 |
| 3 | 空中加油 | 趋势跟踪 | 新高回调 + RSI > 50 + 再放量 |
| 4 | 健康突破 | 趋势跟踪 | 60 日新高 + RSI < 70 + 温和量 |
| 5 | 底部启动 | 反转抄底 | 量 > 5 日均量 × 2 + 站上 MA20 + MACD 金叉 |
| 6 | 底背离反转 | 反转抄底 | 价格新低 + RSI 不新低 + 超卖区金叉 |
| 7 | 单针探底 | 反转抄底 | 长下影 + 放量 + 超卖区金叉 |
| 8 | 牛熊转换 | 反转抄底 | MA60 走平 + 站上 MA60 + MA5 上穿 |
| 9 | 箱体突破 | 形态突破 | 突破箱体 + 倍量 + BOLL 开口 |
| 10 | VCP 突破 | 形态突破 | 波动率收缩 + 缩量 + 放量突破 |
| 11 | 均线粘合向上 | 形态突破 | 三线粘合 + 放量阳线 + 发散 |
| 12 | 突破缺口 | 形态突破 | 跳空 + 涨停 + 封单比 > 0.5% |
| 13 | 资金共振 | 资金共振 | 北向 + 资金流 + 板块 |
| 14 | 三级传导 | 资金共振 | 大盘 + 板块 + 个股同步流入 |
| 15 | 机构打板回调 | 资金共振 | 涨停回调 + 龙虎榜机构买入 |
