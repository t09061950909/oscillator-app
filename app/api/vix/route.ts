import { NextResponse } from 'next/server'
import yahooFinance from 'yahoo-finance2'

export const runtime = 'nodejs'
// 5分キャッシュ（VIXはリアルタイムだが過剰リクエスト防止）
export const revalidate = 300

export interface VixData {
  value: number
  previousClose: number
  change: number
  changePercent: number
  status: 'panic' | 'fear' | 'normal' | 'complacency'
  timestamp: number
}

function getVixStatus(value: number): VixData['status'] {
  if (value >= 40) return 'panic'       // 強い買いシグナル
  if (value >= 25) return 'fear'        // 買い検討ゾーン
  if (value <= 10) return 'complacency' // 売り警戒ゾーン
  return 'normal'
}

export async function GET() {
  try {
    const quote = await yahooFinance.quote('^VIX', {}, { validateResult: false })

    const value = quote.regularMarketPrice ?? 0
    const previousClose = quote.regularMarketPreviousClose ?? 0
    const change = value - previousClose
    const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0

    const data: VixData = {
      value: Math.round(value * 100) / 100,
      previousClose: Math.round(previousClose * 100) / 100,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100,
      status: getVixStatus(value),
      timestamp: Date.now(),
    }

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      },
    })
  } catch (error) {
    console.error('VIX fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch VIX data' },
      { status: 500 }
    )
  }
}
