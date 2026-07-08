/**
 * scripts/scan-factor-lab.ts
 *
 * screener_price_cache の過去価格から全候補因子を計算し
 * factor_lab テーブルに保存する（Phase 1 実行スクリプト）
 *
 * 使い方（PowerShell）:
 *   # 全期間・全銘柄（初回）
 *   npx tsx --env-file=.env.local scripts/scan-factor-lab.ts
 *
 *   # GCシグナル発生日のみ対象（推奨: DBサイズ節約）
 *   $env:GC_ONLY="true"; npx tsx --env-file=.env.local scripts/scan-factor-lab.ts
 *
 *   # 期間指定
 *   $env:FROM_DATE="2025-01-01"; $env:TO_DATE="2025-12-31"
 *   npx tsx --env-file=.env.local scripts/scan-factor-lab.ts
 *
 *   # ドライラン
 *   $env:DRY_RUN="true"; npx tsx --env-file=.env.local scripts/scan-factor-lab.ts
 *
 * 完了後: npm run backtest:factor を実行
 */

import { createClient } from '@supabase/supabase-js'
import { calcAllFactors } from '../lib/screener/factorLab'
import type { Bar } from '../lib/screener/factorLab'

// ── 設定 ─────────────────────────────────────────────────────

const FROM_DATE = process.env.FROM_DATE ?? ''
const TO_DATE   = process.env.TO_DATE   ?? ''
const GC_ONLY   = process.env.GC_ONLY  === 'true'  // GCシグナル発生日のみ
const DRY_RUN   = process.env.DRY_RUN  === 'true'
const MARKET    = process.env.MARKET   ?? 'ALL'

let supabase = null as unknown as ReturnType<typeof createClient>

// ── ヘルパー ──────────────────────────────────────────────────

function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)) }

function round4(v: number): number | null {
  if (!isFinite(v) || isNaN(v)) return null
  return parseFloat(v.toFixed(4))
}

// ── Step 1: スキャン対象の（銘柄, 日付）ペアを取得 ─────────────

async function getTargetPairs(): Promise<Map<string, Set<string>>> {
  // Map<symbol, Set<date>> の形で返す
  const targets = new Map<string, Set<string>>()

  if (GC_ONLY) {
    // gc_signalsに記録されている（銘柄, GC発生日）のみを対象にする
    // → factor_labはGC発生時点のスナップショットだけ保存（DBサイズ削減）
    console.log('モード: GCシグナル発生日のみ')
    let from = 0
    const PAGE = 1000
    while (true) {
      let q = (supabase as any)
        .from('gc_signals')
        .select('symbol, detected_at')
        .eq('signal_type', 'GC')
        .order('detected_at')
        .range(from, from + PAGE - 1)
      if (FROM_DATE) q = q.gte('detected_at', FROM_DATE)
      if (TO_DATE)   q = q.lte('detected_at', TO_DATE)
      if (MARKET !== 'ALL') q = q.eq('market', MARKET)

      const { data, error } = await q
      if (error || !data || (data as any[]).length === 0) break
      for (const row of data as { symbol: string; detected_at: string }[]) {
        if (!targets.has(row.symbol)) targets.set(row.symbol, new Set())
        targets.get(row.symbol)!.add(row.detected_at)
      }
      if ((data as any[]).length < PAGE) break
      from += PAGE
    }
  } else {
    // 全銘柄 × 全営業日を対象
    console.log('モード: 全銘柄 × 全営業日')
    // 銘柄一覧取得
    const symbols = new Set<string>()
    let from = 0
    const PAGE = 1000
    while (true) {
      const { data } = await (supabase as any)
        .from('screener_price_cache')
        .select('symbol')
        .order('symbol')
        .range(from, from + PAGE - 1)
      if (!data || (data as any[]).length === 0) break
      for (const r of data as { symbol: string }[]) symbols.add(r.symbol)
      if ((data as any[]).length < PAGE) break
      from += PAGE
    }
    // 各銘柄に「全営業日」をセット（後で価格取得時にフィルタ）
    for (const sym of symbols) targets.set(sym, new Set(['__all__']))
  }

  return targets
}

// ── Step 2: 銘柄の価格データ取得 ─────────────────────────────

async function fetchBars(symbol: string, warmupFrom: string): Promise<Bar[]> {
  const all: Bar[] = []
  let from = 0
  const PAGE = 1000
  while (true) {
    const { data, error } = await (supabase as any)
      .from('screener_price_cache')
      .select('date, open, high, low, close, volume')
      .eq('symbol', symbol)
      .gte('date', warmupFrom)
      .order('date', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error || !data || (data as Bar[]).length === 0) break
    all.push(...(data as Bar[]))
    if ((data as Bar[]).length < PAGE) break
    from += PAGE
  }
  return all
}

// ── Step 3: 因子計算 → factor_lab 行を生成 ──────────────────

