export interface Symbol {
  id: string
  ticker: string          // e.g. "SOX*USDJPY" or "AAPL"
  display_name: string
  base_ticker: string     // e.g. "^SOX"
  fx_ticker: string | null // e.g. "USDJPY=X"
  created_at: string
}

export interface PriceBar {
  date: string   // YYYY-MM-DD
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface PriceCache {
  id: string
  symbol_id: string
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  close_jpy: number | null
}

export interface TSIPoint {
  date: string
  tsi: number
  signal: number
}

export type CrossSignal = {
  date: string
  type: 'golden_below' | 'golden_above'  // below=-10, above=-10
  price: number
}

export type PriceRange = '1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL'
