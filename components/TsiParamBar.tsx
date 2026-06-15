'use client'

export interface TsiParams {
  long:   number
  short:  number
  signal: number
}

interface Props {
  params: TsiParams
  onChange: (p: TsiParams) => void
}

export default function TsiParamBar({ params, onChange }: Props) {
  function handleChange(key: keyof TsiParams, value: string) {
    const n = parseInt(value, 10)
    if (isNaN(n) || n < 1 || n > 99) return
    onChange({ ...params, [key]: n })
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '0 16px',
      height: 36,
      background: 'var(--bg-primary)',
      borderBottom: '1px solid var(--border)',
      fontSize: 12,
      color: 'var(--text-secondary)',
    }}>
      <span style={{ color: '#388bfd', fontWeight: 600 }}>TSI</span>

      {(['long', 'short', 'signal'] as const).map(key => (
        <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: 'var(--text-muted)' }}>
            {{ long: '長期', short: '短期', signal: 'シグナル' }[key]}
          </span>
          <input
            type="number"
            min={1}
            max={99}
            value={params[key]}
            onChange={e => handleChange(key, e.target.value)}
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
      ))}

      <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
        ゼロライン <span style={{ color: 'var(--text-primary)' }}>-10</span>
      </span>
    </div>
  )
}
