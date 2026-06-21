/**
 * signalScore.ts
 * Phase 3: 複合シグナルスコアリングロジック
 *
 * 各指標のスコアを合算して買い/売りシグナルの強度を判定する。
 * React非依存の純粋関数のみ。Phase 4のアラート等でも再利用可能。
 */

import type { VixData }   from '@/app/api/vix/route'
import type { MacroData } from '@/app/api/macro/route'

// Lightweight Charts v5 マーカー型（再エクスポート用）
export interface EnhancedMarker {
  time:     import('lightweight-charts').Time
  position: 'belowBar' | 'aboveBar'
  color:    string
  shape:    'arrowUp' | 'arrowDown' | 'circle' | 'square'
  text?:    string
  size?:    number
}

// ── 銘柄カテゴリ ──────────────────────────────────────
export type TickerCategory =
  | 'us_stock'    // 米国株・米国ETF → VIX/CAPE/金利すべて有効
  | 'jp_stock'    // 日本株・日本ETF → VIX/金利有効、CAPE除外
  | 'fx'          // 為替              → VIX/金利有効、CAPE除外
  | 'commodity'   // 商品              → VIX有効、CAPE/金利除外
  | 'crypto'      // 暗号資産          → VIX有効、CAPE/金利除外
  | 'other'       // その他            → VIX有効、CAPE/金利除外

// FXティッカーパターン
const FX_PATTERNS = /^(USD|JPY|EUR|GBP|AUD|CAD|CHF|NZD|CNY|HKD|SGD|KRW|MXN|BRL|INR)/i
// 商品パターン
const COMMODITY_PATTERNS = /^(GC|SI|CL|NG|HG|ZC|ZS|ZW|BZ|RB|HO|KC|CC|CT|SB|OJ)/i
// 暗号資産パターン
const CRYPTO_PATTERNS = /^(BTC|ETH|XRP|SOL|ADA|DOGE|DOT|AVAX|LINK|LTC|BCH|UNI|MATIC)/i
// 日本株パターン（数字4桁 or .T suffix）
const JP_STOCK_PATTERNS = /^\d{4}(\.T)?$|\.T$/i
// 日本インデックス
const JP_INDEX_PATTERNS = /^(\^N225|\^TOPX|1306|1321|1570|2558|2559|2633)/i

/**
 * tickerから銘柄カテゴリを判定する
 * ticker例: "AAPL", "7203.T", "USDJPY=X", "^N225", "SOX*USDJPY"
 */
export function detectTickerCategory(ticker: string): TickerCategory {
  if (!ticker) return 'other'

  // FX変換付き銘柄（例: SOX*USDJPY）→ ベース部分で判定
  const baseTicker = ticker.includes('*') ? ticker.split('*')[0] : ticker

  // 為替ティッカー（例: USDJPY=X, EURUSD=X）
  if (ticker.endsWith('=X') || FX_PATTERNS.test(ticker)) return 'fx'

  // 暗号資産
  if (CRYPTO_PATTERNS.test(baseTicker)) return 'crypto'

  // 商品
  if (COMMODITY_PATTERNS.test(baseTicker)) return 'commodity'

  // 日本株・日本インデックス
  if (JP_STOCK_PATTERNS.test(baseTicker) || JP_INDEX_PATTERNS.test(baseTicker)) return 'jp_stock'

  // デフォルトは米国株として扱う
  return 'us_stock'
}

/** カテゴリ別にCAPEが有効かどうか */
export function isCapeApplicable(category: TickerCategory): boolean {
  return category === 'us_stock'
}

/** カテゴリ別に金利スコアが有効かどうか */
export function isRateApplicable(category: TickerCategory): boolean {
  // FX・商品・暗号資産では金利方向の影響が異なるため除外
  return category === 'us_stock' || category === 'jp_stock'
}

// ── スコア定義 ────────────────────────────────────────
export interface SignalScore {
  total:    number
  vix:      number
  cape:     number   // 非対象カテゴリは null（表示で「N/A」）
  rate:     number
  tsi:      number
  capeNA:   boolean  // CAPEが非適用かどうか
  rateNA:   boolean  // 金利が非適用かどうか
  category: TickerCategory
  strength: 'strong_buy' | 'buy' | 'weak_buy' | 'neutral' | 'weak_sell' | 'sell' | 'strong_sell'
  label:    string
  color:    string
  size:     number
}

// ── VIXスコア ─────────────────────────────────────────
export function calcVixScore(vix: VixData | null): number {
  if (!vix) return 0
  switch (vix.status) {
    case 'panic':       return 3
    case 'fear':        return 1
    case 'complacency': return -1
    default:            return 0
  }
}

