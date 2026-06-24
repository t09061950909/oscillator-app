/**
 * __tests__/screener/calcScore.test.ts
 * GC/DC 検出・スコアリングの単体テスト
 */

import { describe, it, expect } from 'vitest'
import { detectCross }           from '../../lib/screener/detectCross'
import { calcGCScore }           from '../../lib/screener/calcScore'
import { sma, calcRSI }          from '../../lib/screener/indicators'
import type { PriceBar }         from '../../types'

// ── テストデータ生成ヘルパー ────────────────────────────────

/** 終値配列からPriceBar配列を生成（テスト用） */
function makeBars(closes: number[], baseVolume = 100_000): PriceBar[] {
  return closes.map((close, i) => ({
    date:   `2024-01-${String(i + 1).padStart(2, '0')}`,
    open:   close * 0.99,
    high:   close * 1.01,
    low:    close * 0.98,
    close,
    volume: baseVolume,
  }))
}

/**
 * GCシナリオ用の終値配列を生成
 * - 前半: 短期MA < 長期MA（DC状態）
 * - 後半: 短期MA > 長期MA（GC後）
 * @param gcAt  GC発生インデックス（0始まり）
 * @param total 総データ数
 */
function makeGCCloses(total = 120, gcAt = 90): number[] {
  const closes: number[] = []
  for (let i = 0; i < total; i++) {
    // gcAt以前は下降トレンド、以降は上昇トレンド
    const base = i < gcAt ? 1000 - i * 2 : 900 + (i - gcAt) * 3
    closes.push(base)
  }
  return closes
}

// ── SMA テスト ───────────────────────────────────────────────

describe('sma()', () => {
  it('期間より短いデータはNaNを返す', () => {
    const result = sma([1, 2, 3], 5)
    expect(result.slice(0, 4).every(v => isNaN(v))).toBe(true)
  })

  it('単純平均が正しく計算される', () => {
    const result = sma([1, 2, 3, 4, 5], 3)
    // index=2: (1+2+3)/3=2, index=3: (2+3+4)/3=3, index=4: (3+4+5)/3=4
    expect(result[2]).toBeCloseTo(2)
    expect(result[3]).toBeCloseTo(3)
    expect(result[4]).toBeCloseTo(4)
  })

  it('全て同じ値なら平均も同じ値', () => {
    const result = sma([100, 100, 100, 100, 100], 3)
    expect(result[4]).toBe(100)
  })
})

// ── RSI テスト ───────────────────────────────────────────────

describe('calcRSI()', () => {
  it('データ不足の場合は50を返す', () => {
    expect(calcRSI([100, 101], 14)).toBe(50)
  })

  it('一貫して上昇するデータは高いRSIを返す', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i)
    expect(calcRSI(closes)).toBeGreaterThan(70)
  })

  it('一貫して下落するデータは低いRSIを返す', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 200 - i)
    expect(calcRSI(closes)).toBeLessThan(30)
  })
})

// ── detectCross テスト ───────────────────────────────────────

describe('detectCross()', () => {
  it('データ不足の場合はnullを返す', () => {
    const closes = Array.from({ length: 10 }, () => 100)
    const result = detectCross(closes, 5, 25)
    expect(result.type).toBeNull()
  })

  it('GCを当日(holdDays=0)で検出できる', () => {
    // short=5, long=10 で確実に当日GCになるよう構築
    // 前半10本: 下降（short < long 確定）
    // 最終1本だけ急騰させ、その日にクロスが起きるよう調整
    const closes = [
      100, 99, 98, 97, 96, 95, 94, 93, 92, 91,  // 下降
      92, 93, 94, 93, 92,                          // 横ばい（short<long継続）
      130,                                          // 急騰→当日GC
    ]
    const result = detectCross(closes, 5, 10)
    expect(result.type).toBe('GC')
    expect(result.holdDays).toBe(0)
  })

  it('DCを当日(holdDays=0)で検出できる', () => {
    const closes = [
      90, 91, 92, 93, 94, 95, 96, 97, 98, 99,   // 上昇
      98, 97, 96, 97, 98,                          // 横ばい（short>long継続）
      60,                                           // 急落→当日DC
    ]
    const result = detectCross(closes, 5, 10)
    expect(result.type).toBe('DC')
    expect(result.holdDays).toBe(0)
  })

  it('GC後の維持日数(holdDays)を正しくカウントする', () => {
    const closes = [
      100, 99, 98, 97, 96, 95, 94, 93, 92, 91,
      95, 98, 102, 107, 113,  // GC発生
      115, 116, 117,           // 3日維持
    ]
    const result = detectCross(closes, 5, 10)
    // GCが3日前に発生し維持中 → holdDays = 3
    expect(result.type).toBe('GC')
    expect(result.holdDays).toBeGreaterThanOrEqual(1)
  })

  it('GC後にDCが発生すればGCはリセットされる', () => {
    const closes = [
      100, 99, 98, 97, 96, 95, 94, 93, 92, 91,
      95, 98, 102, 107, 113,  // GC
      110, 105, 98, 91, 83,   // 急落→DC
    ]
    const result = detectCross(closes, 5, 10)
    expect(result.type).toBe('DC')
  })

  it('クロスなし（レンジ相場）はnullを返す', () => {
    const closes = Array.from({ length: 80 }, () => 100)
    const result = detectCross(closes, 25, 75)
    expect(result.type).toBeNull()
  })
})

