/**
 * scripts/fetch-prices.ts
 *
 * J-Quants「日付指定・全銘柄一括」取得でSupabaseにキャッシュ蓄積
 *
 * 動作モード:
 *   FETCH_MODE=full  → 全期間（初回のみ）: 310日分をループ取得
 *   FETCH_MODE=diff  → 差分のみ（毎日）: 前回取得日の翌日〜jqTo を取得
 *   FETCH_MODE=date  → 特定日付のみ再取得: FETCH_DATE=YYYY-MM-DD で指定
 *
 * 処理速度:
 *   full: 310日 × 13秒 ≒ 67分（初回のみ）
 *   diff: 通常1〜3日分 × 13秒 ≒ 13〜40秒（毎日）
 *   date: 1日分 × 13秒 ≒ 13秒（欠落日補完用）
 *
 * 使い方:
 *   初回: FETCH_MODE=full npx tsx --env-file=.env.local scripts/fetch-prices.ts
 *   毎日: FETCH_MODE=diff npx tsx --env-file=.env.local scripts/fetch-prices.ts
 *   補完: FETCH_MODE=date FETCH_DATE=2025-09-08 npx tsx --env-file=.env.local scripts/fetch-prices.ts
 */

import { createClient } from '@supabase/supabase-js'
import {
  fetchJQuantsDailyByDate,
  fetchJQuantsIssues,
  jQuantsBarToPriceBar,
  getJQuantsFreeAvailableRange,
} from '../lib/screener/jquants'
import { fetchYahooBarsRaw } from '../lib/yahoo'
import type { PriceBar } from '../types'

// ── 設定 ─────────────────────────────────────────────────────

const FETCH_MODE  = (process.env.FETCH_MODE ?? 'diff') as 'full' | 'diff' | 'date'
const FETCH_DATE  = process.env.FETCH_DATE ?? ''   // FETCH_MODE=date 時に使用
const DRY_RUN     = process.env.DRY_RUN === 'true'

let supabase = null as unknown as ReturnType<typeof createClient>

// ── ヘルパー ──────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms))
}

