import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Oscillator App',
  description: '投資タイミングを知らせるオシレータアプリ',
  manifest: '/manifest.json',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  )
}
