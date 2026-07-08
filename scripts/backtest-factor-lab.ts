/**
 * scripts/backtest-factor-lab.ts
 *
 * factor_lab + screener_price_cache を使って
 * 全候補因子のIC（情報係数）・相関・Sharpe分位を分析し
 * 「真に有効な因子」を特定する（Phase 2 実行スクリプト）
 *
 * 実行手順:
 *   1. npm run scan:factor          # factor_labにデータを書き込む
 *   2. npm run backtest:factor      # ← このスクリプト
 *
 * 使い方（PowerShell）:
 *   npx tsx --env-file=.env.local scripts/backtest-factor-lab.ts
 *
 *   # 保有期間指定
 *   $env:HOLD_DAYS="10"; npx tsx --env-file=.env.local scripts/backtest-factor-lab.ts
 *
 *   # 期間分割検証（過学習対策）
 *   $env:SPLIT_DATE="2026-01-01"; npx tsx --env-file=.env.local scripts/backtest-factor-lab.ts
 *
 * 出力:
 *   - コンソール: 因子ランキング（IC・相関・Sharpe分位）
 *   - CSV: factor_ranking_HOLD_DATE.csv（Excelで詳細分析可能）
 */

import { createClient }  from '@supabase/supabase-js'
import { FACTOR_CATALOG } from '../lib/screener/factorLab'
import * as fs from 'fs'

// ── 設定 ─────────────────────────────────────────────────────

const HOLD_DAYS  = parseInt(process.env.HOLD_DAYS  ?? '10')
const SPLIT_DATE = process.env.SPLIT_DATE ?? ''   // In-sample/Out-of-sampleの分割日
const MIN_SAMPLE = parseInt(process.env.MIN_SAMPLE ?? '100')

let supabase = null as unknown as ReturnType<typeof createClient>

// ── 型定義 ────────────────────────────────────────────────────

type FactorKey = keyof typeof FACTOR_CATALOG

interface LabRow {
  symbol:       string
  detected_at:  string
  return_5d:    number | null
  return_10d:   number | null
  return_20d:   number | null
  [key: string]: string | number | null
}

interface FactorResult {
  key:          FactorKey
  label:        string
  category:     string
  n:            number           // サンプル数
  pearson_r:    number           // Pearson相関係数
  ic_mean:      number           // 月次IC平均（Spearman）
  ic_std:       number           // 月次ICの標準偏差
  icir:         number           // IC / IC_std（情報比率）
  sharpe_q1:    number           // 下位25%分位のSharpe
  sharpe_q4:    number           // 上位25%分位のSharpe
  q_spread:     number           // q4 - q1（分位間スプレッド）
  monotone:     boolean          // 分位が単調増加か
  win_q4:       number           // 上位25%の勝率
}

// ── 統計ユーティリティ ────────────────────────────────────────

function avg(arr: number[]): number {
  if (arr.length === 0) return NaN
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function std(arr: number[]): number {
  if (arr.length < 2) return NaN
  const m = avg(arr)
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length)
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length
  if (n < 2) return NaN
  const mx = avg(xs), my = avg(ys)
  const sx = std(xs), sy = std(ys)
  if (sx === 0 || sy === 0) return NaN
  const cov = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / n
  return cov / (sx * sy)
}

/** Spearman順位相関 */
function spearman(xs: number[], ys: number[]): number {
  const n = xs.length
  if (n < 2) return NaN
  const rankOf = (arr: number[]) => {
    const sorted = [...arr].map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)
    const ranks = new Array(n)
    for (let i = 0; i < n; i++) ranks[sorted[i].i] = i + 1
    return ranks
  }
  const rx = rankOf(xs), ry = rankOf(ys)
  return pearson(rx, ry)
}