function buildRow(
  symbol:  string,
  date:    string,
  bars:    Bar[],    // date以前の全バー（末尾がdate当日）
): object {
  const factors = calcAllFactors(bars)

  return {
    symbol,
    detected_at:      date,

    sma_dev_10:       round4(factors.sma_dev_10),
    sma_dev_25:       round4(factors.sma_dev_25),
    sma_dev_50:       round4(factors.sma_dev_50),
    sma_dev_75:       round4(factors.sma_dev_75),
    sma_dev_200:      round4(factors.sma_dev_200),
    adx_14:           round4(factors.adx_14),
    di_plus_14:       round4(factors.di_plus_14),
    di_minus_14:      round4(factors.di_minus_14),
    dist_52w_high:    round4(factors.dist_52w_high),
    dist_52w_low:     round4(factors.dist_52w_low),

    roc_3:            round4(factors.roc_3),
    roc_5:            round4(factors.roc_5),
    roc_10:           round4(factors.roc_10),
    roc_20:           round4(factors.roc_20),
    stoch_k_14:       round4(factors.stoch_k_14),
    williams_r_14:    round4(factors.williams_r_14),
    tsi_value:        round4(factors.tsi_value),
    tsi_signal:       round4(factors.tsi_signal),
    consec_candles:   factors.consec_candles,

    atr_ratio_14:     round4(factors.atr_ratio_14),
    bb_width_20:      round4(factors.bb_width_20),
    volatility_20:    round4(factors.volatility_20),

    obv_slope_20:     round4(factors.obv_slope_20),
    volume_accel:     round4(factors.volume_accel),
    money_flow_ratio: round4(factors.money_flow_ratio),

    pullback_depth_20: round4(factors.pullback_depth_20),
    gap_pct:           round4(factors.gap_pct),
    body_ratio:        round4(factors.body_ratio),

    vol_mom_interact:  round4(factors.vol_mom_interact),

    // リターンは後から埋める（この時点では null）
    return_5d:  null,
    return_10d: null,
    return_20d: null,
  }
}

// ── Step 4: バッチ upsert ────────────────────────────────────

async function upsertBatch(rows: object[]): Promise<void> {
  if (DRY_RUN || rows.length === 0) return
  const { error } = await (supabase as any)
    .from('factor_lab')
    .upsert(rows, { onConflict: 'symbol,detected_at' })
  if (error) console.error('\n[upsert] エラー:', error.message)
}

// ── メイン ────────────────────────────────────────────────────

async function main() {
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('❌ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定')
    process.exit(1)
  }
  supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  console.log('\n因子ラボ スキャン開始')
  console.log(`  GC_ONLY: ${GC_ONLY}  DRY_RUN: ${DRY_RUN}  MARKET: ${MARKET}`)

  // Step 1: 対象ペア取得
  const targets = await getTargetPairs()
  const totalSymbols = targets.size
  console.log(`\n対象銘柄: ${totalSymbols}件`)

  if (totalSymbols === 0) {
    console.log('対象データなし。gc_signalsにデータがあるか確認してください。')
    return
  }

  // ウォームアップ用のバッファ日数（SMA200 + ADX計算に必要）
  const WARMUP_DAYS = 250 * 2  // 土日祝考慮で2倍
  const warmupBase  = FROM_DATE || '2024-01-01'
  const warmupDate  = new Date(warmupBase + 'T00:00:00')
  warmupDate.setDate(warmupDate.getDate() - WARMUP_DAYS)
  const warmupFrom  = warmupDate.toISOString().slice(0, 10)

  let totalRows  = 0
  let processed  = 0
  let buffer: object[] = []
  const startTime = Date.now()

  for (const [symbol, dates] of targets) {
    // 価格データ取得（ウォームアップ込み）
    const allBars = await fetchBars(symbol, warmupFrom)

    if (allBars.length < 50) {
      processed++
      continue
    }

    // 対象日付リストを決定
    let scanDates: string[]
    if (dates.has('__all__')) {
      // 全営業日: allBarsの全日付
      scanDates = allBars
        .map(b => b.date)
        .filter(d => (!FROM_DATE || d >= FROM_DATE) && (!TO_DATE || d <= TO_DATE))
    } else {
      // GCシグナル発生日のみ
      scanDates = [...dates].sort()
    }

    for (const date of scanDates) {
      // その日以前のバーのみを使用（未来データの混入を防ぐ）
      let endIdx = allBars.length - 1
      while (endIdx >= 0 && allBars[endIdx].date > date) endIdx--
      if (endIdx < 50) continue  // データ不足

      const bars = allBars.slice(0, endIdx + 1)
      const row  = buildRow(symbol, date, bars)
      buffer.push(row)
      totalRows++
    }

    // 500件溜まったらupsert
    if (buffer.length >= 500) {
      await upsertBatch(buffer)
      buffer = []
    }

    processed++
    if (processed % 100 === 0 || processed === totalSymbols) {
      const elapsed = (Date.now() - startTime) / 1000
      const eta = processed < totalSymbols
        ? Math.round(elapsed / processed * (totalSymbols - processed))
        : 0
      process.stdout.write(
        `  ${processed}/${totalSymbols}銘柄  行数: ${totalRows}件  ` +
        `経過: ${elapsed.toFixed(0)}s  残: ${eta}s\r`
      )
    }

    if (processed % 50 === 0) await sleep(100)
  }

  if (buffer.length > 0) await upsertBatch(buffer)

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log('\n\n' + '═'.repeat(50))
  console.log('  完了！')
  console.log(`  処理銘柄: ${processed}件`)
  console.log(`  生成行数: ${totalRows}件`)
  console.log(`  所要時間: ${totalTime}秒`)

  if (DRY_RUN) {
    console.log('\n  [DRY_RUN] DBへの書き込みはスキップされました')
  } else {
    console.log('\n  次のステップ:')
    console.log('    npm run backtest:factor   # 因子探索バックテスト')
  }
}

main().catch(err => { console.error('エラー:', err); process.exit(1) })
