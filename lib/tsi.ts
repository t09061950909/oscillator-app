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
// TSI = 100 * EMA(EMA(momentum, short), long) / EMA(EMA(|momentum|, short), long)
export function calcTSI(
  bars: PriceBar[],
  longPeriod = 12,
  shortPeriod = 6,
  signalPeriod = 3
): TSIPoint[] {
  if (bars.length < longPeriod + shortPeriod + signalPeriod + 2) return []

  const closes = bars.map(b => b.close)

  // momentum = close[i] - close[i-1]
  const momentum: number[] = [0]
  for (let i = 1; i < closes.length; i++) {
    momentum.push(closes[i] - closes[i - 1])
  }
  const absMomentum = momentum.map(m => Math.abs(m))

  // Double EMA of momentum and |momentum|
  const ema1 = ema(momentum, longPeriod)
  const ema2 = ema(ema1, shortPeriod)
  const absEma1 = ema(absMomentum, longPeriod)
  const absEma2 = ema(absEma1, shortPeriod)

  // TSI values
  const tsiRaw: number[] = ema2.map((v, i) =>
    absEma2[i] !== 0 ? 100 * (v / absEma2[i]) : 0
  )

  // Signal = EMA(TSI, signalPeriod)
  const signalRaw = ema(tsiRaw, signalPeriod)

  // Align to bar dates, skip initial warmup
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

// Detect golden cross signals
// golden_below: TSI crosses above signal while TSI < -10
// golden_above: TSI crosses above signal while TSI >= -10
export function detectCrossSignals(
  tsiPoints: TSIPoint[],
  bars: PriceBar[],
  zeroLine = -10
): CrossSignal[] {
  const signals: CrossSignal[] = []

  // Build a date->close map
  const priceMap = new Map(bars.map(b => [b.date, b.close]))

  for (let i = 1; i < tsiPoints.length; i++) {
    const prev = tsiPoints[i - 1]
    const cur = tsiPoints[i]

    // Golden cross: TSI crosses ABOVE signal
    const wasBelowSignal = prev.tsi <= prev.signal
    const isAboveSignal = cur.tsi > cur.signal

    if (wasBelowSignal && isAboveSignal) {
      const price = priceMap.get(cur.date) ?? 0
      signals.push({
        date: cur.date,
        type: cur.tsi < zeroLine ? 'golden_below' : 'golden_above',
        price,
      })
    }
  }
  return signals
}
