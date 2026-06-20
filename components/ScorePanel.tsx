'use client'

import type { SignalScore } from '@/lib/signalScore'

interface ScorePanelProps {
  score: SignalScore | null
}

const STRENGTH_BG: Record<string, string> = {
  strong_buy:  '#f59e0b22',
  buy:         '#3fb95022',
  weak_buy:    '#58a6ff22',
  neutral:     '#8b949e22',
  weak_sell:   '#d2992222',
  sell:        '#f8514922',
  strong_sell: '#ff000022',
}

function ScoreBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const isNeg  = value < 0
  const pct    = Math.abs(value) / max * 100
  const sign   = value > 0 ? '+' : ''

  return (
    <div style={{ marginBottom: 5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ fontSize: 10, color: '#8b949e' }}>{label}</span>
        <span style={{ fontSize: 10, fontWeight: 600, color, fontVariantNumeric: 'tabular-nums' }}>
          {sign}{value}
        </span>
      </div>
      <div style={{ position: 'relative', height: 4, background: '#21262d', borderRadius: 2 }}>
        {/* 中央線 */}
        <div style={{
          position: 'absolute', left: '50%', top: 0,
          width: 1, height: '100%', background: '#30363d',
        }} />
        {/* バー */}
        {value !== 0 && (
          <div style={{
            position: 'absolute',
            top: 0, height: '100%',
            width: `${pct / 2}%`,
            left: isNeg ? `${50 - pct / 2}%` : '50%',
            background: color,
            borderRadius: 2,
            transition: 'width 0.3s',
          }} />
        )}
      </div>
    </div>
  )
}

export default function ScorePanel({ score }: ScorePanelProps) {
  if (!score) {
    return (
      <div style={{
        background: '#161b22', border: '1px solid #30363d',
        borderRadius: 8, padding: '10px 12px',
      }}>
        <div style={{ fontSize: 11, color: '#8b949e' }}>複合スコア</div>
        <div style={{ fontSize: 11, color: '#484f58', marginTop: 4 }}>シグナル待ち</div>
      </div>
    )
  }

  const bg     = STRENGTH_BG[score.strength] ?? '#8b949e22'
  const sign   = score.total > 0 ? '+' : ''

  return (
    <div style={{
      background: '#161b22',
      border: `1px solid ${score.color}55`,
      borderRadius: 8,
      padding: '10px 12px',
    }}>
      {/* ヘッダー */}
      <div style={{ fontSize: 11, fontWeight: 600, color: '#8b949e', marginBottom: 6, letterSpacing: '0.04em' }}>
        複合シグナルスコア
      </div>

      {/* メインスコア */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 8px', borderRadius: 6, background: bg,
        marginBottom: 10,
      }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: score.color, fontVariantNumeric: 'tabular-nums' }}>
          {sign}{score.total}
        </span>
        <span style={{ fontSize: 12, color: score.color, fontWeight: 600 }}>
          {score.label}
        </span>
      </div>

      {/* 内訳バー */}
      <ScoreBar label="VIX"  value={score.vix}  max={3} color={score.vix  >= 0 ? '#3fb950' : '#f85149'} />
      <ScoreBar label="CAPE" value={score.cape} max={2} color={score.cape >= 0 ? '#3fb950' : '#f85149'} />
      <ScoreBar label="金利" value={score.rate} max={1} color={score.rate >= 0 ? '#3fb950' : '#f85149'} />
      <ScoreBar label="TSI"  value={score.tsi}  max={2} color={score.tsi  >= 0 ? '#3fb950' : '#f85149'} />

      {/* 判断基準ガイド */}
      <div style={{
        marginTop: 8, padding: '5px 7px',
        background: '#0d1117', borderRadius: 4,
        fontSize: 10, color: '#484f58', lineHeight: 1.6,
      }}>
        +5以上: 強買 / +3: 買い / ±2: 中立<br />
        -2: 売り警戒 / -4以下: 強い売り
      </div>
    </div>
  )
}
