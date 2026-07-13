/**
 * Supabaseの factor_scores / market_regime テーブルに対応する型定義。
 * スキーマは oscillator-research/production/schema.sql を参照。
 */

export type Market = "jp" | "us";
export type Regime = "bull" | "bear" | "range" | "recovery";

export interface FactorScoreRow {
  date: string; // YYYY-MM-DD
  symbol: string;
  market: Market;
  regime: Regime | null;
  close: number | null;
  bear_score: number | null;
  recovery_score: number | null;
  rank_bear: number | null;
  rank_recovery: number | null;
}

export interface MarketRegimeRow {
  date: string; // YYYY-MM-DD
  market: Market;
  regime: Regime;
  close: number | null;
}

export const REGIME_LABEL: Record<Regime, string> = {
  bull: "強気(bull)",
  bear: "弱気(bear)",
  range: "レンジ(range)",
  recovery: "回復期(recovery)",
};

export const MARKET_LABEL: Record<Market, string> = {
  jp: "日本株(TOPIX)",
  us: "米国株(S&P500)",
};
