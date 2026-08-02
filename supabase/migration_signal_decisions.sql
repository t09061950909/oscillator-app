-- signal_decisions テーブル
--
-- 「提示した候補 → 実際の判断 → その後の結果」を記録する。
-- Cの設計思想(判断材料の提示。自動売買の根拠ではない)を実際に運用しながら
-- 検証するための土台であり、中長期的には新たな検証データを貯める仕組みにもなる。
--
-- 実行方法: SupabaseダッシュボードのSQL Editorに貼り付けて実行してください。

create table if not exists signal_decisions (
  id                   uuid primary key default gen_random_uuid(),
  symbol               text not null,
  market               text not null,
  detected_at          date not null,          -- gc_signals.detected_at と対応
  signal_type          text,                    -- 'GC' | 'DC'(参考。任意)
  was_validated        boolean not null default false,  -- 提示時点でbear限定rs_ratio_20の検証済み候補だったか
                                                          -- (後からロジックが変わっても、当時の判定を記録として残す)
  decision             text not null check (decision in ('bought', 'skipped', 'watching')),
  note                 text,
  price_at_decision    double precision,        -- 記録時点の終値(gc_signals.close_priceから複写)
  decided_at           timestamptz not null default now(),

  -- 結果追跡(20営業日後を目安に別バッチで埋める。未計測の間はnull)
  outcome_checked_at   timestamptz,
  price_after_20d      double precision,
  return_20d_pct       double precision,

  created_at           timestamptz not null default now(),
  unique (symbol, market, detected_at)
);

create index if not exists idx_signal_decisions_decided_at on signal_decisions (decided_at desc);
create index if not exists idx_signal_decisions_pending_outcome
  on signal_decisions (decided_at) where outcome_checked_at is null;

alter table signal_decisions enable row level security;

drop policy if exists "service_all_signal_decisions" on signal_decisions;
create policy "service_all_signal_decisions" on signal_decisions
  for all using (true);
-- 個人利用前提でservice role keyのみアクセスする想定。複数人で使う場合は
-- auth.uid()等でユーザーごとに絞るポリシーに変更すること。
