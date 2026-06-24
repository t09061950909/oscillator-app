/**
 * lib/screener/indicators.ts
 * GCスクリーナー用インジケーター計算
 * ※ tsi.ts の calcMACD / calcBollingerBands と共存（重複しない）
 */

import type { PriceBar } from '@/types'

// ── SMA ─────────────────────────────────────────────────────
export function sma(values: number[], period: number): number[] {
  const result: number[] = []
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(NaN)
      continue
    }
    const slice = values.slice(i - period + 1, i + 1)
    result.push(slice.reduce((a, b) => a + b, 0) / period)
  }
  return result
}

// ── RSI ─────────────────────────────────────────────────────
export function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50  // データ不足は中立返却

  let gains = 0, losses = 0
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    if (diff > 0) gains  += diff
    else          losses -= diff
  }
  const avgGain = gains  / period
  const avgLoss = losses / period
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return parseFloat((100 - 100 / (1 + rs)).toFixed(2))
}

// ── MACD ヒストグラム（最新値のみ） ──────────────────────────
function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1)
  const result: number[] = []
  let prev = values[0]
  result.push(prev)
  for (let i = 1; i < values.length; i++) {
    const cur = values[i] * k + prev * (1 - k)
    result.push(cur)
    prev = cur
  }
  return result
}

export function calcMACDHistogram(closes: number[], fast = 12, slow = 26, signal = 9): {
  current: number
  prev: number
} {
  if (closes.length < slow + signal) return { current: 0, prev: 0 }

  const emaFast   = ema(closes, fast)
  const emaSlow   = ema(closes, slow)
  const macdLine  = emaFast.map((v, i) => v - emaSlow[i])
  const signalLine = ema(macdLine, signal)

  const n = closes.length - 1
  return {
    current: macdLine[n]   - signalLine[n],
    prev:    macdLine[n-1] - signalLine[n-1],
  }
}

// ── 週足バー生成（日足→週足変換） ────────────────────────────
export function toWeeklyBars(dailyBars: PriceBar[]): PriceBar[] {
  if (dailyBars.length === 0) return []

  const weeks: PriceBar[] = []
  let current: PriceBar | null = null

  // ISO週番号（月曜起点）
  const weekKey = (dateStr: string) => {
    const d = new Date(dateStr)
    const day = d.getDay() || 7
    d.setDate(d.getDate() + 4 - day)
    const year = d.getFullYear()
    const jan4 = new Date(year, 0, 4)
    const week = Math.ceil(((d.getTime() - jan4.getTime()) / 86400000 + jan4.getDay() + 1) / 7)
    return `${year}-W${String(week).padStart(2, '0')}`
  }

  let prevKey = ''
  for (const bar of dailyBars) {
    const key = weekKey(bar.date)
    if (key !== prevKey) {
      if (current) weeks.push(current)
      current = { ...bar }
      prevKey = key
    } else if (current) {
      current.high   = Math.max(current.high, bar.high)
      current.low    = Math.min(current.low, bar.low)
      current.close  = bar.close
      current.volume += bar.volume
    }
  }
  if (current) weeks.push(current)
  return weeks
}
