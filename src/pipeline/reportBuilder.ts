/**
 * T-5.3 / T-5.4：日报数据聚合与渲染
 *
 * buildDailyReport：把 Phase 1-5 各管道产出聚合成 DailyReport 结构化数据。
 * renderPlainTextReport：将 DailyReport 渲染为纯文本格式。
 */
import type { SignalResult } from '../types/signal';
import type { EnrichedHolding, EnrichedWatchlistItem } from './holdingsMonitor';
import type { CandidatePoolReport } from './candidatePool';
import type { RebalanceSuggestion } from './rebalance';
import type { PortfolioHealthResult } from '../engine/scoring';
import type { BacktestResult } from '../engine/backtestRunner';
import { SIGNAL_DESCRIPTIONS } from '../engine/signals';

// ==================== 类型定义 ====================

/** 日报 7 大板块结构 */
export interface DailyReport {
  /** 日期 YYYY-MM-DD */
  date: string;
  /** 板块 1: 持仓概览 */
  holdingsOverview: {
    totalMarketValue: number;
    totalPnl: number;
    totalPnlPercent: number;
    holdings: EnrichedHolding[];
  };
  /** 板块 2: Watchlist 概览 */
  watchlistOverview: {
    totalStocks: number;
    items: EnrichedWatchlistItem[];
  };
  /** 板块 3: 组合健康度评分 */
  healthScore: PortfolioHealthResult;
  /** 板块 4: 候选池摘要 */
  candidatePool: {
    totalCandidates: number;
    topSignals: Array<{ code: string; name: string; signals: SignalResult[] }>;
  };
  /** 板块 5: 再平衡建议 */
  rebalance: RebalanceSuggestion;
  /** 板块 6: 回测摘要 */
  backtestSummary: {
    totalResults: number;
    bestStrategy: { strategy: string; totalReturn: number } | null;
    results: BacktestResult[];
  };
  /** 板块 7: 市场状态 */
  marketStatus: {
    isTradingDay: boolean;
    marketOpen: boolean;
    date: string;
  };
}

// ==================== 构建函数 ====================

export interface DailyReportInput {
  date: string;
  holdings: EnrichedHolding[];
  watchlist: EnrichedWatchlistItem[];
  healthScore: PortfolioHealthResult;
  candidatePool: CandidatePoolReport;
  rebalance: RebalanceSuggestion;
  backtestResults: BacktestResult[];
  marketStatus: { isTradingDay: boolean; marketOpen: boolean };
}

/**
 * 构建日报数据对象
 */
export function buildDailyReport(input: DailyReportInput): DailyReport {
  const {
    date,
    holdings,
    watchlist,
    healthScore,
    candidatePool,
    rebalance,
    backtestResults,
    marketStatus,
  } = input;

  // 持仓概览
  const totalMarketValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
  const totalPnl = holdings.reduce((sum, h) => sum + h.pnl, 0);
  const totalCostValue = holdings.reduce((sum, h) => sum + h.costValue, 0);
  const totalPnlPercent =
    totalCostValue > 0 ? Math.round((totalPnl / totalCostValue) * 10000) / 100 : 0;

  // 候选池 top 信号
  const topSignals = candidatePool.candidates
    .filter(c => c.signals.length > 0)
    .sort((a, b) => b.signals.length - a.signals.length)
    .slice(0, 10)
    .map(c => ({
      code: c.code,
      name: c.name,
      signals: c.signals,
    }));

  // 回测摘要：找出最好的策略
  let bestStrategy: { strategy: string; totalReturn: number } | null = null;
  if (backtestResults.length > 0) {
    const sorted = [...backtestResults].sort(
      (a, b) => b.report.totalReturn - a.report.totalReturn,
    );
    bestStrategy = {
      strategy: sorted[0].strategy,
      totalReturn: sorted[0].report.totalReturn,
    };
  }

  return {
    date,
    holdingsOverview: {
      totalMarketValue: Math.round(totalMarketValue * 100) / 100,
      totalPnl: Math.round(totalPnl * 100) / 100,
      totalPnlPercent,
      holdings,
    },
    watchlistOverview: {
      totalStocks: watchlist.length,
      items: watchlist,
    },
    healthScore,
    candidatePool: {
      totalCandidates: candidatePool.candidates.length,
      topSignals,
    },
    rebalance,
    backtestSummary: {
      totalResults: backtestResults.length,
      bestStrategy,
      results: backtestResults,
    },
    marketStatus: {
      isTradingDay: marketStatus.isTradingDay,
      marketOpen: marketStatus.marketOpen,
      date,
    },
  };
}

// ==================== 文本渲染 ====================

/** 分隔线 */
const SEP = '='.repeat(60);
const SUB_SEP = '-'.repeat(40);

/**
 * 渲染纯文本格式日报
 */
