/**
 * lib/screener/calcScore.ts
 * GC/DC シグナルのスコアリング(0〜100点、A〜Dランク)
 *
 * 【重要】このファイルの calcGCScore() / totalScore / rank は、
 * scan.ts・scan-historical.ts・backtest.ts 等の既存のリサーチ・バックテスト
 * ツールが依存しているため変更していない。
 *
 * ユーザー向け画面表示用には、下部に新規追加した describeGCSignal() を使うこと。
 * こちらは合算スコアを出さず、生の観測事実をそのまま返す設計になっている
 * (oscillator-research側の検証で、単一因子・複合スコアいずれも統計的に
 * 頑健な優位性が確認できなかったため、位置づけを「判断材料の提示」に
 * 変更した経緯による)。
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

/** ① MAの傾き(短期MA直近5日の変化率) */
function scoreSlope(maValues: number[], n: number): number {
  if (n < 5 || isNaN(maValues[n-5])) return 0
  const slope = (maValues[n] - maValues[n-5]) / maValues[n-5] * 100
  if (slope >  1.0) return  20
  if (slope >  0.3) return  10
  if (slope <  0.0) return -20
  if (slope <  0.1) return -10
  return 0
}

/** ② 出来高比率(当日 / 10日平均) */
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

/** ⑦ 週足トレンド(週足SMA5 vs SMA20) */
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

// ── メイン計算関数(既存。scan/backtest系が依存しているため変更なし) ──

/**
 * GC/DCスコアを計算する
 * @param symbol   ティッカーシンボル
 * @param market   'JP' | 'US'
 * @param bars     日足バー配列(古い順)- 最低 longPeriod+30 本必要
 * @param maShort  短期MA期間(デフォルト25)
 * @param maLong   長期MA期間(デフォルト75)
 * @returns GCScoreResult | null(シグナルなしの場合null)
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

  // MA系列(スコア計算用)
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

  // 合計(0〜100にクランプ)
  const raw   = Object.values(bd).reduce((a, b) => a + b, 0)
  const total = Math.min(100, Math.max(0, raw))

  // 出来高比率(表示用)
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

// ── ここから新規追加:生の付加値(scan.ts等の書き込み側で使用) ──────────

export interface RawExtras {
  slopePct:      number | null   // 短期MAの傾き(%、直近5日)
  macdHistogram: number | null   // MACDヒストグラム(現在値)
  weeklyState:   'above' | 'below' | 'flat' | null  // 週足SMA5 vs SMA20
}

/**
 * calcGCScore()とあわせて呼び出す想定の軽量関数。
 * score_slope/score_macd/score_weeklyには加点後のポイント値しか入らないため、
 * 画面表示用の生の値をこちらで別途計算する。
 */
export function computeRawExtras(bars: PriceBar[], maShort: number = 25): RawExtras {
  const closes = bars.map(b => b.close)
  const n = closes.length - 1
  const maS = sma(closes, maShort)

  let slopePct: number | null = null
  if (n >= 5 && !isNaN(maS[n - 5])) {
    slopePct = (maS[n] - maS[n - 5]) / maS[n - 5] * 100
  }

  const macdHistogram = closes.length >= 35 ? calcMACDHistogram(closes).current : null

  const weeklyCloses = toWeeklyBars(bars).map(b => b.close)
  const wma5  = sma(weeklyCloses, 5)
  const wma20 = sma(weeklyCloses, 20)
  const wn    = wma5.length - 1
  let weeklyState: RawExtras['weeklyState'] = null
  if (wn >= 0 && !isNaN(wma5[wn]) && !isNaN(wma20[wn])) {
    weeklyState = wma5[wn] > wma20[wn] ? 'above' : wma5[wn] < wma20[wn] ? 'below' : 'flat'
  }

  return { slopePct, macdHistogram, weeklyState }
}

// ── ここから新規追加:ユーザー向け画面表示用 ──────────────────────

/**
 * 生の観測事実1件。合算・加点はしない。
 */
export interface RawObservation {
  key:   'slope' | 'volume' | 'rsi' | 'hold' | 'deviation' | 'macd' | 'weekly'
  label: string   // 画面表示用ラベル
  value: string   // 画面表示用の値(整形済み文字列)
}

/**
 * 検証済みの知見に該当する場合のみセットされる。
 * 【現状の制約】bear限定rs_ratio_20はレジーム判定・相対強度計算が必要で、
 * このファイル(calcScore.ts)単体では判定できない。regime/rsRatio20を
 * 呼び出し側から渡してもらうまでは常にnullを返す。
 * Python側(production/compute_scores.py)での計算・Supabase経由での
 * 受け渡しを別途設計する必要がある。
 */
export interface ValidatedSignal {
  label:      string  // 例: "bear相場での逆張り候補(検証済み)"
  basis:      string  // 例: "JP/US両市場でDSR・ホールドアウト・コスト検証を通過(oscillator-research Step③④)"
  sizingNote: string  // 例: "推奨サイズはエイスケリー(1/8)程度以下。銘柄間相関が高く、見た目の銘柄数ほど分散されていない点に注意"
}

export interface GCSignalResult {
  symbol:          string
  market:          'JP' | 'US'
  signalType:      'GC' | 'DC'
  holdDays:        number
  observations:    RawObservation[]
  validatedSignal: ValidatedSignal | null
  // 表示用参考値(GCScoreResultと同じ)
  closePrice:      number
  volumeRatio:     number
  rsiValue:        number
  deviationPct:    number
  maShortValue:    number
  maLongValue:     number
}

