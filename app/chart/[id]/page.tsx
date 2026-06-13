'use client'
import { useEffect, useState, use } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import type { PriceBar, PriceRange } from '@/types'
import TradingChart from '@/components/TradingChart'

interface Props {
  params: Promise<{ id: string }>
}

const RANGES: PriceRange[] = ['1W', '1M', '3M', '6M', '1Y', 'ALL']

function filterByRange(bars: PriceBar[], range: PriceRange): PriceBar[] {
  if (range === 'ALL') return bars
  const now = new Date()
  const cutoff = new Date(now)
  if (range === '1W') cutoff.setDate(now.getDate() - 7)
  else if (range === '1M') cutoff.setMonth(now.getMonth() - 1)
  else if (range === '3M') cutoff.setMonth(now.getMonth() - 3)
  else if (range === '6M') cutoff.setMonth(now.getMonth() - 6)
  else if (range === '1Y') cutoff.setFullYear(now.getFullYear() - 1)
  const cutoffStr = cutoff.toISOString().split('T')[0]
  return bars.filter(b => b.date >= cutoffStr)
}

export default function ChartPage({ params }: Props) {
  const { id } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const ticker = searchParams.get('ticker') ?? ''
  const name = searchParams.get('name') ?? ticker

  const [allBars, setAllBars] = useState<PriceBar[]>([])
  const [range, setRange] = useState<PriceRange>('3M')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => { loadCached() }, [id])

  async function loadCached() {
    setLoading(true)
    try {
      const res = await fetch(`/api/prices?symbol_id=${id}`)
      const data = await res.json()
      if (data.bars?.length) {
        setAllBars(data.bars)
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleRefresh() {
    setRefreshing(true)
    try {
      const res = await fetch('/api/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol_id: id, ticker }),
      })
      const data = await res.json()
      if (data.bars?.length) setAllBars(data.bars)
    } finally {
      setRefreshing(false)
    }
  }

  const displayBars = filterByRange(allBars, range)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        padding: '0 16px',
        height: 52,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => router.back()}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{ticker}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Range buttons */}
          <div style={{ display: 'flex', gap: 2, background: 'var(--bg-primary)', borderRadius: 6, padding: 2 }}>
            {RANGES.map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                style={{
                  background: range === r ? 'var(--accent-blue)' : 'none',
                  border: 'none',
                  borderRadius: 4,
                  padding: '4px 8px',
                  color: range === r ? '#fff' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: range === r ? 600 : 400,
                }}
              >
                {r}
              </button>
            ))}
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '6px 12px',
              color: 'var(--text-secondary)',
              cursor: refreshing ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 12,
            }}
          >
            <RefreshCw size={12} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            {refreshing ? '取得中...' : 'データ更新'}
          </button>
        </div>
      </header>

      {/* Chart area */}
      <div style={{ flex: 1, padding: '0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-muted)' }}>
            読み込み中...
          </div>
        ) : displayBars.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-muted)', gap: 12 }}>
            <p>価格データがありません</p>
            <button
              onClick={handleRefresh}
              style={{
                background: 'var(--accent-blue)', border: 'none', borderRadius: 6,
                padding: '8px 20px', color: '#fff', cursor: 'pointer', fontSize: 13,
              }}
            >
              Yahoo Finance から取得する
            </button>
          </div>
        ) : (
          <TradingChart
            bars={displayBars}
            symbolId={id}
            ticker={ticker}
          />
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
