/**
 * scripts/optimize-weights.ts
 *
 * バックテスト結果CSVを読み込んで、スコア係数の最適な重みを探索する
 *
 * 使い方:
 *   npx tsx scripts/optimize-weights.ts backtest_GC_20d_2025-XX-XX.csv
 *
 * 動作:
 *   1. CSVのスコア因子列とリターン列を読み込む
 *   2. 重回帰分析で各因子の重み（回帰係数）を計算
 *   3. 現在の重みとの比較表を出力
 *   4. 最適重みで再スコアリングしたランク精度を比較
 */

import * as fs from 'fs'
import * as path from 'path'

// ── 型定義 ────────────────────────────────────────────────────

interface Row {
  symbol:          string
  detected_at:     string
  rank:            string
  total_score:     number
  score_slope:     number
  score_volume:    number
  score_rsi:       number
  score_hold:      number
  score_deviation: number
  score_macd:      number
  score_weekly:    number
  return_pct:      number
  rsi_value:       number
  volume_ratio:    number
  deviation_pct:   number
}

// ── CSV読み込み ────────────────────────────────────────────────

function loadCSV(filepath: string): Row[] {
  const text = fs.readFileSync(filepath, 'utf-8')
  const lines = text.trim().split('\n')
  const headers = lines[0].split(',')

  return lines.slice(1).map(line => {
    const vals = line.split(',')
    const obj: Record<string, string | number> = {}
    headers.forEach((h, i) => {
      const v = vals[i] ?? ''
      obj[h] = isNaN(Number(v)) || v === '' ? v : Number(v)
    })
    return obj as unknown as Row
  })
}

// ── 統計ユーティリティ ────────────────────────────────────────

function avg(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function stddev(arr: number[]): number {
  const m = avg(arr)
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length)
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length
  const mx = avg(xs), my = avg(ys)
  const cov = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / n
  const sx = stddev(xs), sy = stddev(ys)
  return sx === 0 || sy === 0 ? 0 : cov / (sx * sy)
}

// ── 重回帰分析（最小二乗法） ──────────────────────────────────
// X: 説明変数の行列 (n×m)、y: 目的変数 (n×1)
// 解: β = (X'X)^-1 X'y

function matMul(A: number[][], B: number[][]): number[][] {
  const n = A.length, m = B[0].length, k = B.length
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: m }, (_, j) =>
      A[i].reduce((s, _, l) => s + A[i][l] * B[l][j], 0)
    )
  )
}

function matTranspose(A: number[][]): number[][] {
  return A[0].map((_, j) => A.map(row => row[j]))
}

// ガウス消去法で Ax = b を解く
function solveLinear(A: number[][], b: number[]): number[] {
  const n = A.length
  const M = A.map((row, i) => [...row, b[i]])  // 拡大係数行列

  for (let col = 0; col < n; col++) {
    // ピボット選択（数値安定性のため）
    let maxRow = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row
    }
    ;[M[col], M[maxRow]] = [M[maxRow], M[col]]

    if (Math.abs(M[col][col]) < 1e-10) continue  // 特異行列対策

    for (let row = 0; row < n; row++) {
      if (row === col) continue
      const factor = M[row][col] / M[col][col]
      for (let j = col; j <= n; j++) {
        M[row][j] -= factor * M[col][j]
      }
    }
  }

  return M.map((row, i) => row[n] / row[i])
}

function multipleRegression(
  X: number[][],  // n×m (n=データ数, m=特徴量数)
  y: number[],    // n×1
): { coefficients: number[]; rSquared: number } {

  // バイアス項（切片）追加
  const Xb = X.map(row => [1, ...row])
  const Xt = matTranspose(Xb)
  const XtX = matMul(Xt, Xb)
  const Xty = Xt.map(row => row.reduce((s, v, i) => s + v * y[i], 0))

  const coef = solveLinear(XtX, Xty)

  // R²（決定係数）
  const yPred = Xb.map(row => row.reduce((s, v, j) => s + v * coef[j], 0))
  const yMean = avg(y)
  const ssTot = y.reduce((s, v)    => s + (v - yMean) ** 2, 0)
  const ssRes = y.reduce((s, v, i) => s + (v - yPred[i]) ** 2, 0)
  const rSquared = 1 - ssRes / ssTot

  return { coefficients: coef.slice(1), rSquared }  // 切片を除く
}

