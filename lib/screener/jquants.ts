/**
 * lib/screener/jquants.ts
 *
 * J-Quants API V2 クライアント（Free plan対応）
 * ※ レスポンスキーは実APIから確認済み:
 *   - 銘柄マスタ: { data: JQuantsIssue[] }
 *   - 日次価格:   { data: JQuantsBar[] }
 *   - フィールド: CoName / CoNameEn / Mkt / S17 / S33 / ScaleCat など
 */

import type { PriceBar } from '@/types'

const JQUANTS_BASE_URL = 'https://api.jquants.com/v2'

// Free planのレート制限: 5req/min → 13秒インターバル
const RATE_LIMIT_MS = 13_000

// ── 型定義（実APIレスポンスから確認済み） ────────────────────

export interface JQuantsBar {
  Date:      string        // "YYYY-MM-DD"
  Code:      string        // "72030" (5桁)
  O:         number | null // 始値
  H:         number | null // 高値
  L:         number | null // 安値
  C:         number | null // 終値
  Vo:        number | null // 出来高
  Va:        number | null // 売買代金
  AdjFactor: number        // 調整係数
  AdjO:      number | null // 調整済み始値
  AdjH:      number | null // 調整済み高値
  AdjL:      number | null // 調整済み安値
  AdjC:      number | null // 調整済み終値
  AdjVo:     number | null // 調整済み出来高
  UL?:       string        // ストップ高
  LL?:       string        // ストップ安
}

export interface JQuantsIssue {
  Code:      string  // "13010" (5桁)
  CoName:    string  // "極洋"
  CoNameEn:  string  // "KYOKUYO CO.,LTD."
  S17:       string  // セクター17コード
  S17Nm:     string  // セクター17名称
  S33:       string  // セクター33コード
  S33Nm:     string  // セクター33名称
  ScaleCat:  string  // 規模区分
  Mkt:       string  // 市場コード "0111"=プライム, "0112"=スタンダード, "0113"=グロース
  MktNm:     string  // 市場名称
  Mrgn?:     string  // 信用区分
  MrgnNm?:   string  // 信用区分名称
  ProdCat?:  string  // 商品区分
  Date?:     string  // 基準日
}

// ── レート制限ヘルパー ────────────────────────────────────────

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── 共通フェッチ関数 ─────────────────────────────────────────

