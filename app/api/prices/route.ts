import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { fetchBarsWithFx } from '@/lib/yahoo'

export async function GET(req: NextRequest) {
  try {
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
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[GET /api/prices]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { symbol_id, ticker } = body
    if (!symbol_id || !ticker) {
      return NextResponse.json({ error: 'symbol_id and ticker required' }, { status: 400 })
    }

    const { bars, fxRate } = await fetchBarsWithFx(ticker)

    const db = createServiceClient()
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
    return NextResponse.json({ bars, count: bars.length })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[POST /api/prices]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
