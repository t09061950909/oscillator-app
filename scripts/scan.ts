/**
 * scripts/scan.ts
 *
 * GitHub Actions から実行される GC/DC スクリーニングスクリプト
 *
 * 動作フロー:
 *   1. J-Quants から銘柄マスタを取得（または Supabase キャッシュを使用）
 *   2. Supabase の price_cache テーブルから各銘柄の過去バーを取得
 *   3. Free plan の遅延により直近12週間が欠落している場合:
 *      → Yahoo Finance でギャップ期間を補完
 *   4. 全銘柄に対してGC/DCスコアを計算
 *   5. シグナルを gc_signals テーブルに upsert
 *   6. 実行ログを screener_scan_logs に記録
 *
 * 環境変数:
 *   SUPABASE_URL               Supabase プロジェクトURL
 *   SUPABASE_SERVICE_ROLE_KEY  サービスロールキー（RLS bypass）
 *   JQUANTS_API_KEY            J-Quants APIキー（V2）
 *   MA_PAIR                    "25,75" 形式（デフォルト: "25,75"）
 *   MARKET                     "JP"（現時点）
 *   DRY_RUN                    "true" の場合DBへの書き込みをスキップ
 */

// .env.local を自動読み込み（tsx 実行時はNext.jsの自動読み込みが効かないため）
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import {
  fetchJQuantsIssues,
  fetchJQuantsDailyByDate,
  fetchJQuantsDailyByCode,
  jQuantsBarToPriceBar,
  getLatestAvailableDate,
  calcFromDate,
  getJQuantsFreeAvailableRange,
} from '../lib/screener/jquants'
import { calcGCScore }  from '../lib/screener/calcScore'
import { fetchYahooBars } from '../lib/yahoo'
import type { PriceBar } from '../types'

// ── 設定 ─────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!
const MA_PAIR      = process.env.MA_PAIR ?? '25,75'
const MARKET       = (process.env.MARKET ?? 'JP') as 'JP' | 'US'
const DRY_RUN      = process.env.DRY_RUN === 'true'

const [maShort, maLong] = MA_PAIR.split(',').map(Number)

// プライム市場のみに絞る（スタンダード・グロースは任意で追加可能）
// MarketCode: 0111=プライム, 0112=スタンダード, 0113=グロース
const TARGET_MARKETS = ['0111', '0112', '0113']

// supabase クライアントは main() 内で遅延生成（dotenv読み込み後に環境変数を参照するため）
// eslint-disable-next-line prefer-const
let supabase = null as unknown as ReturnType<typeof createClient>

// ── ヘルパー ──────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

/** screener_price_cache から指定銘柄の過去バーを取得 */
async function getBarsFromCache(
  symbol: string,
  fromDate: string
): Promise<PriceBar[]> {
  const { data, error } = await supabase
    .from('screener_price_cache')
    .select('date, open, high, low, close, volume')
    .eq('symbol', symbol)
    .gte('date', fromDate)
    .order('date', { ascending: true })

  if (error) {
    console.warn(`[cache] ${symbol} 取得エラー:`, error.message)
    return []
  }
  return (data ?? []) as PriceBar[]
}

/**
 * J-Quants と Yahoo Finance を組み合わせて必要期間のバーを取得
 *
 * Free planの欠落（直近12週間）を Yahoo Finance で補完:
 *   [---- J-Quants (2年〜12週間前) ----][-- Yahoo Finance (12週間前〜当日) --]
 */
