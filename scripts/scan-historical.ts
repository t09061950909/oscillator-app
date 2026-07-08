/**
 * scripts/scan-historical.ts
 *
 * screener_price_cache の過去価格データを使って
 * 各営業日ごとに calcGCScore を再計算し、gc_signals を遡及生成する
 *
 * 用途: バックテスト用の過去シグナルデータを作成する
 *
 * 使い方（PowerShell）:
 *   # 全期間
 *   npx tsx --env-file=.env.local scripts/scan-historical.ts
 *
 *   # 期間指定
 *   $env:FROM_DATE="2025-01-01"; $env:TO_DATE="2025-06-30"; npx tsx --env-file=.env.local scripts/scan-historical.ts
 *
 *   # ドライラン（DBに書き込まない・動作確認用）
 *   $env:DRY_RUN="true"; npx tsx --env-file=.env.local scripts/scan-historical.ts
 *
 * 処理時間の目安（全銘柄・全期間）:
 *   2000銘柄 × 400日 ≒ 10〜20分（price_cacheからの取得がボトルネック）
 *
 * 完了後: npm run backtest を実行
 */

import { createClient } from '@supabase/supabase-js'
import { calcGCScore }  from '../lib/screener/calcScore'
import type { PriceBar } from '../types'

// ── 設定 ─────────────────────────────────────────────────────

const FROM_DATE  = process.env.FROM_DATE ?? ''
const TO_DATE    = process.env.TO_DATE   ?? ''
const DRY_RUN    = process.env.DRY_RUN  === 'true'
const MA_PAIR    = process.env.MA_PAIR   ?? '25,75'
const MARKET     = (process.env.MARKET   ?? 'JP') as 'JP' | 'US'

const [maShort, maLong] = MA_PAIR.split(',').map(Number)
const MIN_BARS = maLong + 30   // MA計算に必要な最低バー数

let supabase = null as unknown as ReturnType<typeof createClient>

// ── 型定義 ────────────────────────────────────────────────────

interface CacheRow {
  symbol: string
  date:   string
  open:   number
  high:   number
  low:    number
  close:  number
  volume: number
}

// ── ヘルパー ──────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms))
}

