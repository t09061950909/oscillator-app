import type { PriceBar } from '@/types'

// Parse ticker string like "SOX*USDJPY" or "AAPL"
export function parseTicker(ticker: string): { base: string; fx: string | null } {
  if (ticker.includes('*')) {
    const [base, fx] = ticker.split('*')
    // Normalize FX ticker: USDJPY -> USDJPY=X
    const fxNorm = fx.endsWith('=X') ? fx : `${fx}=X`
    // Normalize index tickers: SOX -> ^SOX
    const baseNorm = /^[A-Z0-9]+$/.test(base) && base.length <= 4 && !base.startsWith('^')
      ? `^${base}`
      : base
    return { base: baseNorm, fx: fxNorm }
  }
  return { base: ticker, fx: null }
}

// Fetch OHLCV bars from Yahoo Finance (unofficial JSON API)
export async function fetchYahooBars(
  ticker: string,
  range: string = '1y',
  interval: string = '1d'
): Promise<PriceBar[]> {
  const encodedTicker = encodeURIComponent(ticker)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodedTicker}?range=${range}&interval=${interval}&includePrePost=false`

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json',
    },
    next: { revalidate: 3600 },
  })

  if (!res.ok) throw new Error(`Yahoo Finance fetch failed: ${res.status} for ${ticker}`)

  const json = await res.json()
  const result = json?.chart?.result?.[0]
  if (!result) throw new Error(`No data returned for ${ticker}`)

  const timestamps: number[] = result.timestamp ?? []
  const ohlcv = result.indicators?.quote?.[0]
  if (!ohlcv) throw new Error(`No OHLCV data for ${ticker}`)

  const bars: PriceBar[] = []
  for (let i = 0; i < timestamps.length; i++) {
    const open = ohlcv.open?.[i]
    const high = ohlcv.high?.[i]
    const low = ohlcv.low?.[i]
    const close = ohlcv.close?.[i]
    const volume = ohlcv.volume?.[i] ?? 0

    // Skip bars with null values
    if (open == null || high == null || low == null || close == null) continue

    const date = new Date(timestamps[i] * 1000).toISOString().split('T')[0]
    bars.push({ date, open, high, low, close, volume })
  }
  return bars
}

// Fetch latest FX rate (single value)
export async function fetchFxRate(fxTicker: string): Promise<number> {
  const bars = await fetchYahooBars(fxTicker, '5d', '1d')
  if (bars.length === 0) throw new Error(`No FX data for ${fxTicker}`)
  return bars[bars.length - 1].close
}

// Fetch bars with optional FX conversion
export async function fetchBarsWithFx(ticker: string): Promise<{
  bars: PriceBar[]
  fxRate: number | null
  baseTicker: string
  fxTicker: string | null
}> {
  const { base, fx } = parseTicker(ticker)

  const bars = await fetchYahooBars(base, '2y', '1d')

  if (!fx) {
    return { bars, fxRate: null, baseTicker: base, fxTicker: null }
  }

  // Fetch FX bars for entire period to align dates
  const fxBars = await fetchYahooBars(fx, '2y', '1d')
  const fxMap = new Map(fxBars.map(b => [b.date, b.close]))

  const convertedBars: PriceBar[] = bars.map(b => {
    const rate = fxMap.get(b.date) ?? null
    if (rate == null) return b
    return {
      ...b,
      open: parseFloat((b.open * rate).toFixed(2)),
      high: parseFloat((b.high * rate).toFixed(2)),
      low: parseFloat((b.low * rate).toFixed(2)),
      close: parseFloat((b.close * rate).toFixed(2)),
    }
  })

  const latestFxRate = fxBars[fxBars.length - 1]?.close ?? null

  return { bars: convertedBars, fxRate: latestFxRate, baseTicker: base, fxTicker: fx }
}
