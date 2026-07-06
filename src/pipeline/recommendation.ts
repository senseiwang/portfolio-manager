/**
 * Phase 6：系统推荐与跨池联动
 *
 * T-6.1 反向推荐（你错过的板块）
 * T-6.2 相似度推荐
 * T-6.3 情绪面量化（大盘温度计）
 * T-6.4 资金流三级传导
 *
 * 所有函数都是纯函数，无副作用。
 */

// ==================== T-6.1: 反向推荐 ====================

/** 板块日涨跌幅记录 */
export interface SectorDailyChange {
  /** 板块代码 */
  sectorCode: string;
  /** 板块名称 */
  sectorName: string;
  /** 日期 YYYY-MM-DD */
  date: string;
  /** 当日涨跌幅（%） */
  changePercent: number;
}

/** 反向推荐结果 */
export interface MissedSector {
  sectorCode: string;
  sectorName: string;
  /** 连续上涨天数 */
  consecutiveUpDays: number;
  /** 累计涨幅（%） */
  totalGain: number;
  /** 最近一日涨幅（%） */
  latestChange: number;
}

/**
 * 识别错过的板块（T-6.1）
 *
 * 对近 N 日所有板块的日涨跌幅进行分析，找出：
 * 1. 连续 3 日及以上上涨的板块
 * 2. 不包含当前持仓中任何股票的板块
 *
 * @param dailyChanges 近 N 日所有板块的日涨跌幅列表
 * @param holdingSectorCodes 当前持仓涉及的板块代码集合
 * @param minConsecutiveUpDays 最小连续上涨天数，默认 3
 * @returns 按连续天数降序排列的错过板块列表
 */
export function findMissedSectors(
  dailyChanges: SectorDailyChange[],
  holdingSectorCodes: Set<string>,
  minConsecutiveUpDays: number = 3,
): MissedSector[] {
  // 按板块分组并按日期排序
  const grouped = new Map<string, SectorDailyChange[]>();
  for (const entry of dailyChanges) {
    const list = grouped.get(entry.sectorCode) ?? [];
    list.push(entry);
    grouped.set(entry.sectorCode, list);
  }

  // 对每个板块排序并按日期排序
  for (const [, list] of grouped) {
    list.sort((a, b) => a.date.localeCompare(b.date));
  }

  const result: MissedSector[] = [];

  for (const [code, list] of grouped) {
    // 跳过已有持仓的板块
    if (holdingSectorCodes.has(code)) continue;

    // 从后向前扫描连续上涨天数
    let consecutive = 0;
    let totalGain = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].changePercent > 0) {
        consecutive++;
        totalGain += list[i].changePercent;
      } else {
        break;
      }
    }

    if (consecutive >= minConsecutiveUpDays) {
      result.push({
        sectorCode: code,
        sectorName: list[list.length - 1].sectorName,
        consecutiveUpDays: consecutive,
        totalGain: Math.round(totalGain * 100) / 100,
        latestChange: list[list.length - 1].changePercent,
      });
    }
  }

  // 按连续天数降序排列
  result.sort((a, b) => b.consecutiveUpDays - a.consecutiveUpDays);

  return result;
}

// ==================== T-6.2: 相似度推荐 ====================

/** 板块成分股估值信息 */
export interface SectorConstituentValuation {
  code: string;
  name: string;
  /** 市盈率 */
  pe: number | null;
  /** 市净率 */
  pb: number | null;
  /** 所属行业板块代码 */
  sectorCode: string;
  /** 所属行业板块名称 */
  sectorName: string;
}

/** 相似度推荐结果 */
export interface ValuationCandidate {
  code: string;
  name: string;
  sectorName: string;
  /** PE 折价率（%），负数表示低于持仓股 */
  peDiscount: number | null;
  /** PB 折价率（%），负数表示低于持仓股 */
  pbDiscount: number | null;
  /** 综合折价评分（越低越好） */
  compositeScore: number;
}

/**
 * 寻找同板块估值更低的股票（T-6.2）
 *
 * 对每只持仓股，在同板块内找出 PE/PB 更低的股票。
 *
 * @param holdings 持仓股的板块成分股估值
 * @param sectorMap 板块代码 → 该板块所有成分股估值列表
 * @returns 按综合折价评分排序的候选列表
 */