function getBusinessDays(from: string, to: string): string[] {
  const days: string[] = []
  const cur = new Date(from + 'T00:00:00')
  const end = new Date(to   + 'T00:00:00')
  while (cur <= end) {
    const dow = cur.getDay()
    if (dow !== 0 && dow !== 6) days.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

// ── Step 1: DBメタ情報の取得 ──────────────────────────────────

async function getMetaInfo(): Promise<{ symbols: string[]; cacheFrom: string; cacheTo: string }> {
  // 最古日・最新日
  const [{ data: oldest }, { data: newest }] = await Promise.all([
    (supabase as any).from('screener_price_cache').select('date').order('date', { ascending: true  }).limit(1),
    (supabase as any).from('screener_price_cache').select('date').order('date', { ascending: false }).limit(1),
  ])
  const cacheFrom = (oldest  as {date:string}[])?.[0]?.date ?? ''
  const cacheTo   = (newest  as {date:string}[])?.[0]?.date ?? ''

  // 全銘柄をページングで取得（Supabaseはデフォルト1000件上限のため）
  const symbolSet = new Set<string>()
  const PAGE = 1000
  let from = 0
  while (true) {
    const { data: page, error } = await (supabase as any)
      .from('screener_price_cache')
      .select('symbol')
      .order('symbol')
      .range(from, from + PAGE - 1)
    if (error || !page || (page as {symbol:string}[]).length === 0) break
    for (const r of page as {symbol:string}[]) symbolSet.add(r.symbol)
    if ((page as {symbol:string}[]).length < PAGE) break  // 最終ページ
    from += PAGE
  }
  const symbols = [...symbolSet].sort()

  return { symbols, cacheFrom, cacheTo }
}

// ── Step 2: 銘柄単位で全バー取得 → 全日付でスキャン ──────────

async function processSymbol(
  symbol:    string,
  warmupFrom: string,   // MA計算のウォームアップ開始日
  scanDates: string[],  // 実際にシグナルを記録する営業日リスト
): Promise<object[]> {

  // price_cacheから全バーをページングで取得（1銘柄あたり最大2000本≒8年）
  const allRows: CacheRow[] = []
  const PAGE = 1000
  let from = 0
  while (true) {
    const { data: page, error } = await (supabase as any)
      .from('screener_price_cache')
      .select('date, open, high, low, close, volume')
      .eq('symbol', symbol)
      .gte('date', warmupFrom)
      .order('date', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error || !page || (page as CacheRow[]).length === 0) break
    allRows.push(...(page as CacheRow[]))
    if ((page as CacheRow[]).length < PAGE) break
    from += PAGE
  }

  if (allRows.length < MIN_BARS) return []
  const rows: object[] = []

  // 各スキャン日について「その日以前のバー」でcalcGCScoreを実行
  for (const date of scanDates) {
    // binary searchで高速スライス
    let endIdx = allRows.length - 1
    while (endIdx >= 0 && allRows[endIdx].date > date) endIdx--
    if (endIdx < MIN_BARS - 1) continue

    const bars: PriceBar[] = allRows.slice(0, endIdx + 1).map(r => ({
      date: r.date, open: r.open, high: r.high,
      low:  r.low,  close: r.close, volume: r.volume,
    }))

    const result = calcGCScore(symbol, MARKET, bars, maShort, maLong)
    if (!result) continue

    rows.push({
      symbol:          result.symbol,
      market:          result.market,
      name:            null,
      detected_at:     date,
      signal_type:     result.signalType,
      ma_short:        maShort,
      ma_long:         maLong,
      hold_days:       result.holdDays,
      total_score:     result.totalScore,
      rank:            result.rank,
      score_slope:     result.breakdown.slope,
      score_volume:    result.breakdown.volume,
      score_rsi:       result.breakdown.rsi,
      score_hold:      result.breakdown.hold,
      score_deviation: result.breakdown.deviation,
      score_macd:      result.breakdown.macd,
      score_weekly:    result.breakdown.weekly,
      close_price:     result.closePrice,
      volume_ratio:    result.volumeRatio,
      rsi_value:       result.rsiValue,
      deviation_pct:   result.deviationPct,
      ma_short_value:  result.maShortValue,
      ma_long_value:   result.maLongValue,
    })
  }

  return rows
}

// ── Step 3: バッチupsert ──────────────────────────────────────

async function upsertBatch(rows: object[]): Promise<void> {
  if (DRY_RUN || rows.length === 0) return
  const { error } = await (supabase as any)
    .from('gc_signals')
    .upsert(rows, { onConflict: 'symbol,detected_at,ma_short,ma_long' })
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

  console.log('\n過去シグナル遡及スキャン開始')
  console.log(`  MA: ${maShort}/${maLong}  DRY_RUN: ${DRY_RUN}`)

  // メタ情報取得
  const { symbols, cacheFrom, cacheTo } = await getMetaInfo()
  const fromDate = FROM_DATE || cacheFrom
  const toDate   = TO_DATE   || cacheTo

  console.log(`\n価格キャッシュ: ${cacheFrom} 〜 ${cacheTo}`)
  console.log(`スキャン範囲:   ${fromDate} 〜 ${toDate}`)
  console.log(`対象銘柄数:     ${symbols.length}件`)

  if (!fromDate || !toDate || symbols.length === 0) {
    console.log('screener_price_cache にデータがありません')
    return
  }

  // スキャン対象営業日
  const scanDates = getBusinessDays(fromDate, toDate)
  console.log(`スキャン日数:   ${scanDates.length}営業日`)
  console.log(`推定シグナル上限: 約${(symbols.length * scanDates.length / 1000).toFixed(0)}万件（実際はGC/DC時のみ）`)

  // ウォームアップ開始日（fromDateより前のバーも必要）
  const warmup = new Date(fromDate + 'T00:00:00')
  warmup.setDate(warmup.getDate() - MIN_BARS * 2)
  const warmupFrom = warmup.toISOString().slice(0, 10)

  // 確認プロンプト（DRY_RUNでない場合）
  if (!DRY_RUN) {
    console.log('\n既存のgc_signalsはUPSERT（同一銘柄+日付+MAは上書き）されます')
    console.log('開始します... (Ctrl+C でキャンセル)')
    await sleep(3000)
  }

  // 銘柄ごとに処理・バッファにためて500件単位でupsert
  let totalSignals = 0
  let processed    = 0
  let buffer: object[] = []
  const startTime = Date.now()

  for (const symbol of symbols) {
    const rows = await processSymbol(symbol, warmupFrom, scanDates)

    buffer.push(...rows)
    totalSignals += rows.length
    processed++

    // 500件溜まったらupsert
    if (buffer.length >= 500) {
      await upsertBatch(buffer)
      buffer = []
    }

    // 進捗表示（50銘柄ごと）
    if (processed % 50 === 0 || processed === symbols.length) {
      const elapsed = (Date.now() - startTime) / 1000
      const eta = processed < symbols.length
        ? Math.round(elapsed / processed * (symbols.length - processed))
        : 0
      process.stdout.write(
        `  ${processed}/${symbols.length}銘柄  ` +
        `シグナル: ${totalSignals}件  ` +
        `経過: ${elapsed.toFixed(0)}s  残: ${eta}s\r`
      )
    }
  }

  // 残りをupsert
  if (buffer.length > 0) await upsertBatch(buffer)

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log('\n\n' + '═'.repeat(50))
  console.log('  完了！')
  console.log(`  処理銘柄:     ${processed}件`)
  console.log(`  生成シグナル: ${totalSignals}件`)
  console.log(`  所要時間:     ${totalTime}秒`)
  if (DRY_RUN) {
    console.log('\n  [DRY_RUN] DBへの書き込みはスキップされました')
  } else {
    console.log('\n  次のステップ:')
    console.log('    npm run backtest:5d   # 5日保有で検証')
    console.log('    npm run backtest      # 20日保有で検証')
  }
}

main().catch(err => {
  console.error('エラー:', err)
  process.exit(1)
})
