# 日报质量修复计划

> 起草日期: 2026-07-06
> 状态: 待审阅

---

## 问题概述

当前日报生成管线已完整跑通，但存在两个制约迭代效率和质量的根本问题：

1. **迭代周期过长**：每次运行 `run-daily-report` 需处理 2853 只股票的 K 线拉取（含限流等待约 2-3 分钟），导致修复-验证循环缓慢。
2. **报告人类不可读**：日报展示原始数据/分数，但缺乏解释上下文。用户看到 `资金面: 0/100` 或 `[S01, S04, S08]` 但无法理解其含义和行动指引。

---

## 任务 1：加速迭代

### 方案 A：添加 `--quick` 模式（候选股上限）

修改 `run-daily-report.ts`，添加 `--quick` 与 `--max-candidates=N` 参数：

```bash
# 快速迭代模式：只处理前 200 只候选股
tsx src/cli/run-daily-report.ts --quick --max-candidates=200
```

修改点：

| 文件 | 修改 | 影响 |
|------|------|------|
| `src/cli/run-daily-report.ts` | `parseArgs` 增加 `--quick`/`--max-candidates` 解析；传递给 `runDailyBatch` | CLI 层 |
| `src/pipeline/candidatePool.ts` | `runDailyBatch` 增加 `maxCandidates` 选项；在 `quickFilter` 后截断 | pipeline 层 |
| `src/cli/run-stage1.ts` | 同步添加 `--quick` 参数 | CLI 层 |

### 方案 B：SDK 响应缓存层

在 `src/data/` 层增加内存缓存，避免同一会话内重复请求：

```typescript
// src/data/cacheLayer.ts (新文件)
export function createCachedClient(client: SdkClient, ttlMs?: number): SdkClient
```

- 用 `Map<string, { data: unknown; expiry: number }>` 缓存每个方法的 Promise 结果
- TTL 默认 5 分钟
- 同一个 CLI 进程内第二次调用同一方法直接返回缓存
- 不影响测试（测试已走 mock）

### 实施方案

**优先实现方案 A（--quick 模式）**：修改量小（2 个文件），立即可用。
方案 B 作为可选增强，标记为后续优化。

---

## 任务 2：报告质量提升

### 2.1 问题根因分析

| 报告板块 | 当前输出 | 根本问题 | 缺少什么 |
|---------|---------|---------|---------|
| **持仓概览** | 市值、盈亏、涨跌 | ✅ 基本可读 | 可添加行业/板块上下文 |
| **组合健康度** | `资金面: 0/100` | 数值无上下文；0 分不说明原因 | 评分解释 + 归因文本 |
| **候选池摘要** | `[S01, S04, S08]` | 信号编号无含义 | 信号名称 + 触发逻辑简述 |
| **再平衡建议** | `评分: 25/100` | 无拆解原因 | 各因子评分 + 替换理由 |
| **回测摘要** | `总回测结果数: 0` | 硬编码空数据 | 可回测的策略列表或说明 |

### 2.2 修复方案

#### 2.2.1 健康度评分增加文字解释

**改动文件**: `src/pipeline/reportBuilder.ts` + `src/engine/scoring.ts`

在 `PortfolioHealthResult` 中增加 `details` 字段：

```typescript
export interface PortfolioHealthResult {
  // ... 现有字段
  details: HealthDetail[];  // 新增：逐维度解释
}

export interface HealthDetail {
  dimension: string;
  score: number;
  weight: number;
  label: string;          // 可读标签
  interpretation: string; // 评分含义
  reason: string;         // 评分的归因
  suggestion: string;     // 建议
}
```

渲染时，每个维度增加解释行：

```text
【组合健康度】
----------------------------------------
总分: 33/100  [危险]
  资金面: 0/100       (权重 25%) → 数据不足，暂未获取持仓资金流数据
  技术面: 0/100       (权重 20%) → 数据不足，暂未获取技术指标数据
  组合风险: 75/100    (权重 20%) → 最大回撤 1.83%，风险控制良好
  情绪面: 38/100      (权重 15%) → 持仓平均日涨跌 -0.77%，偏弱
  事件安全: 100/100   (权重 10%) → 近期无重大事件
  策略机会: 27/100    (权重 10%) → 活跃信号较少
```

#### 2.2.2 信号编号 → 可读名称 + 触发理由

**改动文件**: `src/pipeline/reportBuilder.ts` + `src/engine/signals/index.ts`

增加信号注册表的描述信息：

