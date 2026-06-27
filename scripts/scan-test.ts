/**
 * scripts/scan-test.ts
 *
 * DRY_RUN動作確認用：特定銘柄のみスキャンする高速テストスクリプト
 *
 * 使い方:
 *   TEST_SYMBOLS=7203,6758,9984 MA_PAIR=25,75 npx tsx scripts/scan-test.ts
 *
 * TEST_SYMBOLS 未指定時はデフォルト5銘柄を使用
 */

import {
  fetchJQuantsDailyByCode,
  jQuantsBarToPriceBar,
  getJQuantsFreeAvailableRange,
  calcFromDate,
} from '../lib/screener/jquants'
import { calcGCScore }    from '../lib/screener/calcScore'
import { detectCross }    from '../lib/screener/detectCross'
import { sma }            from '../lib/screener/indicators'
import { fetchYahooBars } from '../lib/yahoo'
import type { PriceBar }  from '../types'

// ── 設定 ─────────────────────────────────────────────────────

const MA_PAIR = process.env.MA_PAIR ?? '25,75'
const [maShort, maLong] = MA_PAIR.split(',').map(Number)

// TEST_SYMBOLS=7203,6758,9984 のように証券コード（4桁）で指定
const DEFAULT_SYMBOLS = ['7203', '6758', '9984', '8306', '6861']
const rawSymbols = process.env.TEST_SYMBOLS
  ? process.env.TEST_SYMBOLS.split(',').map(s => s.trim())
  : DEFAULT_SYMBOLS

// ── ヘルパー ─────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

function toYahooTicker(code: string): string {
  const base = code.length === 5 ? code.slice(0, 4) : code
  return `${base}.T`
}

/** 結果表示（スコア内訳付き） */
function printResult(symbol: string, bars: PriceBar[], result: ReturnType<typeof calcGCScore>, maShortPeriod = 25, maLongPeriod = 75) {
  const latest = bars[bars.length - 1]
  console.log(`\n${'─'.repeat(50)}`)
  console.log(`📊 ${symbol}  終値: ${latest?.close?.toFixed(0) ?? '-'}円  データ: ${bars.length}本`)

  if (!result) {
    // シグナルなしの理由をデバッグ表示
    const closes  = bars.map(b => b.close)
    const n       = closes.length - 1
    const maS     = sma(closes, maShortPeriod)
    const maL     = sma(closes, maLongPeriod)
    const cross   = detectCross(closes, maShortPeriod, maLongPeriod)

    console.log('  → シグナルなし（GC/DC未検出）')
    if (closes.length < maLongPeriod + 5) {
      console.log(`     ⚠️  データ不足: ${closes.length}本 (MA${maLongPeriod}計算に${maLongPeriod + 5}本必要)`)
    } else {
      const masCur  = maS[n]?.toFixed(1) ?? 'NaN'
      const malCur  = maL[n]?.toFixed(1) ?? 'NaN'
      const masPrev = maS[n-1]?.toFixed(1) ?? 'NaN'
      const malPrev = maL[n-1]?.toFixed(1) ?? 'NaN'
      const relation = maS[n] > maL[n] ? 'GC後の状態（短期 > 長期）' : 'DC後の状態（短期 < 長期）'
      console.log(`     MA${maShortPeriod}(今日): ${masCur}  MA${maLongPeriod}(今日): ${malCur}  → ${relation}`)
      console.log(`     MA${maShortPeriod}(昨日): ${masPrev}  MA${maLongPeriod}(昨日): ${malPrev}`)
      console.log(`     直近30日以内のクロスなし → 保有継続中またはトレンド継続`)
      if (cross.holdDays === 0 && cross.type === null) {
        // 30日以内にクロスなし → 何日前のクロスか探す
        const closes2 = closes
        const maS2 = maS
        const maL2 = maL
        for (let i = 1; i <= Math.min(200, n-1); i++) {
          if (isNaN(maS2[n-i]) || isNaN(maL2[n-i]) || isNaN(maS2[n-i-1]) || isNaN(maL2[n-i-1])) break
          const wasGC = maS2[n-i] > maL2[n-i] && maS2[n-i-1] <= maL2[n-i-1]
          const wasDC = maS2[n-i] < maL2[n-i] && maS2[n-i-1] >= maL2[n-i-1]
          if (wasGC || wasDC) {
            console.log(`     直近クロス: ${wasGC ? 'GC' : 'DC'} が ${i}日前 (${bars[n-i]?.date}) に発生（30日超のため対象外）`)
            break
          }
        }
      }
    }
    return
  }

  const rankEmoji = { A: '🟢', B: '🟡', C: '🟠', D: '🔴' }[result.rank]
  console.log(`  → ${result.signalType} 検出  ${rankEmoji} ランク${result.rank}  スコア: ${result.totalScore}/100`)
  console.log(`     維持日数: ${result.holdDays}日  乖離: ${result.deviationPct.toFixed(1)}%  RSI: ${result.rsiValue.toFixed(1)}`)
  console.log(`     MA${maShort}: ${result.maShortValue.toFixed(1)}  MA${maLong}: ${result.maLongValue.toFixed(1)}`)
  console.log(``)
  console.log(`     スコア内訳:`)
  console.log(`       ① MAの傾き   : ${String(result.breakdown.slope).padStart(4)}点`)
  console.log(`       ② 出来高比率 : ${String(result.breakdown.volume).padStart(4)}点  (${result.volumeRatio.toFixed(2)}倍)`)
  console.log(`       ③ RSI水準   : ${String(result.breakdown.rsi).padStart(4)}点`)
  console.log(`       ④ 維持日数   : ${String(result.breakdown.hold).padStart(4)}点`)
  console.log(`       ⑤ 価格乖離   : ${String(result.breakdown.deviation).padStart(4)}点`)
  console.log(`       ⑥ MACD      : ${String(result.breakdown.macd).padStart(4)}点`)
  console.log(`       ⑦ 週足      : ${String(result.breakdown.weekly).padStart(4)}点`)
  console.log(`                      ──────`)
  console.log(`                合計: ${String(result.totalScore).padStart(4)}点`)
}

