import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
// 24時間キャッシュ（月次データなので十分）
export const revalidate = 86400

// ── 型定義 ────────────────────────────────────────────
export interface MacroData {
  cape: {
    value: number
    status: 'cheap' | 'fair' | 'expensive' | 'extreme'
    updatedAt: string   // YYYY-MM
  }
  rate: {
    current: number     // 最新FF金利
    prev3m:  number     // 3ヶ月前
    direction: 'cutting' | 'hiking' | 'hold'
    updatedAt: string
  }
  score: number         // 合計スコア (-2 〜 +2)
  timestamp: number
}

// ── CAPE ステータス ────────────────────────────────────
function getCapeStatus(v: number): MacroData['cape']['status'] {
  if (v <= 18) return 'cheap'      // +1点: 割安
  if (v <= 25) return 'fair'       // 0点: 適正
  if (v <= 33) return 'expensive'  // -1点: 割高
  return 'extreme'                  // -2点: 極端な割高
}

// ── 金利スコア ────────────────────────────────────────
function getRateScore(dir: MacroData['rate']['direction']): number {
  if (dir === 'cutting') return 1
  if (dir === 'hiking')  return -1
  return 0
}

// ── CAPEスコア ────────────────────────────────────────
function getCapeScore(status: MacroData['cape']['status']): number {
  if (status === 'cheap')    return 1
  if (status === 'fair')     return 0
  if (status === 'expensive') return -1
  return -2
}

// ── CAPE取得（Shiller公式データ由来） ─────────────────
async function fetchCape(): Promise<{ value: number; updatedAt: string }> {
  const res = await fetch(
    'https://posix4e.github.io/shiller_wrapper_data/data/latest.json',
    { next: { revalidate: 86400 } }
  )
  if (!res.ok) throw new Error(`CAPE fetch failed: ${res.status}`)
  const json = await res.json()

  // レスポンス構造: { stock_market: { cape: number, date: "YYYY-MM" } }
  const cape  = json?.stock_market?.cape ?? json?.cape ?? json?.value
  const date  = json?.stock_market?.date ?? json?.date ?? ''
  if (!cape) throw new Error('CAPE value not found in response')

  return {
    value:     Math.round(cape * 10) / 10,
    updatedAt: date,
  }
}

// ── FRED FF金利取得 ───────────────────────────────────
async function fetchFedRate(): Promise<{ current: number; prev3m: number; direction: MacroData['rate']['direction']; updatedAt: string }> {
  const apiKey = process.env.FRED_API_KEY
  if (!apiKey) throw new Error('FRED_API_KEY is not set')

  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=FEDFUNDS&api_key=${apiKey}&file_type=json&sort_order=desc&limit=5`
  const res = await fetch(url, { next: { revalidate: 86400 } })
  if (!res.ok) throw new Error(`FRED fetch failed: ${res.status}`)

  const json = await res.json()
  const obs: { date: string; value: string }[] = json?.observations ?? []
  if (obs.length < 3) throw new Error('FRED: not enough observations')

  const current = parseFloat(obs[0].value)
  const prev3m  = parseFloat(obs[3]?.value ?? obs[obs.length - 1].value)

  let direction: MacroData['rate']['direction'] = 'hold'
  const diff = current - prev3m
  if (diff <= -0.1) direction = 'cutting'
  else if (diff >= 0.1) direction = 'hiking'

  return {
    current:   Math.round(current * 100) / 100,
    prev3m:    Math.round(prev3m  * 100) / 100,
    direction,
    updatedAt: obs[0].date,
  }
}

// ── メインハンドラ ────────────────────────────────────
export async function GET() {
  try {
    // CAPE と FRED を並列取得
    const [capeResult, rateResult] = await Promise.allSettled([
      fetchCape(),
      fetchFedRate(),
    ])

    // CAPE
    const cape = capeResult.status === 'fulfilled'
      ? capeResult.value
      : { value: 0, updatedAt: '' }
    const capeStatus = getCapeStatus(cape.value)

    // 金利
    const rate = rateResult.status === 'fulfilled'
      ? rateResult.value
      : { current: 0, prev3m: 0, direction: 'hold' as const, updatedAt: '' }

    const score = getCapeScore(capeStatus) + getRateScore(rate.direction)

    const data: MacroData = {
      cape:  { value: cape.value, status: capeStatus, updatedAt: cape.updatedAt },
      rate:  { ...rate },
      score,
      timestamp: Date.now(),
    }

    // エラーがあれば警告ヘッダーに含める
    const warnings: string[] = []
    if (capeResult.status === 'rejected') warnings.push('cape_unavailable')
    if (rateResult.status === 'rejected') warnings.push('rate_unavailable')

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600',
        ...(warnings.length ? { 'X-Macro-Warnings': warnings.join(',') } : {}),
      },
    })
  } catch (error) {
    console.error('Macro fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch macro data', detail: String(error) },
      { status: 500 }
    )
  }
}
