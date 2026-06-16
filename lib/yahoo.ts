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

/**
 * Yahoo Finance v8 から単一 range でバーを取得する内部関数
 * query1 → query2 の順にフォールバック
 */
async function fetchYahooBarsRaw(
  ticker: string,
  range: string,
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
        lastError = new Error(`HTTP ${res.status} for ${ticker} (${range})`)
        console.error('[yahoo]', lastError.message)
        continue
      }

      const json   = await res.json()
      const result = json?.chart?.result?.[0]
      if (!result) {
        const desc = json?.chart?.error?.description ?? 'No data'
        lastError  = new Error(`${desc} for ${ticker} (${range})`)
        console.error('[yahoo]', lastError.message)
        continue
      }

      const timestamps: number[] = result.timestamp ?? []
      const ohlcv = result.indicators?.quote?.[0]
      if (!ohlcv || timestamps.length === 0) {
        lastError = new Error(`Empty OHLCV for ${ticker} (${range})`)
        continue
      }

      const bars: PriceBar[] = []
      for (let i = 0; i < timestamps.length; i++) {
        const o = ohlcv.open?.[i],  h = ohlcv.high?.[i]
        const l = ohlcv.low?.[i],   c = ohlcv.close?.[i]
        if (o == null || h == null || l == null || c == null) continue
        const date = new Date(timestamps[i] * 1000).toISOString().split('T')[0]
        bars.push({ date, open: o, high: h, low: l, close: c, volume: ohlcv.volume?.[i] ?? 0 })
      }

      console.log(`[yahoo] fetched ${bars.length} bars for ${ticker} (range=${range})`)
      return bars

    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
      console.error('[yahoo] fetch error:', lastError.message)
    }
  }

  throw lastError ?? new Error(`Failed to fetch ${ticker} (${range})`)
}

/**
 * 分割取得でマージする
 * 1) 10y（古いデータ）→ 2) 2y（直近・高精度）の順に取得し、
 * 日付キーで後者優先でマージ → 日付昇順ソートして返す
 *
 * ・10y が失敗しても 2y だけで続行（警告のみ）
 * ・重複日は 2y 側（新しいリクエスト）の値で上書き
 */
export async function fetchYahooBars(
  ticker: string,
  interval = '1d'
): Promise<PriceBar[]> {
  const map = new Map<string, PriceBar>()

  // ── 1st chunk: 10年分（古い方から埋める） ──
  try {
    const old = await fetchYahooBarsRaw(ticker, '10y', interval)
    for (const b of old) map.set(b.date, b)
  } catch (e) {
    console.warn('[yahoo] 10y fetch failed, falling back to 2y only:', e)
  }

  // ── 2nd chunk: 2年分（直近を正確な値で上書き） ──
  const recent = await fetchYahooBarsRaw(ticker, '2y', interval)
  for (const b of recent) map.set(b.date, b)

  if (map.size === 0) throw new Error(`No bars fetched for ${ticker}`)

  const merged = [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
  console.log(`[yahoo] merged total ${merged.length} bars for ${ticker}`)
  return merged
}

export async function fetchBarsWithFx(ticker: string): Promise<{
  bars: PriceBar[]
  fxRate: number | null
  baseTicker: string
  fxTicker: string | null
}> {
  const { base, fx } = parseTicker(ticker)
  const bars = await fetchYahooBars(base)

  if (!fx) return { bars, fxRate: null, baseTicker: base, fxTicker: null }

  let fxBars: PriceBar[] = []
  try {
    fxBars = await fetchYahooBars(fx)
  } catch (e) {
    console.error('[yahoo] FX fetch failed:', e)
    return { bars, fxRate: null, baseTicker: base, fxTicker: fx }
  }

  const fxMap = new Map(fxBars.map(b => [b.date, b.close]))
  const filledRates = forwardFillRates(bars.map(b => b.date), fxMap)

  const convertedBars: PriceBar[] = bars.map((b, i) => {
    const rate = filledRates[i]
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

/**
 * 株の取引日リストに対して FX レートを前日補完（forward fill）する
 */
function forwardFillRates(dates: string[], fxMap: Map<string, number>): (number | null)[] {
  const result: (number | null)[] = []
  let lastRate: number | null = null
  for (const date of dates) {
    const rate = fxMap.get(date)
    if (rate != null) lastRate = rate
    result.push(lastRate)
  }
  return result
}
