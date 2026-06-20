'use client'

import { useState, useCallback } from 'react'
import type { VixData } from '@/app/api/vix/route'

// Lightweight Charts v5 のマーカー型に合わせた定義
export interface EnhancedMarker {
  time: number
  position: 'belowBar' | 'aboveBar'
  color: string
  shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square'
  text?: string
  size?: number
}

/**
 * VIX値に応じてLightweight Chartsのマーカーを強調するhook
 *
 * 使用例:
 *   const { vixData, enhanceMarkers } = useVixSignal()
 *   const enhanced = enhanceMarkers(originalMarkers)
 *   // → VIX>=40 の買いマーカーが金色・大サイズになる
 */
export function useVixSignal() {
  const [vixData, setVixData] = useState<VixData | null>(null)

  const handleVixChange = useCallback((data: VixData) => {
    setVixData(data)
  }, [])

  /**
   * 既存のTSIマーカーをVIX状態に応じて強調
   * Phase3のスコアリングに繋げやすいよう設計
   */
  const enhanceMarkers = useCallback(
    (markers: EnhancedMarker[]): EnhancedMarker[] => {
      if (!vixData) return markers

      return markers.map((marker) => {
        // 買いマーカー（↑）のみ対象
        if (marker.position !== 'belowBar') return marker

        switch (vixData.status) {
          case 'panic':
            // VIX>=40: 金色 + 最大サイズ + テキスト追加
            return {
              ...marker,
              color: '#f59e0b',   // amber-500
              size: 3,
              text: marker.text ? `${marker.text} 🔥VIX${vixData.value.toFixed(0)}` : `🔥VIX${vixData.value.toFixed(0)}`,
            }
          case 'fear':
            // VIX>=25: オレンジ + やや大きめ
            return {
              ...marker,
              color: '#fb923c',   // orange-400
              size: 2,
              text: marker.text ? `${marker.text} ⚠️` : '⚠️',
            }
          case 'complacency':
            // VIX<=10: 薄くして警戒（買いシグナルの信頼性低下を表現）
            return {
              ...marker,
              color: '#94a3b8',   // slate-400（グレーアウト）
              size: 1,
            }
          default:
            return marker
        }
      })
    },
    [vixData]
  )

  /**
   * 現在のVIX状態をもとに買いシグナルの信頼度を返す
   * Phase3のスコアリングロジックの土台
   */
  const getVixScore = useCallback((): number => {
    if (!vixData) return 0
    switch (vixData.status) {
      case 'panic':       return 3  // 最重要シグナル
      case 'fear':        return 1  // 補助シグナル
      case 'complacency': return -1 // 買いシグナルを弱める
      default:            return 0
    }
  }, [vixData])

  return {
    vixData,
    handleVixChange,  // VixPanel の onVixChange に渡す
    enhanceMarkers,   // チャートのマーカー配列に適用
    getVixScore,      // Phase3スコアリングで利用
  }
}
