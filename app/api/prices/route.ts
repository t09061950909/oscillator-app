import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { fetchBarsWithFx } from '@/lib/yahoo'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const symbolId = searchParams.get('symbol_id')
    const interval  = searchParams.get('interval') ?? '1d'

    if (!symbolId) return NextResponse.json({ error: 'symbol_id required' }, { status: 400 })

    const db = createServiceClient()
    const { data, error } = await db
      .from('price_cache')
      .select('*')
      .eq('symbol_id', symbolId)
      .order('date', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const bars = data ?? []
    if (interval === '1d') return NextResponse.json({ bars })

    const aggregated = aggregateBars(bars, interval as '1wk' | '1mo')
    return NextResponse.json({ bars: aggregated })

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
      open: b.open, high: b.high, low: b.low, close: b.close,
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

type DayBar = { date: string; open: number; high: number; low: number; close: number; volume: number }

function aggregateBars(bars: DayBar[], interval: '1wk' | '1mo') {
  if (bars.length === 0) return []

  // バケットキー：実際の取引日ベースで週/月の最初の日を使う
  // （月曜固定にすると祝日・市場休場でギャップが生じるため）
  const getKey = (date: string) => {
    const d = new Date(date + 'T00:00:00Z')
    if (interval === '1wk') {
      // ISO週番号ベースのキー：YYYY-Www
      const thu = new Date(d)
      thu.setUTCDate(d.getUTCDate() + (4 - (d.getUTCDay() || 7)))
      const year = thu.getUTCFullYear()
      const week = Math.ceil(
        ((thu.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7
      )
      return `${year}-W${String(week).padStart(2, '0')}`
    } else {
      // YYYY-MM
      return date.substring(0, 7)
    }
  }

  // バケットに分類（キー → 日足配列）
  const buckets = new Map<string, DayBar[]>()
  for (const bar of bars) {
    const key = getKey(bar.date)
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(bar)
  }

  // 各バケットの最初の実取引日をdateとして使う（ギャップ防止）
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, group]) => ({
      date:   group[0].date,                               // ← 実際の最初の取引日
      open:   group[0].open,
      high:   Math.max(...group.map(b => b.high)),
      low:    Math.min(...group.map(b => b.low)),
      close:  group[group.length - 1].close,
      volume: group.reduce((s, b) => s + b.volume, 0),
    }))
}