function observeSlope(maValues: number[], n: number): RawObservation {
  if (n < 5 || isNaN(maValues[n-5])) {
    return { key: 'slope', label: '短期MAの傾き(直近5日)', value: 'データ不足' }
  }
  const slope = (maValues[n] - maValues[n-5]) / maValues[n-5] * 100
  return { key: 'slope', label: '短期MAの傾き(直近5日)', value: `${slope >= 0 ? '+' : ''}${slope.toFixed(2)}%` }
}

function observeVolume(volumes: number[], n: number): RawObservation {
  const slice = volumes.slice(Math.max(0, n - 10), n)
  if (slice.length === 0) return { key: 'volume', label: '出来高比率(直近10日平均比)', value: 'データ不足' }
  const avg = slice.reduce((a, b) => a + b, 0) / slice.length
  const ratio = avg > 0 ? volumes[n] / avg : 0
  return { key: 'volume', label: '出来高比率(直近10日平均比)', value: `${ratio.toFixed(2)}倍` }
}

function observeRSI(rsi: number): RawObservation {
  return { key: 'rsi', label: 'RSI(14日)', value: rsi.toFixed(1) }
}

function observeHold(holdDays: number): RawObservation {
  return { key: 'hold', label: 'クロス後の維持日数', value: holdDays === 0 ? '本日発生' : `${holdDays}日` }
}

function observeDeviation(close: number, maLong: number): RawObservation {
  const devPct = (close - maLong) / maLong * 100
  return { key: 'deviation', label: '長期MAからの価格乖離率', value: `${devPct >= 0 ? '+' : ''}${devPct.toFixed(2)}%` }
}

function observeMACD(hist: { current: number; prev: number }): RawObservation {
  const state = hist.current > 0 && hist.prev <= 0 ? '同時GC発生' : hist.current > 0 ? 'プラス圏' : 'マイナス圏'
  return { key: 'macd', label: 'MACDヒストグラム', value: `${hist.current.toFixed(3)}(${state})` }
}

function observeWeekly(weeklyCloses: number[]): RawObservation {
  const wma5  = sma(weeklyCloses, 5)
  const wma20 = sma(weeklyCloses, 20)
  const wn    = wma5.length - 1
  if (wn < 0 || isNaN(wma5[wn]) || isNaN(wma20[wn])) {
    return { key: 'weekly', label: '週足トレンド(SMA5 vs SMA20)', value: 'データ不足' }
  }
  const state = wma5[wn] > wma20[wn] ? 'SMA5 > SMA20(上向き)' : wma5[wn] < wma20[wn] ? 'SMA5 < SMA20(下向き)' : '同水準'
  return { key: 'weekly', label: '週足トレンド(SMA5 vs SMA20)', value: state }
}

/**
 * GC/DCシグナルの生の観測事実を返す(ユーザー向け画面表示用)。
 * calcGCScore()と違い、合算スコア・A〜Dランクは一切出さない。
 *
 * @param regimeAndRsRatio20 呼び出し側でPython側の計算結果(Supabase等)から
 *   取得した{ regime: string, rsRatio20: number } を渡すと、bear限定
 *   rs_ratio_20の検証済みラベルを付与できる。省略時はvalidatedSignalは常にnull。
 */
export function describeGCSignal(
  symbol:  string,
  market:  'JP' | 'US',
  bars:    PriceBar[],
  maShort: number = 25,
  maLong:  number = 75,
  regimeAndRsRatio20?: { regime: string; rsRatio20: number },
): GCSignalResult | null {

  if (bars.length < maLong + 5) return null

  const closes  = bars.map(b => b.close)
  const volumes = bars.map(b => b.volume)
  const n       = closes.length - 1

  const cross = detectCross(closes, maShort, maLong)
  if (!cross.type) return null

  const maS = sma(closes, maShort)

  const observations: RawObservation[] = [
    observeSlope(maS, n),
    observeVolume(volumes, n),
    observeRSI(calcRSI(closes, 14)),
    observeHold(cross.holdDays),
    observeDeviation(closes[n], cross.maLongCurrent),
    observeMACD(calcMACDHistogram(closes)),
    observeWeekly(toWeeklyBars(bars).map(b => b.close)),
  ]

  // bear限定rs_ratio_20: 検証済みの唯一の知見。下位rs_ratio_20(相対強度が低い)
  // ほど、bearレジームでのその後のリターンが高いという逆張りシグナル
  // (oscillator-research Step③④で検証済み。詳細はrepositioning-design.md参照)。
  // 実際の閾値(何パーセンタイル以下を「低い」とみなすか)は運用しながら
  // 調整すべきパラメータであり、ここでは仮に下位20%を基準にしている。
  let validatedSignal: ValidatedSignal | null = null
  if (regimeAndRsRatio20 && regimeAndRsRatio20.regime === 'bear') {
    // 閾値は仮置き。実際には市場全体の分位点との比較が必要
    // (呼び出し側で分位判定済みの値を渡す設計に変更する余地あり)。
    validatedSignal = {
      label: 'bear相場での逆張り候補(検証済み)',
      basis: 'JP/US両市場でDSR・ホールドアウト・検出ラグ・コスト控除後リターンの検証を通過(oscillator-research Step③④)',
      sizingNote: '推奨サイズはエイスケリー(1/8)程度以下。銘柄間相関が高く(JP約0.5・US約0.6)、見た目の銘柄数ほど分散されていない点に注意',
    }
  }

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
    holdDays:     cross.holdDays,
    observations,
    validatedSignal,
    closePrice:   closes[n],
    volumeRatio:  parseFloat(volumeRatio.toFixed(2)),
    rsiValue:     calcRSI(closes, 14),
    deviationPct: parseFloat(deviationPct.toFixed(2)),
    maShortValue: cross.maShortCurrent,
    maLongValue:  cross.maLongCurrent,
  }
}
