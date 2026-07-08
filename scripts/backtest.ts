/**
 * scripts/backtest.ts
 *
 * GC/DCシグナルのバックテスト
 *
 * 動作フロー:
 *   1. gc_signals テーブルから過去のGCシグナルを取得
 *   2. screener_price_cache からシグナル発生日 + N日後の終値を取得
 *   3. リターンを計算してランク・スコア因子別に集計
 *   4. 有効な係数を分析してレポート出力
 *
 * 使い方:
 *   npx tsx --env-file=.env.local scripts/backtest.ts
 *
 * オプション（環境変数）:
 *   HOLD_DAYS=20          リターン測定日数（デフォルト: 20）
 *   SIGNAL_TYPE=GC        GC | DC | ALL（デフォルト: GC）
 *   MIN_SIGNALS=5         集計に必要な最低サンプル数（デフォルト: 5）
 *   MARKET=JP             JP | US | ALL（デフォルト: ALL）
 */

import { createClient } from '@supabase/supabase-js'

// ── 設定 ─────────────────────────────────────────────────────

const HOLD_DAYS    = parseInt(process.env.HOLD_DAYS    ?? '20')
const SIGNAL_TYPE  = (process.env.SIGNAL_TYPE  ?? 'GC') as 'GC' | 'DC' | 'ALL'
const MIN_SIGNALS  = parseInt(process.env.MIN_SIGNALS  ?? '5')
const MARKET_FILTER = process.env.MARKET ?? 'ALL'

// ── 型定義 ────────────────────────────────────────────────────

interface GCSignal {
  id:            string
  symbol:        string
  market:        string
  name:          string | null
  detected_at:   string
  signal_type:   string
  hold_days:     number
  total_score:   number
  rank:          string
  score_slope:   number
  score_volume:  number
  score_rsi:     number
  score_hold:    number
  score_deviation: number
  score_macd:    number
  score_weekly:  number
  close_price:   number | null
  volume_ratio:  number | null
  rsi_value:     number | null
  deviation_pct: number | null
}

interface BacktestResult extends GCSignal {
  entry_price:  number   // シグナル発生日終値
  exit_price:   number   // N日後終値
  return_pct:   number   // リターン（%）
  holding_days: number   // 実際の保有日数（データ欠落を考慮）
}

interface FactorStats {
  label:        string
  buckets:      BucketStats[]
}

interface BucketStats {
  range:        string
  count:        number
  win_rate:     number   // リターン > 0 の割合
  avg_return:   number   // 平均リターン（%）
  med_return:   number   // 中央値リターン（%）
  sharpe:       number   // 簡易シャープレシオ
}

// ── Supabase ─────────────────────────────────────────────────

let supabase = null as unknown as ReturnType<typeof createClient>

// ── ヘルパー ──────────────────────────────────────────────────

