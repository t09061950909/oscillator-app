'use client'

import { useState, useCallback, useRef } from 'react'
import type { VixData }   from '@/app/api/vix/route'
import type { MacroData } from '@/app/api/macro/route'
import {
  calcSignalScore,
  type SignalScore,
  type TsiCrossType,
  type EnhancedMarker,
} from '@/lib/signalScore'

// EnhancedMarker の再エクスポート（後方互換）
export type { EnhancedMarker } from '@/lib/signalScore'

/**
 * useSignalScore
 * VIX・マクロ・TSIの3指標を統合してシグナルスコアを管理するhook。
 * TradingChart で useVixSignal の代わりに使用する。
 */
export function useSignalScore() {
  const [vixData,   setVixData]   = useState<VixData   | null>(null)
  const [macroData, setMacroData] = useState<MacroData | null>(null)
  const [lastScore, setLastScore] = useState<SignalScore | null>(null)

  // drawSeries から参照するため ref でも保持
  const vixRef   = useRef<VixData   | null>(null)
  const macroRef = useRef<MacroData | null>(null)

  const handleVixChange = useCallback((data: VixData) => {
    setVixData(data)
    vixRef.current = data
  }, [])

  const handleMacroChange = useCallback((data: MacroData) => {
    setMacroData(data)
    macroRef.current = data
  }, [])

  /**
   * マーカー配列をスコアに応じて強調する関数。
   * enhanceMarkersRef.current として drawSeries に渡す。
   */
  const enhanceMarkers = useCallback(
    (markers: EnhancedMarker[]): EnhancedMarker[] => {
      return markers.map(marker => {
        // TSIクロスタイプをマーカーテキストから逆引き
        const crossType = inferCrossType(marker)
        const score = calcSignalScore(vixRef.current, macroRef.current, crossType)

        // 最新スコアを state に反映（パネル表示用）
        setLastScore(score)

        return {
          ...marker,
          color: score.color,
          size:  score.size,
          text:  buildMarkerText(marker, score),
        }
      })
    },
    // vixRef/macroRef は ref なので依存配列不要
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  return {
    vixData,
    macroData,
    lastScore,
    handleVixChange,
    handleMacroChange,
    enhanceMarkers,
  }
}

// ── ヘルパー ──────────────────────────────────────────

/** マーカーのテキスト・方向からTSIクロスタイプを推定 */
function inferCrossType(marker: EnhancedMarker): TsiCrossType {
  if (marker.position === 'belowBar') {
    // 買いマーカー
    return marker.text?.includes('<-10') ? 'golden_below' : 'golden_above'
  } else {
    // 売りマーカー
    return marker.text?.includes('<-10') ? 'dead_below' : 'dead_above'
  }
}

/** スコアに応じたマーカーテキストを生成 */
function buildMarkerText(marker: EnhancedMarker, score: SignalScore): string {
  const base = marker.text ?? ''
  if (score.total >= 5) return `${base} 🔥${score.total}`
  if (score.total >= 3) return `${base} ✅${score.total}`
  if (score.total >= 1) return `${base} +${score.total}`
  if (score.total <= -4) return `${base} 🚨${score.total}`
  if (score.total <= -2) return `${base} 🔴${score.total}`
  return base
}