async function fetchBarsForScan(
  code: string,          // J-Quants証券コード ("7203")
  yahooTicker: string,   // Yahoo Financeティッカー ("7203.T")
  fromDate: string,
): Promise<PriceBar[]> {

  const { to: jqTo } = getJQuantsFreeAvailableRange()

  // ① J-Quants から過去データ取得（12週間より前まで）
  let jqBars: PriceBar[] = []
  try {
    const raw = await fetchJQuantsDailyByCode(code, fromDate, jqTo)
    jqBars = raw.map(jQuantsBarToPriceBar).filter((b): b is PriceBar => b !== null)
    console.log(`[jquants] ${code}: ${jqBars.length}本 (${fromDate}〜${jqTo})`)
  } catch (e) {
    console.warn(`[jquants] ${code} 取得失敗:`, e)
  }

  // ② Yahoo Finance でデータ取得
  //    J-Quants が成功した場合: jqTo 以降の直近のみ補完
  //    J-Quants が失敗した場合: 全期間を Yahoo で代替（フォールバック）
  let yahooRecentBars: PriceBar[] = []
  try {
    const allYahooBars = await fetchYahooBars(yahooTicker)
    if (jqBars.length >= maLong + 5) {
      // J-Quantsデータが十分 → 直近補完のみ
      yahooRecentBars = allYahooBars.filter(b => b.date > jqTo)
      console.log(`[yahoo] ${yahooTicker}: ${yahooRecentBars.length}本 (${jqTo}以降)`)
    } else {
      // J-Quantsデータ不足 → 全期間フォールバック
      yahooRecentBars = allYahooBars.filter(b => b.date >= fromDate)
      console.log(`[yahoo] ${yahooTicker}: ${yahooRecentBars.length}本 [全期間フォールバック]`)
    }
  } catch (e) {
    console.warn(`[yahoo] ${yahooTicker} 補完失敗:`, e)
  }

  // ③ マージ（日付でdedup、新しい方優先）
  const merged = new Map<string, PriceBar>()
  for (const b of [...jqBars, ...yahooRecentBars]) {
    merged.set(b.date, b)  // 後から書いたYahoo側が優先
  }

  const sorted = [...merged.values()].sort((a, b) => a.date.localeCompare(b.date))
  return sorted
}

/** J-Quants証券コードからYahoo Financeティッカーに変換 */
function toYahooTicker(code: string): string {
  // J-Quantsは5桁（末尾が株式種別）、Yahoo Financeは4桁+".T"
  const base = code.length === 5 ? code.slice(0, 4) : code
  return `${base}.T`
}

// ── メイン処理 ────────────────────────────────────────────────

