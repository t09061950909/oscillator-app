import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const revalidate = 86400

export interface PppData {
  spotRate:  number   // 実勢レート JPY/USD
  pppRate:   number   // PPP理論レート JPY/USD
  deviation: number   // (spot/ppp - 1) * 100 %
  direction: 'cheap' | 'fair' | 'expensive_mild' | 'expensive_extreme'
  updatedAt: string
  timestamp: number
}

function parseFredValue(s: string): number | null {
  if (!s || s === '.' || s.trim() === '') return null
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

async function fetchFredSeries(seriesId: string, apiKey: string, limit = 5) {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=${limit}`
  const res = await fetch(url, { next: { revalidate: 86400 } })
  if (!res.ok) throw new Error(`FRED ${seriesId} failed: ${res.status}`)
  const json = await res.json()
  const obs: { date: string; value: string }[] = json?.observations ?? []
  return obs
    .map(o => ({ date: o.date, value: parseFredValue(o.value) }))
    .filter((o): o is { date: string; value: number } => o.value !== null)
}

function getDirection(dev: number): PppData['direction'] {
  if (dev >= 40)  return 'expensive_extreme'
  if (dev >= 20)  return 'expensive_mild'
  if (dev >= -20) return 'fair'
  return 'cheap'
}

export async function GET() {
  try {
    const apiKey = process.env.FRED_API_KEY
    if (!apiKey) throw new Error('FRED_API_KEY is not set')

    // DEXJPUS: JPY/USD 実勢レート（日次）
    // PPPJPN: 日本のPPP換算レート USD per JPY（年次・IMF/World Bank）
    //         → JPY/USD に変換するため逆数を取る
    const [spotObs, pppObs] = await Promise.all([
      fetchFredSeries('DEXJPUS', apiKey, 5),
      fetchFredSeries('PPPJPN',  apiKey, 3),
    ])

    if (!spotObs.length) throw new Error('DEXJPUS: no data')
    if (!pppObs.length)  throw new Error('PPPJPN: no data')

    const spotRate = spotObs[0].value          // JPY/USD 例: 155.0
    // PPPJPN は USD per JPY (例: 0.0094) → JPY/USD に変換
    const pppRateRaw = pppObs[0].value
    const pppRate    = pppRateRaw < 1
      ? Math.round((1 / pppRateRaw) * 100) / 100   // USD per JPY → JPY/USD
      : pppRateRaw                                   // 既にJPY/USD形式の場合

    const deviation = Math.round(((spotRate / pppRate) - 1) * 10000) / 100

    const data: PppData = {
      spotRate:  Math.round(spotRate * 100) / 100,
      pppRate,
      deviation,
      direction: getDirection(deviation),
      updatedAt: spotObs[0].date,
      timestamp: Date.now(),
    }

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600' },
    })
  } catch (error) {
    console.error('PPP fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch PPP data', detail: String(error) },
      { status: 500 }
    )
  }
}
