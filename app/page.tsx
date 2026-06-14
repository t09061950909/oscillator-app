'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, RefreshCw, TrendingUp, Bell, BellOff, LogOut } from 'lucide-react'
import type { Symbol } from '@/types'
import SymbolCard from '@/components/SymbolCard'
import AddSymbolModal from '@/components/AddSymbolModal'
import { createBrowserSupabase } from '@/lib/supabase'

export default function Home() {
  const router = useRouter()
  const [symbols, setSymbols] = useState<Symbol[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [notifEnabled, setNotifEnabled] = useState(false)
  const [userEmail, setUserEmail] = useState('')

  useEffect(() => {
    loadSymbols()
    checkNotification()
    registerServiceWorker()
    loadUser()
  }, [])

  async function loadUser() {
    const supabase = createBrowserSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.email) setUserEmail(user.email)
  }

  async function loadSymbols() {
    setLoading(true)
    try {
      const res = await fetch('/api/symbols')
      const data = await res.json()
      setSymbols(data.symbols ?? [])
    } finally {
      setLoading(false)
    }
  }

  async function checkNotification() {
    if ('Notification' in window) {
      setNotifEnabled(Notification.permission === 'granted')
    }
  }

  async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try { await navigator.serviceWorker.register('/sw.js') } catch { /* ignore */ }
    }
  }

  async function requestNotification() {
    if (!('Notification' in window)) return
    const perm = await Notification.requestPermission()
    setNotifEnabled(perm === 'granted')
  }

  async function handleLogout() {
    const supabase = createBrowserSupabase()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  async function handleDelete(id: string) {
    await fetch(`/api/symbols?id=${id}`, { method: 'DELETE' })
    setSymbols(prev => prev.filter(s => s.id !== id))
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* Header */}
      <header style={{
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        padding: '0 24px',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <TrendingUp size={20} color="var(--accent-blue)" />
          <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.3px' }}>
            Oscillator App
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {userEmail && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'none' }}
              className="sm:inline">
              {userEmail}
            </span>
          )}
          <button
            onClick={notifEnabled ? undefined : requestNotification}
            title={notifEnabled ? '通知ON' : '通知を許可する'}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '6px 10px',
              color: notifEnabled ? 'var(--accent-green)' : 'var(--text-secondary)',
              cursor: notifEnabled ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
            }}
          >
            {notifEnabled ? <Bell size={14} /> : <BellOff size={14} />}
            {notifEnabled ? '通知ON' : '通知許可'}
          </button>
          <button
            onClick={() => setShowAdd(true)}
            style={{
              background: 'var(--accent-blue)',
              border: 'none',
              borderRadius: 6,
              padding: '6px 14px',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <Plus size={14} /> 銘柄追加
          </button>
          <button
            onClick={handleLogout}
            title="ログアウト"
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '6px 10px',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <LogOut size={14} />
          </button>
        </div>
      </header>

      {/* Main */}
      <main style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>監視銘柄一覧</h1>
          <button
            onClick={loadSymbols}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '6px 12px',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
            }}
          >
            <RefreshCw size={13} /> 更新
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 60 }}>
            読み込み中...
          </div>
        ) : symbols.length === 0 ? (
          <div style={{
            textAlign: 'center', color: 'var(--text-muted)', padding: 80,
            border: '1px dashed var(--border)', borderRadius: 12,
          }}>
            <TrendingUp size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
            <p style={{ margin: 0 }}>銘柄がまだ登録されていません</p>
            <p style={{ margin: '8px 0 0', fontSize: 13 }}>
              「銘柄追加」ボタンからティッカーを登録してください
            </p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 16,
          }}>
            {symbols.map(symbol => (
              <SymbolCard key={symbol.id} symbol={symbol} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </main>

      {showAdd && (
        <AddSymbolModal
          onClose={() => setShowAdd(false)}
          onAdded={(s) => { setSymbols(prev => [s, ...prev]); setShowAdd(false) }}
        />
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
