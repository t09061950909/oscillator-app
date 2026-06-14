'use client'
import { useEffect, useRef } from 'react'
import type { PriceBar } from '@/types'
import { calcTSI, detectCrossSignals } from '@/lib/tsi'

interface Props {
  bars: PriceBar[]
  symbolId: string
  ticker: string
}

type LWC = typeof import('lightweight-charts')
type IChart = import('lightweight-charts').IChartApi
type Time   = import('lightweight-charts').Time
type SeriesAny = import('lightweight-charts').ISeriesApi<import('lightweight-charts').SeriesType>

interface ChartState {
  lwc: LWC
  priceChart: IChart
  tsiChart: IChart
  ro: ResizeObserver
  disposed: boolean
  // 現在アクティブなシリーズ参照（差し替え用）
  activeSeries: { chart: IChart; s: SeriesAny }[]
  // クロスヘア参照用（最新のシリーズをここに保持）
  crossRef: {
    tsiSeries: SeriesAny | null
    candleSeries: SeriesAny | null
  }
}

export default function TradingChart({ bars, ticker }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<ChartState | null>(null)

  // ── チャート初期化：マウント時1回だけ ──
  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false

    async function init() {
      const lwc = await import('lightweight-charts')
      if (cancelled || !containerRef.current) return

      const { createChart, CrosshairMode, LineStyle } = lwc
      const container = containerRef.current
      container.innerHTML = ''

      const totalH = container.clientHeight || 600
      const priceH = Math.floor(totalH * 0.62)
      const tsiH   = totalH - priceH - 4

      const priceWrapper = document.createElement('div')
      priceWrapper.style.cssText = `height:${priceH}px;`
      const tsiWrapper = document.createElement('div')
      tsiWrapper.style.cssText = `height:${tsiH}px;border-top:1px solid #30363d;`
      container.appendChild(priceWrapper)
      container.appendChild(tsiWrapper)

      const baseOpts = {
        layout: { background: { color: '#0d1117' }, textColor: '#8b949e', fontSize: 11 },
        grid: { vertLines: { color: '#21262d' }, horzLines: { color: '#21262d' } },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: '#8b949e', width: 1 as 1, style: LineStyle.Dashed },
          horzLine: { color: '#8b949e', width: 1 as 1, style: LineStyle.Dashed },
        },
        rightPriceScale: { borderColor: '#30363d' },
        // 下チャートの時間軸は非表示（上と共有する）
        timeScale: { borderColor: '#30363d', timeVisible: true },
      }

      const priceChart = createChart(priceWrapper, { ...baseOpts, height: priceH })
      const tsiChart   = createChart(tsiWrapper, {
        ...baseOpts,
        height: tsiH,
        timeScale: { ...baseOpts.timeScale, visible: false }, // 下チャートの軸を非表示
      })

      const crossRef: ChartState['crossRef'] = { tsiSeries: null, candleSeries: null }

      // ── 横スケール同期：初期化時1回だけ購読 ──
      let lockP = false, lockT = false
      priceChart.timeScale().subscribeVisibleLogicalRangeChange(r => {
        if (lockT || !r) return
        lockP = true
        try { tsiChart.timeScale().setVisibleLogicalRange(r) } catch { /**/ }
        lockP = false
      })
      tsiChart.timeScale().subscribeVisibleLogicalRangeChange(r => {
        if (lockP || !r) return
        lockT = true
        try { priceChart.timeScale().setVisibleLogicalRange(r) } catch { /**/ }
        lockT = false
      })

      // ── クロスヘア同期：初期化時1回だけ購読（crossRefで最新シリーズを参照）──
      priceChart.subscribeCrosshairMove(p => {
        const st = stateRef.current
        if (!st || st.disposed || !crossRef.tsiSeries) return
        try {
          if (p.time) tsiChart.setCrosshairPosition(0, p.time as Time, crossRef.tsiSeries)
          else tsiChart.clearCrosshairPosition()
        } catch { /**/ }
      })
      tsiChart.subscribeCrosshairMove(p => {
        const st = stateRef.current
        if (!st || st.disposed || !crossRef.candleSeries) return
        try {
          if (p.time) priceChart.setCrosshairPosition(0, p.time as Time, crossRef.candleSeries)
          else priceChart.clearCrosshairPosition()
        } catch { /**/ }
      })

      // ── Resize observer ──
      const ro = new ResizeObserver(() => {
        const st = stateRef.current
        if (!st || st.disposed) return
        const h  = container.clientHeight
        const ph = Math.floor(h * 0.62)
        const th = h - ph - 4
        priceWrapper.style.height = `${ph}px`
        tsiWrapper.style.height   = `${th}px`
        try {
          priceChart.applyOptions({ height: ph })
          tsiChart.applyOptions({ height: th })
        } catch { /**/ }
      })
      ro.observe(container)

      stateRef.current = {
        lwc, priceChart, tsiChart, ro,
        disposed: false,
        activeSeries: [],
        crossRef,
      }

      drawSeries(stateRef.current, bars, ticker)
    }

    init()
    return () => {
      cancelled = true
      dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── データ更新：bars / ticker 変化時 ──
  useEffect(() => {
    const st = stateRef.current
    if (!st || st.disposed) return
    drawSeries(st, bars, ticker)
  }, [bars, ticker])

  function dispose() {
    const st = stateRef.current
    if (!st || st.disposed) return
    st.disposed = true
    st.ro.disconnect()
    st.activeSeries = []
    try { st.priceChart.remove() } catch { /**/ }
    try { st.tsiChart.remove() }   catch { /**/ }
    stateRef.current = null
  }

  return <div ref={containerRef} style={{ width: '100%', height: 'calc(100vh - 52px)' }} />
}

