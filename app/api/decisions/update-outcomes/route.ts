import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import yahooFinance from 'yahoo-finance2'

/**
 * app/api/decisions/update-outcomes/route.ts
 *
 * decided_atから約20営業日(28暦日を目安。土日・祝日を考慮した余裕を含む)
 * 経過し、まだ結果を記録していない判断について、現在の株価を取得して
 * リターンを計算・記録する。日次cron等で定期的に叩く想定
 * (vercel.jsonのcrons設定、または外部のスケジューラから呼び出す)。
 *
 * 認証: NOTIFY_SECRETを流用(専用シークレットを分けたい場合は要変更)。
 */

const LOOKBACK_DAYS_THRESHOLD = 28

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.NOTIFY_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()
  const cutoff = new Date(Date.now() - LOOKBACK_DAYS_THRESHOLD * 24 * 60 * 60 * 1000).toISOString()

  const { data: pending, error: fetchError } = await db
    .from('signal_decisions')
    .select('id, symbol, price_at_decision, decided_at')
    .is('outcome_checked_at', null)
    .lte('decided_at', cutoff)
    .not('price_at_decision', 'is', null)
    .limit(100)

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!pending || pending.length === 0) {
    return NextResponse.json({ updated: 0, message: '対象なし' })
  }

  let updated = 0
  const failures: { symbol: string; error: string }[] = []

  for (const row of pending) {
    try {
      const quote = await yahooFinance.quote(row.symbol, {}, { validateResult: false })
      const currentPrice = quote?.regularMarketPrice
      if (currentPrice == null || !row.price_at_decision) {
        failures.push({ symbol: row.symbol, error: '価格取得不可' })
        continue
      }
      const returnPct = (currentPrice - row.price_at_decision) / row.price_at_decision * 100

      const { error: updateError } = await db
        .from('signal_decisions')
        .update({
          price_after_20d: currentPrice,
          return_20d_pct: returnPct,
          outcome_checked_at: new Date().toISOString(),
        })
        .eq('id', row.id)

      if (updateError) {
        failures.push({ symbol: row.symbol, error: updateError.message })
      } else {
        updated++
      }
    } catch (e) {
      failures.push({ symbol: row.symbol, error: e instanceof Error ? e.message : String(e) })
    }
  }

  return NextResponse.json({ updated, failed: failures.length, failures })
}