async function jquantsFetch<T>(
  path:   string,
  params: Record<string, string> = {}
): Promise<T> {
  const API_KEY = process.env.JQUANTS_API_KEY
  if (!API_KEY) throw new Error('JQUANTS_API_KEY が設定されていません')

  const url = new URL(`${JQUANTS_BASE_URL}/${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const res = await fetch(url.toString(), {
    headers: { 'x-api-key': API_KEY },
    cache: 'no-store',
  })

  if (res.status === 429) {
    console.warn('[jquants] 429 Too Many Requests, waiting 30s...')
    await sleep(30_000)
    return jquantsFetch<T>(path, params)
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`[jquants] HTTP ${res.status} ${path}: ${text}`)
  }

  return res.json() as Promise<T>
}

// ── 銘柄マスタ取得 ───────────────────────────────────────────

/**
 * 全上場銘柄の一覧を取得
 * レスポンス: { data: JQuantsIssue[], pagination_key?: string }
 */
export async function fetchJQuantsIssues(date?: string): Promise<JQuantsIssue[]> {
  const params: Record<string, string> = {}
  if (date) params.date = date

  const issues: JQuantsIssue[] = []
  let paginationKey: string | undefined

  do {
    if (paginationKey) {
      params.pagination_key = paginationKey
      await sleep(RATE_LIMIT_MS)
    }

    // 実APIレスポンス: { data: [...], pagination_key?: "..." }
    const res = await jquantsFetch<{
      data: JQuantsIssue[]
      pagination_key?: string
    }>('equities/master', params)

    issues.push(...(res.data ?? []))
    paginationKey = res.pagination_key
  } while (paginationKey)

  console.log(`[jquants] fetchIssues: ${issues.length}件取得`)
  return issues
}

// ── 日次価格取得（日付指定・全銘柄一括） ──────────────────────

/**
 * 指定日の全上場銘柄の価格を取得
 * レスポンス: { data: JQuantsBar[], pagination_key?: string }
 */
export async function fetchJQuantsDailyByDate(date: string): Promise<JQuantsBar[]> {
  const bars: JQuantsBar[] = []
  let paginationKey: string | undefined

  do {
    if (paginationKey) await sleep(RATE_LIMIT_MS)

    const params: Record<string, string> = { date }
    if (paginationKey) params.pagination_key = paginationKey

    const res = await jquantsFetch<{
      data: JQuantsBar[]
      pagination_key?: string
    }>('equities/bars/daily', params)

    bars.push(...(res.data ?? []))
    paginationKey = res.pagination_key
  } while (paginationKey)

  console.log(`[jquants] fetchByDate(${date}): ${bars.length}件`)
  return bars
}

/**
 * 指定銘柄・期間の日次価格を取得
 * レスポンス: { data: JQuantsBar[], pagination_key?: string }
 *
 * @param code  証券コード（4桁・5桁どちらも可）
 * @param from  "YYYY-MM-DD"
 * @param to    "YYYY-MM-DD"
 */
export async function fetchJQuantsDailyByCode(
  code: string,
  from: string,
  to:   string
): Promise<JQuantsBar[]> {
  const bars: JQuantsBar[] = []
  let paginationKey: string | undefined

  do {
    if (paginationKey) await sleep(RATE_LIMIT_MS)

    const params: Record<string, string> = { code, from, to }
    if (paginationKey) params.pagination_key = paginationKey

    const res = await jquantsFetch<{
      data: JQuantsBar[]
      pagination_key?: string
    }>('equities/bars/daily', params)

    bars.push(...(res.data ?? []))
    paginationKey = res.pagination_key
  } while (paginationKey)

  return bars
}

// ── J-Quants Bar → PriceBar 変換 ─────────────────────────────

/**
 * J-Quants レスポンスを PriceBar 型に変換
 * 調整済み株価（AdjC等）を使用して株式分割を考慮
 */
export function jQuantsBarToPriceBar(bar: JQuantsBar): PriceBar | null {
  if (
    bar.AdjO == null || bar.AdjH == null ||
    bar.AdjL == null || bar.AdjC == null
  ) return null

  return {
    date:   bar.Date,
    open:   bar.AdjO,
    high:   bar.AdjH,
    low:    bar.AdjL,
    close:  bar.AdjC,
    volume: bar.AdjVo ?? bar.Vo ?? 0,
  }
}

// ── 日付ユーティリティ ────────────────────────────────────────

/**
 * Free plan で取得可能な日付範囲を返す
 * 直近84日（12週間）は遅延のため取得不可
 */
export function getJQuantsFreeAvailableRange(): { from: string; to: string } {
  const now  = new Date()
  const to   = new Date(now)
  to.setDate(to.getDate() - 84)        // 12週間前（Free planの遅延）

  // Free plan は「2年分」だが境界付近は不安定なため550日前を使用
  const from = new Date(now)
  from.setDate(from.getDate() - 550)

  return {
    from: from.toISOString().slice(0, 10),
    to:   to.toISOString().slice(0, 10),
  }
}



/** Free plan の最新取得可能日（84日前）*/
export function getLatestAvailableDate(): string {
  const d = new Date()
  d.setDate(d.getDate() - 84)
  return d.toISOString().slice(0, 10)
}

/**
 * MA計算に必要な開始日を返す
 * 例: MA75 → 75 × 1.5 + 60 ≒ 173日前
 */
export function calcFromDate(maLongPeriod: number): string {
  const calendarDays = Math.ceil(maLongPeriod * 1.5) + 60
  const d = new Date()
  d.setDate(d.getDate() - calendarDays)
  return d.toISOString().slice(0, 10)
}