// ── シリーズ差し替え＋描画（クロスヘア・時間軸の購読は触らない）──
function drawSeries(st: ChartState, bars: PriceBar[], ticker: string) {
  if (st.disposed || bars.length === 0) return

  const { lwc, priceChart, tsiChart, crossRef } = st
  const { CandlestickSeries, LineSeries, LineStyle, createSeriesMarkers } = lwc

  // 前回シリーズを安全に削除
  for (const { chart, s } of st.activeSeries) {
    try { chart.removeSeries(s) } catch { /**/ }
  }
  st.activeSeries = []
  if (st.disposed) return

  // シリーズ再作成
  const candleSeries = priceChart.addSeries(CandlestickSeries, {
    upColor: '#3fb950', downColor: '#f85149',
    borderUpColor: '#3fb950', borderDownColor: '#f85149',
    wickUpColor: '#3fb950', wickDownColor: '#f85149',
  })
  const tsiSeries  = tsiChart.addSeries(LineSeries, { color: '#388bfd', lineWidth: 2 as 2, title: 'TSI' })
  const sigSeries  = tsiChart.addSeries(LineSeries, { color: '#d29922', lineWidth: 1 as 1, lineStyle: LineStyle.Dashed, title: 'Sig' })
  const zeroSeries = tsiChart.addSeries(LineSeries, { color: '#484f58', lineWidth: 1 as 1, lineStyle: LineStyle.Dotted, title: '-10' })

  st.activeSeries = [
    { chart: priceChart, s: candleSeries as SeriesAny },
    { chart: tsiChart,   s: tsiSeries   as SeriesAny },
    { chart: tsiChart,   s: sigSeries   as SeriesAny },
    { chart: tsiChart,   s: zeroSeries  as SeriesAny },
  ]

  // クロスヘア用の最新シリーズ参照を更新
  crossRef.candleSeries = candleSeries as SeriesAny
  crossRef.tsiSeries    = tsiSeries    as SeriesAny

  // ── データセット ──
  candleSeries.setData(bars.map(b => ({
    time: b.date as Time, open: b.open, high: b.high, low: b.low, close: b.close,
  })))

  const tsiPoints = calcTSI(bars, 12, 6, 3)
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

  // 全データをフィット表示
  priceChart.timeScale().fitContent()

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
