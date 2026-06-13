import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { fetchBarsWithFx } from '@/lib/yahoo'

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()
  const { data: symbols, error } = await db.from('symbols').select('*')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results: { ticker: string; count?: number; error?: string }[] = []

  for (const symbol of symbols ?? []) {
    try {
      const { bars } = await fetchBarsWithFx(symbol.ticker)
      const rows = bars.map((b: { date: string; open: number; high: number; low: number; close: number; volume: number }) => ({
        symbol_id: symbol.id,
        date: b.date,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
      }))

      const { error: upsertError } = await db
        .from('price_cache')
        .upsert(rows, { onConflict: 'symbol_id,date' })

      results.push({
        ticker: symbol.ticker,
        count: upsertError ? undefined : rows.length,
        error: upsertError?.message,
      })
    } catch (e: unknown) {
      results.push({ ticker: symbol.ticker, error: e instanceof Error ? e.message : 'failed' })
    }
  }

  return NextResponse.json({ updated: results })
}
