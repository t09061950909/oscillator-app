-- gc_signalsテーブルへの追加マイグレーション
--
-- ① 生の観測値(合算前)を保存する列。既存のscore_slope/score_macd/score_weekly
--   は加点後のポイント値のみで、画面表示用の生の値(傾き%・MACD値・週足状態)を
--   保存していなかったため追加する。
--   (score_rsi/score_volume/score_deviation/score_holdについては、
--    rsi_value/volume_ratio/deviation_pct/hold_daysに既に生の値が入っている)
--
-- ② factor_scoresテーブル(oscillator-research本番パイプライン)との連携用列。
--   bear限定rs_ratio_20(Step③④で検証済み)の状態をgc_signals側にも
--   持たせることで、画面側で「検証済み」ラベルを出せるようにする。
--   symbolで突き合わせる(marketは大文字小文字が食い違うため使わない)。
--
-- 実行方法: SupabaseダッシュボードのSQL Editorに貼り付けて実行してください。

alter table gc_signals
    add column if not exists slope_pct       double precision,
    add column if not exists macd_histogram  double precision,
    add column if not exists weekly_state    text,  -- 'above' | 'below' | 'flat'
    add column if not exists regime          text,  -- factor_scores.regimeから複写
    add column if not exists bear_score_v2   double precision,
    add column if not exists rank_bear_v2    integer;