function quantile(arr: number[], q: number): number {
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = (sorted.length - 1) * q
  const lo = Math.floor(idx), hi = Math.ceil(idx)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

function sharpeOf(returns: number[]): number {
  const m = avg(returns), s = std(returns)
  if (isNaN(s) || s === 0) return 0
  return m / s
}

// ── Step 1: factor_lab からデータを全件取得 ──────────────────

async function fetchFactorLab(
  returnCol: string,
): Promise<LabRow[]> {
  const all: LabRow[] = []
  let from = 0
  const PAGE = 1000

  while (true) {
    let q = (supabase as any)
      .from('factor_lab')
      .select(`symbol, detected_at, ${returnCol}, ${Object.keys(FACTOR_CATALOG).join(', ')}`)
      .not(returnCol, 'is', null)
      .order('detected_at', { ascending: true })
      .range(from, from + PAGE - 1)

    const { data, error } = await q
    if (error) throw new Error(`factor_lab取得エラー: ${error.message}`)
    if (!data || (data as LabRow[]).length === 0) break

    all.push(...(data as LabRow[]))
    if ((data as LabRow[]).length < PAGE) break
    from += PAGE

    if (from % 10000 === 0) {
      process.stdout.write(`  factor_lab取得中: ${all.length}件...\r`)
    }
  }

  return all
}

// ── Step 2: リターン列を factor_lab に埋め込む ───────────────
// （scan-factor-lab.ts実行後にreturn_Nd が null のままの場合に実行）

async function fillReturns(): Promise<void> {
  console.log('\n[Step 2] リターン値をfactor_labに補完中...')

  // return_Ndがnullのレコードを取得
  for (const days of [5, 10, 20]) {
    const col = `return_${days}d` as const
    let from = 0
    const PAGE = 500
    let filled = 0

    while (true) {
      const { data } = await (supabase as any)
        .from('factor_lab')
        .select('symbol, detected_at')
        .is(col, null)
        .range(from, from + PAGE - 1)

      if (!data || (data as any[]).length === 0) break

      const updates: Array<{ symbol: string; detected_at: string; ret: number | null }> = []

      await Promise.all((data as { symbol: string; detected_at: string }[]).map(async row => {
        // screener_price_cacheからN日後の価格を取得
        const { data: prices } = await (supabase as any)
          .from('screener_price_cache')
          .select('date, close')
          .eq('symbol', row.symbol)
          .gte('date', row.detected_at)
          .order('date', { ascending: true })
          .limit(days * 2 + 5)

        if (!prices || (prices as any[]).length < 2) {
          updates.push({ ...row, ret: null })
          return
        }

        const bars = prices as { date: string; close: number }[]
        const entry   = bars[0].close
        const exitBar = bars[Math.min(days, bars.length - 1)]
        const ret = entry > 0 ? (exitBar.close - entry) / entry * 100 : null
        updates.push({ ...row, ret })
      }))

      // バッチupsert
      const upsertRows = updates
        .filter(u => u.ret !== null)
        .map(u => ({ symbol: u.symbol, detected_at: u.detected_at, [col]: parseFloat(u.ret!.toFixed(4)) }))

      if (upsertRows.length > 0) {
        await (supabase as any)
          .from('factor_lab')
          .upsert(upsertRows, { onConflict: 'symbol,detected_at' })
        filled += upsertRows.length
      }

      from += PAGE
      process.stdout.write(`  ${col}: ${filled}件補完済み\r`)
    }

    console.log(`  ${col}: 補完完了`)
  }
}

// ── Step 3: 全因子のIC・相関・分位Sharpeを計算 ───────────────

function analyzeFactors(
  rows: LabRow[],
  returnCol: string,
): FactorResult[] {
  const returnKey = returnCol as keyof LabRow

  const results: FactorResult[] = []
  const factorKeys = Object.keys(FACTOR_CATALOG) as FactorKey[]

  for (const key of factorKeys) {
    const meta = FACTOR_CATALOG[key]

    // 有効なペア（因子値・リターン共にnullでない）を抽出
    const pairs: Array<{ fv: number; rv: number; month: string }> = []
    for (const row of rows) {
      const fv = row[key] as number | null
      const rv = row[returnKey] as number | null
      if (fv === null || fv === undefined || isNaN(fv)) continue
      if (rv === null || rv === undefined || isNaN(rv)) continue
      // 外れ値除外（リターン > 100% or < -50%）
      if (rv > 100 || rv < -50) continue
      pairs.push({ fv, rv, month: (row.detected_at as string).slice(0, 7) })
    }

    if (pairs.length < MIN_SAMPLE) {
      results.push({
        key, label: meta.label, category: meta.category,
        n: pairs.length, pearson_r: NaN, ic_mean: NaN, ic_std: NaN,
        icir: NaN, sharpe_q1: NaN, sharpe_q4: NaN, q_spread: NaN,
        monotone: false, win_q4: NaN,
      })
      continue
    }

    const fvs = pairs.map(p => p.fv)
    const rvs = pairs.map(p => p.rv)

    // Pearson相関
    const pr = pearson(fvs, rvs)

    // 月次IC（Spearman）の計算 → 安定性を測る
    const byMonth = new Map<string, typeof pairs>()
    for (const p of pairs) {
      if (!byMonth.has(p.month)) byMonth.set(p.month, [])
      byMonth.get(p.month)!.push(p)
    }
    const monthlyICs: number[] = []
    for (const [, monthPairs] of byMonth) {
      if (monthPairs.length < 10) continue
      const ic = spearman(
        monthPairs.map(p => p.fv),
        monthPairs.map(p => p.rv),
      )
      if (!isNaN(ic)) monthlyICs.push(ic)
    }

    const icMean = avg(monthlyICs)
    const icStd  = std(monthlyICs)
    const icir   = icStd > 0 ? icMean / icStd : NaN

    // 5分位（Quintile）に分割してSharpeを計算
    const q20  = quantile(fvs, 0.20)
    const q40  = quantile(fvs, 0.40)
    const q60  = quantile(fvs, 0.60)
    const q80  = quantile(fvs, 0.80)

    const quintiles = [
      pairs.filter(p => p.fv <= q20),
      pairs.filter(p => p.fv > q20 && p.fv <= q40),
      pairs.filter(p => p.fv > q40 && p.fv <= q60),
      pairs.filter(p => p.fv > q60 && p.fv <= q80),
      pairs.filter(p => p.fv > q80),
    ]

    const quintileSharpes = quintiles.map(q =>
      q.length >= 10 ? sharpeOf(q.map(p => p.rv)) : NaN
    )

    const q1Sharpe = quintileSharpes[0]
    const q5Sharpe = quintileSharpes[4]

    // 単調性チェック（下位→上位でSharpeが単調増加するか）
    let monotone = true
    for (let i = 1; i < quintileSharpes.length; i++) {
      if (!isNaN(quintileSharpes[i]) && !isNaN(quintileSharpes[i - 1])) {
        if (quintileSharpes[i] < quintileSharpes[i - 1]) { monotone = false; break }
      }
    }

    // 上位20%の勝率
    const q5Pairs = quintiles[4]
    const winQ4   = q5Pairs.length > 0
      ? q5Pairs.filter(p => p.rv > 0).length / q5Pairs.length
      : NaN

    results.push({
      key, label: meta.label, category: meta.category,
      n:         pairs.length,
      pearson_r: parseFloat(pr.toFixed(4)),
      ic_mean:   parseFloat(icMean.toFixed(4)),
      ic_std:    parseFloat(icStd.toFixed(4)),
      icir:      parseFloat((isNaN(icir) ? 0 : icir).toFixed(3)),
      sharpe_q1: parseFloat(q1Sharpe.toFixed(3)),
      sharpe_q4: parseFloat(q5Sharpe.toFixed(3)),
      q_spread:  parseFloat((q5Sharpe - q1Sharpe).toFixed(3)),
      monotone,
      win_q4:    parseFloat((winQ4 * 100).toFixed(1)),
    })
  }

  // |ICIR| の降順でソート
  return results.sort((a, b) => Math.abs(b.icir || 0) - Math.abs(a.icir || 0))
}

// ── Step 4: レポート出力 ─────────────────────────────────────

function printReport(
  results: FactorResult[],
  label: string,
  returnCol: string,
): void {
  const line = '─'.repeat(80)
  console.log(`\n${'═'.repeat(80)}`)
  console.log(`  因子探索レポート [${label}]  保有${HOLD_DAYS}日  ${returnCol}`)
  console.log(`${'═'.repeat(80)}`)

  console.log('\n  判定基準:')
  console.log('    ✅ 有効    : |ICIR| > 0.3 かつ Q分位スプレッド > 0 かつ 単調性あり')
  console.log('    ⚠ 要検討  : |ICIR| 0.1〜0.3')
  console.log('    ❌ 無効    : |ICIR| < 0.1 または 逆効果\n')

  console.log(line)
  console.log(
    '因子名'.padEnd(18) +
    'n'.padStart(7) +
    'Pearson'.padStart(9) +
    'IC平均'.padStart(9) +
    'ICIR'.padStart(7) +
    'Q1 Sh'.padStart(8) +
    'Q5 Sh'.padStart(8) +
    'スプレッド'.padStart(9) +
    '単調'.padStart(5) +
    '判定'.padStart(6)
  )
  console.log(line)

  // カテゴリ別にグループ化して出力
  const categories = [...new Set(results.map(r => r.category))]
  for (const cat of categories) {
    const catResults = results.filter(r => r.category === cat)
    console.log(`\n  ── ${cat} ──`)

    for (const r of catResults) {
      if (r.n < MIN_SAMPLE) {
        console.log(`  ${r.label.padEnd(16)} (サンプル不足: ${r.n}件)`)
        continue
      }

      const absICIR = Math.abs(r.icir || 0)
      const verdict = absICIR > 0.3 && r.monotone ? '✅'
                    : absICIR > 0.1               ? '⚠'
                    : '❌'

      const icirStr  = isNaN(r.icir) ? '  NaN ' : (r.icir >= 0 ? ' ' : '') + r.icir.toFixed(3)
      const q1Str    = isNaN(r.sharpe_q1) ? '   NaN' : (r.sharpe_q1 >= 0 ? ' ' : '') + r.sharpe_q1.toFixed(3)
      const q4Str    = isNaN(r.sharpe_q4) ? '   NaN' : (r.sharpe_q4 >= 0 ? ' ' : '') + r.sharpe_q4.toFixed(3)
      const sprStr   = isNaN(r.q_spread)  ? '   NaN' : (r.q_spread  >= 0 ? ' ' : '') + r.q_spread.toFixed(3)

      console.log(
        '  ' + r.label.slice(0, 16).padEnd(16) +
        String(r.n).padStart(7) +
        (r.pearson_r >= 0 ? ' ' : '') + r.pearson_r.toFixed(4).padStart(8) +
        (r.ic_mean   >= 0 ? ' ' : '') + r.ic_mean.toFixed(4).padStart(8) +
        icirStr.padStart(7) +
        q1Str.padStart(8) +
        q4Str.padStart(8) +
        sprStr.padStart(9) +
        (r.monotone ? '  ✓' : '  ✗').padStart(5) +
        ('  ' + verdict).padStart(6)
      )
    }
  }

  // トップ10の最終推奨
  const valid = results.filter(r => Math.abs(r.icir || 0) > 0.1 && !isNaN(r.q_spread) && r.n >= MIN_SAMPLE)
  console.log(`\n${line}`)
  console.log('  ■ 有効因子ランキング（|ICIR| 降順）')
  console.log(line)
  console.log(
    '順位'.padEnd(4) + '因子名'.padEnd(20) + 'カテゴリ'.padEnd(12) +
    '|ICIR|'.padStart(8) + 'Q分位スプレッド'.padStart(14) + '上位勝率'.padStart(10) + '単調'.padStart(5)
  )
  console.log(line)

  valid.slice(0, 10).forEach((r, i) => {
    console.log(
      String(i + 1).padEnd(4) +
      r.label.slice(0, 18).padEnd(20) +
      r.category.slice(0, 10).padEnd(12) +
      Math.abs(r.icir || 0).toFixed(3).padStart(8) +
      (r.q_spread >= 0 ? '+' : '') + r.q_spread.toFixed(3) .padStart(13) +
      `${r.win_q4.toFixed(1)}%`.padStart(10) +
      (r.monotone ? '  ✓' : '  ✗').padStart(5)
    )
  })
}

// ── Step 5: CSV出力 ─────────────────────────────────────────

function exportCSV(results: FactorResult[], label: string): void {
  const header = [
    'key', 'label', 'category', 'n', 'pearson_r',
    'ic_mean', 'ic_std', 'icir', 'sharpe_q1', 'sharpe_q4',
    'q_spread', 'monotone', 'win_q4',
  ].join(',')

  const rows = results.map(r => [
    r.key, r.label, r.category, r.n,
    r.pearson_r, r.ic_mean, r.ic_std, r.icir,
    r.sharpe_q1, r.sharpe_q4, r.q_spread,
    r.monotone ? 'TRUE' : 'FALSE', r.win_q4,
  ].join(','))

  const csv      = [header, ...rows].join('\n')
  const filename = `factor_ranking_${label}_${HOLD_DAYS}d_${new Date().toISOString().slice(0, 10)}.csv`
  fs.writeFileSync(filename, csv, 'utf-8')
  console.log(`\n✅ CSV出力: ${filename}`)
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

  console.log(`\n因子探索バックテスト開始  保有${HOLD_DAYS}営業日`)
  if (SPLIT_DATE) console.log(`  期間分割: In-sample〜${SPLIT_DATE} / Out-of-sample ${SPLIT_DATE}〜`)

  // Step 2: リターン補完（nullがあれば埋める）
  await fillReturns()

  // Step 3: データ取得
  const returnCol = `return_${HOLD_DAYS}d`
  console.log(`\n[Step 3] factor_labからデータ取得中...`)
  const allRows = await fetchFactorLab(returnCol)
  console.log(`  取得: ${allRows.length}件`)

  if (allRows.length < MIN_SAMPLE) {
    console.log('サンプル不足。scan:factorを先に実行してください。')
    return
  }

  if (SPLIT_DATE) {
    // 期間分割検証
    const inSample  = allRows.filter(r => (r.detected_at as string) <  SPLIT_DATE)
    const outSample = allRows.filter(r => (r.detected_at as string) >= SPLIT_DATE)
    console.log(`  In-sample: ${inSample.length}件 / Out-of-sample: ${outSample.length}件`)

    const inResults  = analyzeFactors(inSample, returnCol)
    const outResults = analyzeFactors(outSample, returnCol)

    printReport(inResults,  `In-sample 〜${SPLIT_DATE}`, returnCol)
    printReport(outResults, `Out-of-sample ${SPLIT_DATE}〜`, returnCol)

    // 両期間で有効だった因子を抽出
    console.log('\n' + '═'.repeat(80))
    console.log('  ■ 両期間で有効だった因子（過学習リスク低）')
    console.log('═'.repeat(80))
    const inKeys  = new Set(inResults.filter(r => Math.abs(r.icir || 0) > 0.1).map(r => r.key))
    const outKeys = new Set(outResults.filter(r => Math.abs(r.icir || 0) > 0.1).map(r => r.key))
    const bothValid = inResults.filter(r => inKeys.has(r.key) && outKeys.has(r.key))
    bothValid.forEach(r => console.log(`  ✅ ${r.label} (${r.category}) ICIR=${r.icir}`))

    exportCSV(inResults,  'in_sample')
    exportCSV(outResults, 'out_sample')
  } else {
    // 全期間で分析
    const results = analyzeFactors(allRows, returnCol)
    printReport(results, '全期間', returnCol)
    exportCSV(results, 'all')
  }
}

main().catch(err => { console.error('エラー:', err); process.exit(1) })
