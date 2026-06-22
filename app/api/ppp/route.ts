import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const revalidate = 86400

export interface PppData {
  spotRate:    number   // 実勢レート JPY/USD
  pppRate:     number   // PPP理論レート JPY/USD（5年平均で近似）
  deviation:   number   // (spot/ppp - 1) * 100 %
  direction:   'cheap' | 'fair' | 'expensive_mild' | 'expensive_extreme'
  updatedAt:   string
  timestamp:   number
}

function parseFredValue(s: string): number | null {
  if (!s || s === '.' || s.trim() === '') return null
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

async function fetchFredSeries(seriesId: string, apiKey: string, limit = 60) {
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

    // DEXJPUS: JPY/USD 実勢レート（日次）を60件取得
    // PPP理論値 = 過去5年（約60ヶ月分の月次平均）の平均レートで近似
    // ※ 専用PPPシリーズがFREDに存在しないため、中長期平均を理論値として使用
    const obs = await fetchFredSeries('DEXJPUS', apiKey, 60)
    if (obs.length < 10) throw new Error('DEXJPUS: not enough data')

    const spotRate = obs[0].value

    // 過去60件（約5年）の平均をPPP近似値として使用
    const avg = obs.reduce((s, o) => s + o.value, 0) / obs.length
    const pppRate = Math.round(avg * 100) / 100

    const deviation = Math.round(((spotRate / pppRate) - 1) * 10000) / 100

    const data: PppData = {
      spotRate:  Math.round(spotRate * 100) / 100,
      pppRate,
      deviation,
      direction: getDirection(deviation),
      updatedAt: obs[0].date,
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
