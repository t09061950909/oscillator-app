'use client'
import { useEffect, useState, use } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import type { PriceBar } from '@/types'
import TradingChart from '@/components/TradingChart'
import TsiParamBar, { type TsiParams } from '@/components/TsiParamBar'

interface Props {
  params: Promise<{ id: string }>
}

type Interval = '1d' | '1wk' | '1mo'
const INTERVALS: { value: Interval; label: string }[] = [
  { value: '1d',  label: '日足' },
  { value: '1wk', label: '週足' },
  { value: '1mo', label: '月足' },
]

const DEFAULT_TSI: TsiParams = { long: 12, short: 6, signal: 3 }

export default function ChartPage({ params }: Props) {
  const resolvedParams = use(params)
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()

  const symbolId = pathname.split('/').pop() ?? resolvedParams.id
  const ticker   = searchParams.get('ticker') ?? ''
  const name     = searchParams.get('name')   ?? ticker

  const [bars, setBars]             = useState<PriceBar[]>([])
  const [interval, setInterval]     = useState<Interval>('1d')
  const [tsiParams, setTsiParams]   = useState<TsiParams>(DEFAULT_TSI)
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError]           = useState('')

  useEffect(() => { if (symbolId) loadBars('1d') }, [symbolId])
  useEffect(() => { if (bars.length) loadBars(interval) }, [interval])

  async function loadBars(iv: Interval) {
    setLoading(true)
    setError('')
    try {
      const res  = await fetch(`/api/prices?symbol_id=${symbolId}&interval=${iv}`)
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      if (data.bars?.length) setBars(data.bars)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'fetch failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleRefresh() {
    setRefreshing(true)
    setError('')
    try {
      const res  = await fetch('/api/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol_id: symbolId, ticker }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      await loadBars(interval)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'refresh failed')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column' }}>
      {/* ── ヘッダー ── */}
      <header style={{
        background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)',
        padding: '0 16px', height: 52, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.back()}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>
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
              <button key={value} onClick={() => setInterval(value)}
                style={{
                  background: interval === value ? 'var(--accent-blue)' : 'none',
                  border: 'none', borderRadius: 4, padding: '4px 10px',
                  color: interval === value ? '#fff' : 'var(--text-secondary)',
                  cursor: 'pointer', fontSize: 12,
                  fontWeight: interval === value ? 600 : 400,
                  minWidth: 42, transition: 'background 0.12s',
                }}>
                {label}
              </button>
            ))}
          </div>

          <button onClick={handleRefresh} disabled={refreshing}
            style={{
              background: 'none', border: '1px solid var(--border)', borderRadius: 6,
              padding: '6px 12px', color: 'var(--text-secondary)',
              cursor: refreshing ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 5, fontSize: 12,
            }}>
            <RefreshCw size={12} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            {refreshing ? '取得中...' : 'データ更新'}
          </button>
        </div>
      </header>

      {/* ── TSIパラメータバー ── */}
      <TsiParamBar params={tsiParams} onChange={setTsiParams} />

      {/* ── チャートエリア ── */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {error && (
          <div style={{ padding: '10px 16px', background: 'rgba(248,81,73,0.1)', color: 'var(--accent-red)', fontSize: 13 }}>
            エラー: {error}
          </div>
        )}
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-muted)' }}>
            読み込み中...
          </div>
        ) : bars.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-muted)', gap: 12 }}>
            <p>価格データがありません</p>
            <button onClick={handleRefresh}
              style={{ background: 'var(--accent-blue)', border: 'none', borderRadius: 6, padding: '8px 20px', color: '#fff', cursor: 'pointer', fontSize: 13 }}>
              Yahoo Finance から取得する
            </button>
          </div>
        ) : (
          <TradingChart
            bars={bars}
            symbolId={symbolId}
            ticker={ticker}
            tsiParams={tsiParams}
          />
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
