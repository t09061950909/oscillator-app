'use client'
import { useEffect, useRef, useCallback } from 'react'
import type { PriceBar } from '@/types'
import { calcTSI, detectCrossSignals } from '@/lib/tsi'

interface Props {
  bars: PriceBar[]
  symbolId: string
  ticker: string
}

export default function TradingChart({ bars, symbolId, ticker }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  const buildChart = useCallback(async () => {
    if (!containerRef.current || bars.length === 0) return

    if (cleanupRef.current) {
      cleanupRef.current()
      cleanupRef.current = null
    }
    containerRef.current.innerHTML = ''

    const LWC = await import('lightweight-charts')
    const {
      createChart,
      CandlestickSeries,
      LineSeries,
      CrosshairMode,
      LineStyle,
      createSeriesMarkers,
    } = LWC

    const container = containerRef.current
    const totalHeight = container.clientHeight || 600
    const priceHeight = Math.floor(totalHeight * 0.62)
    const tsiHeight = totalHeight - priceHeight - 4

    // Wrappers
    const priceWrapper = document.createElement('div')
    priceWrapper.style.cssText = `height:${priceHeight}px;position:relative;`
    const tsiWrapper = document.createElement('div')
    tsiWrapper.style.cssText = `height:${tsiHeight}px;position:relative;border-top:1px solid #30363d;`
    container.appendChild(priceWrapper)
    container.appendChild(tsiWrapper)

    const sharedOptions = {
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
      timeScale: { borderColor: '#30363d', timeVisible: true },
    }

    // ── Price chart ──
    const priceChart = createChart(priceWrapper, { ...sharedOptions, height: priceHeight })
    const candleSeries = priceChart.addSeries(CandlestickSeries, {
      upColor: '#3fb950',
      downColor: '#f85149',
      borderUpColor: '#3fb950',
      borderDownColor: '#f85149',
      wickUpColor: '#3fb950',
      wickDownColor: '#f85149',
    })

    type Time = import('lightweight-charts').Time
    const candleData = bars.map(b => ({
      time: b.date as Time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }))
    candleSeries.setData(candleData)

    // ── TSI chart ──
    const tsiChart = createChart(tsiWrapper, { ...sharedOptions, height: tsiHeight })

    const tsiPoints = calcTSI(bars, 12, 6, 3)
    const signals = detectCrossSignals(tsiPoints, bars, -10)

    // TSI line
    const tsiSeries = tsiChart.addSeries(LineSeries, {
      color: '#388bfd',
      lineWidth: 2 as 2,
      title: 'TSI',
    })
    tsiSeries.setData(
      tsiPoints.map(p => ({ time: p.date as Time, value: p.tsi }))
    )

    // Signal line
    const signalSeries = tsiChart.addSeries(LineSeries, {
      color: '#d29922',
      lineWidth: 1 as 1,
      lineStyle: LineStyle.Dashed,
      title: 'Signal',
    })
    signalSeries.setData(
      tsiPoints.map(p => ({ time: p.date as Time, value: p.signal }))
    )

    // Zero line (-10)
    if (tsiPoints.length > 0) {
      const zeroSeries = tsiChart.addSeries(LineSeries, {
        color: '#484f58',
        lineWidth: 1 as 1,
        lineStyle: LineStyle.Dotted,
        title: '-10',
      })
      zeroSeries.setData([
        { time: tsiPoints[0].date as Time, value: -10 },
        { time: tsiPoints[tsiPoints.length - 1].date as Time, value: -10 },
      ])
    }

    // ── Markers via createSeriesMarkers ──
    if (signals.length > 0 && tsiPoints.length > 0) {
      const tsiMarkers = signals.map(sig => ({
        time: sig.date as Time,
        position: 'belowBar' as const,
        shape: 'arrowUp' as const,
        color: sig.type === 'golden_below' ? '#f85149' : '#3fb950',
        size: 1,
        text: sig.type === 'golden_below' ? 'GC<-10' : 'GC>-10',
      }))
      createSeriesMarkers(tsiSeries, tsiMarkers)

      const priceMarkers = signals.map(sig => ({
        time: sig.date as Time,
        position: 'belowBar' as const,
        shape: 'arrowUp' as const,
        color: sig.type === 'golden_below' ? '#f85149' : '#3fb950',
        size: 1,
        text: '',
      }))
      createSeriesMarkers(candleSeries, priceMarkers)
    }

    // ── Sync crosshair ──
    priceChart.subscribeCrosshairMove(param => {
      if (param.time) {
        tsiChart.setCrosshairPosition(0, param.time as Time, tsiSeries)
      } else {
        tsiChart.clearCrosshairPosition()
      }
    })
    tsiChart.subscribeCrosshairMove(param => {
      if (param.time) {
        priceChart.setCrosshairPosition(0, param.time as Time, candleSeries)
      } else {
        priceChart.clearCrosshairPosition()
      }
    })

    // ── Sync time scale ──
    let syncingPrice = false
    let syncingTsi = false
    priceChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (syncingTsi) return
      syncingPrice = true
      if (range) tsiChart.timeScale().setVisibleLogicalRange(range)
      syncingPrice = false
    })
    tsiChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (syncingPrice) return
      syncingTsi = true
      if (range) priceChart.timeScale().setVisibleLogicalRange(range)
      syncingTsi = false
    })

    priceChart.timeScale().fitContent()

    // ── Browser notification on latest signal ──
    if (signals.length > 0 && 'Notification' in window && Notification.permission === 'granted') {
      const latestDate = bars[bars.length - 1]?.date
      const recentSignal = signals.find(s => s.date === latestDate)
      if (recentSignal) {
        new Notification(`📈 ${ticker} シグナル検出`, {
          body: recentSignal.type === 'golden_below'
            ? '▲ -10以下でゴールデンクロス（買いシグナル強）'
            : '▲ -10以上でゴールデンクロス',
          icon: '/icon-192.png',
        })
      }
    }

    // ── Resize observer ──
    const ro = new ResizeObserver(() => {
      const h = container.clientHeight
      const ph = Math.floor(h * 0.62)
      priceWrapper.style.height = `${ph}px`
      tsiWrapper.style.height = `${h - ph - 4}px`
      priceChart.applyOptions({ height: ph })
      tsiChart.applyOptions({ height: h - ph - 4 })
    })
    ro.observe(container)

    cleanupRef.current = () => {
      ro.disconnect()
      priceChart.remove()
      tsiChart.remove()
    }
  }, [bars, ticker])

  useEffect(() => {
    buildChart()
    return () => { if (cleanupRef.current) cleanupRef.current() }
  }, [buildChart])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: 'calc(100vh - 52px)' }}
    />
  )
}
