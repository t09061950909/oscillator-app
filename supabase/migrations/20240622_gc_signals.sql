-- ============================================================
-- GC/DC スクリーナー用テーブル
-- oscillator-app Step 1
-- ============================================================

create table if not exists gc_signals (
  id              uuid primary key default gen_random_uuid(),

  -- 銘柄情報
  symbol          text    not null,   -- Yahoo Finance ティッカー (例: "7203.T", "AAPL")
  market          text    not null,   -- 'JP' | 'US'
  name            text,               -- 銘柄名（任意）

  -- シグナル情報
  detected_at     date    not null,   -- GC/DC 発生日 (YYYY-MM-DD)
  scanned_at      timestamptz not null default now(),  -- スキャン実行日時
  signal_type     text    not null,   -- 'GC' | 'DC'
  ma_short        int     not null,   -- 短期MA期間 (例: 25)
  ma_long         int     not null,   -- 長期MA期間 (例: 75)
  hold_days       int     not null default 0, -- GC/DC後の維持日数（0=当日）

  -- 総合スコア
  total_score     int     not null,   -- 0〜100
  rank            text    not null,   -- 'A' | 'B' | 'C' | 'D'

  -- スコア内訳（各要素の加点値）
  score_slope     int     not null default 0,   -- ① MAの傾き
  score_volume    int     not null default 0,   -- ② 出来高比率
  score_rsi       int     not null default 0,   -- ③ RSI水準
  score_hold      int     not null default 0,   -- ④ 維持日数ボーナス
  score_deviation int     not null default 0,   -- ⑤ 価格乖離率
  score_macd      int     not null default 0,   -- ⑥ MACD方向
  score_weekly    int     not null default 0,   -- ⑦ 週足トレンド

  -- 参考値（表示用）
  close_price     numeric,
  volume_ratio    numeric,    -- 当日出来高 / 10日平均出来高
  rsi_value       numeric,    -- RSI(14)
  deviation_pct   numeric,    -- 終値の長期MAからの乖離率(%)
  ma_short_value  numeric,    -- 短期MA値
  ma_long_value   numeric,    -- 長期MA値

  -- 同一銘柄・同日・同MAペアは1レコードのみ
  unique (symbol, detected_at, ma_short, ma_long)
);

-- インデックス
create index if not exists gc_signals_detected_at_idx  on gc_signals (detected_at desc);
create index if not exists gc_signals_market_rank_idx  on gc_signals (market, rank);
create index if not exists gc_signals_symbol_idx       on gc_signals (symbol, detected_at desc);
create index if not exists gc_signals_signal_type_idx  on gc_signals (signal_type, detected_at desc);

-- RLS：認証ユーザーのみ読み取り可（書き込みはサービスロールキーのみ）
alter table gc_signals enable row level security;

create policy "authenticated users can read gc_signals"
  on gc_signals for select
  to authenticated
  using (true);

-- ============================================================
-- スキャン実行ログテーブル（GitHub Actions の実行記録）
-- ============================================================

create table if not exists screener_scan_logs (
  id           uuid primary key default gen_random_uuid(),
  scanned_at   timestamptz not null default now(),
  market       text not null,          -- 'JP' | 'US'
  ma_short     int  not null,
  ma_long      int  not null,
  total_tickers int,                   -- スキャン対象銘柄数
  signals_found int,                   -- シグナル検出数
  duration_ms  int,                    -- 処理時間(ms)
  status       text not null,          -- 'success' | 'error'
  error_msg    text                    -- エラー時のメッセージ
);

alter table screener_scan_logs enable row level security;

create policy "authenticated users can read scan_logs"
  on screener_scan_logs for select
  to authenticated
  using (true);
