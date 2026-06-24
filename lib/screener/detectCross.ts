/**
 * lib/screener/detectCross.ts
 * GC/DC判定・維持日数カウント
 */

import { sma } from './indicators'

export type CrossType = 'GC' | 'DC' | null

export type CrossResult = {
  type:            CrossType
  holdDays:        number    // GC/DC後の維持日数（0=当日発生）
  maShortCurrent:  number
  maLongCurrent:   number
  maShortPrev:     number
  maLongPrev:      number
}

/**
 * GC/DC判定
 * - 当日クロス(holdDays=0)を優先検出
 * - 当日クロスでなければ直近30日以内で発生＋維持中かを確認
 */
export function detectCross(
  closes:      number[],
  shortPeriod: number,
  longPeriod:  number,
): CrossResult {
  const maS = sma(closes, shortPeriod)
  const maL = sma(closes, longPeriod)
  const n   = maS.length - 1

  // データ不足ガード
  if (n < 1 || isNaN(maS[n]) || isNaN(maL[n]) || isNaN(maS[n-1]) || isNaN(maL[n-1])) {
    return { type: null, holdDays: 0, maShortCurrent: NaN, maLongCurrent: NaN, maShortPrev: NaN, maLongPrev: NaN }
  }

  const base = {
    maShortCurrent: maS[n],
    maLongCurrent:  maL[n],
    maShortPrev:    maS[n-1],
    maLongPrev:     maL[n-1],
  }

  // ① 当日クロス判定
  const todayGC = maS[n] >  maL[n] && maS[n-1] <= maL[n-1]
  const todayDC = maS[n] <  maL[n] && maS[n-1] >= maL[n-1]

  if (todayGC) return { ...base, type: 'GC', holdDays: 0 }
  if (todayDC) return { ...base, type: 'DC', holdDays: 0 }

  // ② 直近30日以内でクロスが発生し、今も維持中か確認
  const lookback = Math.min(30, n - 1)
  for (let i = 1; i <= lookback; i++) {
    if (isNaN(maS[n-i]) || isNaN(maL[n-i]) || isNaN(maS[n-i-1]) || isNaN(maL[n-i-1])) break

    const wasGC = maS[n-i] >  maL[n-i] && maS[n-i-1] <= maL[n-i-1]
    const wasDC = maS[n-i] <  maL[n-i] && maS[n-i-1] >= maL[n-i-1]

    if (wasGC && maS[n] > maL[n]) return { ...base, type: 'GC', holdDays: i }
    if (wasDC && maS[n] < maL[n]) return { ...base, type: 'DC', holdDays: i }

    // クロスより前に逆クロスが先に見つかれば探索終了
    if (wasGC || wasDC) break
  }

  return { ...base, type: null, holdDays: 0 }
}
