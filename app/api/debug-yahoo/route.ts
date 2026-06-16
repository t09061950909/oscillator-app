import { NextRequest, NextResponse } from 'next/server'

async function rawFetch(ticker: string, label: string, p1: number, p2: number) {
  const encoded = encodeURIComponent(ticker)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?period1=${p1}&period2=${p2}&interval=1d&includePrePost=false`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) return { label, error: `HTTP ${res.status}`, count: 0, first: null, last: null }
    const json = await res.json()
    const result = json?.chart?.result?.[0]
    if (!result) return { label, error: json?.chart?.error?.description ?? 'no result', count: 0, first: null, last: null }
    const ts: number[] = result.timestamp ?? []
    const toDate = (t: number) => new Date(t * 1000).toISOString().split('T')[0]
    return { label, count: ts.length, first: ts.length ? toDate(ts[0]) : null, last: ts.length ? toDate(ts[ts.length-1]) : null, error: null }
  } catch (e) {
    return { label, error: String(e), count: 0, first: null, last: null }
  }
}

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker') ?? '7203.T'
  const now = Math.floor(Date.now() / 1000)
  const y = 365.25 * 24 * 3600

  const chunks = [
    { label: '20y→15y', p1: Math.floor(now - 20*y), p2: Math.floor(now - 15*y) },
    { label: '15y→10y', p1: Math.floor(now - 15*y), p2: Math.floor(now - 10*y) },
    { label: '10y→5y',  p1: Math.floor(now - 10*y), p2: Math.floor(now -  5*y) },
    { label: '5y→now',  p1: Math.floor(now -  5*y), p2: now },
  ]

  const results = await Promise.all(chunks.map(c => rawFetch(ticker, c.label, c.p1, c.p2)))
  return NextResponse.json({ ticker, results })
}
