-- Oscillator App: Supabase Schema
-- Run this in the Supabase SQL editor

-- symbols table
create table if not exists symbols (
  id           uuid primary key default gen_random_uuid(),
  ticker       text not null unique,
  display_name text not null,
  base_ticker  text not null,
  fx_ticker    text,
  created_at   timestamptz default now()
);

-- price_cache table
create table if not exists price_cache (
  id         uuid primary key default gen_random_uuid(),
  symbol_id  uuid not null references symbols(id) on delete cascade,
  date       date not null,
  open       numeric not null,
  high       numeric not null,
  low        numeric not null,
  close      numeric not null,
  volume     bigint default 0,
  close_jpy  numeric,
  created_at timestamptz default now(),
  unique(symbol_id, date)
);

-- Indexes
create index if not exists idx_price_cache_symbol_date on price_cache(symbol_id, date);

-- RLS: disable for service role access (API uses service role key)
alter table symbols enable row level security;
alter table price_cache enable row level security;

-- Allow all for authenticated service role
create policy "service_all_symbols" on symbols
  for all using (true);

create policy "service_all_price_cache" on price_cache
  for all using (true);