export function findValuationCandidates(
  holdings: SectorConstituentValuation[],
  sectorMap: Map<string, SectorConstituentValuation[]>,
): ValuationCandidate[] {
  const result: ValuationCandidate[] = [];

  for (const holding of holdings) {
    const peers = sectorMap.get(holding.sectorCode);
    if (!peers || peers.length === 0) continue;

    for (const peer of peers) {
      // 跳过持仓股自身
      if (peer.code === holding.code) continue;

      // 计算折价率
      let peDiscount: number | null = null;
      if (holding.pe !== null && peer.pe !== null && holding.pe > 0) {
        peDiscount = ((peer.pe - holding.pe) / holding.pe) * 100;
      }

      let pbDiscount: number | null = null;
      if (holding.pb !== null && peer.pb !== null && holding.pb > 0) {
        pbDiscount = ((peer.pb - holding.pb) / holding.pb) * 100;
      }

      // 综合评分：PE/PB 折价取平均（负数 = 更便宜 = 更好）
      const compositeScore =
        peDiscount !== null && pbDiscount !== null
          ? (peDiscount + pbDiscount) / 2
          : peDiscount ?? pbDiscount ?? 0;

      result.push({
        code: peer.code,
        name: peer.name,
        sectorName: holding.sectorName,
        peDiscount,
        pbDiscount,
        compositeScore,
      });
    }
  }

  // 按综合折价评分升序排列（折价越大越靠前）
  result.sort((a, b) => a.compositeScore - b.compositeScore);

  return result;
}

// ==================== T-6.3: 情绪面量化 ====================

/** 大盘情绪状态 */
export type MarketSentiment = 'greedy' | 'fear' | 'normal';

/** 情绪量化结果 */
export interface SentimentResult {
  /** 情绪状态 */
  sentiment: MarketSentiment;
  /** 涨停家数 */
  limitUpCount: number;
  /** 跌停家数 */
  limitDownCount: number;
  /** 涨跌比 */
  upDownRatio: number;
  /** 贪婪分数 0-100（越高越贪婪） */
  greedScore: number;
}

/**
 * 量化大盘情绪（T-6.3）
 *
 * 给定当日涨停/跌停家数，判定市场情绪状态。
 *
 * 规则：
 * - 涨停家数 / (涨停+跌停) >= 0.7 → 贪婪
 * - 涨停家数 / (涨停+跌停) <= 0.3 → 恐惧
 * - 其他 → 正常
 *
 * 贪婪分数计算:
 * - ratio >= 0.5: greedScore = ratio * 100（越高越贪婪）
 * - ratio < 0.5: greedScore = (1 - ratio) * 100（越低越恐惧）
 *
 * @param limitUpCount 当日涨停家数
 * @param limitDownCount 当日跌停家数
 */
export function quantifySentiment(
  limitUpCount: number,
  limitDownCount: number,
): SentimentResult {
  const total = limitUpCount + limitDownCount;

  if (total === 0) {
    return {
      sentiment: 'normal',
      limitUpCount: 0,
      limitDownCount: 0,
      upDownRatio: 0.5,
      greedScore: 50,
    };
  }

  const upDownRatio = limitUpCount / total;
  let sentiment: MarketSentiment;
  let greedScore: number;

  if (upDownRatio >= 0.7) {
    sentiment = 'greedy';
    greedScore = Math.round(upDownRatio * 100);
  } else if (upDownRatio <= 0.3) {
    sentiment = 'fear';
    greedScore = Math.round((1 - upDownRatio) * 100);
  } else {
    sentiment = 'normal';
    greedScore = 50;
  }

  return {
    sentiment,
    limitUpCount,
    limitDownCount,
    upDownRatio: Math.round(upDownRatio * 100) / 100,
    greedScore,
  };
}

// ==================== T-6.4: 资金流三级传导 ====================

/** 市场资金流方向 */
export type MarketFlowDirection = 'inflow' | 'outflow' | 'neutral';

