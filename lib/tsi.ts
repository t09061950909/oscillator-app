import type { PriceBar, TSIPoint, CrossSignal } from '@/types'

// EMA helper
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

// TSI: True Strength Index
export function calcTSI(
  bars: PriceBar[],
  longPeriod = 12,
  shortPeriod = 6,
  signalPeriod = 3
): TSIPoint[] {
  if (bars.length < longPeriod + shortPeriod + signalPeriod + 2) return []

  const closes = bars.map(b => b.close)

  const momentum: number[] = [0]
  for (let i = 1; i < closes.length; i++) {
    momentum.push(closes[i] - closes[i - 1])
  }
  const absMomentum = momentum.map(m => Math.abs(m))

  const ema1 = ema(momentum, longPeriod)
  const ema2 = ema(ema1, shortPeriod)
  const absEma1 = ema(absMomentum, longPeriod)
  const absEma2 = ema(absEma1, shortPeriod)

  const tsiRaw: number[] = ema2.map((v, i) =>
    absEma2[i] !== 0 ? 100 * (v / absEma2[i]) : 0
  )

  const signalRaw = ema(tsiRaw, signalPeriod)

  const offset = longPeriod + shortPeriod - 2
  const result: TSIPoint[] = []
  for (let i = offset; i < bars.length; i++) {
    result.push({
      date: bars[i].date,
      tsi: parseFloat(tsiRaw[i].toFixed(4)),
      signal: parseFloat(signalRaw[i].toFixed(4)),
    })
  }
  return result
}

// Detect golden and dead cross signals
export function detectCrossSignals(
  tsiPoints: TSIPoint[],
  bars: PriceBar[],
  zeroLine = -10
): CrossSignal[] {
  const signals: CrossSignal[] = []
  const priceMap = new Map(bars.map(b => [b.date, b.close]))

  for (let i = 1; i < tsiPoints.length; i++) {
    const prev = tsiPoints[i - 1]
    const cur  = tsiPoints[i]

    // Golden cross: TSI crosses ABOVE signal
    if (prev.tsi <= prev.signal && cur.tsi > cur.signal) {
      const price = priceMap.get(cur.date) ?? 0
      signals.push({
        date: cur.date,
        type: cur.tsi < zeroLine ? 'golden_below' : 'golden_above',
        price,
      })
    }

    // Dead cross: TSI crosses BELOW signal
    if (prev.tsi >= prev.signal && cur.tsi < cur.signal) {
      const price = priceMap.get(cur.date) ?? 0
      signals.push({
        date: cur.date,
        type: cur.tsi < zeroLine ? 'dead_below' : 'dead_above',
        price,
      })
    }
  }
  return signals
}

// ── Bollinger Bands ──────────────────────────────────────────
export interface BBPoint {
  date:   string
  upper:  number
  middle: number
  lower:  number
}

export function calcBollingerBands(
  bars: PriceBar[],
  period = 20,
  stdDev = 2
): BBPoint[] {
  if (bars.length < period) return []
  const closes = bars.map(b => b.close)
  const result: BBPoint[] = []

  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1)
    const mean  = slice.reduce((s, v) => s + v, 0) / period
    const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period
    const sd = Math.sqrt(variance)
    result.push({
      date:   bars[i].date,
      upper:  parseFloat((mean + stdDev * sd).toFixed(4)),
      middle: parseFloat(mean.toFixed(4)),
      lower:  parseFloat((mean - stdDev * sd).toFixed(4)),
    })
  }
  return result
}

// ── MACD ────────────────────────────────────────────────────
export interface MACDPoint {
  date:      string
  macd:      number
  signal:    number
  histogram: number
}

export function calcMACD(
  bars: PriceBar[],
  fast   = 12,
  slow   = 26,
  signal = 9
): MACDPoint[] {
  if (bars.length < slow + signal) return []
  const closes  = bars.map(b => b.close)
  const emaFast = ema(closes, fast)
  const emaSlow = ema(closes, slow)

  // MACDライン（インデックス揃え）
  const macdLine = emaFast.map((v, i) => v - emaSlow[i])

  // シグナルはMACDラインのEMA
  const signalLine = ema(macdLine, signal)

  const offset = slow - 1  // 最初の slow-1 本はウォームアップ
  const result: MACDPoint[] = []
  for (let i = offset; i < bars.length; i++) {
    const m = macdLine[i]
    const s = signalLine[i]
    result.push({
      date:      bars[i].date,
      macd:      parseFloat(m.toFixed(6)),
      signal:    parseFloat(s.toFixed(6)),
      histogram: parseFloat((m - s).toFixed(6)),
    })
  }
  return result
}