// ── スコアリング関数 ──────────────────────────────────────────
// 各因子の「生の値」からスコアを再計算する（最適係数使用）

function rescoreWithWeights(
  row: Row,
  weights: Record<string, number>,
): number {
  // 各因子の生の加点値（現在のロジックそのまま）と新しい重みを掛け合わせる
  const raw =
    row.score_slope     * weights.slope     +
    row.score_volume    * weights.volume    +
    row.score_rsi       * weights.rsi       +
    row.score_hold      * weights.hold      +
    row.score_deviation * weights.deviation +
    row.score_macd      * weights.macd      +
    row.score_weekly    * weights.weekly

  return Math.min(100, Math.max(0, raw))
}

function toRank(score: number): string {
  if (score >= 80) return 'A'
  if (score >= 60) return 'B'
  if (score >= 40) return 'C'
  return 'D'
}

// ── 精度評価：上位ランクが実際に高リターンかどうか ────────────

function evalRankAccuracy(
  rows: Row[],
  getScore: (r: Row) => number,
  label: string,
): void {
  const scored = rows.map(r => ({
    ...r,
    newScore: getScore(r),
    newRank:  toRank(getScore(r)),
  }))

  console.log(`\n  [${label}] ランク別平均リターン`)
  for (const rank of ['A', 'B', 'C', 'D']) {
    const subset = scored.filter(r => r.newRank === rank)
    if (subset.length === 0) continue
    const rets = subset.map(r => r.return_pct)
    const wins = rets.filter(r => r > 0).length
    const a    = avg(rets)
    console.log(
      `    ${rank}ランク: ${subset.length}件  勝率=${(wins/rets.length*100).toFixed(1)}%  平均=${a.toFixed(2)}%`
    )
  }

  // Rank-Return順序相関（Aが最高、Dが最低かどうか）
  const rankOrder: Record<string, number> = { A: 3, B: 2, C: 1, D: 0 }
  const rankVals  = scored.map(r => rankOrder[r.newRank] ?? 0)
  const retVals   = scored.map(r => r.return_pct)
  const corr      = pearson(rankVals, retVals)
  console.log(`    ランク-リターン相関 (r): ${corr.toFixed(4)}`)
}

// ── メイン ────────────────────────────────────────────────────

