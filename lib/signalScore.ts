import type { VixData }   from '@/app/api/vix/route'
import type { MacroData } from '@/app/api/macro/route'

// ── Lightweight Charts マーカー型 ─────────────────────
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
  | 'us_stock'       // 米国株・ETF          VIX+CAPE+金利+TSI
  | 'us_stock_fx'    // 米国株FX変換付き      VIX+CAPE+金利+TSI+PPP
  | 'jp_stock'       // 日本株               VIX+金利+TSI
  | 'jp_stock_fx'    // 日本株FX変換付き      VIX+金利+TSI+PPP
  | 'fx'             // 為替                 VIX+TSI
  | 'commodity'      // 商品                 VIX+TSI
  | 'crypto'         // 暗号資産             VIX+TSI
  | 'other'          // その他               VIX+TSI

const FX_RE        = /^(USD|JPY|EUR|GBP|AUD|CAD|CHF|NZD|CNY|HKD|SGD|KRW|MXN|BRL|INR)/i
const COMMODITY_RE = /^(GC|SI|CL|NG|HG|ZC|ZS|ZW|BZ|RB|HO|KC|CC|CT|SB|OJ)/i
const CRYPTO_RE    = /^(BTC|ETH|XRP|SOL|ADA|DOGE|DOT|AVAX|LINK|LTC|BCH|UNI|MATIC)/i
const JP_STOCK_RE  = /^\d{4}(\.T)?$|\.T$/i
const JP_INDEX_RE  = /^(\^N225|\^TOPX|1306|1321|1570|2558|2559|2633)/i

export function detectTickerCategory(ticker: string): TickerCategory {
  if (!ticker) return 'other'
  const hasFx  = ticker.includes('*')
  const base   = hasFx ? ticker.split('*')[0] : ticker

  if (ticker.endsWith('=X') || FX_RE.test(ticker)) return 'fx'
  if (CRYPTO_RE.test(base))    return 'crypto'
  if (COMMODITY_RE.test(base)) return 'commodity'

  if (JP_STOCK_RE.test(base) || JP_INDEX_RE.test(base)) {
    return hasFx ? 'jp_stock_fx' : 'jp_stock'
  }
  // デフォルト: 米国株
  return hasFx ? 'us_stock_fx' : 'us_stock'
}

export function isCapeApplicable(cat: TickerCategory): boolean {
  return cat === 'us_stock' || cat === 'us_stock_fx'
}

export function isRateApplicable(cat: TickerCategory): boolean {
  return cat === 'us_stock' || cat === 'us_stock_fx'
    || cat === 'jp_stock'   || cat === 'jp_stock_fx'
}

export function isPppApplicable(ticker: string): boolean {
  return ticker.includes('*')
}

// ── カテゴリ別 最大スコア（正規化用） ────────────────
// 各カテゴリで取れる理論上の最大買いスコア
const MAX_SCORE: Record<TickerCategory, number> = {
  us_stock:    8,   // VIX(3)+CAPE(1)+金利(1)+TSI(2)+PPP(0) = 7 → 切り上げ
  us_stock_fx: 9,   // VIX(3)+CAPE(1)+金利(1)+TSI(2)+PPP(1) = 8
  jp_stock:    6,   // VIX(3)+金利(1)+TSI(2)                = 6
  jp_stock_fx: 7,   // VIX(3)+金利(1)+TSI(2)+PPP(1)         = 7
  fx:          5,   // VIX(3)+TSI(2)                        = 5
  commodity:   5,
  crypto:      5,
  other:       5,
}

const MIN_SCORE: Record<TickerCategory, number> = {
  us_stock:    -6,  // VIX(-1)+CAPE(-2)+金利(-1)+TSI(-2)
  us_stock_fx: -8,  // VIX(-1)+CAPE(-2)+金利(-1)+TSI(-2)+PPP(-2)
  jp_stock:    -4,  // VIX(-1)+金利(-1)+TSI(-2)
  jp_stock_fx: -6,  // VIX(-1)+金利(-1)+TSI(-2)+PPP(-2)
  fx:          -3,  // VIX(-1)+TSI(-2)
  commodity:   -3,
  crypto:      -3,
  other:       -3,
}

// ── スコア型 ──────────────────────────────────────────
export interface SignalScore {
  total:       number
  normalized:  number   // 0〜100に正規化したスコア（表示・比較用）
  vix:         number
  cape:        number
  rate:        number
  tsi:         number
  ppp:         number
  capeNA:      boolean
  rateNA:      boolean
  pppNA:       boolean
  category:    TickerCategory
  strength:    'strong_buy' | 'buy' | 'weak_buy' | 'neutral' | 'weak_sell' | 'sell' | 'strong_sell'
  label:       string
  color:       string
  size:        number
}

export type TsiCrossType = 'golden_below' | 'golden_above' | 'dead_below' | 'dead_above' | null

