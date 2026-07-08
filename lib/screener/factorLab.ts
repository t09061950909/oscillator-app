/**
 * lib/screener/factorLab.ts
 *
 * 既存7因子の枠を外した網羅的ファクター探索ライブラリ（Phase 1）
 *
 * 目的:
 *   GC/DCシグナル発生日のOHLCVから「あらゆる候補指標」を計算し、
 *   factor_lab テーブルに生値として保存する。
 *   どの指標がリターンと相関するかは backtest 側で後から検証する
 *   （ここでは「スコア化」せず、生の指標値のみを返す）。
 *
 * 設計方針:
 *   - calcScore.tsの7因子の評価ロジック（加点/減点）には一切依存しない
 *   - 各関数は「日付配列に対する指標値の配列」または「最新値」を返す
 *   - NaNは「計算不能（データ不足）」を表す
 */

export interface Bar {
  date:   string
  open:   number
  high:   number
  low:    number
  close:  number
  volume: number
}

// ════════════════════════════════════════════════════════════
//  基礎ユーティリティ
// ════════════════════════════════════════════════════════════

function sma(values: number[], period: number): number[] {
  const out: number[] = []
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { out.push(NaN); continue }
    let sum = 0
    for (let j = i - period + 1; j <= i; j++) sum += values[j]
    out.push(sum / period)
  }
  return out
}

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1)
  const out: number[] = []
  let prev = values[0]
  out.push(prev)
  for (let i = 1; i < values.length; i++) {
    const cur = values[i] * k + prev * (1 - k)
    out.push(cur)
    prev = cur
  }
  return out
}

function stddev(values: number[]): number {
  if (values.length === 0) return NaN
  const m = values.reduce((a, b) => a + b, 0) / values.length
  const v = values.reduce((s, x) => s + (x - m) ** 2, 0) / values.length
  return Math.sqrt(v)
}

function last<T>(arr: T[]): T {
  return arr[arr.length - 1]
}

// ════════════════════════════════════════════════════════════
//  ① トレンド系
// ════════════════════════════════════════════════════════════

/** 複数期間SMAからの乖離率（%） */
export function smaDeviation(bars: Bar[], period: number): number {
  const closes = bars.map(b => b.close)
  const s = sma(closes, period)
  const ma = last(s)
  if (isNaN(ma) || ma === 0) return NaN
  return ((last(closes) - ma) / ma) * 100
}

/** ADX（平均方向性指数）+ DI+/DI- — トレンドの強さ */
export function calcADX(bars: Bar[], period = 14): { adx: number; diPlus: number; diMinus: number } {
  if (bars.length < period * 2 + 1) return { adx: NaN, diPlus: NaN, diMinus: NaN }

  const tr: number[] = [], dmPlus: number[] = [], dmMinus: number[] = []

  for (let i = 1; i < bars.length; i++) {
    const cur = bars[i], prev = bars[i - 1]
    const highDiff = cur.high - prev.high
    const lowDiff  = prev.low - cur.low

    dmPlus.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0)
    dmMinus.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0)

    tr.push(Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low  - prev.close),
    ))
  }

  // Wilder平滑化
  function wilderSmooth(values: number[], period: number): number[] {
    const out: number[] = []
    let sum = values.slice(0, period).reduce((a, b) => a + b, 0)
    out.push(sum)
    for (let i = period; i < values.length; i++) {
      sum = sum - sum / period + values[i]
      out.push(sum)
    }
    return out
  }

  const trSmooth = wilderSmooth(tr, period)
  const dmPlusSmooth  = wilderSmooth(dmPlus, period)
  const dmMinusSmooth = wilderSmooth(dmMinus, period)

  const diPlusArr  = dmPlusSmooth.map((v, i)  => trSmooth[i] !== 0 ? (v / trSmooth[i]) * 100 : 0)
  const diMinusArr = dmMinusSmooth.map((v, i) => trSmooth[i] !== 0 ? (v / trSmooth[i]) * 100 : 0)

  const dxArr = diPlusArr.map((dp, i) => {
    const dm = diMinusArr[i]
    const sum = dp + dm
    return sum !== 0 ? (Math.abs(dp - dm) / sum) * 100 : 0
  })

  const adxArr = sma(dxArr, period)

  return {
    adx:     last(adxArr) ?? NaN,
    diPlus:  last(diPlusArr),
    diMinus: last(diMinusArr),
  }
}

