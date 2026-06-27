/**
 * Node.js 20 用 WebSocket ポリフィル
 * tsx --import で事前読み込みすることで、Supabase の createClient より前に実行される
 */
import { WebSocket as WS } from 'ws'
if (typeof globalThis.WebSocket === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).WebSocket = WS
  console.log('[polyfill] globalThis.WebSocket = ws')
}