/** 三级传导结果 */
export interface FundFlowConductionResult {
  /** 市场级方向 */
  marketDirection: MarketFlowDirection;
  /** 市场主力净流入（元） */
  marketMainNetInflow: number;
  /** 前 N 个强势板块（主力净流入为正的板块） */
  strongSectors: FundFlowSectorInfo[];
  /** 前 N 个弱势板块（主力净流入为负的板块） */
  weakSectors: FundFlowSectorInfo[];
  /** 整体传导评分：0-100，越高越适合建仓 */
  conductionScore: number;
}

/** 板块资金流信息 */
export interface FundFlowSectorInfo {
  code: string;
  name: string;
  mainNetInflow: number | null;
  mainNetInflowPercent: number | null;
  changePercent: number | null;
}

/**
 * 资金流三级传导分析（T-6.4）
 *
 * 从市场 → 板块 → 个股三个层级分析资金流向，判断整体建仓环境。
 *
 * Level 1（市场）：判断大盘主力资金是净流入还是净流出
 * Level 2（板块）：识别资金流入/流出最多的板块
 * Level 3（个股）：在候选池中按个股资金流排名加权（由调用方在候选池中应用）
 *
 * @param marketFlows 大盘资金流数据（最近一日为最新）
 * @param sectorFlows 板块资金流排名数据
 * @returns 三级传导分析结果
 */
export function analyzeFundFlowConduction(
  marketFlows: MarketFlowInput[],
  sectorFlows: SectorFlowInput[],
): FundFlowConductionResult {
  // Level 1: 市场级
  const latestMarket = marketFlows.length > 0
    ? marketFlows[marketFlows.length - 1]
    : null;

  let marketDirection: MarketFlowDirection = 'neutral';
  let marketMainNetInflow = 0;

  if (latestMarket) {
    marketMainNetInflow = latestMarket.mainNetInflow ?? 0;
    if (marketMainNetInflow > 0) {
      marketDirection = 'inflow';
    } else if (marketMainNetInflow < 0) {
      marketDirection = 'outflow';
    }
  }

  // Level 2: 板块级
  const strongSectors: FundFlowSectorInfo[] = [];
  const weakSectors: FundFlowSectorInfo[] = [];

  for (const sector of sectorFlows) {
    const info: FundFlowSectorInfo = {
      code: sector.code,
      name: sector.name,
      mainNetInflow: sector.mainNetInflow,
      mainNetInflowPercent: sector.mainNetInflowPercent,
      changePercent: sector.changePercent,
    };

    if ((sector.mainNetInflow ?? 0) > 0) {
      strongSectors.push(info);
    } else {
      weakSectors.push(info);
    }
  }

  // 按主力净流入排序
  strongSectors.sort((a, b) => (b.mainNetInflow ?? 0) - (a.mainNetInflow ?? 0));
  weakSectors.sort((a, b) => (a.mainNetInflow ?? 0) - (b.mainNetInflow ?? 0));

  // 综合传导评分
  const conductionScore = calcConductionScore(marketDirection, strongSectors.length, sectorFlows.length);

  return {
    marketDirection,
    marketMainNetInflow,
    strongSectors,
    weakSectors,
    conductionScore,
  };
}

/** 资金流分析输入 - 市场级 */
export interface MarketFlowInput {
  mainNetInflow: number | null;
}

/** 资金流分析输入 - 板块级 */
export interface SectorFlowInput {
  code: string;
  name: string;
  mainNetInflow: number | null;
  mainNetInflowPercent: number | null;
  changePercent: number | null;
}

/**
 * 计算综合传导评分
 *
 * 规则：
 * - 市场流入 +30 分，流出 -20 分，中性 0 分
 * - 强势板块占比 >= 60% +20 分，>= 40% +10 分，< 40% -10 分
 * - 基础分 50 分
 * - 结果钳制在 [0, 100] 范围
 */
function calcConductionScore(
  marketDirection: MarketFlowDirection,
  strongCount: number,
  totalCount: number,
): number {
  let score = 50;

  // 市场级评分
  if (marketDirection === 'inflow') score += 30;
  else if (marketDirection === 'outflow') score -= 20;

  // 板块级评分
  const strongRatio = totalCount > 0 ? strongCount / totalCount : 0;
  if (strongRatio >= 0.6) score += 20;
  else if (strongRatio >= 0.4) score += 10;
  else score -= 10;

  return Math.max(0, Math.min(100, score));
}