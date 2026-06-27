'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  TrendingUp, TrendingDown, RefreshCw, ChevronRight,
  ArrowLeft, Info, BarChart2, Clock,
} from 'lucide-react'
import { createBrowserSupabase } from '@/lib/supabase'

// ── 型 ─────────────────────────────────────────────────────────
interface GcSignal {
  id:             string
  symbol:         string
  market:         'JP' | 'US'
  name:           string | null
  detected_at:    string
  signal_type:    'GC' | 'DC'
  ma_short:       number
  ma_long:        number
  hold_days:      number
  total_score:    number
  rank:           'A' | 'B' | 'C' | 'D'
  score_slope:    number
  score_volume:   number
  score_rsi:      number
  score_hold:     number
  score_deviation:number
  score_macd:     number
  score_weekly:   number
  close_price:    number | null
  volume_ratio:   number | null
  rsi_value:      number | null
  deviation_pct:  number | null
  ma_short_value: number | null
  ma_long_value:  number | null
}

interface ScanLog {
  scanned_at:     string
  total_tickers:  number | null
  signals_found:  number | null
  status:         string
}

type Market     = 'ALL' | 'JP' | 'US'
type SignalType = 'ALL' | 'GC' | 'DC'
type MaPair     = 'ALL' | '25,75' | '75,200'
type MinRank    = 'ALL' | 'A' | 'B' | 'C' | 'D'

// ── ランク別スタイル ─────────────────────────────────────────────
const RANK_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  A: { bg: 'rgba(63,185,80,0.15)',  color: '#3fb950', label: '高信頼' },
  B: { bg: 'rgba(56,139,253,0.15)', color: '#388bfd', label: '中信頼' },
  C: { bg: 'rgba(210,153,34,0.15)', color: '#d29922', label: '低信頼' },
  D: { bg: 'rgba(248,81,73,0.15)',  color: '#f85149', label: '様子見' },
}

// ── ユーティリティ ──────────────────────────────────────────────
function holdDaysLabel(days: number): string {
  if (days === 0) return '今日'
  if (days === 1) return '1日前'
  return `${days}日前`
}

function holdDaysColor(days: number): string {
  if (days === 0) return '#3fb950'
  if (days <= 3)  return '#d29922'
  return '#8b949e'
}

function formatDate(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, '/')
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

