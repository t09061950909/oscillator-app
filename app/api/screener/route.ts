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
      .order('hold_days',   { ascending: true })   // GC発生が新しい順（hold_days小＝最近）
      .order('total_score', { ascending: false })
      .limit(500)

    if (market)     query = query.eq('market',      market)
    if (signalType) query = query.eq('signal_type', signalType)
    if (maPair) {
      const [s, l] = maPair.split(',').map(Number)
      query = query.eq('ma_short', s).eq('ma_long', l)
    }
    if (minRank) {
      const rankOrder: Record<string, string[]> = {
        A: ['A'], B: ['A','B'], C: ['A','B','C'], D: ['A','B','C','D'],
      }
      query = query.in('rank', rankOrder[minRank] ?? ['A','B','C','D'])
    }

    const { data: signals, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // ── 銘柄名を screener_price_cache から取得 ──────────────────
    // 各 symbol の最古レコードに name が入っている
    const symbolSet = [...new Set((signals ?? []).map(s => s.symbol))]

    let nameMap: Record<string, string> = {}
    if (symbolSet.length > 0) {
      // symbol ごとに1件だけ取得（name が入っているレコード）
      const { data: cacheRows } = await (db as any)
        .from('screener_price_cache')
        .select('symbol, name')
        .in('symbol', symbolSet)
        .not('name', 'is', null)
        .not('name', 'eq', '')
        .order('date', { ascending: true })   // 最古レコードから取得
        .limit(symbolSet.length * 2)           // 1銘柄1件想定だが余裕を持たせる

      // symbol → name（最初に見つかったものを使用）
      for (const row of (cacheRows ?? []) as { symbol: string; name: string }[]) {
        if (!nameMap[row.symbol]) nameMap[row.symbol] = row.name
      }
    }

    // symbols テーブルでも補完（監視リスト登録済み銘柄の id も取得）
    const { data: symbolRows } = symbolSet.length > 0
      ? await db.from('symbols').select('id, ticker, display_name').in('ticker', symbolSet)
      : { data: [] }

    const symbolIdMap = Object.fromEntries(
      (symbolRows ?? []).map(r => [r.ticker, { id: r.id, name: r.display_name }])
    )

    const enriched = (signals ?? []).map(s => ({
      ...s,
      name: s.name                          // gc_signals.name（scan後は入る）
         || nameMap[s.symbol]               // screener_price_cache.name
         || symbolIdMap[s.symbol]?.name     // symbols.display_name（監視登録済み）
         || null,
      symbol_id: symbolIdMap[s.symbol]?.id ?? null,
      yahoo_url: s.market === 'JP'
        ? `https://finance.yahoo.co.jp/quote/${s.symbol}`
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
