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
 * Yahoo Finance v8 から期間指定（period1/period2）でバーを取得する内部関数
 * range パラメータはYahoo側キャッシュに依存して古いデータが欠落するため、
 * UNIX秒の絶対日付指定を使う。
 * query1 → query2 の順にフォールバック
 */
async function fetchYahooBarsRaw(
  ticker: string,
  period1: number,  // UNIX秒（開始）
  period2: number,  // UNIX秒（終了）
  interval = '1d'
): Promise<PriceBar[]> {
  const encoded = encodeURIComponent(ticker)
  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?period1=${period1}&period2=${period2}&interval=${interval}&includePrePost=false`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encoded}?period1=${period1}&period2=${period2}&interval=${interval}&includePrePost=false`,
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
        const o = ohlcv.open?.[i],  h = ohlcv.high?.[i]
        const l = ohlcv.low?.[i],   c = ohlcv.close?.[i]
        if (o == null || h == null || l == null || c == null) continue
        const date = new Date(timestamps[i] * 1000).toISOString().split('T')[0]
        bars.push({ date, open: o, high: h, low: l, close: c, volume: ohlcv.volume?.[i] ?? 0 })
      }

      const firstDate = bars[0]?.date
      const lastDate  = bars[bars.length - 1]?.date
      console.log(`[yahoo] fetched ${bars.length} bars for ${ticker} (${firstDate} → ${lastDate})`)
      return bars

    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
      console.error('[yahoo] fetch error:', lastError.message)
    }
  }

  throw lastError ?? new Error(`Failed to fetch ${ticker}`)
}

/**
 * 分割取得でマージする（period1/period2 絶対日付指定）
 *
 * Yahoo Finance の range パラメータはサーバー側キャッシュに依存し、
 * 古い期間が欠落するケースがある。絶対 UNIX 秒で期間を指定することで
 * 確実に全期間を取得する。
 *
 * チャンク分割の理由：1リクエストあたりの上限が非公式で不明なため、
 * 5年ずつに分割して安全に取得する。
 *
 * ・各チャンクが失敗しても続行（警告のみ）
 * ・重複日は後のチャンク（新しい期間）で上書き → 直近ほど精度が高い
 */
export async function fetchYahooBars(
  ticker: string,
  interval = '1d'
): Promise<PriceBar[]> {
  const map = new Map<string, PriceBar>()
  const now = Math.floor(Date.now() / 1000)

  // 5年ずつ4チャンクで最大20年分を取得
  // 例: 2004〜2009, 2009〜2014, 2014〜2019, 2019〜now
  const YEARS_PER_CHUNK = 5
  const TOTAL_YEARS     = 20
  const SEC_PER_YEAR    = 365.25 * 24 * 3600

  const chunks: Array<{ p1: number; p2: number }> = []
  for (let i = TOTAL_YEARS; i > 0; i -= YEARS_PER_CHUNK) {
    const p1 = Math.floor(now - i * SEC_PER_YEAR)
    const p2 = Math.floor(now - (i - YEARS_PER_CHUNK) * SEC_PER_YEAR)
    chunks.push({ p1, p2: Math.min(p2, now) })
  }

  for (const { p1, p2 } of chunks) {
    try {
      const bars = await fetchYahooBarsRaw(ticker, p1, p2, interval)
      for (const b of bars) map.set(b.date, b)
    } catch (e) {
      console.warn(`[yahoo] chunk failed for ${ticker} (${new Date(p1*1000).toISOString().slice(0,10)} → ${new Date(p2*1000).toISOString().slice(0,10)}):`, e)
    }
  }

  if (map.size === 0) throw new Error(`No bars fetched for ${ticker}`)

  const merged = [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
  console.log(`[yahoo] merged total ${merged.length} bars for ${ticker} (${merged[0].date} → ${merged[merged.length-1].date})`)
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
