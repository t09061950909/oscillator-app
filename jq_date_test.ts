/**
 * jq_date_test.ts - toパラメータの境界値テスト
 * npx tsx --env-file=.env.local jq_date_test.ts
 */
async function main() {
  const API_KEY = process.env.JQUANTS_API_KEY!

  const tests = [
    // TEST2と同じ（成功例）
    { label: 'from=2026-01-05, to=2026-04-02', from: '2026-01-05', to: '2026-04-02' },
    // fromを変えてみる
    { label: 'from=2024-12-22, to=2026-04-02', from: '2024-12-22', to: '2026-04-02' },
    { label: 'from=2025-01-01, to=2026-04-02', from: '2025-01-01', to: '2026-04-02' },
    { label: 'from=2025-06-01, to=2026-04-02', from: '2025-06-01', to: '2026-04-02' },
    { label: 'from=2025-12-01, to=2026-04-02', from: '2025-12-01', to: '2026-04-02' },
    // toを変えてみる（84日より前）
    { label: 'from=2026-01-05, to=2026-03-01', from: '2026-01-05', to: '2026-03-01' },
    // toを直近（84日以内）に設定
    { label: 'from=2026-01-05, to=2026-06-01', from: '2026-01-05', to: '2026-06-01' },
  ]

  for (const t of tests) {
    const url = `https://api.jquants.com/v2/equities/bars/daily?code=7203&from=${t.from}&to=${t.to}`
    const res = await fetch(url, { headers: { 'x-api-key': API_KEY } })
    const json = await res.json() as Record<string, unknown>
    const count = Array.isArray(json.data) ? json.data.length : '-'
    console.log(`${res.status === 200 ? '✅' : '❌'} ${t.label}  → HTTP ${res.status}  件数: ${count}`)
    if (res.status !== 200) console.log(`   エラー: ${JSON.stringify(json)}`)
  }
}
main().catch(console.error)