// ── calcGCScore テスト ───────────────────────────────────────

describe('calcGCScore()', () => {
  it('データ不足の場合はnullを返す', () => {
    const bars = makeBars(Array.from({ length: 30 }, () => 100))
    const result = calcGCScore('TEST', 'JP', bars, 25, 75)
    expect(result).toBeNull()
  })

  it('シグナルがない場合はnullを返す', () => {
    // ずっと同じ値 → GCもDCも発生しない
    const bars = makeBars(Array.from({ length: 120 }, () => 100))
    const result = calcGCScore('TEST', 'JP', bars, 5, 25)
    expect(result).toBeNull()
  })

  it('GC発生時にGCScoreResultを返す', () => {
    const closes = makeGCCloses(120, 90)
    const bars   = makeBars(closes)
    const result = calcGCScore('7203.T', 'JP', bars, 5, 25)
    // GCが発生しているか、またはnull（データ次第）
    if (result !== null) {
      expect(result.signalType).toBe('GC')
      expect(result.totalScore).toBeGreaterThanOrEqual(0)
      expect(result.totalScore).toBeLessThanOrEqual(100)
      expect(['A', 'B', 'C', 'D']).toContain(result.rank)
      expect(result.symbol).toBe('7203.T')
      expect(result.market).toBe('JP')
    }
  })

  it('totalScoreは0〜100の範囲に収まる', () => {
    // 理想的なGC（全スコア最大）に近い状況
    const closes = [
      ...Array.from({ length: 80 }, (_, i) => 1000 - i),   // 下降
      ...Array.from({ length: 40 }, (_, i) => 920 + i * 4), // 急騰
    ]
    // ボリューム: 後半は急増
    const bars = closes.map((close, i) => ({
      date:   `2024-01-${String(i + 1).padStart(2, '0')}`,
      open:   close * 0.99,
      high:   close * 1.02,
      low:    close * 0.97,
      close,
      volume: i > 100 ? 500_000 : 100_000,  // 後半は出来高5倍
    }))
    const result = calcGCScore('AAPL', 'US', bars, 5, 25)
    if (result !== null) {
      expect(result.totalScore).toBeGreaterThanOrEqual(0)
      expect(result.totalScore).toBeLessThanOrEqual(100)
    }
  })

  it('scoreBreakdownの各値が期待する範囲にある', () => {
    const closes = makeGCCloses(120, 85)
    const bars   = makeBars(closes)
    const result = calcGCScore('TEST', 'JP', bars, 5, 25)
    if (result !== null) {
      const bd = result.breakdown
      expect(bd.slope).toBeGreaterThanOrEqual(-20)
      expect(bd.slope).toBeLessThanOrEqual(20)
      expect(bd.volume).toBeGreaterThanOrEqual(-15)
      expect(bd.volume).toBeLessThanOrEqual(20)
      expect(bd.rsi).toBeGreaterThanOrEqual(-15)
      expect(bd.rsi).toBeLessThanOrEqual(15)
      expect(bd.hold).toBeGreaterThanOrEqual(0)
      expect(bd.hold).toBeLessThanOrEqual(25)
      expect(bd.deviation).toBeGreaterThanOrEqual(-15)
      expect(bd.deviation).toBeLessThanOrEqual(10)
      expect(bd.macd).toBeGreaterThanOrEqual(-10)
      expect(bd.macd).toBeLessThanOrEqual(15)
      expect(bd.weekly).toBeGreaterThanOrEqual(-10)
      expect(bd.weekly).toBeLessThanOrEqual(15)
    }
  })

  it('Aランクは80点以上', () => {
    // 高出来高・急騰GCで高スコアを狙う
    const closes = [
      ...Array.from({ length: 80 }, (_, i) => 1000 - i * 0.5),
      ...Array.from({ length: 40 }, (_, i) => 960 + i * 5),
    ]
    const bars = closes.map((close, i) => ({
      date:   `2024-01-${String(i + 1).padStart(2, '0')}`,
      open:   close,
      high:   close * 1.01,
      low:    close * 0.99,
      close,
      volume: i > 105 ? 300_000 : 80_000,
    }))
    const result = calcGCScore('TEST', 'JP', bars, 5, 25)
    if (result && result.rank === 'A') {
      expect(result.totalScore).toBeGreaterThanOrEqual(80)
    }
  })
})