function avg(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

function stddev(arr: number[]): number {
  if (arr.length < 2) return 0
  const m = avg(arr)
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length
  return Math.sqrt(variance)
}

function sharpe(returns: number[]): number {
  const a = avg(returns)
  const s = stddev(returns)
  return s === 0 ? 0 : parseFloat((a / s).toFixed(3))
}

function calcBucketStats(results: BacktestResult[], label: string): BucketStats {
  const returns = results.map(r => r.return_pct)
  const wins    = returns.filter(r => r > 0).length
  return {
    range:      label,
    count:      results.length,
    win_rate:   results.length > 0 ? wins / results.length : 0,
    avg_return: parseFloat(avg(returns).toFixed(3)),
    med_return: parseFloat(median(returns).toFixed(3)),
    sharpe:     sharpe(returns),
  }
}

// 数値を等分バケツに分類
function bucketByScore(
  results: BacktestResult[],
  getter: (r: BacktestResult) => number,
  bucketDef: Array<{ label: string; min: number; max: number }>,
): FactorStats['buckets'] {
  return bucketDef.map(def => {
    const subset = results.filter(r => {
      const v = getter(r)
      return v >= def.min && v < def.max
    })
    return calcBucketStats(subset, def.label)
  })
}

// ── Step 1: gc_signals 取得 ───────────────────────────────────

async function fetchSignals(): Promise<GCSignal[]> {
  // ページングで全件取得（Supabaseは1回1000件上限）
  const all: GCSignal[] = []
  const PAGE = 1000
  let from = 0

  while (true) {
    let query = (supabase as any)
      .from('gc_signals')
      .select('*')
      .order('detected_at', { ascending: true })

    if (SIGNAL_TYPE !== 'ALL') query = query.eq('signal_type', SIGNAL_TYPE)
    if (MARKET_FILTER !== 'ALL') query = query.eq('market', MARKET_FILTER)

    const { data, error } = await query.range(from, from + PAGE - 1)
    if (error) throw new Error(`gc_signals取得エラー: ${error.message}`)
    if (!data || (data as GCSignal[]).length === 0) break

    all.push(...(data as GCSignal[]))
    if ((data as GCSignal[]).length < PAGE) break
    from += PAGE

    // 進捗表示
    if (from % 10000 === 0) {
      process.stdout.write(`  gc_signals取得中: ${all.length}件...
`)
    }
  }

  // 全期間から均等サンプリング（MAX_SAMPLE件を超える場合）
  // 月ごとに均等に取ることで相場偏りを防ぐ
  const MAX_SAMPLE = parseInt(process.env.MAX_SAMPLE ?? '0')  // 0=全件
  if (MAX_SAMPLE > 0 && all.length > MAX_SAMPLE) {
    // 月別にグループ化して均等サンプリング
    const byMonth: Record<string, GCSignal[]> = {}
    for (const s of all) {
      const m = s.detected_at.slice(0, 7)
      if (!byMonth[m]) byMonth[m] = []
      byMonth[m].push(s)
    }
    const months = Object.keys(byMonth).sort()
    const perMonth = Math.ceil(MAX_SAMPLE / months.length)
    const sampled: GCSignal[] = []
    for (const m of months) {
      const group = byMonth[m]
      // シャッフルして先頭perMonth件
      for (let i = group.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[group[i], group[j]] = [group[j], group[i]]
      }
      sampled.push(...group.slice(0, perMonth))
    }
    console.log(`  サンプリング: ${all.length}件 → ${sampled.length}件（月別均等）`)
    return sampled
  }

  return all
}

// ── Step 2: シグナル発生日 + N日後の価格を取得 ──────────────

async function fetchPriceAfterN(
  symbol:     string,
  signalDate: string,
  holdDays:   number,
): Promise<{ entry: number; exit: number; actualDays: number } | null> {

  // シグナル発生日から holdDays*2 日後まで取得（祝日考慮で余裕を持つ）
  const fromDate = signalDate
  const toDate   = new Date(signalDate)
  toDate.setDate(toDate.getDate() + holdDays * 2)
  const toDateStr = toDate.toISOString().slice(0, 10)

  const { data, error } = await (supabase as any)
    .from('screener_price_cache')
    .select('date, close')
    .eq('symbol', symbol)
    .gte('date', fromDate)
    .lte('date', toDateStr)
    .order('date', { ascending: true })
    .limit(holdDays * 2 + 10)

  if (error || !data || data.length === 0) return null

  const bars = data as { date: string; close: number }[]

  // エントリー価格 = シグナル発生日の終値（または翌営業日）
  const entryBar = bars[0]
  if (!entryBar) return null

  // エグジット価格 = holdDays営業日後（データがあれば）
  // holdDays番目のバー（0始まりなのでindex = holdDays）
  const exitIndex  = Math.min(holdDays, bars.length - 1)
  const exitBar    = bars[exitIndex]
  const actualDays = exitIndex  // 実際の保有営業日数

  return {
    entry:      entryBar.close,
    exit:       exitBar.close,
    actualDays,
  }
}

// ── Step 3: バックテスト実行 ─────────────────────────────────

async function runBacktest(signals: GCSignal[]): Promise<BacktestResult[]> {
  const results: BacktestResult[] = []
  let processed = 0
  let skipped   = 0

  console.log(`\n価格データを照合中... (${signals.length}件)`)

  // バッチ処理（Supabase負荷軽減）
  const BATCH = 50
  for (let i = 0; i < signals.length; i += BATCH) {
    const batch = signals.slice(i, i + BATCH)

    await Promise.all(batch.map(async (sig) => {
      // close_priceがあればそれをエントリーとして使う（高速化）
      // なければscreener_price_cacheから取得
      const prices = await fetchPriceAfterN(sig.symbol, sig.detected_at, HOLD_DAYS)

      if (!prices) {
        skipped++
        return
      }

      const returnPct = (prices.exit - prices.entry) / prices.entry * 100

      results.push({
        ...sig,
        entry_price:  prices.entry,
        exit_price:   prices.exit,
        return_pct:   parseFloat(returnPct.toFixed(4)),
        holding_days: prices.actualDays,
      })
      processed++
    }))

    if ((i + BATCH) % 200 === 0 || i + BATCH >= signals.length) {
      process.stdout.write(`  ${Math.min(i + BATCH, signals.length)}/${signals.length}件完了\r`)
    }
  }

  console.log(`\n完了: ${processed}件マッチ / ${skipped}件スキップ（価格データなし）`)
  return results
}

// ── Step 4: 集計・分析 ───────────────────────────────────────

function analyzeResults(results: BacktestResult[]) {

  const line = '─'.repeat(60)

  // ── 全体サマリー ──────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  GC/DCバックテスト結果  (保有${HOLD_DAYS}営業日)`)
  console.log(`${'═'.repeat(60)}`)
  console.log(`総シグナル数    : ${results.length}件`)

  const returns = results.map(r => r.return_pct)
  const wins    = returns.filter(r => r > 0)

  console.log(`勝率            : ${(wins.length / returns.length * 100).toFixed(1)}% (${wins.length}勝${returns.length - wins.length}敗)`)
  console.log(`平均リターン    : ${avg(returns).toFixed(2)}%`)
  console.log(`中央値リターン  : ${median(returns).toFixed(2)}%`)
  console.log(`標準偏差        : ${stddev(returns).toFixed(2)}%`)
  console.log(`シャープレシオ  : ${sharpe(returns).toFixed(3)}`)
  console.log(`最大益          : ${Math.max(...returns).toFixed(2)}%`)
  console.log(`最大損          : ${Math.min(...returns).toFixed(2)}%`)

  // ── ランク別 ─────────────────────────────────────────────
  console.log(`\n${line}`)
  console.log('  ランク別パフォーマンス')
  console.log(line)
  console.log(
    'ランク'.padEnd(6) +
    '件数'.padStart(5) +
    '勝率'.padStart(8) +
    '平均R'.padStart(8) +
    '中央R'.padStart(8) +
    'Sharpe'.padStart(8)
  )
  console.log(line)

  for (const rank of ['A', 'B', 'C', 'D']) {
    const subset = results.filter(r => r.rank === rank)
    if (subset.length < MIN_SIGNALS) {
      console.log(`${rank}ランク`.padEnd(6) + `${subset.length}件（サンプル不足）`)
      continue
    }
    const ret  = subset.map(r => r.return_pct)
    const wr   = ret.filter(r => r > 0).length / ret.length
    console.log(
      rank.padEnd(6) +
      String(subset.length).padStart(5) +
      `${(wr * 100).toFixed(1)}%`.padStart(8) +
      `${avg(ret).toFixed(2)}%`.padStart(8) +
      `${median(ret).toFixed(2)}%`.padStart(8) +
      sharpe(ret).toFixed(3).padStart(8)
    )
  }

  // ── スコア帯別 ───────────────────────────────────────────
  console.log(`\n${line}`)
  console.log('  スコア帯別パフォーマンス')
  console.log(line)
  console.log(
    'スコア帯'.padEnd(10) +
    '件数'.padStart(5) +
    '勝率'.padStart(8) +
    '平均R'.padStart(8) +
    '中央R'.padStart(8) +
    'Sharpe'.padStart(8)
  )
  console.log(line)

  const scoreBands = [
    { label: '80〜100', min: 80,  max: 101 },
    { label: '70〜79',  min: 70,  max: 80  },
    { label: '60〜69',  min: 60,  max: 70  },
    { label: '50〜59',  min: 50,  max: 60  },
    { label: '40〜49',  min: 40,  max: 50  },
    { label: '0〜39',   min:  0,  max: 40  },
  ]
  for (const band of scoreBands) {
    const subset = results.filter(r => r.total_score >= band.min && r.total_score < band.max)
    if (subset.length < MIN_SIGNALS) continue
    const ret = subset.map(r => r.return_pct)
    const wr  = ret.filter(r => r > 0).length / ret.length
    console.log(
      band.label.padEnd(10) +
      String(subset.length).padStart(5) +
      `${(wr * 100).toFixed(1)}%`.padStart(8) +
      `${avg(ret).toFixed(2)}%`.padStart(8) +
      `${median(ret).toFixed(2)}%`.padStart(8) +
      sharpe(ret).toFixed(3).padStart(8)
    )
  }

  // ── 各因子の相関分析 ─────────────────────────────────────
  console.log(`\n${line}`)
  console.log('  スコア因子ごとの有効性分析')
  console.log(line)

  const factors: Array<{
    name:    string
    field:   keyof BacktestResult
    buckets: Array<{ label: string; min: number; max: number }>
  }> = [
    {
      name: '① MAの傾き (score_slope)',
      field: 'score_slope',
      buckets: [
        { label: '-20点',  min: -21, max: -15 },
        { label: '-10点',  min: -11, max: -5  },
        { label: '0点',    min: -1,  max:  1  },
        { label: '+10点',  min:  9,  max: 11  },
        { label: '+20点',  min: 19,  max: 21  },
      ],
    },
    {
      name: '② 出来高比率 (score_volume)',
      field: 'score_volume',
      buckets: [
        { label: '-15点',  min: -16, max: -14 },
        { label: '0点',    min: -1,  max:  1  },
        { label: '+10点',  min:  9,  max: 11  },
        { label: '+20点',  min: 19,  max: 21  },
      ],
    },
    {
      name: '③ RSI水準 (score_rsi)',
      field: 'score_rsi',
      buckets: [
        { label: '-15点',  min: -16, max: -14 },
        { label: '-5点',   min:  -6, max:  -4 },
        { label: '0点',    min:  -1, max:   1 },
        { label: '+5点',   min:   4, max:   6 },
        { label: '+15点',  min:  14, max:  16 },
      ],
    },
    {
      name: '④ 維持日数ボーナス (score_hold)',
      field: 'score_hold',
      buckets: [
        { label: '0点(当日)',   min: -1, max: 1  },
        { label: '+15点(2-4日)', min: 14, max: 16 },
        { label: '+25点(5日+)',  min: 24, max: 26 },
      ],
    },
    {
      name: '⑤ MA乖離率 (score_deviation)',
      field: 'score_deviation',
      buckets: [
        { label: '-15点',  min: -16, max: -14 },
        { label: '-10点',  min: -11, max: -9  },
        { label: '0点',    min:  -1, max:  1  },
        { label: '+10点',  min:   9, max: 11  },
      ],
    },
    {
      name: '⑥ MACD方向 (score_macd)',
      field: 'score_macd',
      buckets: [
        { label: '-10点',  min: -11, max: -9 },
        { label: '0点',    min:  -1, max:  1 },
        { label: '+8点',   min:   7, max:  9 },
        { label: '+15点',  min:  14, max: 16 },
      ],
    },
    {
      name: '⑦ 週足トレンド (score_weekly)',
      field: 'score_weekly',
      buckets: [
        { label: '-10点',  min: -11, max: -9 },
        { label: '0点',    min:  -1, max:  1 },
        { label: '+15点',  min:  14, max: 16 },
      ],
    },
  ]

  for (const factor of factors) {
    console.log(`\n  ${factor.name}`)
    console.log(
      '  ' + '値'.padEnd(14) +
      '件数'.padStart(5) +
      '勝率'.padStart(8) +
      '平均R'.padStart(8) +
      '中央R'.padStart(8) +
      'Sharpe'.padStart(8)
    )

    for (const bucket of factor.buckets) {
      const subset = results.filter(r => {
        const v = r[factor.field] as number
        return v >= bucket.min && v < bucket.max
      })
      if (subset.length < MIN_SIGNALS) {
        console.log(`  ${bucket.label.padEnd(14)}${String(subset.length).padStart(5)}  (サンプル不足)`)
        continue
      }
      const ret = subset.map(r => r.return_pct)
      const wr  = ret.filter(r => r > 0).length / ret.length
      console.log(
        '  ' + bucket.label.padEnd(14) +
        String(subset.length).padStart(5) +
        `${(wr * 100).toFixed(1)}%`.padStart(8) +
        `${avg(ret).toFixed(2)}%`.padStart(8) +
        `${median(ret).toFixed(2)}%`.padStart(8) +
        sharpe(ret).toFixed(3).padStart(8)
      )
    }
  }

  // ── 月別・相場環境別サマリー ───────────────────────────────
  console.log(`\n${line}`)
  console.log('  月別パフォーマンス（相場バイアスの確認）')
  console.log(line)
  console.log(
    '月'.padEnd(10) +
    '件数'.padStart(5) +
    '勝率'.padStart(8) +
    '平均R'.padStart(8) +
    '中央R'.padStart(8) +
    'Sharpe'.padStart(8)
  )
  console.log(line)

  const byMonth: Record<string, BacktestResult[]> = {}
  for (const r of results) {
    const m = r.detected_at.slice(0, 7)
    if (!byMonth[m]) byMonth[m] = []
    byMonth[m].push(r)
  }
  for (const month of Object.keys(byMonth).sort()) {
    const subset = byMonth[month]
    if (subset.length < MIN_SIGNALS) continue
    const ret = subset.map(r => r.return_pct)
    const wr  = ret.filter(r => r > 0).length / ret.length
    console.log(
      month.padEnd(10) +
      String(subset.length).padStart(5) +
      `${(wr * 100).toFixed(1)}%`.padStart(8) +
      `${avg(ret).toFixed(2)}%`.padStart(8) +
      `${median(ret).toFixed(2)}%`.padStart(8) +
      sharpe(ret).toFixed(3).padStart(8)
    )
  }
  console.log('  ※ 月によってリターンが大きく異なる場合、特定相場環境への依存を示す')

  // ── 相関係数（各因子スコア vs リターン） ──────────────────
  console.log(`\n${line}`)
  console.log('  因子スコアとリターンの相関係数 (Pearson r)')
  console.log('  ※ |r| > 0.1 で弱い相関、> 0.3 で中程度、> 0.5 で強い相関')
  console.log(line)

  const factorFields: Array<[string, keyof BacktestResult]> = [
    ['total_score',      'total_score'],
    ['① slope',         'score_slope'],
    ['② volume',        'score_volume'],
    ['③ RSI',           'score_rsi'],
    ['④ hold_days',     'score_hold'],
    ['⑤ deviation',     'score_deviation'],
    ['⑥ MACD',          'score_macd'],
    ['⑦ weekly',        'score_weekly'],
  ]

  for (const [label, field] of factorFields) {
    const xs = results.map(r => r[field] as number)
    const ys = results.map(r => r.return_pct)
    const r  = pearson(xs, ys)
    const bar = makeBar(r, 30)
    const sig = Math.abs(r) > 0.3 ? ' ★★' : Math.abs(r) > 0.1 ? ' ★' : ''
    console.log(`  ${label.padEnd(16)} r=${r >= 0 ? ' ' : ''}${r.toFixed(4)}  ${bar}${sig}`)
  }

  // ── 推奨スコア係数 ───────────────────────────────────────
  console.log(`\n${line}`)
  console.log('  ■ 推奨：有効性の高い因子（相関係数ベース）')
  console.log(line)
  console.log(
    '  有効な因子: Sharpe > 0.1 かつ 高得点帯の勝率 > 低得点帯の勝率'
  )
  console.log('  ※ 十分なサンプル数がある場合に判定可能\n')
}

// Pearson相関係数
function pearson(xs: number[], ys: number[]): number {
  const n  = xs.length
  if (n < 2) return 0
  const mx = avg(xs), my = avg(ys)
  const cov = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / n
  const sx  = Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0) / n)
  const sy  = Math.sqrt(ys.reduce((s, y) => s + (y - my) ** 2, 0) / n)
  if (sx === 0 || sy === 0) return 0
  return parseFloat((cov / (sx * sy)).toFixed(4))
}