export function renderPlainTextReport(report: DailyReport): string {
  const lines: string[] = [];

  lines.push(SEP);
  lines.push(`  投资组合日报  ${report.date}`);
  lines.push(SEP);
  lines.push('');

  // --- 板块 1: 持仓概览 ---
  lines.push('【持仓概览】');
  lines.push(SUB_SEP);
  const { holdingsOverview } = report;
  lines.push(
    `总市值: ¥${formatMoney(holdingsOverview.totalMarketValue)}  |  ` +
    `总盈亏: ${formatSigned(holdingsOverview.totalPnl, '¥')}  |  ` +
    `盈亏比例: ${formatSigned(holdingsOverview.totalPnlPercent, '', '%')}`,
  );
  lines.push('');
  for (const h of holdingsOverview.holdings) {
    lines.push(
      `  ${h.name}(${h.code})  ` +
      `现价: ¥${h.currentPrice.toFixed(2)}  ` +
      `市值: ¥${formatMoney(h.marketValue)}  ` +
      `盈亏: ${formatSigned(h.pnl, '¥')}(${formatSigned(h.pnlPercent, '', '%')})  ` +
      `日涨跌: ${formatSigned(h.changePercent, '', '%')}`,
    );
  }
  lines.push('');

  // --- 板块 2: Watchlist ---
  lines.push('【Watchlist 概览】');
  lines.push(SUB_SEP);
  lines.push(`共 ${report.watchlistOverview.totalStocks} 只`);
  for (const item of report.watchlistOverview.items) {
    const signalInfo = (item as unknown as { signalLabel?: string }).signalLabel;
    const sig = signalInfo ? `  [${signalInfo}]` : '';
    lines.push(
      `  ${item.name}(${item.code})  ` +
      `现价: ¥${item.currentPrice.toFixed(2)}  ` +
      `涨跌: ${formatSigned(item.changePercent, '', '%')}${sig}`,
    );
  }
  lines.push('');

  // --- 板块 3: 组合健康度 ---
  lines.push('【组合健康度】');
  lines.push(SUB_SEP);
  const hs = report.healthScore;
  const colorLabel = getColorLabel(hs.colorBand);
  lines.push(`总分: ${hs.total}/100  [${colorLabel}]`);
  lines.push('');
  for (const d of hs.details) {
    const pct = Math.round(d.weight * 100);
    const bar = scoreBar(d.score);
    lines.push(
      `  ${d.label}: ${d.score.toString().padStart(3)}/100 ${bar}  (权重 ${pct}%)  → ${d.interpretation}`,
    );
    lines.push(`     └ ${d.reason}`);
    if (d.suggestion && d.score < 60) {
      lines.push(`     └ 建议: ${d.suggestion}`);
    }
  }
  lines.push('');

  // --- 板块 4: 候选池 ---
  lines.push('【候选池摘要】');
  lines.push(SUB_SEP);
  lines.push(`候选总数: ${report.candidatePool.totalCandidates}`);
  if (report.candidatePool.topSignals.length > 0) {
    lines.push('信号最多的股票:');
    for (const item of report.candidatePool.topSignals) {
      lines.push(`  ${item.name}(${item.code}):`);
      for (const s of item.signals) {
        const desc = SIGNAL_DESCRIPTIONS[s.signalId];
        if (desc) {
          lines.push(`    ${s.signalId} ${desc.name}  — ${desc.summary}`);
        } else {
          lines.push(`    ${s.signalId}`);
        }
      }
    }
  }
  lines.push('');

  // --- 板块 5: 再平衡建议 ---
  lines.push('【再平衡建议】');
  lines.push(SUB_SEP);
  lines.push(`组合健康度评分: ${report.rebalance.overallHealthScore}/100`);
  if (report.rebalance.replaceCandidates.length > 0) {
    lines.push('建议关注替换:');
    for (const c of report.rebalance.replaceCandidates) {
      const reason = (c as unknown as { reason?: string }).reason;
      lines.push(
        `  ${c.name}(${c.code})  ` +
        `综合: ${c.totalScore}/100  ` +
        `(资金流: ${c.fundFlowScore}  信号: ${c.signalScore})`,
      );
      if (reason) {
        lines.push(`    └ 原因: ${reason}`);
      }
    }
  } else {
    lines.push('当前无需建议替换');
  }
  lines.push('');

  // --- 板块 6: 回测摘要 ---
  lines.push('【回测摘要】');
  lines.push(SUB_SEP);
  lines.push(`总回测结果数: ${report.backtestSummary.totalResults}`);
  if (report.backtestSummary.bestStrategy) {
    const bs = report.backtestSummary.bestStrategy;
    lines.push(`最优策略: ${bs.strategy}  (收益率: ${bs.totalReturn.toFixed(2)}%)`);
  }
  if (report.backtestSummary.totalResults === 0) {
    lines.push('  注：回测依赖历史K线数据与策略参数，可在收盘后通过以下命令单独运行:');
    lines.push('    npx tsx src/cli/run-backtest.ts --strategy=STG01 --symbol=600519');
  }
  lines.push('');

  // --- 板块 7: 市场状态 ---
  lines.push('【市场状态】');
  lines.push(SUB_SEP);
  lines.push(
    `日期: ${report.marketStatus.date}  ` +
    `交易日: ${report.marketStatus.isTradingDay ? '是' : '否'}  ` +
    `盘中: ${report.marketStatus.marketOpen ? '交易中' : '已收盘'}`,
  );
  lines.push('');

  lines.push(SEP);

  return lines.join('\n');
}

// ==================== 工具函数 ====================

function formatMoney(value: number): string {
  if (Math.abs(value) >= 1e8) {
    return (value / 1e8).toFixed(2) + '亿';
  }
  if (Math.abs(value) >= 1e4) {
    return (value / 1e4).toFixed(2) + '万';
  }
  return value.toFixed(2);
}

function formatSigned(value: number, prefix: string, suffix?: string): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${prefix}${value.toFixed(2)}${suffix ?? ''}`;
}

function getColorLabel(color: string): string {
  switch (color) {
    case 'green': return '健康';
    case 'yellow': return '关注';
    case 'orange': return '预警';
    case 'red': return '危险';
    default: return color;
  }
}

/** 分数可视化条（10 格） */
function scoreBar(score: number): string {
  const filled = Math.round(score / 10);
  const empty = 10 - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}