/** 52週（営業日約250日 or 取得可能な最大）高値からの乖離率（%） */
export function distanceFrom52wHigh(bars: Bar[], lookback = 250): number {
  const n = Math.min(lookback, bars.length)
  const recent = bars.slice(-n)
  const high52w = Math.max(...recent.map(b => b.high))
  const cur = last(bars).close
  if (high52w === 0) return NaN
  return ((cur - high52w) / high52w) * 100   // 通常は負値（高値からの下落率）
}

/** 52週安値からの乖離率（%） */
export function distanceFrom52wLow(bars: Bar[], lookback = 250): number {
  const n = Math.min(lookback, bars.length)
  const recent = bars.slice(-n)
  const low52w = Math.min(...recent.map(b => b.low))
  const cur = last(bars).close
  if (low52w === 0) return NaN
  return ((cur - low52w) / low52w) * 100
}

// ════════════════════════════════════════════════════════════
//  ② モメンタム系
// ════════════════════════════════════════════════════════════

/** ROC: N日前比の変化率（%） */
export function calcROC(bars: Bar[], period: number): number {
  if (bars.length < period + 1) return NaN
  const closes = bars.map(b => b.close)
  const cur  = last(closes)
  const past = closes[closes.length - 1 - period]
  if (past === 0) return NaN
  return ((cur - past) / past) * 100
}

/** ストキャスティクス %K（period日間の高安レンジ内の現在位置） */
export function calcStochasticK(bars: Bar[], period = 14): number {
  if (bars.length < period) return NaN
  const recent = bars.slice(-period)
  const highMax = Math.max(...recent.map(b => b.high))
  const lowMin  = Math.min(...recent.map(b => b.low))
  const cur = last(bars).close
  if (highMax === lowMin) return 50
  return ((cur - lowMin) / (highMax - lowMin)) * 100
}

/** Williams %R（ストキャスティクスの逆数表現、-100〜0） */
export function calcWilliamsR(bars: Bar[], period = 14): number {
  const k = calcStochasticK(bars, period)
  if (isNaN(k)) return NaN
  return k - 100
}

/** TSI（True Strength Index）—既存lib/tsi.tsと同じロジックを再実装（依存を切るため） */
export function calcTSIValue(bars: Bar[], longP = 25, shortP = 13, signalP = 7): { tsi: number; signal: number } {
  if (bars.length < longP + shortP + signalP + 2) return { tsi: NaN, signal: NaN }

  const closes = bars.map(b => b.close)
  const momentum: number[] = [0]
  for (let i = 1; i < closes.length; i++) momentum.push(closes[i] - closes[i - 1])
  const absMomentum = momentum.map(Math.abs)

  const ema1 = ema(momentum, longP)
  const ema2 = ema(ema1, shortP)
  const absEma1 = ema(absMomentum, longP)
  const absEma2 = ema(absEma1, shortP)

  const tsiRaw = ema2.map((v, i) => absEma2[i] !== 0 ? 100 * (v / absEma2[i]) : 0)
  const signalRaw = ema(tsiRaw, signalP)

  return { tsi: last(tsiRaw), signal: last(signalRaw) }
}

/** 連続陽線・陰線の本数（直近からさかのぼってカウント、正=陽線連続、負=陰線連続） */
export function consecutiveCandles(bars: Bar[]): number {
  let count = 0
  for (let i = bars.length - 1; i > 0; i--) {
    const isUp = bars[i].close > bars[i - 1].close
    if (count === 0) {
      count = isUp ? 1 : -1
    } else if ((count > 0 && isUp) || (count < 0 && !isUp)) {
      count += isUp ? 1 : -1
    } else break
  }
  return count
}

// ════════════════════════════════════════════════════════════
//  ③ ボラティリティ系
// ════════════════════════════════════════════════════════════

