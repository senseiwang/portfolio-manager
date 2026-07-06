/**
 * 持仓监控模块
 *
 * 将 YAML 配置的持仓列表与实时行情合并，计算市值、盈亏等指标。
 *
 * T-6.5 增强：事件驱动提醒
 * - 分红除权日提醒（近 30 天）
 * - 分红派息日提醒（近 30 天）
 * - 融资融券标的提醒
 * - 除权日已过提醒（近 7 天）
 */
import type { SdkClient } from '../data/sdkClient';
import type { PortfolioConfig } from '../types/config';
import { loadPortfolioConfig } from '../config/loadConfig';

/** 增强后的持仓条目（含实时行情计算） */
export interface EnrichedHolding {
  /** 原始持仓信息 */
  code: string;
  shares: number;
  costPrice: number;
  /** 实时行情 */
  currentPrice: number;
  name: string;
  /** 计算值 */
  marketValue: number;       // currentPrice * shares
  costValue: number;         // costPrice * shares
  pnl: number;               // marketValue - costValue
  pnlPercent: number;        // (currentPrice - costPrice) / costPrice * 100
  changePercent: number;     // 当日涨跌幅
}

/** 增强后的 Watchlist 条目 */
export interface EnrichedWatchlistItem {
  code: string;
  name: string;
  currentPrice: number;
  changePercent: number;
}

// ==================== T-6.5: 事件驱动提醒 ====================

/** 事件类型 */
export type HoldingEventType =
  | 'dividend_ex_date'    // 除权除息日临近
  | 'dividend_pay_date'   // 分红派息日临近
  | 'ex_dividend_passed'  // 除权除息日已过（提醒到账）
  | 'margin_target'       // 融资融券标的

/** 持仓事件提醒 */
export interface HoldingEvent {
  /** 事件类型 */
  type: HoldingEventType;
  /** 股票代码 */
  code: string;
  /** 股票名称 */
  name: string;
  /** 事件日期 */
  date: string;
  /** 事件标题 */
  title: string;
  /** 事件描述 */
  description: string;
  /** 距离今天数（负数表示已过） */
  daysFromNow: number;
  /** 优先级：high / medium / low */
  priority: 'high' | 'medium' | 'low';
}

/**
 * 获取持仓事件提醒（T-6.5）
 *
 * 检查每个持仓股票即将发生的或已发生的重要事件：
 * 1. 除权除息日是否在 30 天内
 * 2. 分红派息日是否在 30 天内
 * 3. 除权除息日是否在近 7 天内已过
 * 4. 是否属于融资融券标的
 *
 * @param client SDK 客户端
 * @param config 持仓配置（可选，默认从文件加载）
 * @returns 事件提醒列表，按日期排序
 */
export async function getHoldingEvents(
  client: SdkClient,
  config?: PortfolioConfig,
): Promise<HoldingEvent[]> {
  const portfolio = config ?? loadPortfolioConfig();
  if (portfolio.holdings.length === 0) return [];

  const today = new Date().toISOString().slice(0, 10);
  const codes = portfolio.holdings.map(h => h.code);

  // 并行获取分红详情和融资融券标的列表
  const [dividendResults, marginTargets] = await Promise.all([
    Promise.allSettled(
      codes.map(code =>
        client.getDividendDetail(code).catch(() => null),
      ),
    ),
    client.getMarginTargetList().catch(() => []),
  ]);

  const marginCodeSet = new Set(marginTargets.map(m => m.code));
  const events: HoldingEvent[] = [];

  for (let i = 0; i < portfolio.holdings.length; i++) {
    const holding = portfolio.holdings[i];
    const rawCode = holding.code;
    // 提取纯数字代码用于分红查询
    const numCode = rawCode.replace(/[^0-9]/g, '');

    // 检查分红事件
    const dividendResult = dividendResults[i];
    if (dividendResult?.status === 'fulfilled' && dividendResult.value) {
      const detail = dividendResult.value;

      // 除权除息日临近（未来 30 天内）
      if (detail.exDividendDate && detail.exDividendDate >= today) {
        const daysDiff = daysBetween(today, detail.exDividendDate);
        if (daysDiff <= 30) {
          events.push({
            type: 'dividend_ex_date',
            code: rawCode,
            name: detail.name || rawCode,
            date: detail.exDividendDate,
            title: '除权除息日临近',
            description: getDividendDesc(detail.dividendDesc, detail.dividendPretax),
            daysFromNow: daysDiff,
            priority: daysDiff <= 7 ? 'high' : 'medium',
          });
        }
      }

      // 分红派息日临近（未来 30 天内）
      if (detail.payDate && detail.payDate >= today) {
        const daysDiff = daysBetween(today, detail.payDate);
        if (daysDiff <= 30) {
          events.push({
            type: 'dividend_pay_date',
            code: rawCode,
            name: detail.name || rawCode,
            date: detail.payDate,
            title: '分红派息日临近',
            description: getDividendDesc(detail.dividendDesc, detail.dividendPretax),
            daysFromNow: daysDiff,
            priority: daysDiff <= 7 ? 'high' : 'medium',
          });
        }
      }

      // 除权除息日已过（近 7 天内），提醒分红到账
      if (detail.exDividendDate && detail.exDividendDate < today) {
        const daysDiff = daysBetween(today, detail.exDividendDate);
        if (daysDiff >= -7 && daysDiff < 0) {
          events.push({
            type: 'ex_dividend_passed',
            code: rawCode,
            name: detail.name || rawCode,
            date: detail.exDividendDate,
            title: '除权除息日已过',
            description: `已于 ${detail.exDividendDate} 除权除息，${detail.payDate ? `派息日 ${detail.payDate}` : '请关注派息到账'}`,
            daysFromNow: daysDiff,
            priority: 'medium',
          });
        }
      }
    }

    // 融资融券标的检查
    if (marginCodeSet.has(numCode) || marginCodeSet.has(rawCode)) {
      events.push({
        type: 'margin_target',
        code: rawCode,
        name: holding.code,
        date: today,
        title: '融资融券标的',
        description: '该股票为融资融券标的，可进行融资买入或融券卖出',
        daysFromNow: 0,
        priority: 'low',
      });
    }
  }

  // 按日期排序（即将发生的在前）
  events.sort((a, b) => {
    // 优先按天数排序（负值放最后）
    if (a.daysFromNow >= 0 && b.daysFromNow < 0) return -1;
    if (a.daysFromNow < 0 && b.daysFromNow >= 0) return 1;
    return a.daysFromNow - b.daysFromNow;
  });

  return events;
}

