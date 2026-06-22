'use client'
import { useEffect, useRef, type MutableRefObject } from 'react'
import type { PriceBar } from '@/types'
import {
  calcTSI, detectCrossSignals,
  calcBollingerBands, calcMACD,
} from '@/lib/tsi'
import type { TsiParams, BBParams, MACDParams, ActiveIndicator } from './TsiParamBar'
import SignalPanel from './SignalPanel'
import { useSignalScore, type EnhancedMarker } from '@/hooks/useSignalScore'

interface Props {
  bars:        PriceBar[]
  symbolId:    string
  ticker:      string
  tsiParams:   TsiParams
  bbParams:    BBParams
  macdParams:  MACDParams
  activeIndicator: ActiveIndicator
}

type LWC       = typeof import('lightweight-charts')
type IChart    = import('lightweight-charts').IChartApi
type Time      = import('lightweight-charts').Time
type SeriesAny = import('lightweight-charts').ISeriesApi<import('lightweight-charts').SeriesType>

interface ChartState {
  lwc: LWC
  chart: IChart
  ro: ResizeObserver
  disposed: boolean
  activeSeries: SeriesAny[]
}

export default function TradingChart({
  bars, ticker,
  tsiParams, bbParams, macdParams, activeIndicator,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stateRef     = useRef<ChartState | null>(null)
  const {
    vixData, macroData, pppData, lastScore,
    vixLoading, macroLoading,
    vixError, macroError,
    fetchVix, fetchMacro,
    enhanceMarkers,
  } = useSignalScore(ticker)

  // enhanceMarkers を drawSeries から参照できるよう ref に保持
  const enhanceMarkersRef = useRef(enhanceMarkers)
  useEffect(() => { enhanceMarkersRef.current = enhanceMarkers }, [enhanceMarkers])

  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false

    async function init() {
      const lwc = await import('lightweight-charts')
      if (cancelled || !containerRef.current) return

      const { createChart, CrosshairMode, LineStyle } = lwc
      const container = containerRef.current
      container.innerHTML = ''

      const chart = createChart(container, {
        width:  container.clientWidth,
        height: container.clientHeight,
        layout: {
          background: { color: '#0d1117' },
          textColor: '#8b949e',
          fontSize: 11,
        },
        grid: {
          vertLines: { color: '#21262d' },
          horzLines: { color: '#21262d' },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: '#8b949e', width: 1 as 1, style: LineStyle.Dashed },
          horzLine: { color: '#8b949e', width: 1 as 1, style: LineStyle.Dashed },
        },
        rightPriceScale: { borderColor: '#30363d' },
        timeScale: { borderColor: '#30363d', timeVisible: true, rightOffset: 5 },
      })

      // Pane 1（インジケータ用）
      chart.addPane()

      const ro = new ResizeObserver(() => {
        const st = stateRef.current
        if (!st || st.disposed) return
        const h = container.clientHeight
        const w = container.clientWidth
        try {
          chart.applyOptions({ width: w, height: h })
          resizePanes(chart, h)
        } catch { /**/ }
      })
      ro.observe(container)

      resizePanes(chart, container.clientHeight)

      stateRef.current = { lwc, chart, ro, disposed: false, activeSeries: [] }

      drawSeries(stateRef.current, bars, ticker, tsiParams, bbParams, macdParams, activeIndicator, enhanceMarkersRef)
    }

    init()
    return () => { cancelled = true; dispose() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const st = stateRef.current
    if (!st || st.disposed) return
    drawSeries(st, bars, ticker, tsiParams, bbParams, macdParams, activeIndicator, enhanceMarkersRef)
  }, [bars, ticker, tsiParams, bbParams, macdParams, activeIndicator])

  function dispose() {
    const st = stateRef.current
    if (!st || st.disposed) return
    st.disposed = true
    st.ro.disconnect()
    st.activeSeries = []
    try { st.chart.remove() } catch { /**/ }
    stateRef.current = null
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: 'calc(100vh - 88px)' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {/* 右上: 統合シグナルパネル */}
      <div style={{
        position: 'absolute', top: 8, right: 8,
        width: 180, zIndex: 10,
      }}>
        <SignalPanel
          vixData={vixData}
          macroData={macroData}
          pppData={pppData}
          score={lastScore}
          onRefreshVix={fetchVix}
          onRefreshMacro={fetchMacro}
          vixLoading={vixLoading}
          macroLoading={macroLoading}
          vixError={vixError}
          macroError={macroError}
        />
      </div>
    </div>
  )
}