/** 営業日リストを生成（土日を除く） */
function getBusinessDays(from: string, to: string): string[] {
  const days: string[] = []
  const cur = new Date(from)
  const end = new Date(to)
  while (cur <= end) {
    const dow = cur.getDay()
    if (dow !== 0 && dow !== 6) {  // 土日除く（祝日は除けないがJ-Quantsが空データを返す）
      days.push(cur.toISOString().slice(0, 10))
    }
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

/** Supabaseから最後に取得した日付を確認 */
async function getLastFetchedDate(): Promise<string | null> {
  const { data } = await (supabase.from('screener_price_cache') as any)
    .select('date')
    .order('date', { ascending: false })
    .limit(1)
  return (data as { date: string }[] | null)?.[0]?.date ?? null
}

/** 1日分のデータをSupabaseにupsert */
async function saveDayPrices(date: string, bars: PriceBar[], codeToName: Map<string, string>): Promise<number> {
  if (bars.length === 0) return 0

  const rows = bars.map(b => {
    // J-Quantsのtickerは5桁(72030) → Yahoo形式(7203.T)に変換
    const base   = b.date  // dateはPriceBarのdate、ここでは一時使用
    // barにはsymbolがないので外部から渡す必要あり → 別途処理
    return b
  })

  // upsert: symbol, date の組み合わせで重複排除
  const { error } = await (supabase.from('screener_price_cache') as any).upsert(
    bars,
    { onConflict: 'symbol,date' }
  )
  if (error) {
    console.error(`  [save] ${date} upsertエラー:`, error.message)
    return 0
  }
  return bars.length
}

// ── メイン ────────────────────────────────────────────────────

async function main() {
  supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { from: jqFrom, to: jqTo } = getJQuantsFreeAvailableRange()
  console.log(`\n=== 価格データ蓄積 (${FETCH_MODE}モード) ===`)
  console.log(`J-Quants取得可能範囲: ${jqFrom} 〜 ${jqTo}`)
  console.log(`DRY_RUN: ${DRY_RUN}`)

  // ── 取得する日付範囲を決定 ────────────────────────────────

  let fetchFrom: string
  let fetchTo:   string = jqTo

  if (FETCH_MODE === 'full') {
    fetchFrom = jqFrom
    console.log(`\n全期間取得: ${fetchFrom} 〜 ${fetchTo}`)

  } else if (FETCH_MODE === 'date') {
    // 特定日付のみ再取得（欠落日補完用）
    if (!FETCH_DATE) {
      console.error('FETCH_MODE=date の場合は FETCH_DATE=YYYY-MM-DD が必要です')
      process.exit(1)
    }
    fetchFrom = FETCH_DATE
    fetchTo   = FETCH_DATE
    console.log(`\n特定日付再取得: ${fetchFrom}`)

  } else {
    // diff: Supabaseの最終取得日の翌日から
    const lastDate = await getLastFetchedDate()
    if (!lastDate) {
      console.log('キャッシュなし → fullモードに切り替え')
      fetchFrom = jqFrom
    } else {
      const next = new Date(lastDate)
      next.setDate(next.getDate() + 1)
      fetchFrom = next.toISOString().slice(0, 10)
    }
    console.log(`\n差分取得: ${fetchFrom} 〜 ${fetchTo} (前回最終: ${lastDate ?? 'なし'})`)
  }

  if (fetchFrom > fetchTo) {
    console.log('取得すべき新しいデータなし（最新状態）')
    return
  }

  // ── 銘柄コード→Yahoo変換マップを構築 ─────────────────────

  console.log('\n[Step 1] 銘柄マスタ取得...')
  const issues = await fetchJQuantsIssues()
  const codeToYahoo = new Map<string, string>()
  const codeToName  = new Map<string, string>()
  for (const issue of issues) {
    const yahoo = issue.Code.slice(0, 4) + '.T'
    codeToYahoo.set(issue.Code, yahoo)
    codeToName.set(issue.Code, issue.CoName)
  }
  console.log(`銘柄マスタ: ${issues.length}件`)
  await sleep(13_000)  // レート制限

  // ── 日付ループで1日ずつ全銘柄取得 ────────────────────────

  const days = getBusinessDays(fetchFrom, fetchTo)
  console.log(`\n[Step 2] ${days.length}営業日分を取得...`)

  let totalSaved = 0
  let dayErrors  = 0

  for (let i = 0; i < days.length; i++) {
    const date = days[i]

    try {
      // 1リクエストでその日の全銘柄価格を取得
      const rawBars = await fetchJQuantsDailyByDate(date)

      if (rawBars.length === 0) {
        console.log(`  ${date}: データなし（祝日or取引なし）`)
        // 空日もレート制限を守る
        await sleep(13_000)
        continue
      }

      // PriceBar形式に変換 + symbolを付与
      const bars: (PriceBar & { symbol: string; name: string })[] = []
      for (const raw of rawBars) {
        const bar = jQuantsBarToPriceBar(raw)
        if (!bar) continue
        const symbol = codeToYahoo.get(raw.Code) ?? raw.Code.slice(0, 4) + '.T'
        const name   = codeToName.get(raw.Code)  ?? ''
        bars.push({ ...bar, symbol, name })
      }

      // symbol+date で重複除去（J-Quantsが同一銘柄を複数コードで返す場合がある）
      const deduped = new Map<string, typeof bars[0]>()
      for (const b of bars) {
        deduped.set(`${b.symbol}__${b.date}`, b)
      }
      const uniqueBars = [...deduped.values()]

      // Supabaseに保存（500件バッチ）
      if (!DRY_RUN && uniqueBars.length > 0) {
        const BATCH = 500
        let batchError = false
        for (let bi = 0; bi < uniqueBars.length; bi += BATCH) {
          const chunk = uniqueBars.slice(bi, bi + BATCH).map(b => ({
            symbol: b.symbol,
            name:   b.name,
            date:   b.date,
            open:   b.open,
            high:   b.high,
            low:    b.low,
            close:  b.close,
            volume: b.volume,
          }))
          const { error } = await (supabase.from('screener_price_cache') as any).upsert(
            chunk,
            { onConflict: 'symbol,date' }
          )
          if (error) {
            console.error(`  ${date}: upsertエラー:`, error.message)
            dayErrors++
            batchError = true
            break
          }
        }
        if (!batchError) totalSaved += uniqueBars.length
      }

      const pct = ((i + 1) / days.length * 100).toFixed(0)
      console.log(`  ${date}: ${bars.length}銘柄 [${pct}% 完了] 累計保存: ${totalSaved}件`)

    } catch (e) {
      console.error(`  ${date}: エラー:`, e instanceof Error ? e.message : e)
      dayErrors++
    }

    // レート制限: 最終日以外は13秒待機
    if (i < days.length - 1) await sleep(13_000)
  }

  console.log(`\n=== 完了 ===`)
  console.log(`保存件数: ${totalSaved}件`)
  console.log(`エラー日数: ${dayErrors}日`)
  if (DRY_RUN) console.log('※ DRY_RUNのためDBへの書き込みはスキップしました')

  // ── Phase 2: Yahoo で J-Quants ギャップ（84日分）を補完 ──────
  // jqTo 〜 今日 の期間を全銘柄 Yahoo から取得してキャッシュに追記
  // これにより scan.ts のスキャン基準日を「今日」にできる
  await fillYahooGap(jqTo)
}

/** Yahoo Finance で jqTo+1〜today を補完してキャッシュに保存 */
async function fillYahooGap(jqTo: string) {
  const today = new Date().toISOString().slice(0, 10)
  const gapFrom = new Date(jqTo)
  gapFrom.setDate(gapFrom.getDate() + 1)
  const gapFromStr = gapFrom.toISOString().slice(0, 10)

  if (gapFromStr > today) {
    console.log('\n[Yahoo補完] ギャップなし（最新状態）')
    return
  }

  console.log(`\n[Yahoo補完] ${gapFromStr} 〜 ${today} を Yahoo で補完中...`)

  // Supabase から symbol 一覧を取得
  // .select('symbol') は行数上限があるため、特定日付1日分から取得する
  const { to: jqTo2 } = getJQuantsFreeAvailableRange()
  const { data: symbolRows } = await (supabase.from('screener_price_cache') as any)
    .select('symbol')
    .eq('date', jqTo2)   // J-Quantsの最終日（全銘柄が揃っている日）
    .limit(10000)
  const symbols: string[] = (symbolRows ?? []).map((r: { symbol: string }) => r.symbol)
  console.log(`[Yahoo補完] 対象銘柄: ${symbols.length}件`)

  if (symbols.length === 0) return

  const p1 = Math.floor(gapFrom.getTime() / 1000)
  const p2 = Math.floor(Date.now() / 1000)

  let saved = 0
  let skipped = 0
  const CONCURRENCY = 5  // 並列数（Yahoo はレート制限なし）
  const BATCH_DB = 500

  for (let i = 0; i < symbols.length; i += CONCURRENCY) {
    const chunk = symbols.slice(i, i + CONCURRENCY)
    const results = await Promise.allSettled(chunk.map(async (symbol) => {
      try {
        const bars = await fetchYahooBarsRaw(symbol, p1, p2)
        if (bars.length === 0) return []
        return bars.map(b => ({
          symbol,
          name:   '',     // Yahoo から名前は取れないがキャッシュ済み銘柄なのでOK
          date:   b.date,
          open:   b.open,
          high:   b.high,
          low:    b.low,
          close:  b.close,
          volume: b.volume,
        }))
      } catch {
        return []  // HTTP 400（上場廃止など）はスキップ
      }
    }))

    const rows = results.flatMap(r => r.status === 'fulfilled' ? r.value : [])
    if (rows.length === 0) { skipped += chunk.length; continue }

    if (!DRY_RUN) {
      for (let bi = 0; bi < rows.length; bi += BATCH_DB) {
        const { error } = await (supabase.from('screener_price_cache') as any)
          .upsert(rows.slice(bi, bi + BATCH_DB), { onConflict: 'symbol,date' })
        if (error) console.error('[Yahoo補完] upsertエラー:', error.message)
      }
    }
    saved += rows.length

    if ((i / CONCURRENCY) % 20 === 0) {
      console.log(`[Yahoo補完] 進捗: ${Math.min(i + CONCURRENCY, symbols.length)}/${symbols.length} (保存: ${saved}件)`)
    }
  }

  console.log(`[Yahoo補完] 完了: 保存 ${saved}件, スキップ ${skipped}件`)
}

main().catch(err => {
  console.error('致命的エラー:', err)
  process.exit(1)
})