```typescript
// src/engine/signals/index.ts 增加
export const SIGNAL_DESCRIPTIONS: Record<string, {
  name: string;
  summary: string;
}> = {
  S01: { name: '资金流排名前10%', summary: '个股资金净流入排名市场前10%' },
  S02: { name: '三级传导共振', summary: '大盘翻红 + 板块前3 + 个股前3%' },
  S03: { name: '北向连续增持', summary: '北向资金连续5日增持' },
  S04: { name: 'MACD金叉', summary: 'DIF上穿DEA，短期趋势转强' },
  S05: { name: 'KDJ超卖底背离', summary: 'K<20且价格新低但K不新低' },
  S06: { name: '放量突破BOLL中轨', summary: '价格站上中轨且成交量放大' },
  S07: { name: '涨停机构买入回调', summary: '涨停后机构买入，回调企稳' },
  S08: { name: '多维共振', summary: '同时满足资金流/北向/MACD等多个条件' },
};
```

渲染候选池时：

```text
【候选池摘要】
----------------------------------------
候选总数: 2764
信号最多的股票:
  中国石油(601857):
    - S01 资金流排名前10%  主力净流入排名靠前
    - S04 MACD金叉        DIF上穿DEA，短线转强
    - S08 多维共振         同时满足多项条件
```

#### 2.2.3 再平衡建议增加因子拆解

**改动文件**: `src/pipeline/rebalance.ts` + `src/pipeline/reportBuilder.ts`

在 `RebalanceSuggestion` 中增加 `details`：

```typescript
export interface RebalanceSuggestion {
  overallHealthScore: number;
  replaceCandidates: Array<{
    code: string;
    name: string;
    totalScore: number;
    fundFlowScore: number;
    signalScore: number;
    reason: string;  // 新增：建议替换的具体原因
  }>;
}
```

渲染时：

```text
【再平衡建议】
----------------------------------------
组合健康度评分: 27/100
建议关注替换:
  黄金ETF华安(518880)  评分: 25/100
    ├─ 资金流: 50/100  (中性)
    └─ 信号: 0/100     (无触发信号，活跃度不足)
  科创50ETF易方达(588080)  评分: 25/100
    ├─ 资金流: 50/100  (中性)
    └─ 信号: 0/100     (无触发信号，活跃度不足)
```

#### 2.2.4 回测空结果处理

**改动文件**: `src/cli/run-daily-report.ts`

将硬编码 `backtestResults = []` 改为：
- 尝试运行 5 个策略的简易回测（使用持仓股 K 线数据）
- 如果失败，显示提示信息而非空

```text
【回测摘要】
----------------------------------------
总回测结果数: 0
（注：回测依赖历史K线数据与策略参数，可在收盘后通过 run-backtest CLI 单独运行）
```

#### 2.2.5 Watchlist 增强

**改动文件**: `src/pipeline/reportBuilder.ts`

为 Watchlist 股票增加信号状态标记：

```text
【Watchlist 概览】
----------------------------------------
共 9 只
  贵州茅台(600519)  现价: ¥1208.58  涨跌: +1.18%  [信号: S04 MACD金叉]
  宁德时代(300750)  现价: ¥378.13  涨跌: -0.49%
```

---

## 3. 实施优先级

| 优先级 | 任务 | 文件 | 预估工作量 |
|--------|------|------|-----------|
| P0 | `--quick` 模式 | candidatePool.ts + run-daily-report.ts | 0.5h |
| P1 | 信号名称映射 + 候选池渲染 | signals/index.ts + reportBuilder.ts | 0.5h |
| P1 | 健康度评分解释 | scoring.ts + reportBuilder.ts | 1h |
| P2 | 再平衡建议拆解 + 理由 | rebalance.ts + reportBuilder.ts | 1h |
| P2 | Watchlist 信号标记 | reportBuilder.ts + holdingsMonitor.ts | 0.5h |
| P3 | 回测空结果处理 | run-daily-report.ts | 0.5h |
| P3 | SDK 缓存层（方案 B） | data/cacheLayer.ts | 1h |

---

## 4. 验收标准

最终日报应满足：

```
【组合健康度】
  每个维度分数后有 → 解释和归因

【候选池摘要】
  信号显示名称而非编号 → 有触发原因简述

【再平衡建议】
  建议替换有具体理由 → 因子拆解可见

【Watchlist】
  信号状态标记

【回测】
  不为空或给出明确说明

【运行时间】
  --quick 模式下候选池 ≤ 500 只，单次运行 ≤ 30 秒
```

---

## 5. 不纳入本次修复的项

- LLM 润色报告（可作为独立 Phase 10 任务，需要先接入 LLM SDK）
- HTML Dashboard（需求文档 4.3 节，UI 工作，非 MVP 范围）
- 推送渠道（Telegram/企业微信）
- 多语言报告