// ── メイン ────────────────────────────────────────────────────

async function main() {
  const { from: jqFrom, to: jqTo } = getJQuantsFreeAvailableRange()
  // J-Quantsから取得する期間: jqFrom（2年前）〜 jqTo（84日前）
  // Yahoo Financeで jqTo〜当日 を補完する
  // calcFromDate()はYahooフォールバック時のfilter用に保持
  const fromDate = jqFrom

  console.log(`\n${'═'.repeat(50)}`)
  console.log(`  GC/DC テストスキャン（${rawSymbols.length}銘柄）`)
  console.log(`  MA: ${maShort}/${maLong}`)
  console.log(`  J-Quants取得範囲: ${jqFrom} 〜 ${jqTo} [Free plan: 2年分・84日遅延]`)
  console.log(`${'═'.repeat(50)}`)

  const results: Array<{ symbol: string; result: ReturnType<typeof calcGCScore> }> = []

  for (let i = 0; i < rawSymbols.length; i++) {
    const code        = rawSymbols[i]
    const yahooTicker = toYahooTicker(code)

    console.log(`\n[${i + 1}/${rawSymbols.length}] ${yahooTicker} 取得中...`)

    // ① J-Quants から過去データ取得（レート制限: 5req/分 → 必ず13秒待機）
    let jqBars: PriceBar[] = []
    try {
      const raw = await fetchJQuantsDailyByCode(code, fromDate, jqTo)
      jqBars = raw.map(jQuantsBarToPriceBar).filter((b): b is PriceBar => b !== null)
      console.log(`  J-Quants: ${jqBars.length}本 (${jqBars[0]?.date} 〜 ${jqBars[jqBars.length-1]?.date})`)
    } catch (e) {
      console.warn(`  J-Quants 取得失敗:`, e instanceof Error ? e.message : e)
    }
    // J-Quants APIのレート制限（5req/分）を確実に守る
    // ページネーションなしの場合でも次のリクエストまで待機
    await sleep(13_000)

    // ② Yahoo Finance でデータ取得
    //    J-Quants が成功した場合: jqTo 以降の直近のみ補完
    //    J-Quants が失敗した場合: 全期間を Yahoo で代替（フォールバック）
    let yahooRecentBars: PriceBar[] = []
    try {
      const allBars = await fetchYahooBars(yahooTicker)
      if (jqBars.length >= maLong + 5) {
        // J-Quantsデータが十分 → 直近補完のみ
        yahooRecentBars = allBars.filter(b => b.date > jqTo)
        console.log(`  Yahoo補完: ${yahooRecentBars.length}本 (${jqTo}以降)`)
      } else {
        // J-Quantsデータ不足（APIキー未設定など）→ 全期間フォールバック
        yahooRecentBars = allBars.filter(b => b.date >= fromDate)
        console.log(`  Yahoo全期間: ${yahooRecentBars.length}本 [J-Quantsフォールバック]`)
      }
    } catch (e) {
      console.warn(`  Yahoo取得 失敗:`, e instanceof Error ? e.message : e)
    }

    // ③ マージ
    const merged = new Map<string, PriceBar>()
    for (const b of [...jqBars, ...yahooRecentBars]) merged.set(b.date, b)
    const bars = [...merged.values()].sort((a, b) => a.date.localeCompare(b.date))
    console.log(`  マージ後: ${bars.length}本 (${bars[0]?.date} 〜 ${bars[bars.length-1]?.date})`)

    // ④ スコア計算
    const result = calcGCScore(yahooTicker, 'JP', bars, maShort, maLong)
    printResult(yahooTicker, bars, result, maShort, maLong)
    results.push({ symbol: yahooTicker, result })

    // J-Quants取得後に既に13秒待機済みのため、追加待機不要
  }

  // ── サマリー表示 ────────────────────────────────────────────
  console.log(`\n${'═'.repeat(50)}`)
  console.log(`  スキャン結果サマリー`)
  console.log(`${'═'.repeat(50)}`)

  const detected = results.filter(r => r.result !== null)
  console.log(`  検出: ${detected.length}/${results.length}銘柄`)
  console.log(``)

  if (detected.length > 0) {
    console.log(`  銘柄        種別  ランク  スコア  維持日数`)
    console.log(`  ${'─'.repeat(42)}`)
    detected
      .sort((a, b) => (b.result?.totalScore ?? 0) - (a.result?.totalScore ?? 0))
      .forEach(({ symbol, result: r }) => {
        if (!r) return
        const rankEmoji = { A: '🟢', B: '🟡', C: '🟠', D: '🔴' }[r.rank]
        console.log(
          `  ${symbol.padEnd(12)}${r.signalType}    ${rankEmoji}${r.rank}     ${String(r.totalScore).padStart(3)}点    ${r.holdDays}日`
        )
      })
  } else {
    console.log(`  シグナル検出なし`)
    console.log(`  （対象期間にGC/DCが発生していないか、データ不足の可能性）`)
  }

  console.log(`\n${'═'.repeat(50)}\n`)
}

main().catch(err => {
  console.error('エラー:', err)
  process.exit(1)
})