async function main() {
  // dotenv 読み込み後に環境変数が確定するので、ここで supabase を初期化
  // Node.js 20: ネイティブWebSocket未対応のためwsパッケージをtransportに指定
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { realtime: { transport: ws as any } }
  )

  const startTime = Date.now()
  console.log(`\n=== GC/DC スキャン開始 ===`)
  console.log(`MA: ${maShort}/${maLong}, Market: ${MARKET}, DryRun: ${DRY_RUN}`)

  const { from: jqFrom, to: jqTo } = getJQuantsFreeAvailableRange()
  const fromDate   = jqFrom           // 2年前（J-Quants取得開始日）
  const latestDate = jqTo             // 84日前（J-Quants取得終了日 = スキャン基準日）
  console.log(`取得範囲: ${fromDate} 〜 ${latestDate}（J-Quants Free: 2年分・84日遅延）`)

  // Step 1: 銘柄マスタ取得
  console.log('\n[Step 1] 銘柄マスタ取得...')
  const issues = await fetchJQuantsIssues()
  const targets = issues.filter(i => TARGET_MARKETS.includes(i.Mkt))
  console.log(`対象銘柄: ${targets.length}件 / 全${issues.length}件`)
  // 銘柄マスタ取得後にレート制限を守るため待機
  await sleep(13_000)

  // Step 2: 全銘柄スキャン
  console.log('\n[Step 2] スキャン開始...')
  const signals: NonNullable<ReturnType<typeof calcGCScore>>[] = []
  let processed = 0
  let skipped   = 0
  let errors    = 0

  for (const issue of targets) {
    const code        = issue.Code
    const yahooTicker = toYahooTicker(code)

    try {
      // screener_price_cache から取得（fetch-prices.ts で事前蓄積済み）
      let bars = await getBarsFromCache(yahooTicker, fromDate)

      if (bars.length < maLong + 5) {
        // キャッシュ不足 → Yahoo Finance でフォールバック（初回 or キャッシュ未蓄積時）
        // 新規上場銘柄は物理的に本数が少ないため、Yahoo でも同様に少ない場合がある
        console.warn(`[scan] ${yahooTicker} キャッシュ不足(${bars.length}本) → Yahooフォールバック`)
        bars = await fetchBarsForScan(code, yahooTicker, fromDate)
      }

      // 新規上場銘柄: maLong の 80% 以上あればスコア計算を試みる
      const minRequired = Math.floor(maLong * 0.8)
      if (bars.length < minRequired) {
        skipped++
        continue
      }

      const result = calcGCScore(yahooTicker, MARKET, bars, maShort, maLong)
      if (result) signals.push(result)

      processed++
      if (processed % 50 === 0) {
        console.log(`  進捗: ${processed}/${targets.length} (シグナル: ${signals.length}件)`)
      }

    } catch (e) {
      errors++
      console.warn(`[scan] ${code} エラー:`, e)
    }
  }

  console.log(`\nスキャン完了: 処理=${processed}, スキップ=${skipped}, エラー=${errors}`)
  console.log(`シグナル検出: ${signals.length}件`)

  // Step 3: Supabase に upsert
  if (!DRY_RUN && signals.length > 0) {
    console.log('\n[Step 3] Supabase 書き込み...')

    const rows = signals.map(s => ({
      symbol:        s!.symbol,
      market:        s!.market,
      detected_at:   latestDate,
      signal_type:   s!.signalType,
      ma_short:      maShort,
      ma_long:       maLong,
      hold_days:     s!.holdDays,
      total_score:   s!.totalScore,
      rank:          s!.rank,
      score_slope:   s!.breakdown.slope,
      score_volume:  s!.breakdown.volume,
      score_rsi:     s!.breakdown.rsi,
      score_hold:    s!.breakdown.hold,
      score_deviation: s!.breakdown.deviation,
      score_macd:    s!.breakdown.macd,
      score_weekly:  s!.breakdown.weekly,
      close_price:   s!.closePrice,
      volume_ratio:  s!.volumeRatio,
      rsi_value:     s!.rsiValue,
      deviation_pct: s!.deviationPct,
      ma_short_value: s!.maShortValue,
      ma_long_value:  s!.maLongValue,
    }))

    // 500件ずつバッチ upsert
    const BATCH = 500
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH)
      const { error } = await supabase
        .from('gc_signals')
        .upsert(batch as never[], { onConflict: 'symbol,detected_at,ma_short,ma_long' })
      if (error) console.error('[supabase] upsert error:', error.message)
      else console.log(`  書き込み: ${i + batch.length}/${rows.length}件`)
    }
  } else if (DRY_RUN) {
    console.log('\n[DRY RUN] 書き込みスキップ。検出シグナル:')
    signals.slice(0, 10).forEach(s =>
      console.log(`  ${s!.symbol} ${s!.signalType} rank=${s!.rank} score=${s!.totalScore}`)
    )
  }

  // Step 4: 実行ログ記録
  const durationMs = Date.now() - startTime
  if (!DRY_RUN) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('screener_scan_logs') as any).insert({
      market:        MARKET,
      ma_short:      maShort,
      ma_long:       maLong,
      total_tickers: processed,
      signals_found: signals.length,
      duration_ms:   durationMs,
      status:        'success',
    })
  }

  console.log(`\n=== 完了 (${(durationMs / 1000).toFixed(1)}秒) ===\n`)
}

main().catch(async (err) => {
  console.error('[scan] 致命的エラー:', err)

  // エラーログをSupabaseに記録
  if (!DRY_RUN) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { realtime: { transport: ws as any } }
    )
    try {
      await supabase.from('screener_scan_logs').insert({
        market:   process.env.MARKET ?? 'JP',
        ma_short: maShort,
        ma_long:  maLong,
        status:   'error',
        error_msg: String(err),
      })
    } catch { /* ログ記録失敗は無視 */ }
  }

  process.exit(1)
})
