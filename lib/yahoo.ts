import type { PriceBar } from '@/types'

// "SOX*USDJPY" → { base: "^SOX", fx: "USDJPY=X" }
// "SOXL*USDJPY" → { base: "SOXL", fx: "USDJPY=X" }
export function parseTicker(ticker: string): { base: string; fx: string | null } {
  if (ticker.includes('*')) {
    const [rawBase, rawFx] = ticker.split('*')
    const fxNorm = rawFx.endsWith('=X') ? rawFx : `${rawFx}=X`
    // 指数（3文字以下の純アルファ）のみ ^ を付与。ETF（SOXL等）には付けない
    const isIndex = /^[A-Z]{2,4}$/.test(rawBase) && ['SOX','NDX','SPX','DJI','VIX','RUT','FTSE','DAX'].includes(rawBase.toUpperCase())
    const baseNorm = isIndex ? `^${rawBase}` : rawBase
    return { base: baseNorm, fx: fxNorm }
  }
  return { base: ticker, fx: null }
}

// Yahoo Finance v8 API からOHLCVを取得
export async function fetchYahooBars(
  ticker: string,
  range: string = '2y',
  interval: string = '1d'
): Promise<PriceBar[]> {
  const encodedTicker = encodeURIComponent(ticker)
  
  // v8とv11の両方を試みる
  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodedTicker}?range=${range}&interval=${interval}&includePrePost=false`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodedTicker}?range=${range}&interval=${interval}&includePrePost=false`,
  ]

  let lastError: Error | null = null

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        // Vercel Edge では cache: 'no-store' でタイムアウトを防ぐ
        cache: 'no-store',
      })

      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status} for ${ticker} (${url})`)
        console.error('[yahoo]', lastError.message)
        continue
      }

      const json = await res.json()
      const result = json?.chart?.result?.[0]
      
      if (!result) {
        const errMsg = json?.chart?.error?.description ?? 'No data returned'
        lastError = new Error(`${errMsg} for ${ticker}`)
        console.error('[yahoo]', lastError.message)
        continue
      }

      const timestamps: number[] = result.timestamp ?? []
      const ohlcv = result.indicators?.quote?.[0]
      
      if (!ohlcv || timestamps.length === 0) {
        lastError = new Error(`Empty OHLCV for ${ticker}`)
        continue
      }

      const bars: PriceBar[] = []
      for (let i = 0; i < timestamps.length; i++) {
        const open  = ohlcv.open?.[i]
        const high  = ohlcv.high?.[i]
        const low   = ohlcv.low?.[i]
        const close = ohlcv.close?.[i]
        const volume = ohlcv.volume?.[i] ?? 0
        if (open == null || high == null || low == null || close == null) continue
        const date = new Date(timestamps[i] * 1000).toISOString().split('T')[0]
        bars.push({ date, open, high, low, close, volume })
      }

      console.log(`[yahoo] fetched ${bars.length} bars for ${ticker}`)
      return bars

    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
      console.error('[yahoo] fetch error:', lastError.message)
    }
  }

  throw lastError ?? new Error(`Failed to fetch ${ticker}`)
}

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

  // FX取得失敗してもベース価格は返す
  let fxBars: PriceBar[] = []
  try {
    fxBars = await fetchYahooBars(fx, '2y', '1d')
  } catch (e) {
    console.error('[yahoo] FX fetch failed:', e)
    return { bars, fxRate: null, baseTicker: base, fxTicker: fx }
  }

  const fxMap = new Map(fxBars.map(b => [b.date, b.close]))

  const convertedBars: PriceBar[] = bars.map(b => {
    const rate = fxMap.get(b.date)
    if (!rate) return b
    return {
      ...b,
      open:  parseFloat((b.open  * rate).toFixed(2)),
      high:  parseFloat((b.high  * rate).toFixed(2)),
      low:   parseFloat((b.low   * rate).toFixed(2)),
      close: parseFloat((b.close * rate).toFixed(2)),
    }
  })

  const fxRate = fxBars[fxBars.length - 1]?.close ?? null
  return { bars: convertedBars, fxRate, baseTicker: base, fxTicker: fx }
}