/** ATR（Average True Range）— 絶対値 */
export function calcATR(bars: Bar[], period = 14): number {
  if (bars.length < period + 1) return NaN
  const tr: number[] = []
  for (let i = 1; i < bars.length; i++) {
    const cur = bars[i], prev = bars[i - 1]
    tr.push(Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low  - prev.close),
    ))
  }
  const atrArr = sma(tr, period)
  return last(atrArr)
}

/** ATR比率（ATR / 終値、%）— 銘柄間の比較を可能にする正規化版 */
export function calcATRRatio(bars: Bar[], period = 14): number {
  const atr = calcATR(bars, period)
  const close = last(bars).close
  if (isNaN(atr) || close === 0) return NaN
  return (atr / close) * 100
}

/** ボリンジャーバンド幅（%、(upper-lower)/middle） */
export function calcBBWidth(bars: Bar[], period = 20, mult = 2): number {
  if (bars.length < period) return NaN
  const closes = bars.map(b => b.close)
  const recent = closes.slice(-period)
  const mid = recent.reduce((a, b) => a + b, 0) / period
  const sd  = stddev(recent)
  if (mid === 0) return NaN
  return ((mult * sd * 2) / mid) * 100
}

/** 過去N日の日次リターン標準偏差（%、年率換算なし） */
export function calcVolatility(bars: Bar[], period = 20): number {
  if (bars.length < period + 1) return NaN
  const closes = bars.slice(-period - 1).map(b => b.close)
  const rets: number[] = []
  for (let i = 1; i < closes.length; i++) {
    rets.push((closes[i] - closes[i - 1]) / closes[i - 1] * 100)
  }
  return stddev(rets)
}

// ════════════════════════════════════════════════════════════
//  ④ 出来高系
// ════════════════════════════════════════════════════════════

/** OBV（On Balance Volume）の傾き（直近N日の線形回帰係数を出来高平均で正規化） */
export function calcOBVSlope(bars: Bar[], period = 20): number {
  if (bars.length < period + 1) return NaN
  const recent = bars.slice(-(period + 1))
  const obv: number[] = [0]
  for (let i = 1; i < recent.length; i++) {
    const diff = recent[i].close - recent[i - 1].close
    const prevObv = obv[obv.length - 1]
    obv.push(diff > 0 ? prevObv + recent[i].volume : diff < 0 ? prevObv - recent[i].volume : prevObv)
  }
  // 単純な始点-終点の傾き（正規化）
  const avgVol = recent.reduce((s, b) => s + b.volume, 0) / recent.length
  if (avgVol === 0) return NaN
  return (last(obv) - obv[0]) / (avgVol * period)
}

/** 出来高加速度: 直近3日平均 / 直近20日平均 */
export function volumeAcceleration(bars: Bar[]): number {
  if (bars.length < 20) return NaN
  const vols = bars.map(b => b.volume)
  const avg3  = vols.slice(-3).reduce((a, b) => a + b, 0) / 3
  const avg20 = vols.slice(-20).reduce((a, b) => a + b, 0) / 20
  if (avg20 === 0) return NaN
  return avg3 / avg20
}

/** マネーフロー: 終値×出来高の直近5日合計 / 直近20日合計 */
export function moneyFlowRatio(bars: Bar[]): number {
  if (bars.length < 20) return NaN
  const mf = bars.map(b => b.close * b.volume)
  const sum5  = mf.slice(-5).reduce((a, b) => a + b, 0)
  const sum20 = mf.slice(-20).reduce((a, b) => a + b, 0)
  if (sum20 === 0) return NaN
  return (sum5 / 5) / (sum20 / 20)
}

// ════════════════════════════════════════════════════════════
//  ⑤ パターン系（GC/DC文脈特有）
// ════════════════════════════════════════════════════════════

/**
 * GC/DC発生日から指定日数後の実現リターン（%）
 * ※ バックテストの「教師データ」ではなく「特徴量」として使う場合
 *    （例: GC後3日リターンを5日後リターン予測の説明変数にする）
 * crossIndex: GC/DC発生バーのインデックス（barsの中での位置）
 */