// ── CAPEスコア ────────────────────────────────────────
export function calcCapeScore(macro: MacroData | null): number {
  if (!macro || macro.cape.value === 0) return 0
  switch (macro.cape.status) {
    case 'cheap':     return 1
    case 'fair':      return 0
    case 'expensive': return -1
    case 'extreme':   return -2
  }
}

// ── 金利スコア ────────────────────────────────────────
export function calcRateScore(macro: MacroData | null): number {
  if (!macro || macro.rate.current === 0) return 0
  switch (macro.rate.direction) {
    case 'cutting': return 1
    case 'hiking':  return -1
    case 'hold':    return 0
  }
}

// ── TSIシグナルスコア ─────────────────────────────────
export type TsiCrossType = 'golden_below' | 'golden_above' | 'dead_below' | 'dead_above' | null

export function calcTsiScore(crossType: TsiCrossType): number {
  switch (crossType) {
    case 'golden_below': return 2
    case 'golden_above': return 1
    case 'dead_below':   return -2
    case 'dead_above':   return -1
    default:             return 0
  }
}

// ── 合計スコア → strength変換 ────────────────────────
function toStrength(total: number): SignalScore['strength'] {
  if (total >= 5) return 'strong_buy'
  if (total >= 3) return 'buy'
  if (total >= 1) return 'weak_buy'
  if (total <= -4) return 'strong_sell'
  if (total <= -2) return 'sell'
  if (total <= -1) return 'weak_sell'
  return 'neutral'
}

const STRENGTH_META: Record<SignalScore['strength'], { label: string; color: string; size: number }> = {
  strong_buy:  { label: '🔥 強い買い',  color: '#f59e0b', size: 4 },
  buy:         { label: '✅ 買い',      color: '#3fb950', size: 3 },
  weak_buy:    { label: '🔵 弱い買い',  color: '#58a6ff', size: 2 },
  neutral:     { label: '⬜ 中立',      color: '#8b949e', size: 1 },
  weak_sell:   { label: '🟡 弱い売り',  color: '#d29922', size: 1 },
  sell:        { label: '🔴 売り警戒',  color: '#f85149', size: 2 },
  strong_sell: { label: '🚨 強い売り',  color: '#ff0000', size: 3 },
}

// ── メイン計算関数 ────────────────────────────────────
export function calcSignalScore(
  vix:       VixData    | null,
  macro:     MacroData  | null,
  crossType: TsiCrossType,
  ticker:    string = '',
): SignalScore {
  const category = detectTickerCategory(ticker)
  const capeNA   = !isCapeApplicable(category)
  const rateNA   = !isRateApplicable(category)

  const vixS  = calcVixScore(vix)
  const capeS = capeNA ? 0 : calcCapeScore(macro)
  const rateS = rateNA ? 0 : calcRateScore(macro)
  const tsiS  = calcTsiScore(crossType)
  const total = vixS + capeS + rateS + tsiS

  const strength = toStrength(total)
  const meta     = STRENGTH_META[strength]

  return {
    total, vix: vixS, cape: capeS, rate: rateS, tsi: tsiS,
    capeNA, rateNA, category,
    strength, ...meta,
  }
}

export function formatScoreBreakdown(score: SignalScore): string {
  return [
    `合計: ${score.total > 0 ? '+' : ''}${score.total} [${score.label}]`,
    `  VIX: ${score.vix > 0 ? '+' : ''}${score.vix}`,
    `  CAPE: ${score.capeNA ? 'N/A' : `${score.cape > 0 ? '+' : ''}${score.cape}`}`,
    `  金利: ${score.rateNA ? 'N/A' : `${score.rate > 0 ? '+' : ''}${score.rate}`}`,
    `  TSI: ${score.tsi > 0 ? '+' : ''}${score.tsi}`,
  ].join('\n')
}
  color:    string
  shape:    'arrowUp' | 'arrowDown' | 'circle' | 'square'
  text?:    string
  size?:    number
}

// ── スコア定義 ────────────────────────────────────────
// 買いスコア: プラス / 売りスコア: マイナス / 中立: 0
// 合計レンジ: -7 〜 +9

export interface SignalScore {
  total:    number   // 合計スコア
  vix:      number   // VIXスコア    (-1 〜 +3)
  cape:     number   // CAPEスコア   (-2 〜 +1)
  rate:     number   // 金利スコア   (-1 〜 +1)
  tsi:      number   // TSIスコア    (-2 〜 +2)
  strength: 'strong_buy' | 'buy' | 'weak_buy' | 'neutral' | 'weak_sell' | 'sell' | 'strong_sell'
  label:    string
  color:    string   // マーカー色
  size:     number   // マーカーサイズ (1〜4)
}

