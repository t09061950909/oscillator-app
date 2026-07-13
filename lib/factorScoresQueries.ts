/**
 * factor_scores / market_regime テーブルのデータ取得。
 *
 * 【重要】既存プロジェクトに既にSupabaseクライアントがある場合(例: lib/supabase.ts,
 * utils/supabase/server.ts 等)は、下の createClient(...) の行をそちらに差し替えてください。
 * ここでは新規依存を増やさないよう、@supabase/supabase-js を直接使う最小構成にしています。
 * この機能は認証不要の公開データ(RLSで読み取りは誰でも許可済み)なので、
 * サーバーコンポーネントから anon key で直接読み取る想定です。
 *
 * 必要な環境変数(.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 * (service_role キーはフロントエンドでは絶対に使わないこと)
 */
import { createClient } from "@supabase/supabase-js";
import type { FactorScoreRow, Market, MarketRegimeRow, Regime } from "@/types/factorScores";

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が設定されていません(.env.localを確認してください)"
    );
  }
  return createClient(url, key);
}

/** 直近の market_regime の日付(データが存在する最新日)を取得する。 */
async function getLatestRegimeDate(): Promise<string | null> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("market_regime")
    .select("date")
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.date ?? null;
}

/** 最新日時点の、市場ごとのレジーム状況を取得する。 */
export async function getCurrentRegimes(): Promise<MarketRegimeRow[]> {
  const latestDate = await getLatestRegimeDate();
  if (!latestDate) return [];

  const supabase = getClient();
  const { data, error } = await supabase
    .from("market_regime")
    .select("*")
    .eq("date", latestDate);

  if (error) throw error;
  return data ?? [];
}

interface ScoreRankingParams {
  market?: Market;
  scoreType: "bear" | "recovery";
  limit?: number;
}

/**
 * 最新日時点の、bear_score または recovery_score の上位ランキングを取得する。
 * 対象レジームでない銘柄はscoreがnullなので、自動的に除外される
 * (bull/rangeの間はこの関数の結果が空配列になるのが正常な挙動)。
 */
export async function getScoreRanking({
  market,
  scoreType,
  limit = 50,
}: ScoreRankingParams): Promise<FactorScoreRow[]> {
  const latestDate = await getLatestRegimeDate();
  if (!latestDate) return [];

  const supabase = getClient();
  const scoreColumn = scoreType === "bear" ? "bear_score" : "recovery_score";
  const rankColumn = scoreType === "bear" ? "rank_bear" : "rank_recovery";

  let query = supabase
    .from("factor_scores")
    .select("*")
    .eq("date", latestDate)
    .not(scoreColumn, "is", null)
    .order(rankColumn, { ascending: true })
    .limit(limit);

  if (market) {
    query = query.eq("market", market);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
