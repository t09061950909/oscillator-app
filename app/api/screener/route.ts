import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)

    const market     = searchParams.get('market')
    const signalType = searchParams.get('signal_type')
    const maPair     = searchParams.get('ma_pair')
    const minRank    = searchParams.get('min_rank')
    const days       = parseInt(searchParams.get('days') ?? '365', 10)

    const db = createServiceClient()

    const since = new Date()
    since.setDate(since.getDate() - days)
    const sinceStr = since.toISOString().slice(0, 10)

    let query = db
      .from('gc_signals')
      .select('*')
      .gte('detected_at', sinceStr)
      // デフォルトは detected_at DESC, total_score DESC（フロントでソート）
      .order('detected_at', { ascending: false })
      .order('total_score',  { ascending: false })
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
      query = query.in('rank', rankOrder[minRank] ?? ['A', 'B', 'C', 'D'])
    }

    const { data: signals, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // symbols テーブルから ticker → { id, display_name } マップ
    // ※ gc_signals.symbol は "7203.T" 形式、symbols.ticker も同形式
    const symbolSet = [...new Set((signals ?? []).map(s => s.symbol))]
    const { data: symbolRows } = symbolSet.length > 0
      ? await db.from('symbols').select('id, ticker, display_name').in('ticker', symbolSet)
      : { data: [] }

    const symbolMap = Object.fromEntries(
      (symbolRows ?? []).map(r => [r.ticker, { id: r.id, name: r.display_name }])
    )

    const enriched = (signals ?? []).map(s => ({
      ...s,
      // gc_signals.name が空なら symbols.display_name で補完
      name:        s.name || symbolMap[s.symbol]?.name || null,
      // symbols に登録済みなら UUID、未登録なら null
      symbol_id:   symbolMap[s.symbol]?.id ?? null,
      // Yahoo Finance チャートURL（symbol_id がなくても使えるフォールバック）
      yahoo_url:   s.market === 'JP'
        ? `https://finance.yahoo.co.jp/quote/${s.symbol.replace('.T', '')}.T`
        : `https://finance.yahoo.com/quote/${s.symbol}`,
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
