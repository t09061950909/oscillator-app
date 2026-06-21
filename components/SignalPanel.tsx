'use client'

import { useState, useCallback } from 'react'
import type { VixData }    from '@/app/api/vix/route'
import type { MacroData }  from '@/app/api/macro/route'
import type { SignalScore } from '@/lib/signalScore'

// ── 設定定数 ──────────────────────────────────────────
const VIX_STATUS = {
  panic:       { icon: '🔥', label: 'パニック',  color: '#f59e0b' },
  fear:        { icon: '⚠️', label: '恐怖',      color: '#fb923c' },
  normal:      { icon: '✅', label: '平常',      color: '#3fb950' },
  complacency: { icon: '🔴', label: '楽観',      color: '#f85149' },
} as const

const CAPE_STATUS = {
  cheap:     { icon: '🟢', label: '割安',   color: '#3fb950' },
  fair:      { icon: '🔵', label: '適正',   color: '#58a6ff' },
  expensive: { icon: '🟡', label: '割高',   color: '#d29922' },
  extreme:   { icon: '🔴', label: '極割高', color: '#f85149' },
} as const

const RATE_DIR = {
  cutting: { icon: '↓', label: '利下げ', color: '#3fb950' },
  hold:    { icon: '→', label: '据置き', color: '#8b949e' },
  hiking:  { icon: '↑', label: '利上げ', color: '#f85149' },
} as const

// ── スタイル定数 ──────────────────────────────────────
const S = {
  panel: {
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: 8,
    overflow: 'hidden',
    userSelect: 'none' as const,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 10px',
    cursor: 'pointer',
    borderBottom: '1px solid #21262d',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    borderBottom: '1px solid #0d1117',
    fontSize: 11,
  },
  btn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '2px 6px',
    fontSize: 12,
    color: '#484f58',
    borderRadius: 4,
    // タップ領域を広げる
    minWidth: 28,
    minHeight: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
}

// ── ミニスコアバー ────────────────────────────────────
function MiniBar({ value, max }: { value: number; max: number }) {
  const pct  = Math.abs(value) / max * 50
  const neg  = value < 0
  const col  = value > 0 ? '#3fb950' : value < 0 ? '#f85149' : '#484f58'
  return (
    <div style={{ position: 'relative', width: 40, height: 4, background: '#21262d', borderRadius: 2, flexShrink: 0 }}>
      <div style={{ position: 'absolute', left: '50%', top: 0, width: 1, height: '100%', background: '#30363d' }} />
      {value !== 0 && (
        <div style={{
          position: 'absolute', top: 0, height: '100%', borderRadius: 2,
          width: `${pct}%`,
          left: neg ? `${50 - pct}%` : '50%',
          background: col,
        }} />
      )}
    </div>
  )
}

// ── メインコンポーネント ──────────────────────────────
interface SignalPanelProps {
  vixData:    VixData    | null
  macroData:  MacroData  | null
  score:      SignalScore | null
  onRefreshVix:   () => void
  onRefreshMacro: () => void
  vixLoading:   boolean
  macroLoading: boolean
  vixError:     string | null
  macroError:   string | null
}