function resizePanes(chart: IChart, totalH: number) {
  const panes = chart.panes()
  if (panes.length >= 2) {
    panes[0].setHeight(Math.floor(totalH * 0.62))
    panes[1].setHeight(totalH - Math.floor(totalH * 0.62))
  }
}

function drawSeries(
  st: ChartState,
  bars: PriceBar[],
  ticker: string,
  tsiParams:  TsiParams,
  bbParams:   BBParams,
  macdParams: MACDParams,
  activeIndicator: ActiveIndicator,
  enhanceMarkersRef: MutableRefObject<(markers: EnhancedMarker[]) => EnhancedMarker[]>,
) {
  if (st.disposed || bars.length === 0) return

  const { lwc, chart } = st
  const { CandlestickSeries, LineSeries, HistogramSeries, LineStyle, createSeriesMarkers } = lwc

  // 既存シリーズ削除
  for (const s of st.activeSeries) {
    try { chart.removeSeries(s) } catch { /**/ }
  }
  st.activeSeries = []
  if (st.disposed) return

  // ── Pane 0: ローソク足 ──
  const candleSeries = chart.addSeries(CandlestickSeries, {
    upColor: '#3fb950', downColor: '#f85149',
    borderUpColor: '#3fb950', borderDownColor: '#f85149',
    wickUpColor: '#3fb950', wickDownColor: '#f85149',
  }, 0)
  candleSeries.setData(bars.map(b => ({
    time: b.date as Time, open: b.open, high: b.high, low: b.low, close: b.close,
  })))
  st.activeSeries.push(candleSeries as SeriesAny)

  // ── ボリンジャーバンド（Pane 0 に重ねて表示） ──
  if (activeIndicator === 'bb') {
    const bbData = calcBollingerBands(bars, bbParams.period, bbParams.stdDev)
    const bbUpper = chart.addSeries(LineSeries, {
      color: '#c678dd', lineWidth: 1 as 1, title: `BB+${bbParams.stdDev}σ`,
      lineStyle: LineStyle.Solid,
    }, 0)
    const bbMid = chart.addSeries(LineSeries, {
      color: '#c678dd99', lineWidth: 1 as 1, title: `BB Mid`,
      lineStyle: LineStyle.Dashed,
    }, 0)
    const bbLower = chart.addSeries(LineSeries, {
      color: '#c678dd', lineWidth: 1 as 1, title: `BB-${bbParams.stdDev}σ`,
      lineStyle: LineStyle.Solid,
    }, 0)
    bbUpper.setData(bbData.map(p => ({ time: p.date as Time, value: p.upper })))
    bbMid.setData(bbData.map(p => ({ time: p.date as Time, value: p.middle })))
    bbLower.setData(bbData.map(p => ({ time: p.date as Time, value: p.lower })))
    st.activeSeries.push(bbUpper as SeriesAny, bbMid as SeriesAny, bbLower as SeriesAny)
  }

  // ── Pane 1: インジケータ ──
  if (activeIndicator === 'tsi') {
    // TSI + シグナル + ゼロライン
    const tsiSeries  = chart.addSeries(LineSeries, { color: '#388bfd', lineWidth: 2 as 2, title: 'TSI' }, 1)
    const sigSeries  = chart.addSeries(LineSeries, {
      color: '#d29922', lineWidth: 1 as 1, lineStyle: LineStyle.Dashed, title: 'Sig',
    }, 1)
    const zeroSeries = chart.addSeries(LineSeries, {
      color: '#484f58', lineWidth: 1 as 1, lineStyle: LineStyle.Dotted, title: '-10',
    }, 1)

    const tsiPoints = calcTSI(bars, tsiParams.long, tsiParams.short, tsiParams.signal)
    const signals   = detectCrossSignals(tsiPoints, bars, -10)

    tsiSeries.setData(tsiPoints.map(p => ({ time: p.date as Time, value: p.tsi })))
    sigSeries.setData(tsiPoints.map(p => ({ time: p.date as Time, value: p.signal })))
    if (tsiPoints.length > 0) {
      zeroSeries.setData([
        { time: tsiPoints[0].date as Time,                    value: -10 },
        { time: tsiPoints[tsiPoints.length - 1].date as Time, value: -10 },
      ])
    }

    // マーカー（GC=上矢印緑、DC=下矢印赤）
    if (signals.length > 0) {
      const rawMarkers = signals.map(s => {
        const isGolden = s.type === 'golden_below' || s.type === 'golden_above'
        return {
          time:     s.date as Time,
          position: isGolden ? 'belowBar' as const : 'aboveBar' as const,
          shape:    isGolden ? 'arrowUp' as const  : 'arrowDown' as const,
          color:    isGolden ? '#3fb950' : '#f85149',
          size:     1,
          text:     isGolden
            ? (s.type === 'golden_below' ? 'GC<-10' : 'GC')
            : (s.type === 'dead_below'   ? 'DC<-10' : 'DC'),
        }
      })
      // VIX状態に応じてマーカーを強調
      const tsiMarkers = enhanceMarkersRef.current(rawMarkers)
      createSeriesMarkers(tsiSeries, tsiMarkers)

      // ローソク足にも同じマーカー（テキストなし）
      createSeriesMarkers(candleSeries, signals.map(s => {
        const isGolden = s.type === 'golden_below' || s.type === 'golden_above'
        return {
          time:     s.date as Time,
          position: isGolden ? 'belowBar' as const : 'aboveBar' as const,
          shape:    isGolden ? 'arrowUp' as const  : 'arrowDown' as const,
          color:    isGolden ? '#3fb950' : '#f85149',
          size:     1,
          text:     '',
        }
      }))
    }

    st.activeSeries.push(tsiSeries as SeriesAny, sigSeries as SeriesAny, zeroSeries as SeriesAny)

    // 通知
    if (signals.length > 0 && typeof window !== 'undefined' && Notification.permission === 'granted') {
      const last = bars[bars.length - 1]?.date
      const hit  = signals.find(s => s.date === last)
      if (hit) {
        const isGolden = hit.type === 'golden_below' || hit.type === 'golden_above'
        new Notification(`${isGolden ? '📈' : '📉'} ${ticker} シグナル検出`, {
          body: isGolden
            ? (hit.type === 'golden_below' ? '▲ -10以下でゴールデンクロス（強い買いシグナル）' : '▲ ゴールデンクロス')
            : (hit.type === 'dead_below'   ? '▼ -10以下でデッドクロス（強い売りシグナル）'   : '▼ デッドクロス'),
          icon: '/icon-192.png',
        })
      }
    }

  } else if (activeIndicator === 'macd') {
    // MACD Line + Signal + Histogram
    const macdData = calcMACD(bars, macdParams.fast, macdParams.slow, macdParams.signal)

    const macdSeries = chart.addSeries(LineSeries, {
      color: '#e5c07b', lineWidth: 2 as 2, title: 'MACD',
    }, 1)
    const macdSig = chart.addSeries(LineSeries, {
      color: '#f85149', lineWidth: 1 as 1, lineStyle: LineStyle.Dashed, title: 'Signal',
    }, 1)
    const histSeries = chart.addSeries(HistogramSeries, {
      color: '#3fb950', title: 'Hist',
    }, 1)

    macdSeries.setData(macdData.map(p => ({ time: p.date as Time, value: p.macd })))
    macdSig.setData(macdData.map(p => ({ time: p.date as Time, value: p.signal })))
    histSeries.setData(macdData.map(p => ({
      time:  p.date as Time,
      value: p.histogram,
      color: p.histogram >= 0 ? '#3fb95088' : '#f8514988',
    })))

    st.activeSeries.push(macdSeries as SeriesAny, macdSig as SeriesAny, histSeries as SeriesAny)

  } else if (activeIndicator === 'bb') {
    // BB のとき Pane 1 はパーセント帯（%B）を表示
    const bbData = calcBollingerBands(bars, bbParams.period, bbParams.stdDev)
    const pctB = bbData.map(p => {
      const range = p.upper - p.lower
      const close = bars.find(b => b.date === p.date)?.close ?? p.middle
      return { time: p.date as Time, value: range > 0 ? (close - p.lower) / range * 100 : 50 }
    })
    const pctSeries = chart.addSeries(LineSeries, {
      color: '#c678dd', lineWidth: 2 as 2, title: '%B',
    }, 1)
    const upperRef = chart.addSeries(LineSeries, {
      color: '#c678dd44', lineWidth: 1 as 1, lineStyle: LineStyle.Dotted, title: '100',
    }, 1)
    const lowerRef = chart.addSeries(LineSeries, {
      color: '#c678dd44', lineWidth: 1 as 1, lineStyle: LineStyle.Dotted, title: '0',
    }, 1)
    pctSeries.setData(pctB)
    if (pctB.length > 0) {
      upperRef.setData([{ time: pctB[0].time, value: 100 }, { time: pctB[pctB.length - 1].time, value: 100 }])
      lowerRef.setData([{ time: pctB[0].time, value: 0   }, { time: pctB[pctB.length - 1].time, value: 0   }])
    }
    st.activeSeries.push(pctSeries as SeriesAny, upperRef as SeriesAny, lowerRef as SeriesAny)
  }

  chart.timeScale().fitContent()
}