function main() {
  const filepath = process.argv[2]
  if (!filepath) {
    console.error('使い方: npx tsx scripts/optimize-weights.ts <backtest_csv_path>')
    console.error('  例:  npx tsx scripts/optimize-weights.ts backtest_GC_20d_2025-01-01.csv')
    process.exit(1)
  }

  if (!fs.existsSync(filepath)) {
    console.error(`ファイルが見つかりません: ${filepath}`)
    process.exit(1)
  }

  console.log(`\n係数最適化分析: ${path.basename(filepath)}`)
  const rows = loadCSV(filepath)
  console.log(`データ: ${rows.length}件`)

  if (rows.length < 30) {
    console.error('サンプルが少なすぎます（最低30件必要）')
    process.exit(1)
  }

  const line = '─'.repeat(70)

  // ── 1. 単純相関係数 ─────────────────────────────────────────
  console.log(`\n${line}`)
  console.log('  単純相関係数（各因子スコア vs リターン%）')
  console.log(line)

  const factors: Array<{ label: string; field: keyof Row }> = [
    { label: '① slope',    field: 'score_slope'     },
    { label: '② volume',   field: 'score_volume'    },
    { label: '③ RSI',      field: 'score_rsi'       },
    { label: '④ hold',     field: 'score_hold'      },
    { label: '⑤ deviation',field: 'score_deviation' },
    { label: '⑥ MACD',     field: 'score_macd'      },
    { label: '⑦ weekly',   field: 'score_weekly'    },
    { label: '合計スコア', field: 'total_score'      },
  ]

  const sortedByCorr: Array<{ label: string; r: number }> = []

  for (const f of factors) {
    const xs = rows.map(r => r[f.field] as number)
    const ys = rows.map(r => r.return_pct)
    const r  = pearson(xs, ys)
    sortedByCorr.push({ label: f.label, r })

    const stars = Math.abs(r) > 0.3 ? ' ★★★' : Math.abs(r) > 0.2 ? ' ★★' : Math.abs(r) > 0.1 ? ' ★' : ''
    console.log(`  ${f.label.padEnd(14)} r = ${r >= 0 ? ' ' : ''}${r.toFixed(4)}${stars}`)
  }

  // ── 2. 重回帰分析 ─────────────────────────────────────────
  console.log(`\n${line}`)
  console.log('  重回帰分析（複数因子の同時最適化）')
  console.log(line)

  const X = rows.map(r => [
    r.score_slope, r.score_volume, r.score_rsi, r.score_hold,
    r.score_deviation, r.score_macd, r.score_weekly,
  ])
  const y = rows.map(r => r.return_pct)

  const { coefficients, rSquared } = multipleRegression(X, y)

  console.log(`  R² (決定係数): ${rSquared.toFixed(4)}`)
  console.log(`    ※ R²=0.1以上なら弱い説明力、0.3以上なら中程度`)
  console.log()

  const factorNames = ['slope', 'volume', 'rsi', 'hold', 'deviation', 'macd', 'weekly']
  const currentWeights = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0]  // 現在は均等

  // 正規化（最大値を1.0に）
  const maxCoef = Math.max(...coefficients.map(Math.abs))
  const normalizedCoef = maxCoef > 0 ? coefficients.map(c => c / maxCoef) : coefficients

  console.log(
    '  因子'.padEnd(16) +
    '現在重み'.padStart(10) +
    '回帰係数'.padStart(12) +
    '正規化係数'.padStart(12) +
    '推奨変更'.padStart(10)
  )
  console.log('  ' + '─'.repeat(60))

  const optimizedWeights: Record<string, number> = {}

  factorNames.forEach((name, i) => {
    const cur  = currentWeights[i]
    const coef = coefficients[i]
    const norm = normalizedCoef[i]
    const change = norm > 0.5 ? '↑ 増加推奨' : norm > 0.1 ? '→ 維持'
                 : norm > -0.1 ? '↓ 削減検討' : '✕ 逆効果'

    console.log(
      '  ' + factorNames[i].padEnd(14) +
      cur.toFixed(2).padStart(10) +
      coef.toFixed(4).padStart(12) +
      norm.toFixed(4).padStart(12) +
      change.padStart(10)
    )

    optimizedWeights[name] = Math.max(0, norm)  // 負は0（除外）
  })

  // ── 3. 現在vs最適化の精度比較 ─────────────────────────────
  console.log(`\n${line}`)
  console.log('  現在のスコア vs 最適化スコアの精度比較')
  console.log(line)

  evalRankAccuracy(rows, r => r.total_score, '現在のスコア')
  evalRankAccuracy(
    rows,
    r => rescoreWithWeights(r, optimizedWeights),
    '最適化スコア'
  )

  // ── 4. 推奨係数の出力 ─────────────────────────────────────
  console.log(`\n${line}`)
  console.log('  ■ calcScore.ts への適用案')
  console.log(line)
  console.log('  ※ 正規化係数を現在の最大得点に掛けた推奨配点:')
  console.log()

  const currentMax = [20, 20, 15, 25, 10, 15, 15]
  factorNames.forEach((name, i) => {
    const recMax = Math.round(normalizedCoef[i] * currentMax[i])
    const label = ['slope', 'volume', 'rsi', 'hold', 'deviation', 'macd', 'weekly'][i]
    if (recMax <= 0) {
      console.log(`  ⑥ ${label}: 推奨 0点（回帰係数が負または小さい → 除外または逆転を検討）`)
    } else {
      console.log(`  ${i+1} ${label}: 現在最大 ${currentMax[i]}点 → 推奨 ${recMax}点`)
    }
  })

  // 合計が100超えるなら調整
  const totalMax = factorNames.reduce((s, _, i) => {
    return s + Math.max(0, Math.round(normalizedCoef[i] * currentMax[i]))
  }, 0)
  console.log(`\n  推奨合計最大点: ${totalMax}点 → 0〜100にクランプ`)

  console.log(`\n  ⚠ 注意：過学習に注意してください。`)
  console.log(`    データ期間を2分割してIn-sample / Out-of-sampleで検証することを推奨します。`)
}

main()