/** 计算两个日期之间的天数差 */
function daysBetween(from: string, to: string): number {
  const d1 = new Date(from).getTime();
  const d2 = new Date(to).getTime();
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}

/** 格式化分红描述 */
function getDividendDesc(desc: string, pretax: number | null): string {
  if (desc) return desc;
  if (pretax !== null) {
    return `每股税前 ${pretax} 元`;
  }
  return '请查看分红详情';
}

/**
 * 获取增强后的持仓列表
 *
 * 1. 从 holdings.yaml 读取持仓配置
 * 2. 通过 SDK 获取实时行情
 * 3. 计算市值、盈亏
 */
export async function getEnrichedHoldings(
  client: SdkClient,
  config?: PortfolioConfig,
): Promise<EnrichedHolding[]> {
  const portfolio = config ?? loadPortfolioConfig();

  if (portfolio.holdings.length === 0) return [];

  const codes = portfolio.holdings.map(h => h.code);
  const quotes = await client.getQuotesByCodes(codes);

  // 构建 code → quote 映射
  const quoteMap = new Map(
    quotes.map(q => [q.code, q]),
  );

  return portfolio.holdings.map(holding => {
    const quote = quoteMap.get(holding.code);
    const currentPrice = quote?.price ?? 0;
    const name = quote?.name ?? holding.code;
    const changePercent = quote?.changePercent ?? 0;

    const costValue = holding.costPrice * holding.shares;
    const marketValue = currentPrice * holding.shares;
    const pnl = marketValue - costValue;
    const pnlPercent =
      holding.costPrice > 0
        ? ((currentPrice - holding.costPrice) / holding.costPrice) * 100
        : 0;

    return {
      code: holding.code,
      shares: holding.shares,
      costPrice: holding.costPrice,
      currentPrice,
      name,
      marketValue: Math.round(marketValue * 100) / 100,
      costValue: Math.round(costValue * 100) / 100,
      pnl: Math.round(pnl * 100) / 100,
      pnlPercent: Math.round(pnlPercent * 100) / 100,
      changePercent,
    };
  });
}

/**
 * 获取增强后的 Watchlist
 *
 * 1. 从 watchlist.yaml 读取代码列表
 * 2. 通过 SDK 获取实时行情
 */
export async function getEnrichedWatchlist(
  client: SdkClient,
  config?: PortfolioConfig,
): Promise<EnrichedWatchlistItem[]> {
  const portfolio = config ?? loadPortfolioConfig();

  if (portfolio.watchlist.length === 0) return [];

  const quotes = await client.getQuotesByCodes(portfolio.watchlist);

  return quotes.map(q => ({
    code: q.code,
    name: q.name,
    currentPrice: q.price,
    changePercent: q.changePercent,
  }));
}