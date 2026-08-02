'use client'

import { useState } from 'react'

/**
 * components/DecisionButtons.tsx
 *
 * 既存のBreakdownModal内に組み込む想定の、判断記録UI。
 * 「買った/見送った/様子見」を選ぶと /api/decisions に記録する。
 *
 * 【統合手順】
 * 1. このファイルを components/DecisionButtons.tsx として配置
 * 2. app/screener/page.tsx の BreakdownModal コンポーネント内、
 *    「閉じる」ボタンの直前あたりに以下を追加:
 *
 *      <DecisionButtons
 *        symbol={signal.symbol}
 *        market={signal.market}
 *        detectedAt={signal.detected_at}
 *        signalType={signal.signal_type}
 *        wasValidated={isValidatedSignal(signal)}
 *        priceAtDecision={signal.close_price}
 *      />
 *
 * 3. import { DecisionButtons } from '@/components/DecisionButtons' を追加
 */

interface DecisionButtonsProps {
  symbol: string
  market: string
  detectedAt: string
  signalType?: string
  wasValidated: boolean
  priceAtDecision?: number | null
}

const OPTIONS: { key: 'bought' | 'skipped' | 'watching'; label: string }[] = [
  { key: 'bought',   label: '買った' },
  { key: 'watching', label: '様子見' },
  { key: 'skipped',  label: '見送った' },
]

export function DecisionButtons({ symbol, market, detectedAt, signalType, wasValidated, priceAtDecision }: DecisionButtonsProps) {
  const [saved, setSaved]   = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  async function record(decision: 'bought' | 'skipped' | 'watching') {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/decisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol, market, detectedAt, signalType, wasValidated, priceAtDecision, decision,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      setSaved(decision)
    } catch (e) {
      setError(e instanceof Error ? e.message : '記録に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #21262d' }}>
      <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 8 }}>
        この候補、どうしましたか?(振り返り用に記録します)
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {OPTIONS.map(opt => (
          <button
            key={opt.key}
            onClick={() => record(opt.key)}
            disabled={saving}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 6, fontSize: 13, cursor: saving ? 'default' : 'pointer',
              border: saved === opt.key ? '1px solid #3fb950' : '1px solid #30363d',
              background: saved === opt.key ? 'rgba(63,185,80,0.15)' : '#161b22',
              color: saved === opt.key ? '#3fb950' : '#c9d1d9',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saved === opt.key ? '✓ ' : ''}{opt.label}
          </button>
        ))}
      </div>
      {error && <div style={{ marginTop: 6, fontSize: 12, color: '#f85149' }}>{error}</div>}
    </div>
  )
}
