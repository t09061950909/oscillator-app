'use client'

export interface TsiParams {
  long:   number
  short:  number
  signal: number
}

export interface BBParams {
  period: number
  stdDev: number
}

export interface MACDParams {
  fast:   number
  slow:   number
  signal: number
}

export type ActiveIndicator = 'tsi' | 'bb' | 'macd'

interface Props {
  tsiParams:  TsiParams
  bbParams:   BBParams
  macdParams: MACDParams
  active:     ActiveIndicator
  onTsiChange:  (p: TsiParams)  => void
  onBBChange:   (p: BBParams)   => void
  onMACDChange: (p: MACDParams) => void
  onActiveChange: (a: ActiveIndicator) => void
}

function NumInput({
  label, value, min, max, onChange
}: { label: string; value: number; min: number; max: number; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: 42,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          padding: '2px 6px',
          color: 'var(--text-primary)',
          fontSize: 12,
          textAlign: 'center',
          outline: 'none',
        }}
      />
    </label>
  )
}

export default function TsiParamBar({
  tsiParams, bbParams, macdParams, active,
  onTsiChange, onBBChange, onMACDChange, onActiveChange,
}: Props) {

  function num(v: string, min = 1, max = 999) {
    const n = parseFloat(v)
    return isNaN(n) || n < min || n > max ? null : n
  }

  const indicators: { key: ActiveIndicator; label: string; color: string }[] = [
    { key: 'tsi',  label: 'TSI',  color: '#388bfd' },
    { key: 'bb',   label: 'BB',   color: '#c678dd' },
    { key: 'macd', label: 'MACD', color: '#e5c07b' },
  ]

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '0 16px', height: 36,
      background: 'var(--bg-primary)',
      borderBottom: '1px solid var(--border)',
      fontSize: 12, color: 'var(--text-secondary)',
      overflowX: 'auto',
    }}>
      {/* インジケータ切替タブ */}
      <div style={{ display: 'flex', gap: 2, background: 'var(--bg-card)', borderRadius: 5, padding: 2, flexShrink: 0 }}>
        {indicators.map(({ key, label, color }) => (
          <button key={key} onClick={() => onActiveChange(key)}
            style={{
              background: active === key ? color + '22' : 'none',
              border: active === key ? `1px solid ${color}` : '1px solid transparent',
              borderRadius: 4, padding: '2px 9px',
              color: active === key ? color : 'var(--text-muted)',
              cursor: 'pointer', fontSize: 12, fontWeight: active === key ? 700 : 400,
              transition: 'all 0.15s',
            }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }} />

      {/* TSI パラメータ */}
      {active === 'tsi' && (
        <>
          <NumInput label="長期" value={tsiParams.long}   min={1} max={99}
            onChange={v => { const n = num(v); if (n) onTsiChange({ ...tsiParams, long: n }) }} />
          <NumInput label="短期" value={tsiParams.short}  min={1} max={99}
            onChange={v => { const n = num(v); if (n) onTsiChange({ ...tsiParams, short: n }) }} />
          <NumInput label="シグナル" value={tsiParams.signal} min={1} max={99}
            onChange={v => { const n = num(v); if (n) onTsiChange({ ...tsiParams, signal: n }) }} />
          <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
            ゼロライン <span style={{ color: 'var(--text-primary)' }}>-10</span>
          </span>
        </>
      )}

      {/* BB パラメータ */}
      {active === 'bb' && (
        <>
          <NumInput label="期間" value={bbParams.period} min={2} max={200}
            onChange={v => { const n = num(v,2,200); if (n) onBBChange({ ...bbParams, period: n }) }} />
          <NumInput label="σ" value={bbParams.stdDev} min={0.5} max={5}
            onChange={v => {
              const n = parseFloat(v)
              if (!isNaN(n) && n >= 0.5 && n <= 5) onBBChange({ ...bbParams, stdDev: n })
            }} />
        </>
      )}

      {/* MACD パラメータ */}
      {active === 'macd' && (
        <>
          <NumInput label="Fast" value={macdParams.fast}   min={1} max={99}
            onChange={v => { const n = num(v); if (n) onMACDChange({ ...macdParams, fast: n }) }} />
          <NumInput label="Slow" value={macdParams.slow}   min={1} max={200}
            onChange={v => { const n = num(v,1,200); if (n) onMACDChange({ ...macdParams, slow: n }) }} />
          <NumInput label="Signal" value={macdParams.signal} min={1} max={99}
            onChange={v => { const n = num(v); if (n) onMACDChange({ ...macdParams, signal: n }) }} />
        </>
      )}
    </div>
  )
}
