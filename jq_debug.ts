/**
 * jq_debug.ts - J-Quants APIレスポンス構造確認
 * 使い方: npx tsx --env-file=.env.local jq_debug.ts
 */

async function main() {
  const API_KEY = process.env.JQUANTS_API_KEY

  if (!API_KEY) {
    console.error('❌ JQUANTS_API_KEY が未設定です')
    process.exit(1)
  }

  console.log(`✅ APIキー確認: ${API_KEY.slice(0, 8)}...（${API_KEY.length}文字）`)

  // ── 1. 銘柄マスタ ─────────────────────────────────────────
  console.log('\n[TEST 1] 銘柄マスタ取得...')
  const masterRes = await fetch('https://api.jquants.com/v2/equities/master', {
    headers: { 'x-api-key': API_KEY }
  })
  console.log(`  HTTPステータス: ${masterRes.status}`)

  if (!masterRes.ok) {
    const txt = await masterRes.text()
    console.error(`  エラー内容: ${txt}`)
  } else {
    const masterJson = await masterRes.json() as Record<string, unknown>
    console.log(`  レスポンスキー: ${Object.keys(masterJson).join(', ')}`)
    for (const [k, v] of Object.entries(masterJson)) {
      if (Array.isArray(v)) {
        console.log(`  ${k}: Array(${v.length}件) 先頭1件 =`, JSON.stringify(v[0]))
      } else {
        console.log(`  ${k}: ${JSON.stringify(v)}`)
      }
    }
  }

  // ── 2. 日次価格（コード4桁）───────────────────────────────
  const from = '2026-01-05'
  const to   = '2026-04-02'

  console.log(`\n[TEST 2] 日次価格（code=7203, 4桁）${from}〜${to}`)
  const res4 = await fetch(
    `https://api.jquants.com/v2/equities/bars/daily?code=7203&from=${from}&to=${to}`,
    { headers: { 'x-api-key': API_KEY } }
  )
  console.log(`  HTTPステータス: ${res4.status}`)
  if (!res4.ok) {
    console.error(`  エラー内容: ${await res4.text()}`)
  } else {
    const j = await res4.json() as Record<string, unknown>
    console.log(`  レスポンスキー: ${Object.keys(j).join(', ')}`)
    for (const [k, v] of Object.entries(j)) {
      if (Array.isArray(v)) {
        console.log(`  ${k}: Array(${v.length}件)`)
        if (v.length > 0) console.log(`    先頭1件 =`, JSON.stringify(v[0]))
        if (v.length > 1) console.log(`    末尾1件 =`, JSON.stringify(v[v.length-1]))
      } else {
        console.log(`  ${k}: ${JSON.stringify(v)}`)
      }
    }
  }

  // ── 3. 日次価格（コード5桁）───────────────────────────────
  console.log(`\n[TEST 3] 日次価格（code=72030, 5桁）${from}〜${to}`)
  const res5 = await fetch(
    `https://api.jquants.com/v2/equities/bars/daily?code=72030&from=${from}&to=${to}`,
    { headers: { 'x-api-key': API_KEY } }
  )
  console.log(`  HTTPステータス: ${res5.status}`)
  if (!res5.ok) {
    console.error(`  エラー内容: ${await res5.text()}`)
  } else {
    const j = await res5.json() as Record<string, unknown>
    console.log(`  レスポンスキー: ${Object.keys(j).join(', ')}`)
    for (const [k, v] of Object.entries(j)) {
      if (Array.isArray(v)) {
        console.log(`  ${k}: Array(${v.length}件)`)
        if (v.length > 0) console.log(`    先頭1件 =`, JSON.stringify(v[0]))
      } else {
        console.log(`  ${k}: ${JSON.stringify(v)}`)
      }
    }
  }

  // ── 4. 日付を過去に変更（Free plan確認）──────────────────
  const from2 = '2024-06-01'
  const to2   = '2024-12-31'
  console.log(`\n[TEST 4] 日付範囲を過去に変更（code=72030）${from2}〜${to2}`)
  const res6 = await fetch(
    `https://api.jquants.com/v2/equities/bars/daily?code=72030&from=${from2}&to=${to2}`,
    { headers: { 'x-api-key': API_KEY } }
  )
  console.log(`  HTTPステータス: ${res6.status}`)
  if (!res6.ok) {
    console.error(`  エラー内容: ${await res6.text()}`)
  } else {
    const j = await res6.json() as Record<string, unknown>
    console.log(`  レスポンスキー: ${Object.keys(j).join(', ')}`)
    for (const [k, v] of Object.entries(j)) {
      if (Array.isArray(v)) {
        console.log(`  ${k}: Array(${v.length}件)`)
        if (v.length > 0) console.log(`    先頭1件 =`, JSON.stringify(v[0]))
      } else {
        console.log(`  ${k}: ${JSON.stringify(v)}`)
      }
    }
  }
}

main().catch(err => {
  console.error('エラー:', err)
  process.exit(1)
})
