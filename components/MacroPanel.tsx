'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { MacroData } from '@/app/api/macro/route'

// ── CAPE設定 ──────────────────────────────────────────
const CAPE_CONFIG = {
  cheap:     { label: '割安', icon: '🟢', color: '#3fb950', score: '+1' },
  fair:      { label: '適正', icon: '🔵', color: '#58a6ff', score: '0'  },
  expensive: { label: '割高', icon: '🟡', color: '#d29922', score: '-1' },
  extreme:   { label: '極割高', icon: '🔴', color: '#f85149', score: '-2' },
} as const

// ── 金利設定 ──────────────────────────────────────────
const RATE_CONFIG = {
  cutting: { label: '利下げ中', icon: '↓', color: '#3fb950', score: '+1' },
  hold:    { label: '据え置き', icon: '→', color: '#8b949e', score: '0'  },
  hiking:  { label: '利上げ中', icon: '↑', color: '#f85149', score: '-1' },
} as const

// ── スコア表示 ────────────────────────────────────────
function ScoreBadge({ score }: { score: number }) {
  const color = score >= 1 ? '#3fb950' : score <= -1 ? '#f85149' : '#8b949e'
  const label = score >= 2 ? '強い買い' : score === 1 ? '買い寄り' : score === 0 ? '中立' : score === -1 ? '売り寄り' : '強い売り'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '4px 8px', borderRadius: 6,
      background: `${color}22`, border: `1px solid ${color}44`,
    }}>
      <span style={{ fontSize: 11, color, fontWeight: 700 }}>
        マクロスコア {score > 0 ? '+' : ''}{score}
      </span>
      <span style={{ fontSize: 10, color, opacity: 0.9 }}>{label}</span>
    </div>
  )
}

// ── 行アイテム ────────────────────────────────────────
function DataRow({
  label, value, sub, icon, color,
}: {
  label: string; value: string; sub?: string; icon: string; color: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0', borderBottom: '1px solid #21262d' }}>
      <span style={{ fontSize: 13 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: '#8b949e' }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: '#484f58', marginTop: 1 }}>{sub}</div>}
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, color, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </div>
  )
}

// ── メインコンポーネント ──────────────────────────────
interface MacroPanelProps {
  className?: string
  onMacroChange?: (data: MacroData) => void
}

export default function MacroPanel({ onMacroChange }: MacroPanelProps) {
  const [data, setData]           = useState<MacroData | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const fetchMacro = useCallback(async () => {
    try {
      const res = await fetch('/api/macro')
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.detail ?? `HTTP ${res.status}`)
      }
      const json: MacroData = await res.json()
      setData(json)
      setLastUpdated(new Date())
      setError(null)
      onMacroChange?.(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'マクロデータ取得失敗')
    } finally {
      setLoading(false)
    }
  }, [onMacroChange])

  useEffect(() => {
    fetchMacro()
    // 1時間ごとに自動更新（月次データなので十分）
    intervalRef.current = setInterval(fetchMacro, 60 * 60 * 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [fetchMacro])

  // ── ローディング ──
  if (loading) {
    return (
      <div style={{
        background: '#161b22', border: '1px solid #30363d',
        borderRadius: 8, padding: '10px 12px',
      }}>
        <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 6 }}>市場環境</div>
        {[1,2].map(i => (
          <div key={i} style={{ height: 14, background: '#21262d', borderRadius: 4, marginBottom: 6, opacity: 0.6 }} />
        ))}
      </div>
    )
  }

  // ── エラー ──
  if (error || !data) {
    return (
      <div style={{
        background: '#161b22', border: '1px solid #f8514944',
        borderRadius: 8, padding: '10px 12px',
      }}>
        <div style={{ fontSize: 11, color: '#f85149', marginBottom: 4 }}>市場環境</div>
        <div style={{ fontSize: 11, color: '#8b949e' }}>{error ?? 'データなし'}</div>
        <button
          onClick={fetchMacro}
          style={{
            marginTop: 6, fontSize: 11, color: '#58a6ff',
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          }}
        >
          再取得
        </button>
      </div>
    )
  }

  const capeCfg = CAPE_CONFIG[data.cape.status]
  const rateCfg = RATE_CONFIG[data.rate.direction]

  return (
    <div style={{
      background: '#161b22', border: '1px solid #30363d',
      borderRadius: 8, padding: '10px 12px',
    }}>
      {/* ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#8b949e', letterSpacing: '0.04em' }}>
          市場環境
        </span>
        <button
          onClick={fetchMacro}
          style={{ fontSize: 11, color: '#484f58', background: 'none', border: 'none', cursor: 'pointer' }}
          title="更新"
        >
          ↻
        </button>
      </div>

      {/* CAPE */}
      <DataRow
        label="CAPE（Shiller PER）"
        value={data.cape.value > 0 ? data.cape.value.toFixed(1) : '—'}
        sub={data.cape.updatedAt ? `更新: ${data.cape.updatedAt}` : undefined}
        icon={capeCfg.icon}
        color={capeCfg.color}
      />

      {/* 政策金利 */}
      <DataRow
        label="FF金利"
        value={data.rate.current > 0 ? `${data.rate.current.toFixed(2)}%` : '—'}
        sub={data.rate.updatedAt ? `3ヶ月前: ${data.rate.prev3m.toFixed(2)}%` : undefined}
        icon={rateCfg.icon}
        color={rateCfg.color}
      />

      {/* ステータス行 */}
      <div style={{ display: 'flex', gap: 6, marginTop: 6, marginBottom: 8 }}>
        <span style={{
          fontSize: 10, padding: '2px 6px', borderRadius: 4,
          background: `${capeCfg.color}22`, color: capeCfg.color, fontWeight: 600,
        }}>
          {capeCfg.label} {capeCfg.score}
        </span>
        <span style={{
          fontSize: 10, padding: '2px 6px', borderRadius: 4,
          background: `${rateCfg.color}22`, color: rateCfg.color, fontWeight: 600,
        }}>
          {rateCfg.label} {rateCfg.score}
        </span>
      </div>

      {/* 合計スコア */}
      <ScoreBadge score={data.score} />

      {/* 最終更新 */}
      {lastUpdated && (
        <div style={{ fontSize: 10, color: '#484f58', marginTop: 6 }}>
          取得: {lastUpdated.toLocaleTimeString('ja-JP')}
        </div>
      )}
    </div>
  )
}
