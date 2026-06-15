import type { PriceBar } from '@/types'

export function parseTicker(ticker: string): { base: string; fx: string | null } {
  if (ticker.includes('*')) {
    const [rawBase, rawFx] = ticker.split('*')
    const fxNorm  = rawFx.endsWith('=X') ? rawFx : `${rawFx}=X`
    const isIndex = ['SOX','NDX','SPX','DJI','VIX','RUT','FTSE','DAX','TOPIX','NK'].includes(rawBase.toUpperCase())
    const baseNorm = isIndex ? `^${rawBase}` : rawBase
    return { base: baseNorm, fx: fxNorm }
  }
  return { base: ticker, fx: null }
}

export async function fetchYahooBars(
  ticker: string,
  range  = '2y',
  interval = '1d'
): Promise<PriceBar[]> {
  const encoded = encodeURIComponent(ticker)
  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?range=${range}&interval=${interval}&includePrePost=false`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encoded}?range=${range}&interval=${interval}&includePrePost=false`,
  ]

  let lastError: Error | null = null

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
        cache: 'no-store',
      })

      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status} for ${ticker}`)
        console.error('[yahoo]', lastError.message)
        continue
      }

      const json   = await res.json()
      const result = json?.chart?.result?.[0]
      if (!result) {
        const desc = json?.chart?.error?.description ?? 'No data'
        lastError  = new Error(`${desc} for ${ticker}`)
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
        const o = ohlcv.open?.[i], h = ohlcv.high?.[i]
        const l = ohlcv.low?.[i],  c = ohlcv.close?.[i]
        if (o == null || h == null || l == null || c == null) continue
        const date = new Date(timestamps[i] * 1000).toISOString().split('T')[0]
        bars.push({ date, open: o, high: h, low: l, close: c, volume: ohlcv.volume?.[i] ?? 0 })
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

  if (!fx) return { bars, fxRate: null, baseTicker: base, fxTicker: null }

  let fxBars: PriceBar[] = []
  try {
    fxBars = await fetchYahooBars(fx, '2y', '1d')
  } catch (e) {
    console.error('[yahoo] FX fetch failed:', e)
    // FX取得失敗時はUSD元値を返す（混在よりマシ）
    return { bars, fxRate: null, baseTicker: base, fxTicker: fx }
  }

  // 日付→レートのマップ
  const fxMap = new Map(fxBars.map(b => [b.date, b.close]))

  // レートが存在しない日を前日レートで補完（forward fill）
  const filledRates = forwardFillRates(
    bars.map(b => b.date),
    fxMap
  )

  const convertedBars: PriceBar[] = bars.map((b, i) => {
    const rate = filledRates[i]
    if (!rate) return b   // 先頭数日で前日レートがない場合のみフォールバック
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

/**
 * 株の取引日リストに対して、FXレートを前日補完（forward fill）する
 * 例：株市場は開いているがFX市場データが欠けている日 → 直近の有効レートで補完
 */
function forwardFillRates(dates: string[], fxMap: Map<string, number>): (number | null)[] {
  const result: (number | null)[] = []
  let lastRate: number | null = null

  for (const date of dates) {
    const rate = fxMap.get(date)
    if (rate != null) {
      lastRate = rate
    }
    // forward fill：当日レートがなければ直近レートを使う
    result.push(lastRate)
  }

  return result
}
