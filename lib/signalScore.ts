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
  | 'us_stock'
  | 'jp_stock'
  | 'fx'
  | 'commodity'
  | 'crypto'
  | 'other'

const FX_RE        = /^(USD|JPY|EUR|GBP|AUD|CAD|CHF|NZD|CNY|HKD|SGD|KRW|MXN|BRL|INR)/i
const COMMODITY_RE = /^(GC|SI|CL|NG|HG|ZC|ZS|ZW|BZ|RB|HO|KC|CC|CT|SB|OJ)/i
const CRYPTO_RE    = /^(BTC|ETH|XRP|SOL|ADA|DOGE|DOT|AVAX|LINK|LTC|BCH|UNI|MATIC)/i
const JP_STOCK_RE  = /^\d{4}(\.T)?$|\.T$/i
const JP_INDEX_RE  = /^(\^N225|\^TOPX|1306|1321|1570|2558|2559|2633)/i

export function detectTickerCategory(ticker: string): TickerCategory {
  if (!ticker) return 'other'
  const base = ticker.includes('*') ? ticker.split('*')[0] : ticker
  if (ticker.endsWith('=X') || FX_RE.test(ticker)) return 'fx'
  if (CRYPTO_RE.test(base))    return 'crypto'
  if (COMMODITY_RE.test(base)) return 'commodity'
  if (JP_STOCK_RE.test(base) || JP_INDEX_RE.test(base)) return 'jp_stock'
  return 'us_stock'
}

export function isCapeApplicable(cat: TickerCategory): boolean {
  return cat === 'us_stock'
}

export function isRateApplicable(cat: TickerCategory): boolean {
  return cat === 'us_stock' || cat === 'jp_stock'
}

// ── スコア型 ──────────────────────────────────────────
export interface SignalScore {
  total:    number
  vix:      number
  cape:     number
  rate:     number
  tsi:      number
  capeNA:   boolean
  rateNA:   boolean
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

// ── strength変換 ──────────────────────────────────────
function toStrength(total: number): SignalScore['strength'] {
  if (total >= 5)  return 'strong_buy'
  if (total >= 3)  return 'buy'
  if (total >= 1)  return 'weak_buy'
  if (total <= -4) return 'strong_sell'
  if (total <= -2) return 'sell'
  if (total <= -1) return 'weak_sell'
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

  return { total, vix: vixS, cape: capeS, rate: rateS, tsi: tsiS, capeNA, rateNA, category, strength, ...meta }
}

export function formatScoreBreakdown(score: SignalScore): string {
  return [
    `合計: ${score.total > 0 ? '+' : ''}${score.total} [${score.label}]`,
    `  VIX:  ${score.vix > 0 ? '+' : ''}${score.vix}`,
    `  CAPE: ${score.capeNA ? 'N/A' : `${score.cape > 0 ? '+' : ''}${score.cape}`}`,
    `  金利: ${score.rateNA ? 'N/A' : `${score.rate > 0 ? '+' : ''}${score.rate}`}`,
    `  TSI:  ${score.tsi > 0 ? '+' : ''}${score.tsi}`,
  ].join('\n')
}