// ── VIXスコア ─────────────────────────────────────────
export function calcVixScore(vix: VixData | null): number {
  if (!vix) return 0
  switch (vix.status) {
    case 'panic':       return 3   // VIX>=40: 最強の買いシグナル
    case 'fear':        return 1   // VIX>=25: 買い補助
    case 'complacency': return -1  // VIX<=10: 楽観 → 買いを弱める
    default:            return 0
  }
}

// ── CAPEスコア ────────────────────────────────────────
export function calcCapeScore(macro: MacroData | null): number {
  if (!macro || macro.cape.value === 0) return 0
  switch (macro.cape.status) {
    case 'cheap':     return 1
    case 'fair':      return 0
    case 'expensive': return -1
    case 'extreme':   return -2
  }
}

// ── 金利スコア ────────────────────────────────────────
export function calcRateScore(macro: MacroData | null): number {
  if (!macro || macro.rate.current === 0) return 0
  switch (macro.rate.direction) {
    case 'cutting': return 1
    case 'hiking':  return -1
    case 'hold':    return 0
  }
}

// ── TSIシグナルスコア ─────────────────────────────────
// crossType: detectCrossSignals の s.type
export type TsiCrossType = 'golden_below' | 'golden_above' | 'dead_below' | 'dead_above' | null

export function calcTsiScore(crossType: TsiCrossType): number {
  switch (crossType) {
    case 'golden_below': return 2   // -10以下でGC: 最強TSIシグナル
    case 'golden_above': return 1   // 通常GC
    case 'dead_below':   return -2  // -10以下でDC: 最強売りシグナル
    case 'dead_above':   return -1  // 通常DC
    default:             return 0
  }
}

// ── 合計スコア → strength変換 ────────────────────────
function toStrength(total: number): SignalScore['strength'] {
  if (total >= 5) return 'strong_buy'
  if (total >= 3) return 'buy'
  if (total >= 1) return 'weak_buy'
  if (total <= -4) return 'strong_sell'
  if (total <= -2) return 'sell'
  if (total <= -1) return 'weak_sell'
  return 'neutral'
}

const STRENGTH_META: Record<SignalScore['strength'], { label: string; color: string; size: number }> = {
  strong_buy:  { label: '🔥 強い買い',  color: '#f59e0b', size: 4 },  // 金色・最大
  buy:         { label: '✅ 買い',      color: '#3fb950', size: 3 },  // 緑・大
  weak_buy:    { label: '🔵 弱い買い',  color: '#58a6ff', size: 2 },  // 青・中
  neutral:     { label: '⬜ 中立',      color: '#8b949e', size: 1 },  // グレー・小
  weak_sell:   { label: '🟡 弱い売り',  color: '#d29922', size: 1 },  // 黄・小
  sell:        { label: '🔴 売り警戒',  color: '#f85149', size: 2 },  // 赤・中
  strong_sell: { label: '🚨 強い売り',  color: '#ff0000', size: 3 },  // 赤・大
}

// ── メイン計算関数 ────────────────────────────────────
export function calcSignalScore(
  vix:      VixData   | null,
  macro:    MacroData | null,
  crossType: TsiCrossType,
): SignalScore {
  const vixS  = calcVixScore(vix)
  const capeS = calcCapeScore(macro)
  const rateS = calcRateScore(macro)
  const tsiS  = calcTsiScore(crossType)
  const total = vixS + capeS + rateS + tsiS

  const strength = toStrength(total)
  const meta     = STRENGTH_META[strength]

  return {
    total,
    vix:  vixS,
    cape: capeS,
    rate: rateS,
    tsi:  tsiS,
    strength,
    ...meta,
  }
}

// ── スコア内訳テキスト（通知・ログ用） ───────────────
export function formatScoreBreakdown(score: SignalScore): string {
  return [
    `合計: ${score.total > 0 ? '+' : ''}${score.total} [${score.label}]`,
    `  VIX: ${score.vix > 0 ? '+' : ''}${score.vix}`,
    `  CAPE: ${score.capeNA ? 'N/A' : `${score.cape > 0 ? '+' : ''}${score.cape}`}`,
    `  金利: ${score.rateNA ? 'N/A' : `${score.rate > 0 ? '+' : ''}${score.rate}`}`,
    `  TSI: ${score.tsi > 0 ? '+' : ''}${score.tsi}`,
  ].join('\n')
}