export function returnSinceIndex(bars: Bar[], crossIndex: number, daysAfter: number): number {
  const targetIndex = crossIndex + daysAfter
  if (targetIndex >= bars.length || crossIndex < 0) return NaN
  const base = bars[crossIndex].close
  const target = bars[targetIndex].close
  if (base === 0) return NaN
  return ((target - base) / base) * 100
}

/** 押し目深度: 直近高値からの現在の下落率（%、52週よりも短期: 20日） */
export function pullbackDepth(bars: Bar[], lookback = 20): number {
  const n = Math.min(lookback, bars.length)
  const recent = bars.slice(-n)
  const high = Math.max(...recent.map(b => b.high))
  const cur = last(bars).close
  if (high === 0) return NaN
  return ((cur - high) / high) * 100   // 通常は負値
}

/** ギャップ率: 当日始値と前日終値の差（%） */
export function gapPercent(bars: Bar[]): number {
  if (bars.length < 2) return NaN
  const cur = last(bars)
  const prev = bars[bars.length - 2]
  if (prev.close === 0) return NaN
  return ((cur.open - prev.close) / prev.close) * 100
}

/** 実体比率: ローソク足の実体 / 値幅（トレンドの強さの簡易指標、0〜1） */
export function bodyRatio(bars: Bar[]): number {
  const cur = last(bars)
  const range = cur.high - cur.low
  if (range === 0) return NaN
  return Math.abs(cur.close - cur.open) / range
}

// ════════════════════════════════════════════════════════════
//  ⑥ 交互作用系（既存因子の掛け合わせ）
// ════════════════════════════════════════════════════════════

/** 出来高加速度 × 価格モメンタム（5日ROC）の積 */
export function volumeMomentumInteraction(bars: Bar[]): number {
  const vAccel = volumeAcceleration(bars)
  const roc5   = calcROC(bars, 5)
  if (isNaN(vAccel) || isNaN(roc5)) return NaN
  return vAccel * roc5
}

// ════════════════════════════════════════════════════════════
//  統合: 全候補因子をまとめて計算
// ════════════════════════════════════════════════════════════

export interface FactorSnapshot {
  // ① トレンド系
  sma_dev_10:        number
  sma_dev_25:        number
  sma_dev_50:        number
  sma_dev_75:        number
  sma_dev_200:       number
  adx_14:            number
  di_plus_14:        number
  di_minus_14:       number
  dist_52w_high:     number
  dist_52w_low:      number

  // ② モメンタム系
  roc_3:             number
  roc_5:             number
  roc_10:            number
  roc_20:            number
  stoch_k_14:        number
  williams_r_14:     number
  tsi_value:         number
  tsi_signal:        number
  consec_candles:    number

  // ③ ボラティリティ系
  atr_ratio_14:      number
  bb_width_20:       number
  volatility_20:     number

  // ④ 出来高系
  obv_slope_20:      number
  volume_accel:      number
  money_flow_ratio:  number

  // ⑤ パターン系
  pullback_depth_20: number
  gap_pct:           number
  body_ratio:        number

  // ⑥ 交互作用系
  vol_mom_interact:  number
}

/**
 * 直近バーまでの全候補因子を一括計算する
 * bars: その時点までの全価格データ（末尾が「現在」）
 */
