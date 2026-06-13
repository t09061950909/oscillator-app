'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Trash2, TrendingUp } from 'lucide-react'
import type { Symbol } from '@/types'

interface Props {
  symbol: Symbol
  onDelete: (id: string) => void
}

export default function SymbolCard({ symbol, onDelete }: Props) {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)
  const [lastPrice, setLastPrice] = useState<number | null>(null)

  async function handleRefresh(e: React.MouseEvent) {
    e.stopPropagation()
    setRefreshing(true)
    try {
      const res = await fetch('/api/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol_id: symbol.id, ticker: symbol.ticker }),
      })
      const data = await res.json()
      if (data.bars?.length) {
        setLastPrice(data.bars[data.bars.length - 1].close)
      }
    } finally {
      setRefreshing(false)
    }
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm(`「${symbol.display_name}」を削除しますか？`)) return
    onDelete(symbol.id)
  }

  function handleClick() {
    router.push(`/chart/${symbol.id}?ticker=${encodeURIComponent(symbol.ticker)}&name=${encodeURIComponent(symbol.display_name)}`)
  }

  return (
    <div
      onClick={handleClick}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '16px',
        cursor: 'pointer',
        transition: 'border-color 0.15s, background 0.15s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent-blue)'
        ;(e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'
        ;(e.currentTarget as HTMLDivElement).style.background = 'var(--bg-card)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 4 }}>
            {symbol.display_name}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
            {symbol.ticker}
          </div>
          {symbol.fx_ticker && (
            <div style={{ fontSize: 11, color: 'var(--accent-amber)', marginTop: 4 }}>
              FX換算: {symbol.fx_ticker}
            </div>
          )}
        </div>
        <TrendingUp size={18} color="var(--accent-blue)" style={{ opacity: 0.6 }} />
      </div>

      {lastPrice && (
        <div style={{ marginTop: 12, fontSize: 18, fontWeight: 700, color: 'var(--accent-green)' }}>
          {lastPrice.toLocaleString()}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            flex: 1,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '6px 0',
            color: 'var(--text-secondary)',
            cursor: refreshing ? 'wait' : 'pointer',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
          }}
        >
          <RefreshCw size={12} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          {refreshing ? '取得中...' : '更新'}
        </button>
        <button
          onClick={handleDelete}
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '6px 10px',
            color: 'var(--accent-red)',
            cursor: 'pointer',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Trash2 size={12} />
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
