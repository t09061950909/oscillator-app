import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// /api/screener/debug — gc_signals の件数と最新5件を返す（動作確認用）
export async function GET() {
  const db = createServiceClient()

  const { data: sample, error } = await db
    .from('gc_signals')
    .select('symbol, market, signal_type, detected_at, total_score, rank, ma_short, ma_long')
    .order('detected_at', { ascending: false })
    .limit(5)

  const { count } = await db
    .from('gc_signals')
    .select('*', { count: 'exact', head: true })

  return NextResponse.json({ count, sample, error: error?.message ?? null })
}
