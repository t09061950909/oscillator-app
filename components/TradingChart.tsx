'use client'
import { useEffect, useRef } from 'react'
import type { PriceBar } from '@/types'
import { calcTSI, detectCrossSignals } from '@/lib/tsi'
import type { TsiParams } from './TsiParamBar'

interface Props {
  bars: PriceBar[]
  symbolId: string
  ticker: string
  tsiParams: TsiParams
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
  crossRef: { tsiSeries: SeriesAny | null; candleSeries: SeriesAny | null }
}

export default function TradingChart({ bars, ticker, tsiParams }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stateRef     = useRef<ChartState | null>(null)

  // ── 初期化：マウント時1回 ──
  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false

    async function init() {
      const lwc = await import('lightweight-charts')
      if (cancelled || !containerRef.current) return

      const { createChart, CrosshairMode, LineStyle } = lwc
      const container = containerRef.current
      container.innerHTML = ''

      // 1つのチャートで全て管理（Pane分割でTSIを下部に配置）
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

      // Pane 1（TSI用）を追加
      chart.addPane()

      // Pane 0 の高さ比率を 62% に設定
      const panes = chart.panes()
      if (panes.length >= 2) {
        const total = container.clientHeight
        panes[0].setHeight(Math.floor(total * 0.62))
        panes[1].setHeight(total - Math.floor(total * 0.62))
      }

      const crossRef: ChartState['crossRef'] = { tsiSeries: null, candleSeries: null }

      // クロスヘア同期（1チャートなので縦線は自動同期、横線のみ手動）
      chart.subscribeCrosshairMove(p => {
        // 1チャートなので基本的に自動で同期される
      })

      // Resize observer
      const ro = new ResizeObserver(() => {
        const st = stateRef.current
        if (!st || st.disposed) return
        const h = container.clientHeight
        const w = container.clientWidth
        try {
          chart.applyOptions({ width: w, height: h })
          const panes = chart.panes()
          if (panes.length >= 2) {
            panes[0].setHeight(Math.floor(h * 0.62))
            panes[1].setHeight(h - Math.floor(h * 0.62))
          }
        } catch { /**/ }
      })
      ro.observe(container)

      stateRef.current = {
        lwc, chart, ro,
        disposed: false,
        activeSeries: [],
        crossRef,
      }

      drawSeries(stateRef.current, bars, ticker, tsiParams)
    }

    init()
    return () => { cancelled = true; dispose() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── bars / ticker / tsiParams 変化時に再描画 ──
  useEffect(() => {
    const st = stateRef.current
    if (!st || st.disposed) return
    drawSeries(st, bars, ticker, tsiParams)
  }, [bars, ticker, tsiParams])

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
    <div
      ref={containerRef}
      style={{ width: '100%', height: 'calc(100vh - 88px)' }}
    />
  )
}

// ── シリーズ差し替え＋描画 ──
function drawSeries(st: ChartState, bars: PriceBar[], ticker: string, tsiParams: TsiParams) {
  if (st.disposed || bars.length === 0) return

  const { lwc, chart } = st
  const { CandlestickSeries, LineSeries, LineStyle, createSeriesMarkers } = lwc

  // 前回シリーズを安全削除
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

  // ── Pane 1: TSI・シグナル・ゼロライン ──
  const tsiSeries  = chart.addSeries(LineSeries, { color: '#388bfd', lineWidth: 2 as 2, title: 'TSI' }, 1)
  const sigSeries  = chart.addSeries(LineSeries, { color: '#d29922', lineWidth: 1 as 1, lineStyle: LineStyle.Dashed, title: 'Sig' }, 1)
  const zeroSeries = chart.addSeries(LineSeries, { color: '#484f58', lineWidth: 1 as 1, lineStyle: LineStyle.Dotted, title: '-10' }, 1)

  st.activeSeries = [
    candleSeries as SeriesAny,
    tsiSeries    as SeriesAny,
    sigSeries    as SeriesAny,
    zeroSeries   as SeriesAny,
  ]
  st.crossRef.candleSeries = candleSeries as SeriesAny
  st.crossRef.tsiSeries    = tsiSeries    as SeriesAny

  // ── データセット ──
  candleSeries.setData(bars.map(b => ({
    time: b.date as Time, open: b.open, high: b.high, low: b.low, close: b.close,
  })))

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

  // GCマーカー
  if (signals.length > 0) {
    createSeriesMarkers(tsiSeries, signals.map(s => ({
      time: s.date as Time, position: 'belowBar' as const, shape: 'arrowUp' as const,
      color: s.type === 'golden_below' ? '#f85149' : '#3fb950',
      size: 1, text: s.type === 'golden_below' ? 'GC<-10' : 'GC>-10',
    })))
    createSeriesMarkers(candleSeries, signals.map(s => ({
      time: s.date as Time, position: 'belowBar' as const, shape: 'arrowUp' as const,
      color: s.type === 'golden_below' ? '#f85149' : '#3fb950',
      size: 1, text: '',
    })))
  }

  chart.timeScale().fitContent()

  // 通知
  if (signals.length > 0 && typeof window !== 'undefined' && Notification.permission === 'granted') {
    const last = bars[bars.length - 1]?.date
    const hit  = signals.find(s => s.date === last)
    if (hit) {
      new Notification(`📈 ${ticker} シグナル検出`, {
        body: hit.type === 'golden_below'
          ? '▲ -10以下でゴールデンクロス（強い買いシグナル）'
          : '▲ -10以上でゴールデンクロス',
        icon: '/icon-192.png',
      })
    }
  }
}
