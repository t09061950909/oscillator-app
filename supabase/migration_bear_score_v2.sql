-- factor_scoresテーブルへの追加マイグレーション
-- bear_score_v2: rs_ratio_20単体による検証済みシグナル(oscillator-research
-- Step③④で、DSR・エピソード単位ブートストラップ・holdout・検出ラグ・
-- コスト控除後リターンの全てを通過)。
--
-- 既存のbear_score(BEAR_WEIGHTSによる5因子合成、ウォークフォワード検証のみ)
-- とは検証履歴・対象因子が異なるため、置き換えず並列のフィールドとして追加する。
--
-- 実行方法: SupabaseダッシュボードのSQL Editorに貼り付けて実行してください。

alter table factor_scores
    add column if not exists bear_score_v2 double precision,
    add column if not exists rank_bear_v2 integer;

create index if not exists idx_factor_scores_rank_bear_v2
    on factor_scores (date, rank_bear_v2) where bear_score_v2 is not null;
