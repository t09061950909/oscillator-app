'use client'
import { useEffect, useState, use } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import type { PriceBar } from '@/types'
import TradingChart from '@/components/TradingChart'

interface Props {
  params: Promise<{ id: string }>
}

type Interval = '1d' | '1wk' | '1mo'
const INTERVALS: { value: Interval; label: string }[] = [
  { value: '1d',  label: '日足' },
  { value: '1wk', label: '週足' },
  { value: '1mo', label: '月足' },
]

export default function ChartPage({ params }: Props) {
  const { id } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const ticker = searchParams.get('ticker') ?? ''
  const name   = searchParams.get('name')   ?? ticker

  const [bars, setBars]           = useState<PriceBar[]>([])
  const [interval, setInterval]   = useState<Interval>('1d')
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // 初回：DBキャッシュから日足を取得
  useEffect(() => { loadBars('1d') }, [id])

  // 足種切替：キャッシュ済みデータをサーバーで集計して返す
  useEffect(() => {
    if (!bars.length) return   // 初回ロード前はスキップ
    loadBars(interval)
  }, [interval])

  async function loadBars(iv: Interval) {
    setLoading(true)
    try {
      const res  = await fetch(`/api/prices?symbol_id=${id}&interval=${iv}`)
      const data = await res.json()
      if (data.bars?.length) setBars(data.bars)
    } finally {
      setLoading(false)
    }
  }

  async function handleRefresh() {
    setRefreshing(true)
    try {
      // Yahoo から最新日足をDB更新
      const res  = await fetch('/api/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol_id: id, ticker }),
      })
      const data = await res.json()
      if (data.error) { console.error(data.error); return }
      // 更新後に現在の足種で再取得
      await loadBars(interval)
    } finally {
      setRefreshing(false)
    }
  }

  function handleIntervalChange(iv: Interval) {
    setInterval(iv)
  }

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
          {/* 足種切替 */}
          <div style={{ display: 'flex', gap: 2, background: 'var(--bg-primary)', borderRadius: 6, padding: 2 }}>
            {INTERVALS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => handleIntervalChange(value)}
                style={{
                  background: interval === value ? 'var(--accent-blue)' : 'none',
                  border: 'none',
                  borderRadius: 4,
                  padding: '4px 10px',
                  color: interval === value ? '#fff' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: interval === value ? 600 : 400,
                  minWidth: 42,
                  transition: 'background 0.12s',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* データ更新ボタン */}
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
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-muted)' }}>
            読み込み中...
          </div>
        ) : bars.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-muted)', gap: 12 }}>
            <p>価格データがありません</p>
            <button
              onClick={handleRefresh}
              style={{ background: 'var(--accent-blue)', border: 'none', borderRadius: 6, padding: '8px 20px', color: '#fff', cursor: 'pointer', fontSize: 13 }}
            >
              Yahoo Finance から取得する
            </button>
          </div>
        ) : (
          <TradingChart bars={bars} symbolId={id} ticker={ticker} />
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
