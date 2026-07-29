import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * app/api/notify/route.ts
 *
 * scan.ts完了後に呼ばれ、当日検出分のgc_signalsをLINE Messaging APIで
 * ブロードキャスト配信する。個人利用前提で、特定のuserIdを取得する手間を
 * 省くためbroadcast(LINE公式アカウントの友だち全員に配信)を使っている。
 * 複数人で使う場合はpush(特定userId宛)に変更すること。
 *
 * 【文言の方針】(repositioning-design.mdより)
 * 「シグナル発生」「買い時」のような断定的な言い方を避け、
 * 「候補が見つかりました、確認してください」のトーンに統一する。
 * 検証済み(bear限定rs_ratio_20)とそれ以外は明確に区別して表示する。
 *
 * 環境変数:
 *   LINE_CHANNEL_ACCESS_TOKEN — LINE Developersコンソールで発行
 *   NOTIFY_SECRET             — scan.ts側と共有する簡易認証シークレット
 *   APP_URL                   — 通知文中に載せるアプリのURL(例: https://xxx.vercel.app)
 */

const LINE_BROADCAST_URL = 'https://api.line.me/v2/bot/message/broadcast'

interface GcSignalForNotify {
  symbol: string
  market: string
  signal_type: string
  regime: string | null
  bear_score_v2: number | null
  rank_bear_v2: number | null
}

function isValidated(s: GcSignalForNotify): boolean {
  return s.regime === 'bear' && s.bear_score_v2 != null
}

function buildMessageText(signals: GcSignalForNotify[], appUrl: string | undefined): string {
  const validated = signals.filter(isValidated)
  const others = signals.filter(s => !isValidated(s))

  const lines: string[] = []
  lines.push(`本日の候補: 検証済み${validated.length}件、参考情報${others.length}件`)
  lines.push('')

  if (validated.length > 0) {
    lines.push('✓ 検証済み候補(bearレジーム・相対強度が低い銘柄)')
    for (const s of validated.slice(0, 10)) {
      lines.push(`  ${s.symbol}(${s.market}) 相対強度ランク${s.rank_bear_v2 ?? '—'}位`)
    }
    if (validated.length > 10) lines.push(`  ...他${validated.length - 10}件`)
    lines.push('')
  }

  if (others.length > 0) {
    lines.push('参考情報(GC/DC検出のみ。検証済みではありません)')
    for (const s of others.slice(0, 5)) {
      lines.push(`  ${s.symbol}(${s.market}) ${s.signal_type}`)
    }
    if (others.length > 5) lines.push(`  ...他${others.length - 5}件`)
    lines.push('')
  }

  if (appUrl) lines.push(`詳細はアプリでご確認ください: ${appUrl}/screener`)
  lines.push('')
  lines.push('※ これは投資助言ではなく、判断材料の提示です。')

  return lines.join('\n')
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.NOTIFY_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!channelAccessToken) {
    return NextResponse.json({ error: 'LINE_CHANNEL_ACCESS_TOKEN is not set' }, { status: 500 })
  }

  const db = createServiceClient()

  // 直近のdetected_atを基準日とする
  const { data: latestRow, error: latestError } = await db
    .from('gc_signals')
    .select('detected_at')
    .order('detected_at', { ascending: false })
    .limit(1)
  if (latestError) return NextResponse.json({ error: latestError.message }, { status: 500 })

  const latestDate = latestRow?.[0]?.detected_at
  if (!latestDate) {
    return NextResponse.json({ skipped: true, reason: 'no signals found' })
  }

  const { data: signals, error: signalsError } = await db
    .from('gc_signals')
    .select('symbol, market, signal_type, regime, bear_score_v2, rank_bear_v2')
    .eq('detected_at', latestDate)
  if (signalsError) return NextResponse.json({ error: signalsError.message }, { status: 500 })

  if (!signals || signals.length === 0) {
    return NextResponse.json({ skipped: true, reason: 'no signals for latest date' })
  }

  const text = buildMessageText(signals as GcSignalForNotify[], process.env.APP_URL)

  const res = await fetch(LINE_BROADCAST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify({
      messages: [{ type: 'text', text }],
    }),
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    return NextResponse.json({ error: `LINE broadcast failed: ${res.status} ${errBody}` }, { status: 502 })
  }

  return NextResponse.json({ sent: true, date: latestDate, count: signals.length })
}
