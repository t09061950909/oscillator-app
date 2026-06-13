'use client'
import { useState } from 'react'
import { X, Plus } from 'lucide-react'
import type { Symbol } from '@/types'

interface Props {
  onClose: () => void
  onAdded: (symbol: Symbol) => void
}

const EXAMPLES = [
  { ticker: 'AAPL', label: 'Apple' },
  { ticker: 'QQQ', label: 'QQQ ETF' },
  { ticker: '^SOX*USDJPY', label: 'SOX（円換算）' },
  { ticker: 'SPY*USDJPY', label: 'SPY（円換算）' },
  { ticker: '9984.T', label: 'ソフトバンクG' },
]

export default function AddSymbolModal({ onClose, onAdded }: Props) {
  const [ticker, setTicker] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (!ticker.trim()) { setError('ティッカーを入力してください'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/symbols', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: ticker.trim().toUpperCase(), display_name: displayName.trim() || ticker.trim().toUpperCase() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'エラーが発生しました'); return }
      onAdded(data.symbol)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
    }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 28,
          width: 440,
          maxWidth: '90vw',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>銘柄を追加</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
            ティッカーコード <span style={{ color: 'var(--accent-red)' }}>*</span>
          </label>
          <input
            value={ticker}
            onChange={e => setTicker(e.target.value)}
            placeholder="例: AAPL / ^SOX*USDJPY / 9984.T"
            style={{
              width: '100%',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '9px 12px',
              color: 'var(--text-primary)',
              fontSize: 14,
              fontFamily: 'monospace',
              outline: 'none',
            }}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            為替換算: ティッカー*為替コード（例: SOX*USDJPY）
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
            表示名（省略可）
          </label>
          <input
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="例: SOX半導体指数"
            style={{
              width: '100%',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '9px 12px',
              color: 'var(--text-primary)',
              fontSize: 14,
              outline: 'none',
            }}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          />
        </div>

        {/* Quick examples */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>クイック入力</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {EXAMPLES.map(ex => (
              <button
                key={ex.ticker}
                onClick={() => { setTicker(ex.ticker); setDisplayName(ex.label) }}
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  padding: '4px 10px',
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                }}
              >
                {ex.ticker}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div style={{ color: 'var(--accent-red)', fontSize: 13, marginBottom: 14, padding: '8px 12px', background: 'rgba(248,81,73,0.1)', borderRadius: 6 }}>
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: '100%',
            background: 'var(--accent-blue)',
            border: 'none',
            borderRadius: 6,
            padding: '10px 0',
            color: '#fff',
            fontWeight: 600,
            fontSize: 14,
            cursor: loading ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <Plus size={15} /> {loading ? '登録中...' : '登録する'}
        </button>
      </div>
    </div>
  )
}
