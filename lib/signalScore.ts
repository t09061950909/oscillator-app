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
  | 'us_stock'       // 米国株・ETF        VIX+CAPE+金利+TSI
  | 'us_stock_fx'    // 米国株FX変換付き    VIX+CAPE+金利+TSI+PPP
  | 'jp_stock'       // 日本株             VIX+金利+TSI
  | 'jp_stock_fx'    // 日本株FX変換付き    VIX+金利+TSI+PPP
  | 'fx'             // 為替               VIX+TSI
  | 'commodity'      // 商品               VIX+TSI
  | 'crypto'         // 暗号資産           VIX+TSI
  | 'other'          // その他             VIX+TSI

const FX_RE        = /^(USD|JPY|EUR|GBP|AUD|CAD|CHF|NZD|CNY|HKD|SGD|KRW|MXN|BRL|INR)/i
const COMMODITY_RE = /^(GC|SI|CL|NG|HG|ZC|ZS|ZW|BZ|RB|HO|KC|CC|CT|SB|OJ)/i
const CRYPTO_RE    = /^(BTC|ETH|XRP|SOL|ADA|DOGE|DOT|AVAX|LINK|LTC|BCH|UNI|MATIC)/i
const JP_STOCK_RE  = /^\d{4}(\.T)?$|\.T$/i
const JP_INDEX_RE  = /^(\^N225|\^TOPX|1306|1321|1570|2558|2559|2633)/i

export function detectTickerCategory(ticker: string): TickerCategory {
  if (!ticker) return 'other'
  const hasFx = ticker.includes('*')
  const base  = hasFx ? ticker.split('*')[0] : ticker
  if (ticker.endsWith('=X') || FX_RE.test(ticker)) return 'fx'
  if (CRYPTO_RE.test(base))    return 'crypto'
  if (COMMODITY_RE.test(base)) return 'commodity'
  if (JP_STOCK_RE.test(base) || JP_INDEX_RE.test(base))
    return hasFx ? 'jp_stock_fx' : 'jp_stock'
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

// ── カテゴリ別 最大・最小スコア ───────────────────────
const MAX_SCORE: Record<TickerCategory, number> = {
  us_stock:    7,  // VIX(3)+CAPE(1)+金利(1)+TSI(2)
  us_stock_fx: 8,  // VIX(3)+CAPE(1)+金利(1)+TSI(2)+PPP(1)
  jp_stock:    6,  // VIX(3)+金利(1)+TSI(2)
  jp_stock_fx: 7,  // VIX(3)+金利(1)+TSI(2)+PPP(1)
  fx:          5,  // VIX(3)+TSI(2)
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
  total:    number
  ratio:    number   // total/maxScore比率（-1〜+1）、表示用
  vix:      number
  cape:     number
  rate:     number
  tsi:      number
  ppp:      number
  capeNA:   boolean
  rateNA:   boolean
  pppNA:    boolean
  category: TickerCategory
  strength: 'strong_buy' | 'buy' | 'weak_buy' | 'neutral' | 'weak_sell' | 'sell' | 'strong_sell'
  label:    string
  color:    string
  size:     number
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
    case 'cheap':     return  1
    case 'fair':      return  0
    case 'expensive': return -1
    case 'extreme':   return -2
  }
}
export function calcRateScore(macro: MacroData | null): number {
  if (!macro || macro.rate.current === 0) return 0
  switch (macro.rate.direction) {
    case 'cutting': return  1
    case 'hiking':  return -1
    case 'hold':    return  0
  }
}
export function calcTsiScore(crossType: TsiCrossType): number {
  switch (crossType) {
    case 'golden_below': return  2
    case 'golden_above': return  1
    case 'dead_below':   return -2
    case 'dead_above':   return -1
    default:             return  0
  }
}
// 円ベース投資家: 円安=有利=プラス、円高=不利=マイナス
export function calcPppScore(dev: number | null): number {
  if (dev === null) return 0
  if (dev >= 40)  return  0   // 極端な円安: 高値圏・中立
  if (dev >= 20)  return  1   // 円安圏: 有利
  if (dev >= -20) return  0   // 適正圏
  if (dev >= -40) return -1   // 円高方向: 不利
  return -2                    // 極端な円高
}

// ── strength判定（比率ベース、total=0は必ずneutral）──
function toStrength(total: number, category: TickerCategory): SignalScore['strength'] {
  if (total === 0) return 'neutral'
  const ref   = total > 0 ? MAX_SCORE[category] : Math.abs(MIN_SCORE[category])
  const ratio = total / ref
  if (ratio >= 0.70) return 'strong_buy'
  if (ratio >= 0.45) return 'buy'
  if (ratio >  0)    return 'weak_buy'
  if (ratio <= -0.70) return 'strong_sell'
  if (ratio <= -0.45) return 'sell'
  return 'weak_sell'
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

  const maxS    = MAX_SCORE[category]
  const ratio   = Math.round((total / maxS) * 100) / 100

  const strength = toStrength(total, category)
  const meta     = STRENGTH_META[strength]

  return {
    total, ratio,
    vix: vixS, cape: capeS, rate: rateS, tsi: tsiS, ppp: pppS,
    capeNA, rateNA, pppNA,
    category, strength, ...meta,
  }
}

export function formatScoreBreakdown(score: SignalScore): string {
  return [
    `合計: ${score.total > 0 ? '+' : ''}${score.total} [${score.label}]`,
    `  VIX:  ${score.vix > 0 ? '+' : ''}${score.vix}`,
    `  CAPE: ${score.capeNA ? 'N/A' : `${score.cape > 0 ? '+' : ''}${score.cape}`}`,
    `  金利: ${score.rateNA ? 'N/A' : `${score.rate > 0 ? '+' : ''}${score.rate}`}`,
    `  PPP:  ${score.pppNA  ? 'N/A' : `${score.ppp  > 0 ? '+' : ''}${score.ppp}`}`,
    `  TSI:  ${score.tsi > 0 ? '+' : ''}${score.tsi}`,
  ].join('\n')
}
