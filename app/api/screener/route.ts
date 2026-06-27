import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

type SortKey = 'detected_at' | 'total_score' | 'symbol' | 'hold_days' | 'rank'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)

    const market     = searchParams.get('market')
    const signalType = searchParams.get('signal_type')
    const maPair     = searchParams.get('ma_pair')
    const minRank    = searchParams.get('min_rank')
    const days       = parseInt(searchParams.get('days') ?? '365', 10)
    const sortKey    = (searchParams.get('sort')  ?? 'detected_at') as SortKey
    const sortDir    = searchParams.get('dir') === 'asc'

    const db = createServiceClient()

    const since = new Date()
    since.setDate(since.getDate() - days)
    const sinceStr = since.toISOString().slice(0, 10)

    let query = db
      .from('gc_signals')
      .select('*')
      .gte('detected_at', sinceStr)
      .limit(500)

    if (market)     query = query.eq('market',      market)
    if (signalType) query = query.eq('signal_type', signalType)
    if (maPair) {
      const [s, l] = maPair.split(',').map(Number)
      query = query.eq('ma_short', s).eq('ma_long', l)
    }
    if (minRank) {
      const rankOrder: Record<string, string[]> = {
        A: ['A'],
        B: ['A', 'B'],
        C: ['A', 'B', 'C'],
        D: ['A', 'B', 'C', 'D'],
      }
      const ranks = rankOrder[minRank] ?? ['A', 'B', 'C', 'D']
      query = query.in('rank', ranks)
    }

    // ソート：rank はA<B<C<D順（文字列ソートと一致するので直接使用可）
    query = query.order(sortKey, { ascending: sortDir })
    // 2次ソート
    if (sortKey !== 'detected_at') query = query.order('detected_at', { ascending: false })
    if (sortKey !== 'total_score') query = query.order('total_score',  { ascending: false })

    const { data: signals, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // symbols テーブルから ticker → { id, display_name } マップを構築
    const symbolSet = [...new Set((signals ?? []).map(s => s.symbol))]
    const { data: symbolRows } = await db
      .from('symbols')
      .select('id, ticker, display_name')
      .in('ticker', symbolSet)

    const symbolMap = Object.fromEntries(
      (symbolRows ?? []).map(r => [r.ticker, { id: r.id, name: r.display_name }])
    )

    // gc_signals の name フィールドを補完し、symbol_id を付加
    const enriched = (signals ?? []).map(s => ({
      ...s,
      name:      s.name || symbolMap[s.symbol]?.name || null,
      symbol_id: symbolMap[s.symbol]?.id ?? null,
    }))

    const { data: logData } = await db
      .from('screener_scan_logs')
      .select('scanned_at, total_tickers, signals_found, status')
      .eq('status', 'success')
      .order('scanned_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return NextResponse.json({ signals: enriched, lastScan: logData ?? null })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[GET /api/screener]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
