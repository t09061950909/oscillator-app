import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { parseTicker } from '@/lib/yahoo'

export async function GET() {
  try {
    const db = createServiceClient()
    const { data, error } = await db
      .from('symbols')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ symbols: data })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[GET /api/symbols]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { ticker, display_name } = body

    if (!ticker) return NextResponse.json({ error: 'ticker is required' }, { status: 400 })

    // 環境変数チェック
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json({ error: 'NEXT_PUBLIC_SUPABASE_URL is not set' }, { status: 500 })
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not set' }, { status: 500 })
    }

    const { base, fx } = parseTicker(ticker)
    const name = display_name || ticker

    const db = createServiceClient()
    const { data, error } = await db
      .from('symbols')
      .insert({
        ticker: ticker.toUpperCase(),
        display_name: name,
        base_ticker: base,
        fx_ticker: fx,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ symbol: data }, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[POST /api/symbols]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const db = createServiceClient()
    const { error } = await db.from('symbols').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[DELETE /api/symbols]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