// ── 各スコア計算 ──────────────────────────────────────
export function calcVixScore(vix: VixData | null): number {
  if (!vix) return 0
  switch (vix.status) {
    case 'panic':       return 3
    case 'fear':        return 1
    case 'complacency': return -1
    default:            return 0
  }
}

export function calcCapeScore(macro: MacroData | null): number {
  if (!macro || macro.cape.value === 0) return 0
  switch (macro.cape.status) {
    case 'cheap':     return 1
    case 'fair':      return 0
    case 'expensive': return -1
    case 'extreme':   return -2
  }
}

export function calcRateScore(macro: MacroData | null): number {
  if (!macro || macro.rate.current === 0) return 0
  switch (macro.rate.direction) {
    case 'cutting': return 1
    case 'hiking':  return -1
    case 'hold':    return 0
  }
}

export function calcTsiScore(crossType: TsiCrossType): number {
  switch (crossType) {
    case 'golden_below': return 2
    case 'golden_above': return 1
    case 'dead_below':   return -2
    case 'dead_above':   return -1
    default:             return 0
  }
}

// PPP乖離率スコア（円ベース投資家: 円安=有利=プラス）
export function calcPppScore(dev: number | null): number {
  if (dev === null) return 0
  if (dev >= 40)   return 0   // 極端な円安: 高値圏・中立
  if (dev >= 20)   return 1   // 円安圏: 有利
  if (dev >= -20)  return 0   // 適正圏
  if (dev >= -40)  return -1  // 円高方向: 不利
  return -2                    // 極端な円高
}

// ── 正規化スコア → strength変換 ──────────────────────
// 正規化スコア(0〜100)を使うことでカテゴリ間の公平な比較が可能
function toStrength(normalized: number): SignalScore['strength'] {
  if (normalized >= 75) return 'strong_buy'
  if (normalized >= 62) return 'buy'
  if (normalized >= 55) return 'weak_buy'
  if (normalized <= 20) return 'strong_sell'
  if (normalized <= 33) return 'sell'
  if (normalized <= 42) return 'weak_sell'
  return 'neutral'
}

const STRENGTH_META: Record<SignalScore['strength'], { label: string; color: string; size: number }> = {
  strong_buy:  { label: '🔥 強い買い', color: '#f59e0b', size: 4 },
  buy:         { label: '✅ 買い',     color: '#3fb950', size: 3 },
  weak_buy:    { label: '🔵 弱い買い', color: '#58a6ff', size: 2 },
  neutral:     { label: '⬜ 中立',     color: '#8b949e', size: 1 },
  weak_sell:   { label: '🟡 弱い売り', color: '#d29922', size: 1 },
  sell:        { label: '🔴 売り警戒', color: '#f85149', size: 2 },
  strong_sell: { label: '🚨 強い売り', color: '#ff0000', size: 3 },
}

// ── メイン計算 ────────────────────────────────────────
export function calcSignalScore(
  vix:          VixData    | null,
  macro:        MacroData  | null,
  crossType:    TsiCrossType,
  ticker:       string = '',
  pppDeviation: number | null = null,
): SignalScore {
  const category = detectTickerCategory(ticker)
  const capeNA   = !isCapeApplicable(category)
  const rateNA   = !isRateApplicable(category)
  const pppNA    = !isPppApplicable(ticker)

  const vixS  = calcVixScore(vix)
  const capeS = capeNA ? 0 : calcCapeScore(macro)
  const rateS = rateNA ? 0 : calcRateScore(macro)
  const tsiS  = calcTsiScore(crossType)
  const pppS  = pppNA  ? 0 : calcPppScore(pppDeviation)
  const total = vixS + capeS + rateS + tsiS + pppS

  // カテゴリ別最大・最小スコアで 0〜100 に正規化
  const maxS = MAX_SCORE[category]
  const minS = MIN_SCORE[category]
  const normalized = Math.round(((total - minS) / (maxS - minS)) * 100)

  const strength = toStrength(normalized)
  const meta     = STRENGTH_META[strength]

  return {
    total, normalized,
    vix: vixS, cape: capeS, rate: rateS, tsi: tsiS, ppp: pppS,
    capeNA, rateNA, pppNA,
    category, strength, ...meta,
  }
}

export function formatScoreBreakdown(score: SignalScore): string {
  return [
    `合計: ${score.total > 0 ? '+' : ''}${score.total} / 正規化: ${score.normalized} [${score.label}]`,
    `  VIX:  ${score.vix > 0 ? '+' : ''}${score.vix}`,
    `  CAPE: ${score.capeNA ? 'N/A' : `${score.cape > 0 ? '+' : ''}${score.cape}`}`,
    `  金利: ${score.rateNA ? 'N/A' : `${score.rate > 0 ? '+' : ''}${score.rate}`}`,
    `  PPP:  ${score.pppNA  ? 'N/A' : `${score.ppp  > 0 ? '+' : ''}${score.ppp}`}`,
    `  TSI:  ${score.tsi > 0 ? '+' : ''}${score.tsi}`,
  ].join('\n')
}
