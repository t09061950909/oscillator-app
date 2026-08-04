import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import yahooFinance from 'yahoo-finance2'

/**
 * app/api/decisions/update-outcomes/route.ts
 *
 * decided_atから約20営業日(28暦日を目安。土日・祝日を考慮した余裕を含む)
 * 経過し、まだ結果を記録していない判断について、現在の株価を取得して
 * リターンを計算・記録する。
 *
 * 認証: Vercel Cronの標準的な仕組みに合わせ、CRON_SECRET環境変数を使う。
 * Vercelは、この環境変数が設定されている場合、cron実行時に
 * "Authorization: Bearer $CRON_SECRET" ヘッダーを自動的に付与する
 * (2026年6月時点のVercel公式ドキュメントで確認)。手動での動作確認時は、
 * 同じ値を自分でヘッダーに指定すればよい。
 */

const LOOKBACK_DAYS_THRESHOLD = 28

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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
