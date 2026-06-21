'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import type { VixData }    from '@/app/api/vix/route'
import type { MacroData }  from '@/app/api/macro/route'
import {
  calcSignalScore,
  type SignalScore,
  type TsiCrossType,
  type EnhancedMarker,
} from '@/lib/signalScore'

export type { EnhancedMarker } from '@/lib/signalScore'

export function useSignalScore() {
  const [vixData,      setVixData]      = useState<VixData    | null>(null)
  const [macroData,    setMacroData]    = useState<MacroData  | null>(null)
  const [lastScore,    setLastScore]    = useState<SignalScore | null>(null)
  const [vixLoading,   setVixLoading]   = useState(true)
  const [macroLoading, setMacroLoading] = useState(true)
  const [vixError,     setVixError]     = useState<string | null>(null)
  const [macroError,   setMacroError]   = useState<string | null>(null)

  const vixRef   = useRef<VixData   | null>(null)
  const macroRef = useRef<MacroData | null>(null)
  const vixTimer   = useRef<NodeJS.Timeout | null>(null)
  const macroTimer = useRef<NodeJS.Timeout | null>(null)

  // ── VIX fetch ────────────────────────────────────────
  const fetchVix = useCallback(async () => {
    try {
      setVixLoading(true)
      const res = await fetch('/api/vix')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: VixData = await res.json()
      setVixData(json)
      vixRef.current = json
      setVixError(null)
    } catch (e) {
      setVixError(e instanceof Error ? e.message : 'VIX取得失敗')
    } finally {
      setVixLoading(false)
    }
  }, [])

  // ── マクロ fetch ──────────────────────────────────────
  const fetchMacro = useCallback(async () => {
    try {
      setMacroLoading(true)
      const res = await fetch('/api/macro')
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.detail ?? `HTTP ${res.status}`)
      }
      const json: MacroData = await res.json()
      setMacroData(json)
      macroRef.current = json
      setMacroError(null)
    } catch (e) {
      setMacroError(e instanceof Error ? e.message : 'マクロ取得失敗')
    } finally {
      setMacroLoading(false)
    }
  }, [])

  // ── 初期fetch + 自動更新 ──────────────────────────────
  useEffect(() => {
    fetchVix()
    fetchMacro()
    vixTimer.current   = setInterval(fetchVix,   5  * 60 * 1000) // 5分
    macroTimer.current = setInterval(fetchMacro, 60 * 60 * 1000) // 1時間
    return () => {
      if (vixTimer.current)   clearInterval(vixTimer.current)
      if (macroTimer.current) clearInterval(macroTimer.current)
    }
  }, [fetchVix, fetchMacro])

  // ── マーカー強調 ──────────────────────────────────────
  const enhanceMarkers = useCallback(
    (markers: EnhancedMarker[]): EnhancedMarker[] => {
      return markers.map(marker => {
        const crossType = inferCrossType(marker)
        const score = calcSignalScore(vixRef.current, macroRef.current, crossType)
        setLastScore(score)
        return {
          ...marker,
          color: score.color,
          size:  score.size,
          text:  buildMarkerText(marker, score),
        }
      })
    },
    []
  )

  return {
    vixData, macroData, lastScore,
    vixLoading, macroLoading,
    vixError, macroError,
    fetchVix, fetchMacro,
    enhanceMarkers,
  }
}

function inferCrossType(marker: EnhancedMarker): TsiCrossType {
  if (marker.position === 'belowBar') {
    return marker.text?.includes('<-10') ? 'golden_below' : 'golden_above'
  }
  return marker.text?.includes('<-10') ? 'dead_below' : 'dead_above'
}

function buildMarkerText(marker: EnhancedMarker, score: SignalScore): string {
  const base = marker.text ?? ''
  if (score.total >= 5) return `${base} 🔥${score.total}`
  if (score.total >= 3) return `${base} ✅${score.total}`
  if (score.total >= 1) return `${base} +${score.total}`
  if (score.total <= -4) return `${base} 🚨${score.total}`
  if (score.total <= -2) return `${base} 🔴${score.total}`
  return base
}
