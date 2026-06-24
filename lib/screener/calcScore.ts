/**
 * lib/screener/calcScore.ts
 * GC/DC シグナルのスコアリング（0〜100点、A〜Dランク）
 */

import { sma, calcRSI, calcMACDHistogram, toWeeklyBars } from './indicators'
import { detectCross }                                    from './detectCross'
import type { PriceBar }                                  from '@/types'

// ── 型定義 ────────────────────────────────────────────────────

export type GCRank = 'A' | 'B' | 'C' | 'D'

export interface ScoreBreakdown {
  slope:     number   // ① MAの傾き         最大+20 最小-20
  volume:    number   // ② 出来高比率        最大+20 最小-15
  rsi:       number   // ③ RSI水準           最大+15 最小-15
  hold:      number   // ④ GC後維持日数      最大+25
  deviation: number   // ⑤ 価格乖離率        最大+10 最小-15
  macd:      number   // ⑥ MACDヒストグラム  最大+15 最小-10
  weekly:    number   // ⑦ 週足トレンド      最大+15 最小-10
}

export interface GCScoreResult {
  symbol:        string
  market:        'JP' | 'US'
  signalType:    'GC' | 'DC'
  totalScore:    number
  rank:          GCRank
  holdDays:      number
  breakdown:     ScoreBreakdown
  // 表示用参考値
  closePrice:    number
  volumeRatio:   number
  rsiValue:      number
  deviationPct:  number
  maShortValue:  number
  maLongValue:   number
}

// ── スコア計算ヘルパー ────────────────────────────────────────

/** ① MAの傾き（短期MA直近5日の変化率） */
function scoreSlope(maValues: number[], n: number): number {
  if (n < 5 || isNaN(maValues[n-5])) return 0
  const slope = (maValues[n] - maValues[n-5]) / maValues[n-5] * 100
  if (slope >  1.0) return  20
  if (slope >  0.3) return  10
  if (slope <  0.0) return -20
  if (slope <  0.1) return -10
  return 0
}

/** ② 出来高比率（当日 / 10日平均） */
function scoreVolume(volumes: number[], n: number): number {
  const slice  = volumes.slice(Math.max(0, n - 10), n)  // 当日を除く直近10日
  if (slice.length === 0) return 0
  const avg    = slice.reduce((a, b) => a + b, 0) / slice.length
  if (avg === 0) return 0
  const ratio  = volumes[n] / avg
  if (ratio > 1.5) return  20
  if (ratio > 1.0) return  10
  if (ratio < 0.7) return -15
  return 0
}

/** ③ RSI水準 */
function scoreRSI(rsi: number): number {
  if (rsi >= 50 && rsi <= 70) return  15
  if (rsi >= 45 && rsi <  50) return   5
  if (rsi >  70)              return  -5   // 過熱→乗り遅れGCリスク
  if (rsi <  45)              return -15   // 弱すぎ→騙しリスク
  return 0
}

/** ④ GC後維持日数ボーナス */
function scoreHold(holdDays: number): number {
  if (holdDays >= 5) return 25
  if (holdDays >= 2) return 15
  return 0  // 当日(0)は加点なし
}

/** ⑤ 価格の長期MAからの乖離率 */
function scoreDeviation(close: number, maLong: number): number {
  const devPct = (close - maLong) / maLong * 100
  if (devPct > 15)             return -15  // 乖離しすぎ→高値掴みリスク
  if (devPct > 0 && devPct <= 8) return  10  // 適切な乖離
  if (close  < maLong)         return -10  // 長期MA下→勢いなし
  return 0
}

/** ⑥ MACDヒストグラム */
function scoreMACD(hist: { current: number; prev: number }): number {
  if (hist.current > 0 && hist.prev <= 0) return  15  // MACDも同時GC
  if (hist.current > 0)                   return   8
  if (hist.current < 0)                   return -10
  return 0
}

/** ⑦ 週足トレンド（週足SMA5 vs SMA20） */
function scoreWeekly(weeklyCloses: number[]): number {
  const wma5  = sma(weeklyCloses, 5)
  const wma20 = sma(weeklyCloses, 20)
  const wn    = wma5.length - 1
  if (wn < 0 || isNaN(wma5[wn]) || isNaN(wma20[wn])) return 0
  if (wma5[wn] > wma20[wn]) return  15
  if (wma5[wn] < wma20[wn]) return -10
  return 0
}

/** スコア→ランク変換 */
function toRank(score: number): GCRank {
  if (score >= 80) return 'A'
  if (score >= 60) return 'B'
  if (score >= 40) return 'C'
  return 'D'
}

// ── メイン計算関数 ────────────────────────────────────────────

/**
 * GC/DCスコアを計算する
 * @param symbol   ティッカーシンボル
 * @param market   'JP' | 'US'
 * @param bars     日足バー配列（古い順）- 最低 longPeriod+30 本必要
 * @param maShort  短期MA期間（デフォルト25）
 * @param maLong   長期MA期間（デフォルト75）
 * @returns GCScoreResult | null（シグナルなしの場合null）
 */
export function calcGCScore(
  symbol:  string,
  market:  'JP' | 'US',
  bars:    PriceBar[],
  maShort: number = 25,
  maLong:  number = 75,
): GCScoreResult | null {

  if (bars.length < maLong + 5) return null  // データ不足

  const closes  = bars.map(b => b.close)
  const volumes = bars.map(b => b.volume)
  const n       = closes.length - 1

  // GC/DC判定
  const cross = detectCross(closes, maShort, maLong)
  if (!cross.type) return null

  // MA系列（スコア計算用）
  const maS = sma(closes, maShort)

  // 各スコア計算
  const bd: ScoreBreakdown = {
    slope:     scoreSlope(maS, n),
    volume:    scoreVolume(volumes, n),
    rsi:       scoreRSI(calcRSI(closes, 14)),
    hold:      scoreHold(cross.holdDays),
    deviation: scoreDeviation(closes[n], cross.maLongCurrent),
    macd:      scoreMACD(calcMACDHistogram(closes)),
    weekly:    scoreWeekly(toWeeklyBars(bars).map(b => b.close)),
  }

  // 合計（0〜100にクランプ）
  const raw   = Object.values(bd).reduce((a, b) => a + b, 0)
  const total = Math.min(100, Math.max(0, raw))

  // 出来高比率（表示用）
  const volSlice = volumes.slice(Math.max(0, n - 10), n)
  const avgVol   = volSlice.length > 0
    ? volSlice.reduce((a, b) => a + b, 0) / volSlice.length
    : 1
  const volumeRatio  = avgVol > 0 ? volumes[n] / avgVol : 0
  const deviationPct = (closes[n] - cross.maLongCurrent) / cross.maLongCurrent * 100

  return {
    symbol,
    market,
    signalType:   cross.type,
    totalScore:   total,
    rank:         toRank(total),
    holdDays:     cross.holdDays,
    breakdown:    bd,
    closePrice:   closes[n],
    volumeRatio:  parseFloat(volumeRatio.toFixed(2)),
    rsiValue:     calcRSI(closes, 14),
    deviationPct: parseFloat(deviationPct.toFixed(2)),
    maShortValue: cross.maShortCurrent,
    maLongValue:  cross.maLongCurrent,
  }
}
