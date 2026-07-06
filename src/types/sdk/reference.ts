/** 个股分红详情，对应 sdk.reference.dividendDetail() */
export interface DividendDetail {
  code: string;
  name: string;
  reportDate: string;
  planNoticeDate: string;
  disclosureDate: string;
  assignTransferRatio: number | null;
  bonusRatio: number | null;
  transferRatio: number | null;
  dividendPretax: number | null;
  dividendDesc: string;
  dividendYield: number | null;
  eps: number | null;
  bps: number | null;
  capitalReserve: number | null;
  unassignedProfit: number | null;
  netProfitYoy: number | null;
  totalShares: number;
  equityRecordDate: string | null;
  exDividendDate: string | null;
  payDate: string | null;
  assignProgress: string;
  noticeDate: string;
}
