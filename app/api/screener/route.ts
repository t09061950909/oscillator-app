import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase }      from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)

    const market     = searchParams.get('market')      // 'JP' | 'US' | null
    const signalType = searchParams.get('signal_type') // 'GC' | 'DC' | null
    const maPair     = searchParams.get('ma_pair')     // '25,75' | '75,200' | null
    const minRank    = searchParams.get('min_rank')    // 'A' | 'B' | 'C' | 'D' | null
    const days       = parseInt(searchParams.get('days') ?? '30', 10) // 直近N日

    const db = await createServerSupabase()

    // 直近N日の日付下限
    const since = new Date()
    since.setDate(since.getDate() - days)
    const sinceStr = since.toISOString().slice(0, 10)

    let query = db
      .from('gc_signals')
      .select('*')
      .gte('detected_at', sinceStr)
      .order('detected_at', { ascending: false })
      .order('total_score',  { ascending: false })
      .limit(500)

    if (market)     query = query.eq('market',      market)
    if (signalType) query = query.eq('signal_type', signalType)
    if (maPair) {
      const [s, l] = maPair.split(',').map(Number)
      query = query.eq('ma_short', s).eq('ma_long', l)
    }
    // ランクフィルタ：A以上、B以上など
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

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // 最終スキャン日時を scan_logs から取得
    const { data: logData } = await db
      .from('screener_scan_logs')
      .select('scanned_at, total_tickers, signals_found, status')
      .eq('status', 'success')
      .order('scanned_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return NextResponse.json({
      signals:   data ?? [],
      lastScan:  logData ?? null,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[GET /api/screener]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