export function calcAllFactors(bars: Bar[]): FactorSnapshot {
  const adx = calcADX(bars, 14)
  const tsi = calcTSIValue(bars)

  return {
    sma_dev_10:        smaDeviation(bars, 10),
    sma_dev_25:        smaDeviation(bars, 25),
    sma_dev_50:        smaDeviation(bars, 50),
    sma_dev_75:        smaDeviation(bars, 75),
    sma_dev_200:       smaDeviation(bars, 200),
    adx_14:            adx.adx,
    di_plus_14:        adx.diPlus,
    di_minus_14:       adx.diMinus,
    dist_52w_high:     distanceFrom52wHigh(bars),
    dist_52w_low:      distanceFrom52wLow(bars),

    roc_3:             calcROC(bars, 3),
    roc_5:             calcROC(bars, 5),
    roc_10:            calcROC(bars, 10),
    roc_20:            calcROC(bars, 20),
    stoch_k_14:        calcStochasticK(bars, 14),
    williams_r_14:     calcWilliamsR(bars, 14),
    tsi_value:         tsi.tsi,
    tsi_signal:        tsi.signal,
    consec_candles:    consecutiveCandles(bars),

    atr_ratio_14:      calcATRRatio(bars, 14),
    bb_width_20:       calcBBWidth(bars, 20),
    volatility_20:     calcVolatility(bars, 20),

    obv_slope_20:      calcOBVSlope(bars, 20),
    volume_accel:      volumeAcceleration(bars),
    money_flow_ratio:  moneyFlowRatio(bars),

    pullback_depth_20: pullbackDepth(bars, 20),
    gap_pct:           gapPercent(bars),
    body_ratio:        bodyRatio(bars),

    vol_mom_interact:  volumeMomentumInteraction(bars),
  }
}

/** 因子カタログ（メタ情報。UIやレポートでの表示用） */
export const FACTOR_CATALOG: Record<keyof FactorSnapshot, { label: string; category: string; unit: string }> = {
  sma_dev_10:        { label: 'SMA10乖離率',        category: 'トレンド',   unit: '%' },
  sma_dev_25:        { label: 'SMA25乖離率',        category: 'トレンド',   unit: '%' },
  sma_dev_50:        { label: 'SMA50乖離率',        category: 'トレンド',   unit: '%' },
  sma_dev_75:        { label: 'SMA75乖離率',        category: 'トレンド',   unit: '%' },
  sma_dev_200:       { label: 'SMA200乖離率',       category: 'トレンド',   unit: '%' },
  adx_14:            { label: 'ADX(14)',            category: 'トレンド',   unit: '' },
  di_plus_14:        { label: '+DI(14)',            category: 'トレンド',   unit: '' },
  di_minus_14:       { label: '-DI(14)',            category: 'トレンド',   unit: '' },
  dist_52w_high:     { label: '52週高値乖離',       category: 'トレンド',   unit: '%' },
  dist_52w_low:      { label: '52週安値乖離',       category: 'トレンド',   unit: '%' },

  roc_3:             { label: 'ROC(3日)',           category: 'モメンタム', unit: '%' },
  roc_5:             { label: 'ROC(5日)',           category: 'モメンタム', unit: '%' },
  roc_10:            { label: 'ROC(10日)',          category: 'モメンタム', unit: '%' },
  roc_20:             { label: 'ROC(20日)',          category: 'モメンタム', unit: '%' },
  stoch_k_14:        { label: 'ストキャスティクス%K', category: 'モメンタム', unit: '' },
  williams_r_14:     { label: 'Williams %R',        category: 'モメンタム', unit: '' },
  tsi_value:         { label: 'TSI',                category: 'モメンタム', unit: '' },
  tsi_signal:        { label: 'TSIシグナル',        category: 'モメンタム', unit: '' },
  consec_candles:    { label: '連続陽線/陰線数',    category: 'モメンタム', unit: '本' },

  atr_ratio_14:      { label: 'ATR比率(14)',        category: 'ボラティリティ', unit: '%' },
  bb_width_20:       { label: 'BB幅(20)',           category: 'ボラティリティ', unit: '%' },
  volatility_20:     { label: '日次リターン標準偏差(20)', category: 'ボラティリティ', unit: '%' },

  obv_slope_20:      { label: 'OBV傾き(20)',        category: '出来高',    unit: '' },
  volume_accel:      { label: '出来高加速度',       category: '出来高',    unit: '倍' },
  money_flow_ratio:  { label: 'マネーフロー比率',   category: '出来高',    unit: '倍' },

  pullback_depth_20: { label: '押し目深度(20日)',   category: 'パターン',  unit: '%' },
  gap_pct:           { label: '寄り付きギャップ',   category: 'パターン',  unit: '%' },
  body_ratio:        { label: 'ローソク実体比率',   category: 'パターン',  unit: '' },

  vol_mom_interact:  { label: '出来高×モメンタム交互作用', category: '交互作用', unit: '' },
}
