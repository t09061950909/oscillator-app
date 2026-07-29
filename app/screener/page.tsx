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
  symbol_id:      string | null
  yahoo_url:      string | null   // チャートフォールバック用
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
  // 生の付加値(合算前)
  slope_pct:      number | null
  macd_histogram: number | null
  weekly_state:   'above' | 'below' | 'flat' | null
  // factor_scoresとの連携(bear限定rs_ratio_20。oscillator-research Step③④で検証済み)
  regime:         string | null
  bear_score_v2:  number | null
  rank_bear_v2:   number | null
}

/** regime='bear'時、rs_ratio_20を根拠に検証済みラベルを付与する候補かどうか */
function isValidatedSignal(signal: GcSignal): boolean {
  return signal.regime === 'bear' && signal.bear_score_v2 != null
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
type DaysOption = 30 | 90 | 180 | 365
type SortKey    = 'hold_days' | 'total_score' | 'symbol' | 'rank'

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

// ── 詳細モーダル(合算スコアではなく生の観測事実を表示) ────────────
function BreakdownModal({ signal, onClose }: { signal: GcSignal; onClose: () => void }) {
  const validated = isValidatedSignal(signal)
  const observations = [
    { label: '短期MAの傾き(直近5日)', value: signal.slope_pct != null ? `${signal.slope_pct >= 0 ? '+' : ''}${signal.slope_pct.toFixed(2)}%` : '—' },
    { label: '出来高比率(直近10日平均比)', value: signal.volume_ratio != null ? `${signal.volume_ratio.toFixed(2)}倍` : '—' },
    { label: 'RSI(14)', value: signal.rsi_value != null ? signal.rsi_value.toFixed(1) : '—' },
    { label: 'クロス後の維持日数', value: signal.hold_days === 0 ? '本日発生' : `${signal.hold_days}日` },
    { label: '長期MAからの価格乖離率', value: signal.deviation_pct != null ? `${signal.deviation_pct >= 0 ? '+' : ''}${signal.deviation_pct.toFixed(2)}%` : '—' },
    { label: 'MACDヒストグラム', value: signal.macd_histogram != null ? signal.macd_histogram.toFixed(3) : '—' },
    {
      label: '週足トレンド(SMA5 vs SMA20)',
      value: signal.weekly_state === 'above' ? '上向き' : signal.weekly_state === 'below' ? '下向き' : signal.weekly_state === 'flat' ? '同水準' : '—',
    },
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
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 20, fontWeight: 700 }}>{signal.symbol}</span>
            <span style={{
              background: signal.signal_type === 'GC' ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)',
              color: signal.signal_type === 'GC' ? '#3fb950' : '#f85149',
              padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 700,
            }}>{signal.signal_type}</span>
          </div>
          <div style={{ fontSize: 13, color: '#8b949e' }}>
            MA{signal.ma_short}/{signal.ma_long} ・ 発生: {formatDate(signal.detected_at)} ({holdDaysLabel(signal.hold_days)})
          </div>
        </div>

        {/* 検証済みラベル(bear限定rs_ratio_20に該当する場合のみ) */}
        {validated && (
          <div style={{
            marginBottom: 20, padding: 12,
            background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.4)', borderRadius: 8,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#3fb950', marginBottom: 4 }}>
              ✓ 検証済み: bear相場での逆張り候補
            </div>
            <div style={{ fontSize: 12, color: '#8b949e', lineHeight: 1.5 }}>
              JP/US両市場でDSR・ホールドアウト・検出ラグ・コスト控除後リターンの検証を通過
              (oscillator-research Step③④)。相対強度ランク: {signal.rank_bear_v2 ?? '—'}位
            </div>
            <div style={{ fontSize: 12, color: '#d29922', marginTop: 6 }}>
              推奨サイズはエイスケリー(1/8)程度以下。銘柄間相関が高く、見た目の銘柄数ほど分散されていない点に注意。
            </div>
          </div>
        )}

        {/* 参考値 */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: 8, marginBottom: 20,
        }}>
          {[
            { label: '終値', value: signal.close_price != null ? signal.close_price.toLocaleString() : '-' },
            { label: '現在のレジーム', value: signal.regime ?? '不明' },
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

        {/* 観測事実(生の値。合算スコアは出さない) */}
        <div style={{ marginBottom: 4, fontSize: 12, color: '#8b949e', fontWeight: 600, letterSpacing: '0.05em' }}>
          観測事実(参考情報。上記「検証済み」以外は検証済みの予測シグナルではありません)
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {observations.map(item => (
            <div key={item.label} style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '8px 0', borderBottom: '1px solid #21262d',
            }}>
              <span style={{ fontSize: 13, color: '#8b949e' }}>{item.label}</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{item.value}</span>
            </div>
          ))}
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
  const isGC = signal.signal_type === 'GC'
  const validated = isValidatedSignal(signal)

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1.8fr 52px 64px 80px 80px 1fr',
      alignItems: 'center',
      gap: 8,
      padding: '10px 16px',
      borderBottom: '1px solid #21262d',
      transition: 'background 0.1s',
    }}
    onMouseEnter={e => (e.currentTarget.style.background = '#21262d')}
    onMouseLeave={e => (e.currentTarget.style.background = '')}
    >
      {/* 銘柄 + 銘柄名 */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.2px', fontFamily: 'monospace' }}>
          {signal.symbol}
        </div>
        <div style={{
          fontSize: 11, color: '#8b949e', marginTop: 1,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {signal.name ?? <span style={{ color: '#484f58' }}>—</span>}
        </div>
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

      {/* 検証済みラベル(旧: ランク+スコア) */}
      <div style={{ textAlign: 'center' }}>
        {validated ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            background: 'rgba(63,185,80,0.15)', color: '#3fb950',
            padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
          }}>
            ✓ 検証済み
          </span>
        ) : (
          <span style={{ fontSize: 11, color: '#484f58' }}>—</span>
        )}
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
          title={signal.symbol_id ? 'アプリ内チャートを表示' : 'Yahoo Financeでチャートを表示（別タブ）'}
          style={{
            background: signal.symbol_id ? 'var(--accent-blue)' : 'rgba(210,153,34,0.15)',
            border: signal.symbol_id ? 'none' : '1px solid #d29922',
            borderRadius: 6, padding: '4px 10px',
            color: signal.symbol_id ? '#fff' : '#d29922',
            cursor: 'pointer', fontSize: 12,
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <BarChart2 size={12} />
          {signal.symbol_id ? 'チャート' : 'Yahoo'}
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
  const [validatedOnly, setValidatedOnly] = useState(false)
  const [days,       setDays]       = useState<number>(365)
  // ソート状態（デフォルト: GC発生が新しい順 = hold_days 昇順）
  const [sortKey, setSortKey] = useState<SortKey>('hold_days')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

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
      params.set('days', String(days))
      // ソートはクライアント側で行う（サーバーソートはdetected_at型で不安定なため）

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
  }, [market, signalType, maPair, minRank, days])

  useEffect(() => { loadSignals() }, [loadSignals])

  // クライアントサイドソート
  const sortedSignals = [...signals].sort((a, b) => {
    let cmp = 0
    if (sortKey === 'symbol') {
      cmp = a.symbol.localeCompare(b.symbol)
    } else if (sortKey === 'total_score') {
      cmp = a.total_score - b.total_score
    } else if (sortKey === 'hold_days') {
      // hold_days が小さい = GC/DC発生が最近
      cmp = a.hold_days - b.hold_days
    } else if (sortKey === 'rank') {
      const order = { A: 0, B: 1, C: 2, D: 3 }
      cmp = (order[a.rank] ?? 9) - (order[b.rank] ?? 9)
    }
    return sortDir === 'desc' ? -cmp : cmp
  }).filter(s => !validatedOnly || isValidatedSignal(s))

  function handleChart(signal: GcSignal) {
    if (signal.symbol_id) {
      // 監視リスト登録済み → アプリ内チャートへ遷移
      router.push(`/chart/${signal.symbol_id}`)
    } else if (signal.yahoo_url) {
      // 未登録 → Yahoo Financeチャートを別タブで開く
      window.open(signal.yahoo_url, '_blank', 'noopener,noreferrer')
    }
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortKey(key)
      // hold_days は昇順（0=今日が先頭）、それ以外は降順がデフォルト
      setSortDir(key === 'symbol' || key === 'hold_days' ? 'asc' : 'desc')
    }
  }

  // ランク集計(ソート前の全件から。参考情報として残す)
  const rankCounts = signals.reduce<Record<string, number>>((acc, s) => {
    acc[s.rank] = (acc[s.rank] ?? 0) + 1
    return acc
  }, {})
  const validatedCount = signals.filter(isValidatedSignal).length

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

        {/* 検証済みサマリー + 旧ランクサマリー(参考) */}
        {!loading && signals.length > 0 && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <div
              onClick={() => setValidatedOnly(v => !v)}
              style={{
                background: validatedOnly ? 'rgba(63,185,80,0.15)' : '#1c2128',
                border: `1px solid ${validatedOnly ? '#3fb950' : '#30363d'}`,
                borderRadius: 8, padding: '10px 16px', cursor: 'pointer',
                minWidth: 90, textAlign: 'center', transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 800, color: '#3fb950' }}>
                {validatedCount}
              </div>
              <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>
                ✓ 検証済み
              </div>
            </div>
            <div style={{ width: 1, height: 32, background: '#30363d', margin: '0 4px' }} />
            <span style={{ fontSize: 11, color: '#484f58' }}>以下は参考情報(旧ランク基準。検証済みではありません)</span>
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
                    borderRadius: 8, padding: '6px 12px', cursor: 'pointer',
                    minWidth: 60, textAlign: 'center', transition: 'all 0.15s',
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 700, color: st.color }}>
                    {n}
                  </div>
                  <div style={{ fontSize: 10, color: '#8b949e' }}>
                    {r}
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
          <div style={{ width: 1, height: 24, background: '#30363d' }} />
          {/* 期間フィルタ */}
          <div style={{ display: 'flex', gap: 4 }}>
            {([30, 90, 180, 365] as DaysOption[]).map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                style={{
                  background: days === d ? '#21262d' : 'none',
                  border: `1px solid ${days === d ? '#8b949e' : '#30363d'}`,
                  borderRadius: 6, padding: '5px 10px',
                  color: days === d ? '#e6edf3' : '#8b949e',
                  cursor: 'pointer', fontSize: 13,
                  transition: 'all 0.15s',
                }}
              >
                {d === 30 ? '1ヶ月' : d === 90 ? '3ヶ月' : d === 180 ? '6ヶ月' : '1年'}
              </button>
            ))}
          </div>
        </div>

        {/* テーブル */}
        <div style={{ background: '#1c2128', border: '1px solid #30363d', borderRadius: 10, overflow: 'hidden' }}>

          {/* テーブルヘッダー */}
          {(() => {
            const col = (key: SortKey | null, label: string, align?: string) => {
              const isActive = key && sortKey === key
              return (
                <div
                  onClick={key ? () => handleSort(key) : undefined}
                  style={{
                    textAlign: align as 'center' | 'right' | undefined,
                    cursor: key ? 'pointer' : 'default',
                    userSelect: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
                    color: isActive ? '#e6edf3' : '#8b949e',
                  }}
                >
                  {label}
                  {key && (
                    <span style={{ fontSize: 10, opacity: isActive ? 1 : 0.3 }}>
                      {isActive ? (sortDir === 'desc' ? '▼' : '▲') : '⇅'}
                    </span>
                  )}
                </div>
              )
            }
            return (
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1.8fr 52px 64px 80px 80px 1fr',
                gap: 8,
                padding: '8px 16px',
                background: '#161b22',
                borderBottom: '1px solid #30363d',
                fontSize: 11, fontWeight: 600,
                letterSpacing: '0.05em',
              }}>
                {col('symbol',      '銘柄')}
                {col(null,          '市場')}
                {col(null,          'シグナル')}
                {col('total_score', '検証済み', 'center')}
                {col('hold_days',   '発生日', 'center')}
                {col(null,          'アクション', 'right')}
              </div>
            )
          })()}

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
          {!loading && !error && sortedSignals.map(signal => (
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
            直近{days === 365 ? '1年' : days === 180 ? '6ヶ月' : days === 90 ? '3ヶ月' : '1ヶ月'}のシグナルを表示 ·
            スキャン対象: {lastScan.total_tickers?.toLocaleString() ?? '—'} 銘柄 ·
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
