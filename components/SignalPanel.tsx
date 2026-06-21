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
    fontSize: 12,
    color: '#484f58',
    borderRadius: 4,
    minWidth: 28,
    minHeight: 28,
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: 0,
  },
}

// ── ミニスコアバー ────────────────────────────────────
function MiniBar({ value, max }: { value: number; max: number }) {
  const pct = Math.abs(value) / max * 50
  const neg = value < 0
  const col = value > 0 ? '#3fb950' : value < 0 ? '#f85149' : '#484f58'
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

// ── スコア説明モーダル ────────────────────────────────
function ScoreGuideModal({ onClose }: { onClose: () => void }) {
  const handleBackdrop = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onClose()
  }, [onClose])
  const handleInner = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
  }, [])

  const th: React.CSSProperties = {
    padding: '4px 8px', fontSize: 10, color: '#8b949e',
    borderBottom: '1px solid #30363d', textAlign: 'left' as const,
    fontWeight: 600,
  }
  const td: React.CSSProperties = {
    padding: '4px 8px', fontSize: 11, color: '#c9d1d9',
    borderBottom: '1px solid #21262d',
  }
  const tdC: React.CSSProperties = { ...td, textAlign: 'center' as const }

  return (
    <div
      onClick={handleBackdrop}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={handleInner}
        style={{
          background: '#161b22', border: '1px solid #30363d',
          borderRadius: 10, padding: '14px 16px',
          width: '100%', maxWidth: 340,
          maxHeight: '80vh', overflowY: 'auto',
        }}
      >
        {/* ヘッダー */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#c9d1d9' }}>スコア評価基準</span>
          <button onClick={(e) => { e.stopPropagation(); onClose() }} style={{ ...S.btn, color: '#8b949e', fontSize: 16 }}>✕</button>
        </div>

        {/* 合計スコア基準 */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#8b949e', marginBottom: 6 }}>合計スコア → 判定</div>
          {[
            { range: '+5以上', label: '🔥 強い買い',  color: '#f59e0b' },
            { range: '+3〜+4', label: '✅ 買い',      color: '#3fb950' },
            { range: '+1〜+2', label: '🔵 弱い買い',  color: '#58a6ff' },
            { range: '0',      label: '⬜ 中立',      color: '#8b949e' },
            { range: '-1',     label: '🟡 弱い売り',  color: '#d29922' },
            { range: '-2〜-3', label: '🔴 売り警戒',  color: '#f85149' },
            { range: '-4以下', label: '🚨 強い売り',  color: '#ff0000' },
          ].map(r => (
            <div key={r.range} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #0d1117' }}>
              <span style={{ fontSize: 11, color: '#8b949e', fontVariantNumeric: 'tabular-nums' }}>{r.range}</span>
              <span style={{ fontSize: 11, color: r.color, fontWeight: 600 }}>{r.label}</span>
            </div>
          ))}
        </div>

        {/* VIX */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#8b949e', marginBottom: 4 }}>VIX（-1〜+3）</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>VIX値</th><th style={th}>状態</th><th style={{ ...th, textAlign: 'center' }}>スコア</th></tr></thead>
            <tbody>
              {[
                { v: '≥ 40',   s: '🔥 パニック', c: '+3', col: '#f59e0b' },
                { v: '25〜39', s: '⚠️ 恐怖',     c: '+1', col: '#fb923c' },
                { v: '10〜24', s: '✅ 平常',      c: '0',  col: '#8b949e' },
                { v: '≤ 10',   s: '🔴 楽観',     c: '-1', col: '#f85149' },
              ].map(r => (
                <tr key={r.v}>
                  <td style={td}>{r.v}</td>
                  <td style={td}>{r.s}</td>
                  <td style={{ ...tdC, color: r.col, fontWeight: 700 }}>{r.c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* CAPE */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#8b949e', marginBottom: 4 }}>CAPE Shiller PER（-2〜+1）</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>CAPE値</th><th style={th}>状態</th><th style={{ ...th, textAlign: 'center' }}>スコア</th></tr></thead>
            <tbody>
              {[
                { v: '≤ 18',   s: '🟢 割安',   c: '+1', col: '#3fb950' },
                { v: '18〜25', s: '🔵 適正',   c: '0',  col: '#8b949e' },
                { v: '25〜33', s: '🟡 割高',   c: '-1', col: '#d29922' },
                { v: '≥ 33',   s: '🔴 極割高', c: '-2', col: '#f85149' },
              ].map(r => (
                <tr key={r.v}>
                  <td style={td}>{r.v}</td>
                  <td style={td}>{r.s}</td>
                  <td style={{ ...tdC, color: r.col, fontWeight: 700 }}>{r.c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 金利 */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#8b949e', marginBottom: 4 }}>FF金利方向（-1〜+1）</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>方向</th><th style={th}>条件（3ヶ月比）</th><th style={{ ...th, textAlign: 'center' }}>スコア</th></tr></thead>
            <tbody>
              {[
                { v: '↓ 利下げ', s: '-0.1%以上低下', c: '+1', col: '#3fb950' },
                { v: '→ 据置き', s: '±0.1%以内',     c: '0',  col: '#8b949e' },
                { v: '↑ 利上げ', s: '+0.1%以上上昇',  c: '-1', col: '#f85149' },
              ].map(r => (
                <tr key={r.v}>
                  <td style={td}>{r.v}</td>
                  <td style={td}>{r.s}</td>
                  <td style={{ ...tdC, color: r.col, fontWeight: 700 }}>{r.c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* TSI */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#8b949e', marginBottom: 4 }}>TSIシグナル（-2〜+2）</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>シグナル</th><th style={th}>条件</th><th style={{ ...th, textAlign: 'center' }}>スコア</th></tr></thead>
            <tbody>
              {[
                { v: 'GC<-10', s: 'TSI-10以下でGC', c: '+2', col: '#f59e0b' },
                { v: 'GC',     s: '通常ゴールデンクロス', c: '+1', col: '#3fb950' },
                { v: '中立',   s: 'クロスなし',      c: '0',  col: '#8b949e' },
                { v: 'DC',     s: '通常デッドクロス', c: '-1', col: '#f85149' },
                { v: 'DC<-10', s: 'TSI-10以下でDC', c: '-2', col: '#ff0000' },
              ].map(r => (
                <tr key={r.v}>
                  <td style={td}>{r.v}</td>
                  <td style={td}>{r.s}</td>
                  <td style={{ ...tdC, color: r.col, fontWeight: 700 }}>{r.c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── メインコンポーネント ──────────────────────────────
interface SignalPanelProps {
  vixData:      VixData    | null
  macroData:    MacroData  | null
  score:        SignalScore | null
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
  const [open,      setOpen]      = useState(true)
  const [showGuide, setShowGuide] = useState(false)

  const handleRefreshVix = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); onRefreshVix()
  }, [onRefreshVix])

  const handleRefreshMacro = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); onRefreshMacro()
  }, [onRefreshMacro])

  const toggleOpen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); setOpen(o => !o)
  }, [])

  const openGuide = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); setShowGuide(true)
  }, [])

  const scoreColor = score ? score.color : '#8b949e'
  const scoreSign  = score && score.total > 0 ? '+' : ''
  const scoreTotal = score ? `${scoreSign}${score.total}` : '—'
  const scoreLabel = score ? score.label : 'データ取得中'

  return (
    <>
      <div style={S.panel}>
        {/* ヘッダー */}
        <div style={S.header} onClick={toggleOpen}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: scoreColor, fontVariantNumeric: 'tabular-nums' }}>
              {scoreTotal}
            </span>
            <span style={{ fontSize: 10, color: scoreColor }}>{scoreLabel}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {/* 説明ボタン（?） */}
            <button
              style={{ ...S.btn, fontSize: 11, color: '#8b949e' }}
              onClick={openGuide}
              title="スコア評価基準"
            >?</button>
            <span style={{ fontSize: 10, color: '#484f58' }}>{open ? '▲' : '▼'}</span>
          </div>
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
              <button style={S.btn} onClick={handleRefreshVix} title="VIX更新">↻</button>
            </div>

            {/* CAPE行 */}
            <div style={S.row}>
              <span style={{ fontSize: 12, minWidth: 14 }}>
                {macroLoading ? '…' : macroData ? CAPE_STATUS[macroData.cape.status].icon : '?'}
              </span>
              <span style={{ color: '#8b949e', minWidth: 28 }}>CAPE</span>
              <span style={{ color: macroData ? CAPE_STATUS[macroData.cape.status].color : '#484f58', fontWeight: 600, flex: 1, fontVariantNumeric: 'tabular-nums' }}>
                {score?.capeNA
                  ? <span style={{ color: '#484f58', fontSize: 10 }}>N/A</span>
                  : macroLoading ? '…' : macroData?.cape.value ? macroData.cape.value.toFixed(1) : '—'}
              </span>
              {score && (
                <>
                  {score.capeNA
                    ? <span style={{ fontSize: 10, color: '#484f58', minWidth: 58, textAlign: 'right' }}>対象外</span>
                    : <>
                        <MiniBar value={score.cape} max={2} />
                        <span style={{ fontSize: 10, color: score.cape >= 0 ? '#3fb950' : '#f85149', minWidth: 18, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {score.cape > 0 ? '+' : ''}{score.cape}
                        </span>
                      </>
                  }
                </>
              )}
              <button style={S.btn} onClick={handleRefreshMacro} title="マクロ更新">↻</button>
            </div>

            {/* FF金利行 */}
            <div style={S.row}>
              <span style={{ fontSize: 12, minWidth: 14 }}>
                {macroLoading ? '…' : macroData ? RATE_DIR[macroData.rate.direction].icon : '?'}
              </span>
              <span style={{ color: '#8b949e', minWidth: 28 }}>金利</span>
              <span style={{ color: macroData ? RATE_DIR[macroData.rate.direction].color : '#484f58', fontWeight: 600, flex: 1, fontVariantNumeric: 'tabular-nums' }}>
                {score?.rateNA
                  ? <span style={{ color: '#484f58', fontSize: 10 }}>N/A</span>
                  : macroLoading ? '…' : macroData?.rate.current ? `${macroData.rate.current.toFixed(2)}%` : '—'}
              </span>
              {score && (
                <>
                  {score.rateNA
                    ? <span style={{ fontSize: 10, color: '#484f58', minWidth: 58, textAlign: 'right' }}>対象外</span>
                    : <>
                        <MiniBar value={score.rate} max={1} />
                        <span style={{ fontSize: 10, color: score.rate >= 0 ? '#3fb950' : '#f85149', minWidth: 18, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {score.rate > 0 ? '+' : ''}{score.rate}
                        </span>
                      </>
                  }
                </>
              )}
            </div>

            {/* TSI行 */}
            <div style={{ ...S.row, borderBottom: 'none' }}>
              <span style={{ fontSize: 12, minWidth: 14 }}>📈</span>
              <span style={{ color: '#8b949e', minWidth: 28 }}>TSI</span>
              <span style={{ color: '#8b949e', flex: 1, fontSize: 10 }}>
                {score
                  ? score.tsi === 2  ? 'GC<-10'
                  : score.tsi === 1  ? 'GC'
                  : score.tsi === -2 ? 'DC<-10'
                  : score.tsi === -1 ? 'DC'
                  : '中立'
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

            {/* エラー */}
            {(vixError || macroError) && (
              <div style={{ padding: '4px 10px', fontSize: 10, color: '#f85149' }}>
                {vixError   && <div>VIX: {vixError}</div>}
                {macroError && <div>マクロ: {macroError}</div>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* スコア説明モーダル */}
      {showGuide && <ScoreGuideModal onClose={() => setShowGuide(false)} />}
    </>
  )
}
