'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { VixData } from '@/app/api/vix/route'

// ─── VIX閾値 ──────────────────────────────────────────
const VIX_PANIC       = 40   // 強い買いシグナル（金色マーカー）
const VIX_FEAR        = 25   // 買い検討ゾーン
const VIX_COMPLACENCY = 10   // 売り警戒ゾーン

// ─── ステータス設定 ──────────────────────────────────────
const STATUS_CONFIG = {
  panic: {
    label: 'パニック圏',
    sublabel: '🔥 強い買いシグナル',
    bg: 'bg-amber-50 border-amber-400',
    badge: 'bg-amber-500 text-white',
    text: 'text-amber-700',
    value: 'text-amber-600',
  },
  fear: {
    label: '恐怖圏',
    sublabel: '⚠️ 買い検討ゾーン',
    bg: 'bg-orange-50 border-orange-300',
    badge: 'bg-orange-400 text-white',
    text: 'text-orange-700',
    value: 'text-orange-600',
  },
  normal: {
    label: '平常',
    sublabel: '✅ 中立',
    bg: 'bg-gray-50 border-gray-200',
    badge: 'bg-gray-400 text-white',
    text: 'text-gray-600',
    value: 'text-gray-800',
  },
  complacency: {
    label: '楽観圏',
    sublabel: '🔴 売り警戒',
    bg: 'bg-red-50 border-red-300',
    badge: 'bg-red-500 text-white',
    text: 'text-red-700',
    value: 'text-red-600',
  },
} as const

// ─── ゲージバー ──────────────────────────────────────────
function VixGauge({ value }: { value: number }) {
  // 0〜60 のレンジで表示（実用的なVIX範囲）
  const MAX = 60
  const pct = Math.min((value / MAX) * 100, 100)

  // グラデーション: 0(緑) → 25(黄) → 40(橙) → 60(赤)
  const getColor = (v: number) => {
    if (v >= VIX_PANIC) return '#f59e0b'  // amber
    if (v >= VIX_FEAR)  return '#fb923c'  // orange
    if (v <= VIX_COMPLACENCY) return '#ef4444' // red
    return '#22c55e'                       // green
  }

  return (
    <div className="mt-2">
      <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: getColor(value) }}
        />
        {/* 閾値マーカー */}
        <div
          className="absolute top-0 h-full w-px bg-red-400 opacity-60"
          style={{ left: `${(VIX_COMPLACENCY / MAX) * 100}%` }}
        />
        <div
          className="absolute top-0 h-full w-px bg-orange-400 opacity-60"
          style={{ left: `${(VIX_FEAR / MAX) * 100}%` }}
        />
        <div
          className="absolute top-0 h-full w-px bg-amber-500 opacity-80"
          style={{ left: `${(VIX_PANIC / MAX) * 100}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
        <span>0</span>
        <span className="text-red-400">{VIX_COMPLACENCY}</span>
        <span className="text-orange-400">{VIX_FEAR}</span>
        <span className="text-amber-500">{VIX_PANIC}</span>
        <span>{MAX}+</span>
      </div>
    </div>
  )
}

// ─── メインコンポーネント ─────────────────────────────────
interface VixPanelProps {
  /** チャートコンテナの幅に合わせて右寄せする場合に指定 */
  className?: string
  /** VIX値が変化したときに親へ通知（マーカー強調制御用） */
  onVixChange?: (data: VixData) => void
}

export default function VixPanel({ className = '', onVixChange }: VixPanelProps) {
  const [data, setData] = useState<VixData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const fetchVix = useCallback(async () => {
    try {
      const res = await fetch('/api/vix')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: VixData = await res.json()
      setData(json)
      setLastUpdated(new Date())
      setError(null)
      onVixChange?.(json)
    } catch (e) {
      setError('VIXデータ取得失敗')
      console.error('VIX fetch error:', e)
    } finally {
      setLoading(false)
    }
  }, [onVixChange])

  useEffect(() => {
    fetchVix()
    // 5分ごとに自動更新
    intervalRef.current = setInterval(fetchVix, 5 * 60 * 1000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchVix])

  if (loading) {
    return (
      <div className={`border rounded-lg p-3 bg-gray-50 animate-pulse ${className}`}>
        <div className="h-4 bg-gray-200 rounded w-20 mb-2" />
        <div className="h-7 bg-gray-200 rounded w-16" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className={`border border-red-200 rounded-lg p-3 bg-red-50 ${className}`}>
        <p className="text-xs text-red-500">{error ?? 'データなし'}</p>
        <button
          onClick={fetchVix}
          className="mt-1 text-xs text-red-600 underline"
        >
          再取得
        </button>
      </div>
    )
  }

  const cfg = STATUS_CONFIG[data.status]
  const changeSign = data.change >= 0 ? '+' : ''

  return (
    <div className={`border rounded-lg p-3 ${cfg.bg} ${className}`}>
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-gray-500">VIX</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${cfg.badge}`}>
            {cfg.label}
          </span>
        </div>
        <button
          onClick={fetchVix}
          className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
          title="更新"
        >
          ↻
        </button>
      </div>

      {/* メイン数値 */}
      <div className="flex items-end gap-2">
        <span className={`text-2xl font-bold tabular-nums ${cfg.value}`}>
          {data.value.toFixed(2)}
        </span>
        <span className={`text-xs mb-0.5 tabular-nums ${data.change >= 0 ? 'text-red-500' : 'text-green-600'}`}>
          {changeSign}{data.change.toFixed(2)} ({changeSign}{data.changePercent.toFixed(1)}%)
        </span>
      </div>

      {/* サブラベル */}
      <p className={`text-xs mt-0.5 ${cfg.text}`}>{cfg.sublabel}</p>

      {/* ゲージ */}
      <VixGauge value={data.value} />

      {/* 閾値ガイド */}
      <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] text-gray-500">
        <span>≥{VIX_PANIC}: 買い強</span>
        <span>≥{VIX_FEAR}: 買い検討</span>
        <span>≤{VIX_COMPLACENCY}: 売り警戒</span>
      </div>

      {/* 最終更新 */}
      {lastUpdated && (
        <p className="mt-1.5 text-[10px] text-gray-400">
          更新: {lastUpdated.toLocaleTimeString('ja-JP')}
        </p>
      )}
    </div>
  )
}
