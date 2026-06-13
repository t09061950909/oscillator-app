import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { fetchBarsWithFx } from '@/lib/yahoo'

// GET /api/prices?symbol_id=xxx  → return cached bars from DB
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const symbolId = searchParams.get('symbol_id')
  if (!symbolId) return NextResponse.json({ error: 'symbol_id required' }, { status: 400 })

  const db = createServiceClient()
  const { data, error } = await db
    .from('price_cache')
    .select('*')
    .eq('symbol_id', symbolId)
    .order('date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ bars: data })
}

// POST /api/prices  → fetch from Yahoo and upsert to DB
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { symbol_id, ticker } = body
  if (!symbol_id || !ticker) {
    return NextResponse.json({ error: 'symbol_id and ticker required' }, { status: 400 })
  }

  try {
    const { bars, fxRate } = await fetchBarsWithFx(ticker)

    const db = createServiceClient()

    // Upsert bars into price_cache
    const rows = bars.map(b => ({
      symbol_id,
      date: b.date,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
      close_jpy: fxRate ? parseFloat((b.close).toFixed(2)) : null,
    }))

    const { error } = await db
      .from('price_cache')
      .upsert(rows, { onConflict: 'symbol_id,date' })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Return latest bars
    return NextResponse.json({ bars, count: bars.length })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