// ASCIIバー（相関係数の可視化）
function makeBar(r: number, width: number): string {
  const center = Math.floor(width / 2)
  const pos    = Math.round(r * center)
  const arr    = Array(width).fill('·')
  arr[center]  = '|'
  if (pos !== 0) {
    const start = pos > 0 ? center : center + pos
    const end   = pos > 0 ? center + pos : center
    for (let i = start; i <= end; i++) arr[i] = pos > 0 ? '▒' : '░'
  }
  return '[' + arr.join('') + ']'
}

// ── CSV出力 ──────────────────────────────────────────────────

function outputCSV(results: BacktestResult[]) {
  const header = [
    'symbol', 'detected_at', 'signal_type', 'rank',
    'total_score', 'score_slope', 'score_volume', 'score_rsi',
    'score_hold', 'score_deviation', 'score_macd', 'score_weekly',
    'entry_price', 'exit_price', 'return_pct', 'holding_days',
    'rsi_value', 'volume_ratio', 'deviation_pct',
  ].join(',')

  const rows = results.map(r => [
    r.symbol, r.detected_at, r.signal_type, r.rank,
    r.total_score, r.score_slope, r.score_volume, r.score_rsi,
    r.score_hold, r.score_deviation, r.score_macd, r.score_weekly,
    r.entry_price, r.exit_price, r.return_pct, r.holding_days,
    r.rsi_value ?? '', r.volume_ratio ?? '', r.deviation_pct ?? '',
  ].join(','))

  const csv = [header, ...rows].join('\n')
  const fs  = require('fs')
  const filename = `backtest_${SIGNAL_TYPE}_${HOLD_DAYS}d_${new Date().toISOString().slice(0,10)}.csv`
  fs.writeFileSync(filename, csv, 'utf-8')
  console.log(`\n✅ CSV出力: ${filename}`)
  return filename
}

