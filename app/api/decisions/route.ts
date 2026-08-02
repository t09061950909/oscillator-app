import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * app/api/decisions/route.ts
 *
 * 「提示した候補 → 実際の判断 → その後の結果」を記録するAPI。
 * POST: 判断を記録する(買った/見送った/様子見)
 * GET:  記録一覧を取得する(振り返り画面用)
 */

interface DecisionPayload {
  symbol: string
  market: string
  detectedAt: string       // gc_signals.detected_at
  signalType?: string
  wasValidated: boolean
  decision: 'bought' | 'skipped' | 'watching'
  note?: string
  priceAtDecision?: number | null
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as DecisionPayload | null
  if (!body || !body.symbol || !body.market || !body.detectedAt || !body.decision) {
    return NextResponse.json({ error: 'symbol, market, detectedAt, decision は必須です' }, { status: 400 })
  }
  if (!['bought', 'skipped', 'watching'].includes(body.decision)) {
    return NextResponse.json({ error: "decision は 'bought' | 'skipped' | 'watching' のいずれかです" }, { status: 400 })
  }

  const db = createServiceClient()
  const { data, error } = await db
    .from('signal_decisions')
    .upsert(
      {
        symbol: body.symbol,
        market: body.market,
        detected_at: body.detectedAt,
        signal_type: body.signalType ?? null,
        was_validated: body.wasValidated,
        decision: body.decision,
        note: body.note ?? null,
        price_at_decision: body.priceAtDecision ?? null,
        decided_at: new Date().toISOString(),
      },
      { onConflict: 'symbol,market,detected_at' },
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ saved: true, decision: data })
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit = Number(searchParams.get('limit') ?? '100')
  const pendingOutcomeOnly = searchParams.get('pending_outcome') === 'true'

  const db = createServiceClient()
  let query = db
    .from('signal_decisions')
    .select('*')
    .order('decided_at', { ascending: false })
    .limit(Math.min(limit, 500))

  if (pendingOutcomeOnly) {
    query = query.is('outcome_checked_at', null)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ decisions: data ?? [] })
}
