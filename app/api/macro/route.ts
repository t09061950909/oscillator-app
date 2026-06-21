import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const revalidate = 86400

// ── 型定義 ────────────────────────────────────────────
export interface MacroData {
  cape: {
    value:     number
    status:    'cheap' | 'fair' | 'expensive' | 'extreme'
    updatedAt: string
  }
  rate: {
    current:   number
    prev3m:    number
    direction: 'cutting' | 'hiking' | 'hold'
    updatedAt: string
  }
  score:     number
  timestamp: number
}

function getCapeStatus(v: number): MacroData['cape']['status'] {
  if (v <= 18) return 'cheap'
  if (v <= 25) return 'fair'
  if (v <= 33) return 'expensive'
  return 'extreme'
}

function getRateScore(dir: MacroData['rate']['direction']): number {
  if (dir === 'cutting') return 1
  if (dir === 'hiking')  return -1
  return 0
}

function getCapeScore(status: MacroData['cape']['status']): number {
  if (status === 'cheap')     return 1
  if (status === 'expensive') return -1
  if (status === 'extreme')   return -2
  return 0
}

// ── FRED値のパース（"." や空文字を除外） ──────────────
function parseFredValue(s: string): number | null {
  if (!s || s === '.' || s.trim() === '') return null
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

async function fetchCape(): Promise<{ value: number; updatedAt: string }> {
  const res = await fetch(
    'https://posix4e.github.io/shiller_wrapper_data/data/latest.json',
    { next: { revalidate: 86400 } }
  )
  if (!res.ok) throw new Error(`CAPE fetch failed: ${res.status}`)
  const json = await res.json()
  const cape = json?.stock_market?.cape ?? json?.cape ?? json?.value
  const date = json?.stock_market?.date ?? json?.date ?? ''
  if (!cape) throw new Error('CAPE value not found')
  return { value: Math.round(cape * 10) / 10, updatedAt: date }
}

async function fetchFedRate(): Promise<MacroData['rate']> {
  const apiKey = process.env.FRED_API_KEY
  if (!apiKey) throw new Error('FRED_API_KEY is not set')

  // limit=12 で直近1年分取得し、"." を除いた有効値だけ使う
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=FEDFUNDS&api_key=${apiKey}&file_type=json&sort_order=desc&limit=12`
  const res = await fetch(url, { next: { revalidate: 86400 } })
  if (!res.ok) throw new Error(`FRED fetch failed: ${res.status}`)

  const json = await res.json()
  const raw: { date: string; value: string }[] = json?.observations ?? []

  // 有効な数値のみ抽出（新しい順）
  const valid = raw
    .map(o => ({ date: o.date, value: parseFredValue(o.value) }))
    .filter((o): o is { date: string; value: number } => o.value !== null)

  if (valid.length < 2) throw new Error('FRED: not enough valid observations')

  const current = valid[0].value
  // 3ヶ月前に相当するインデックス（有効値ベース）
  const prev3m  = valid[Math.min(3, valid.length - 1)].value

  let direction: MacroData['rate']['direction'] = 'hold'
  const diff = current - prev3m
  if (diff <= -0.1) direction = 'cutting'
  else if (diff >= 0.1) direction = 'hiking'

  return {
    current:   Math.round(current * 100) / 100,
    prev3m:    Math.round(prev3m  * 100) / 100,
    direction,
    updatedAt: valid[0].date,
  }
}

export async function GET() {
  try {
    const [capeResult, rateResult] = await Promise.allSettled([
      fetchCape(),
      fetchFedRate(),
    ])

    const cape = capeResult.status === 'fulfilled'
      ? capeResult.value
      : { value: 0, updatedAt: '' }
    const capeStatus = getCapeStatus(cape.value)

    const rate = rateResult.status === 'fulfilled'
      ? rateResult.value
      : { current: 0, prev3m: 0, direction: 'hold' as const, updatedAt: '' }

    // デバッグ用: エラー内容をログ出力
    if (capeResult.status === 'rejected') console.error('CAPE error:', capeResult.reason)
    if (rateResult.status === 'rejected') console.error('FRED error:', rateResult.reason)

    const score = getCapeScore(capeStatus) + getRateScore(rate.direction)

    const data: MacroData = {
      cape:  { value: cape.value, status: capeStatus, updatedAt: cape.updatedAt },
      rate,
      score,
      timestamp: Date.now(),
    }

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600' },
    })
  } catch (error) {
    console.error('Macro fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch macro data', detail: String(error) },
      { status: 500 }
    )
  }
}