export default function SignalPanel({
  vixData, macroData, score,
  onRefreshVix, onRefreshMacro,
  vixLoading, macroLoading,
  vixError, macroError,
}: SignalPanelProps) {
  const [open, setOpen] = useState(true)

  // ボタンクリックがチャートに伝播しないよう stopPropagation
  const handleRefreshVix = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onRefreshVix()
  }, [onRefreshVix])

  const handleRefreshMacro = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onRefreshMacro()
  }, [onRefreshMacro])

  const toggleOpen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setOpen(o => !o)
  }, [])

  // ── ヘッダー（常時表示） ─────────────────────────────
  const scoreColor  = score ? score.color : '#8b949e'
  const scoreSign   = score && score.total > 0 ? '+' : ''
  const scoreTotal  = score ? `${scoreSign}${score.total}` : '—'
  const scoreLabel  = score ? score.label : 'データ取得中'

  return (
    <div style={S.panel}>
      {/* ヘッダー: スコアサマリー + 折りたたみ */}
      <div style={S.header} onClick={toggleOpen}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: scoreColor, fontVariantNumeric: 'tabular-nums' }}>
            {scoreTotal}
          </span>
          <span style={{ fontSize: 10, color: scoreColor }}>{scoreLabel}</span>
        </div>
        <span style={{ fontSize: 10, color: '#484f58' }}>{open ? '▲' : '▼'}</span>
      </div>

      {/* 展開コンテンツ */}
      {open && (
        <div>
          {/* VIX行 */}
          <div style={S.row}>
            <span style={{ fontSize: 12, minWidth: 14 }}>
              {vixLoading ? '…' : vixData ? VIX_STATUS[vixData.status].icon : '?'}
            </span>
            <span style={{ color: '#8b949e', minWidth: 28 }}>VIX</span>
            <span style={{ color: vixData ? VIX_STATUS[vixData.status].color : '#484f58', fontWeight: 600, flex: 1, fontVariantNumeric: 'tabular-nums' }}>
              {vixLoading ? '…' : vixData ? vixData.value.toFixed(1) : vixError ? 'ERR' : '—'}
            </span>
            {score && (
              <>
                <MiniBar value={score.vix} max={3} />
                <span style={{ fontSize: 10, color: score.vix >= 0 ? '#3fb950' : '#f85149', minWidth: 18, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {score.vix > 0 ? '+' : ''}{score.vix}
                </span>
              </>
            )}
            <button
              style={S.btn}
              onClick={handleRefreshVix}
              title="VIX更新"
            >↻</button>
          </div>

          {/* CAPE行 */}
          <div style={S.row}>
            <span style={{ fontSize: 12, minWidth: 14 }}>
              {macroLoading ? '…' : macroData ? CAPE_STATUS[macroData.cape.status].icon : '?'}
            </span>
            <span style={{ color: '#8b949e', minWidth: 28 }}>CAPE</span>
            <span style={{ color: macroData ? CAPE_STATUS[macroData.cape.status].color : '#484f58', fontWeight: 600, flex: 1, fontVariantNumeric: 'tabular-nums' }}>
              {macroLoading ? '…' : macroData?.cape.value ? macroData.cape.value.toFixed(1) : '—'}
            </span>
            {score && (
              <>
                <MiniBar value={score.cape} max={2} />
                <span style={{ fontSize: 10, color: score.cape >= 0 ? '#3fb950' : '#f85149', minWidth: 18, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {score.cape > 0 ? '+' : ''}{score.cape}
                </span>
              </>
            )}
            <button
              style={S.btn}
              onClick={handleRefreshMacro}
              title="マクロ更新"
            >↻</button>
          </div>

          {/* FF金利行 */}
          <div style={S.row}>
            <span style={{ fontSize: 12, minWidth: 14 }}>
              {macroLoading ? '…' : macroData ? RATE_DIR[macroData.rate.direction].icon : '?'}
            </span>
            <span style={{ color: '#8b949e', minWidth: 28 }}>金利</span>
            <span style={{ color: macroData ? RATE_DIR[macroData.rate.direction].color : '#484f58', fontWeight: 600, flex: 1, fontVariantNumeric: 'tabular-nums' }}>
              {macroLoading ? '…' : macroData?.rate.current ? `${macroData.rate.current.toFixed(2)}%` : '—'}
            </span>
            {score && (
              <>
                <MiniBar value={score.rate} max={1} />
                <span style={{ fontSize: 10, color: score.rate >= 0 ? '#3fb950' : '#f85149', minWidth: 18, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {score.rate > 0 ? '+' : ''}{score.rate}
                </span>
              </>
            )}
          </div>

          {/* TSI行 */}
          <div style={{ ...S.row, borderBottom: 'none' }}>
            <span style={{ fontSize: 12, minWidth: 14 }}>📈</span>
            <span style={{ color: '#8b949e', minWidth: 28 }}>TSI</span>
            <span style={{ color: '#8b949e', flex: 1, fontSize: 10 }}>
              {score
                ? score.tsi === 2 ? 'GC<-10' : score.tsi === 1 ? 'GC' : score.tsi === -2 ? 'DC<-10' : score.tsi === -1 ? 'DC' : '中立'
                : '—'}
            </span>
            {score && (
              <>
                <MiniBar value={score.tsi} max={2} />
                <span style={{ fontSize: 10, color: score.tsi >= 0 ? '#3fb950' : '#f85149', minWidth: 18, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {score.tsi > 0 ? '+' : ''}{score.tsi}
                </span>
              </>
            )}
          </div>

          {/* エラー表示 */}
          {(vixError || macroError) && (
            <div style={{ padding: '4px 10px', fontSize: 10, color: '#f85149' }}>
              {vixError && <div>VIX: {vixError}</div>}
              {macroError && <div>マクロ: {macroError}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