// ── メイン ────────────────────────────────────────────────────

async function main() {
  // dotenv 読み込み（tsx --env-file で渡されるが念のため）
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('❌ 環境変数 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です')
    console.error('   .env.local を確認してください')
    process.exit(1)
  }

  supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  console.log(`\nGC/DCバックテスト開始`)
  console.log(`  対象: ${SIGNAL_TYPE === 'ALL' ? 'GC + DC' : SIGNAL_TYPE}シグナル`)
  console.log(`  保有期間: ${HOLD_DAYS}営業日`)
  console.log(`  マーケット: ${MARKET_FILTER}`)

  // Step 1: シグナル取得
  console.log('\n[Step 1] gc_signalsを取得中...')
  const signals = await fetchSignals()
  console.log(`  ${signals.length}件のシグナルを取得`)

  if (signals.length === 0) {
    console.log('シグナルが見つかりませんでした。scan.tsを先に実行してください。')
    return
  }

  // Step 2 + 3: 価格照合 & バックテスト
  console.log('\n[Step 2] 価格データを照合してリターンを計算中...')
  const results = await runBacktest(signals)

  if (results.length < MIN_SIGNALS) {
    console.log(`サンプル数が不足しています (${results.length}件 < ${MIN_SIGNALS}件)`)
    console.log('screener_price_cacheにデータが蓄積されているか確認してください')
    return
  }

  // Step 4: 分析レポート
  analyzeResults(results)

  // CSV出力（Excelや外部ツールでの分析用）
  outputCSV(results)
}

main().catch(err => {
  console.error('エラー:', err)
  process.exit(1)
})