// ── スコア内訳モーダル ──────────────────────────────────────────
function BreakdownModal({ signal, onClose }: { signal: GcSignal; onClose: () => void }) {
  const rank = RANK_STYLE[signal.rank]
  const items = [
    { label: 'MAの傾き',     score: signal.score_slope,     max: 20,  desc: '短期MA直近5日の変化率' },
    { label: '出来高比率',   score: signal.score_volume,    max: 20,  desc: '当日 / 10日平均出来高' },
    { label: 'RSI水準',      score: signal.score_rsi,       max: 15,  desc: 'RSI(14)が50〜70が理想' },
    { label: 'GC維持日数',   score: signal.score_hold,      max: 25,  desc: 'クロス後の維持ボーナス' },
    { label: '価格乖離率',   score: signal.score_deviation, max: 10,  desc: '長期MAからの乖離幅' },
    { label: 'MACD方向',     score: signal.score_macd,      max: 15,  desc: 'MACDヒストグラム状態' },
    { label: '週足トレンド', score: signal.score_weekly,    max: 15,  desc: '週足SMA5 vs SMA20' },
  ]
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 200, padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#1c2128', border: '1px solid #30363d', borderRadius: 12,
          padding: 24, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        {/* ヘッダー */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 20, fontWeight: 700 }}>{signal.symbol}</span>
              <span style={{
                background: signal.signal_type === 'GC' ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)',
                color: signal.signal_type === 'GC' ? '#3fb950' : '#f85149',
                padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 700,
              }}>{signal.signal_type}</span>
              <span style={{
                background: rank.bg, color: rank.color,
                padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 700,
              }}>ランク{signal.rank}</span>
            </div>
            <div style={{ fontSize: 13, color: '#8b949e' }}>
              MA{signal.ma_short}/{signal.ma_long} ・ 発生: {formatDate(signal.detected_at)} ({holdDaysLabel(signal.hold_days)})
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: rank.color }}>{signal.total_score}</div>
            <div style={{ fontSize: 11, color: '#8b949e' }}>/ 100点</div>
          </div>
        </div>

        {/* 参考値 */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: 8, marginBottom: 20,
        }}>
          {[
            { label: '終値', value: signal.close_price != null ? signal.close_price.toLocaleString() : '-' },
            { label: 'RSI(14)', value: signal.rsi_value != null ? signal.rsi_value.toFixed(1) : '-' },
            { label: '出来高比率', value: signal.volume_ratio != null ? signal.volume_ratio.toFixed(2) + 'x' : '-' },
            { label: '長期MA乖離', value: signal.deviation_pct != null ? signal.deviation_pct.toFixed(1) + '%' : '-' },
          ].map(item => (
            <div key={item.label} style={{
              background: '#161b22', border: '1px solid #30363d',
              borderRadius: 8, padding: '10px 14px',
            }}>
              <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 2 }}>{item.label}</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{item.value}</div>
            </div>
          ))}
        </div>

        {/* スコア内訳 */}
        <div style={{ marginBottom: 4, fontSize: 12, color: '#8b949e', fontWeight: 600, letterSpacing: '0.05em' }}>
          スコア内訳
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(item => {
            const isPositive = item.score > 0
            const isNegative = item.score < 0
            const barColor = isPositive ? '#3fb950' : isNegative ? '#f85149' : '#30363d'
            const barPct = Math.abs(item.score) / item.max * 100
            return (
              <div key={item.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{item.label}</span>
                    <span style={{ fontSize: 11, color: '#484f58', marginLeft: 6 }}>{item.desc}</span>
                  </div>
                  <span style={{
                    fontSize: 13, fontWeight: 700,
                    color: isPositive ? '#3fb950' : isNegative ? '#f85149' : '#8b949e',
                  }}>
                    {isPositive ? '+' : ''}{item.score}
                  </span>
                </div>
                <div style={{ height: 4, background: '#21262d', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${Math.min(100, barPct)}%`,
                    background: barColor, borderRadius: 2,
                    transition: 'width 0.3s ease',
                  }} />
                </div>
              </div>
            )
          })}
        </div>

        {/* 判断指針 */}
        <div style={{
          marginTop: 20, padding: 12,
          background: rank.bg, border: `1px solid ${rank.color}33`,
          borderRadius: 8, fontSize: 13, color: rank.color,
        }}>
          {signal.rank === 'A' && '✅ 高信頼シグナル。積極的に検討可。'}
          {signal.rank === 'B' && '🔍 中信頼。週足チャートを確認してから判断を。'}
          {signal.rank === 'C' && '⚠️ 低信頼。参考程度に留め、追加確認を推奨。'}
          {signal.rank === 'D' && '🚫 騙しリスク高。様子見を推奨。'}
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop: 16, width: '100%', padding: '10px',
            background: 'none', border: '1px solid #30363d',
            borderRadius: 8, color: '#8b949e', cursor: 'pointer', fontSize: 14,
          }}
        >閉じる</button>
      </div>
    </div>
  )
}

// ── シグナル行 ──────────────────────────────────────────────────
function SignalRow({
  signal, onDetail, onChart,
}: {
  signal: GcSignal
  onDetail: (s: GcSignal) => void
  onChart:  (s: GcSignal) => void
}) {
  const rank = RANK_STYLE[signal.rank]
  const isGC = signal.signal_type === 'GC'

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 52px 56px 80px 64px 1fr',
      alignItems: 'center',
      gap: 8,
      padding: '10px 16px',
      borderBottom: '1px solid #21262d',
      transition: 'background 0.1s',
    }}
    onMouseEnter={e => (e.currentTarget.style.background = '#21262d')}
    onMouseLeave={e => (e.currentTarget.style.background = '')}
    >
      {/* 銘柄 */}
      <div>
        <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.2px' }}>{signal.symbol}</div>
        {signal.name && (
          <div style={{ fontSize: 11, color: '#8b949e', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {signal.name}
          </div>
        )}
      </div>

      {/* 市場 */}
      <div style={{ fontSize: 11, color: '#8b949e' }}>
        <span style={{
          background: '#21262d', border: '1px solid #30363d',
          padding: '2px 6px', borderRadius: 4, fontSize: 11,
        }}>{signal.market}</span>
      </div>

      {/* GC/DC */}
      <div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          background: isGC ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)',
          color: isGC ? '#3fb950' : '#f85149',
          padding: '3px 8px', borderRadius: 4, fontSize: 12, fontWeight: 700,
        }}>
          {isGC ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {signal.signal_type}
        </span>
        <div style={{ fontSize: 10, color: '#484f58', marginTop: 2 }}>
          {signal.ma_short}/{signal.ma_long}
        </div>
      </div>

      {/* スコア */}
      <div style={{ textAlign: 'center' }}>
        <span style={{
          display: 'inline-block',
          background: rank.bg, color: rank.color,
          padding: '3px 10px', borderRadius: 6,
          fontSize: 13, fontWeight: 800, letterSpacing: '-0.3px',
        }}>
          {signal.rank}{signal.total_score}
        </span>
      </div>

      {/* 発生日 */}
      <div style={{ textAlign: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: holdDaysColor(signal.hold_days) }}>
          {holdDaysLabel(signal.hold_days)}
        </span>
        <div style={{ fontSize: 10, color: '#484f58', marginTop: 1 }}>
          {formatDate(signal.detected_at)}
        </div>
      </div>

      {/* アクション */}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button
          onClick={() => onDetail(signal)}
          title="スコア詳細"
          style={{
            background: 'none', border: '1px solid #30363d',
            borderRadius: 6, padding: '4px 8px',
            color: '#8b949e', cursor: 'pointer', fontSize: 12,
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <Info size={12} /> 詳細
        </button>
        <button
          onClick={() => onChart(signal)}
          title="チャートを確認"
          style={{
            background: 'var(--accent-blue)', border: 'none',
            borderRadius: 6, padding: '4px 10px',
            color: '#fff', cursor: 'pointer', fontSize: 12,
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <BarChart2 size={12} /> チャート
          <ChevronRight size={11} />
        </button>
      </div>
    </div>
  )
}

// ── フィルタバー ────────────────────────────────────────────────
function FilterBar<T extends string>({
  options, value, onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            background: value === opt.value ? 'var(--accent-blue)' : 'none',
            border: `1px solid ${value === opt.value ? 'var(--accent-blue)' : '#30363d'}`,
            borderRadius: 6, padding: '5px 12px',
            color: value === opt.value ? '#fff' : '#8b949e',
            cursor: 'pointer', fontSize: 13, fontWeight: value === opt.value ? 600 : 400,
            transition: 'all 0.15s',
          }}
        >{opt.label}</button>
      ))}
    </div>
  )
}

// ── メインページ ────────────────────────────────────────────────
export default function ScreenerPage() {
  const router = useRouter()

  const [signals,    setSignals]    = useState<GcSignal[]>([])
  const [lastScan,   setLastScan]   = useState<ScanLog | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')
  const [detail,     setDetail]     = useState<GcSignal | null>(null)

  // フィルタ状態
  const [market,     setMarket]     = useState<Market>('ALL')
  const [signalType, setSignalType] = useState<SignalType>('ALL')
  const [maPair,     setMaPair]     = useState<MaPair>('ALL')
  const [minRank,    setMinRank]    = useState<MinRank>('ALL')

  // 認証チェック
  useEffect(() => {
    const supabase = createBrowserSupabase()
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.push('/login')
    })
  }, [router])

  const loadSignals = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (market     !== 'ALL') params.set('market',      market)
      if (signalType !== 'ALL') params.set('signal_type', signalType)
      if (maPair     !== 'ALL') params.set('ma_pair',     maPair)
      if (minRank    !== 'ALL') params.set('min_rank',    minRank)
      params.set('days', '30')

      const res = await fetch(`/api/screener?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setSignals(data.signals ?? [])
      setLastScan(data.lastScan ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [market, signalType, maPair, minRank])

  useEffect(() => { loadSignals() }, [loadSignals])

  function handleChart(signal: GcSignal) {
    // symbols テーブルにある銘柄ならチャートへ（ticker から id を引けないため symbol ベース）
    // JP 銘柄は 4桁コード.T → base_ticker 変換が必要なので query param で渡す
    router.push(`/?highlight=${encodeURIComponent(signal.symbol)}`)
  }

  // ランク集計
  const rankCounts = signals.reduce<Record<string, number>>((acc, s) => {
    acc[s.rank] = (acc[s.rank] ?? 0) + 1
    return acc
  }, {})

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>

      {/* ヘッダー */}
      <header style={{
        background: '#161b22', borderBottom: '1px solid #30363d',
        padding: '0 24px', height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => router.push('/')}
            style={{
              background: 'none', border: 'none', color: '#8b949e',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 8px', borderRadius: 6,
            }}
          >
            <ArrowLeft size={16} />
          </button>
          <TrendingUp size={18} color="#3fb950" />
          <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.3px' }}>
            GC/DC スクリーナー
          </span>
          {lastScan && (
            <span style={{ fontSize: 12, color: '#484f58', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={11} />
              最終スキャン: {formatDateTime(lastScan.scanned_at)}
            </span>
          )}
        </div>
        <button
          onClick={loadSignals}
          disabled={loading}
          style={{
            background: 'none', border: '1px solid #30363d',
            borderRadius: 6, padding: '6px 14px',
            color: '#8b949e', cursor: loading ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
            opacity: loading ? 0.6 : 1,
          }}
        >
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          更新
        </button>
      </header>

      {/* メイン */}
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>

        {/* ランクサマリー */}
        {!loading && signals.length > 0 && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
            {(['A', 'B', 'C', 'D'] as const).map(r => {
              const st = RANK_STYLE[r]
              const n  = rankCounts[r] ?? 0
              return (
                <div
                  key={r}
                  onClick={() => setMinRank(minRank === r ? 'ALL' : r)}
                  style={{
                    background: minRank === r ? st.bg : '#1c2128',
                    border: `1px solid ${minRank === r ? st.color : '#30363d'}`,
                    borderRadius: 8, padding: '10px 16px', cursor: 'pointer',
                    minWidth: 90, textAlign: 'center', transition: 'all 0.15s',
                  }}
                >
                  <div style={{ fontSize: 18, fontWeight: 800, color: st.color }}>
                    {n}
                  </div>
                  <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>
                    ランク{r}　{st.label}
                  </div>
                </div>
              )
            })}
            <div style={{
              background: '#1c2128', border: '1px solid #30363d',
              borderRadius: 8, padding: '10px 16px', minWidth: 90, textAlign: 'center',
            }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{signals.length}</div>
              <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>合計</div>
            </div>
          </div>
        )}

        {/* フィルタ */}
        <div style={{
          background: '#1c2128', border: '1px solid #30363d',
          borderRadius: 10, padding: '14px 16px',
          marginBottom: 16,
          display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
        }}>
          <FilterBar<Market>
            options={[
              { value: 'ALL', label: '🌏 全市場' },
              { value: 'JP',  label: '🇯🇵 JP' },
              { value: 'US',  label: '🇺🇸 US' },
            ]}
            value={market}
            onChange={setMarket}
          />
          <div style={{ width: 1, height: 24, background: '#30363d' }} />
          <FilterBar<SignalType>
            options={[
              { value: 'ALL', label: 'GC & DC' },
              { value: 'GC',  label: '↗ GC' },
              { value: 'DC',  label: '↘ DC' },
            ]}
            value={signalType}
            onChange={setSignalType}
          />
          <div style={{ width: 1, height: 24, background: '#30363d' }} />
          <FilterBar<MaPair>
            options={[
              { value: 'ALL',    label: '全MAペア' },
              { value: '25,75',  label: '5/25' },
              { value: '75,200', label: '75/200' },
            ]}
            value={maPair}
            onChange={setMaPair}
          />
          <div style={{ width: 1, height: 24, background: '#30363d' }} />
          <FilterBar<MinRank>
            options={[
              { value: 'ALL', label: 'ランク全て' },
              { value: 'A',   label: 'A以上' },
              { value: 'B',   label: 'B以上' },
              { value: 'C',   label: 'C以上' },
            ]}
            value={minRank}
            onChange={setMinRank}
          />
        </div>

        {/* テーブル */}
        <div style={{ background: '#1c2128', border: '1px solid #30363d', borderRadius: 10, overflow: 'hidden' }}>

          {/* テーブルヘッダー */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 52px 56px 80px 64px 1fr',
            gap: 8,
            padding: '8px 16px',
            background: '#161b22',
            borderBottom: '1px solid #30363d',
            fontSize: 11, fontWeight: 600, color: '#8b949e',
            letterSpacing: '0.05em',
          }}>
            <div>銘柄</div>
            <div>市場</div>
            <div>シグナル</div>
            <div style={{ textAlign: 'center' }}>スコア</div>
            <div style={{ textAlign: 'center' }}>発生</div>
            <div style={{ textAlign: 'right' }}>アクション</div>
          </div>

          {/* ローディング */}
          {loading && (
            <div style={{ padding: 48, textAlign: 'center', color: '#8b949e' }}>
              <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
              <div style={{ fontSize: 14 }}>スキャン結果を読み込み中...</div>
            </div>
          )}

          {/* エラー */}
          {!loading && error && (
            <div style={{ padding: 32, textAlign: 'center', color: '#f85149' }}>
              <div style={{ fontSize: 14 }}>エラー: {error}</div>
              <button
                onClick={loadSignals}
                style={{ marginTop: 12, background: 'none', border: '1px solid #f85149', color: '#f85149', borderRadius: 6, padding: '6px 16px', cursor: 'pointer' }}
              >再試行</button>
            </div>
          )}

          {/* 空 */}
          {!loading && !error && signals.length === 0 && (
            <div style={{ padding: 64, textAlign: 'center', color: '#8b949e' }}>
              <TrendingUp size={32} style={{ marginBottom: 16, opacity: 0.3 }} />
              <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>
                シグナルが見つかりません
              </div>
              <div style={{ fontSize: 13, color: '#484f58' }}>
                フィルタを変更するか、GitHub Actions のスキャンが完了するのをお待ちください。
              </div>
            </div>
          )}

          {/* シグナル行 */}
          {!loading && !error && signals.map(signal => (
            <SignalRow
              key={signal.id}
              signal={signal}
              onDetail={setDetail}
              onChart={handleChart}
            />
          ))}
        </div>

        {/* フッター補足 */}
        {!loading && signals.length > 0 && lastScan && (
          <div style={{ marginTop: 12, fontSize: 12, color: '#484f58', textAlign: 'center' }}>
            直近30日間のシグナルを表示 ・
            スキャン対象: {lastScan.total_tickers?.toLocaleString() ?? '—'} 銘柄 ・
            検出数: {lastScan.signals_found?.toLocaleString() ?? '—'} シグナル
          </div>
        )}
      </main>

      {/* スコア内訳モーダル */}
      {detail && <BreakdownModal signal={detail} onClose={() => setDetail(null)} />}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 600px) {
          .signal-grid { grid-template-columns: 1fr 1fr; }
        }
      `}</style>
    </div>
  )
}
