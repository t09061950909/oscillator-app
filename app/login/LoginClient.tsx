'use client'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { TrendingUp, Mail, Lock, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react'
import { createBrowserSupabase } from '@/lib/supabase'

type Mode = 'login' | 'signup' | 'reset'

export default function LoginClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (searchParams.get('error') === 'auth_callback_failed') {
      setError('認証に失敗しました。もう一度お試しください。')
    }
  }, [searchParams])

  async function handleSubmit() {
    if (!email) { setError('メールアドレスを入力してください'); return }
    if (mode !== 'reset' && !password) { setError('パスワードを入力してください'); return }

    setLoading(true)
    setError('')
    setSuccess('')
    const supabase = createBrowserSupabase()

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.push('/')
        router.refresh()
      } else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${location.origin}/auth/callback` },
        })
        if (error) throw error
        setSuccess('確認メールを送信しました。メールのリンクをクリックしてください。')
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${location.origin}/auth/callback`,
        })
        if (error) throw error
        setSuccess('パスワードリセットメールを送信しました。')
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'エラーが発生しました'
      if (msg.includes('Invalid login credentials')) setError('メールアドレスまたはパスワードが正しくありません')
      else if (msg.includes('Email not confirmed')) setError('メールアドレスが未確認です。確認メールをご確認ください')
      else if (msg.includes('User already registered')) setError('このメールアドレスは既に登録されています')
      else if (msg.includes('Password should be')) setError('パスワードは6文字以上で入力してください')
      else setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const modeLabel = { login: 'ログイン', signup: '新規登録', reset: 'パスワードリセット' }[mode]

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-primary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 52, height: 52, background: 'var(--bg-card)',
            border: '1px solid var(--border)', borderRadius: 14, marginBottom: 14,
          }}>
            <TrendingUp size={26} color="var(--accent-blue)" />
          </div>
          <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.5px' }}>Oscillator App</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
            投資タイミングを知らせるオシレータアプリ
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 14, padding: 28,
        }}>
          <h2 style={{ margin: '0 0 22px', fontSize: 17, fontWeight: 700 }}>{modeLabel}</h2>

          {/* Email */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              メールアドレス
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                style={{
                  width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                  borderRadius: 7, padding: '9px 12px 9px 34px', color: 'var(--text-primary)',
                  fontSize: 14, outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Password */}
          {mode !== 'reset' && (
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                パスワード
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type={showPw ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? '6文字以上' : '••••••••'}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  style={{
                    width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                    borderRadius: 7, padding: '9px 36px 9px 34px', color: 'var(--text-primary)',
                    fontSize: 14, outline: 'none', boxSizing: 'border-box',
                  }}
                />
                <button onClick={() => setShowPw(p => !p)} style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
                  display: 'flex', alignItems: 'center',
                }}>
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              color: 'var(--accent-red)', fontSize: 13, marginBottom: 16,
              background: 'rgba(248,81,73,0.1)', borderRadius: 7, padding: '10px 12px',
            }}>
              <AlertCircle size={14} style={{ marginTop: 1, flexShrink: 0 }} />{error}
            </div>
          )}
          {success && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              color: 'var(--accent-green)', fontSize: 13, marginBottom: 16,
              background: 'rgba(63,185,80,0.1)', borderRadius: 7, padding: '10px 12px',
            }}>
              <CheckCircle size={14} style={{ marginTop: 1, flexShrink: 0 }} />{success}
            </div>
          )}

          <button
            onClick={handleSubmit} disabled={loading}
            style={{
              width: '100%', background: loading ? 'var(--bg-hover)' : 'var(--accent-blue)',
              border: 'none', borderRadius: 7, padding: '10px 0',
              color: loading ? 'var(--text-muted)' : '#fff',
              fontWeight: 700, fontSize: 14, cursor: loading ? 'wait' : 'pointer',
            }}
          >
            {loading ? '処理中...' : modeLabel}
          </button>

          <div style={{
            marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--border-subtle)',
            display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center',
          }}>
            {mode === 'login' && (<>
              <button onClick={() => { setMode('signup'); setError(''); setSuccess('') }} style={linkStyle}>アカウントを作成する</button>
              <button onClick={() => { setMode('reset'); setError(''); setSuccess('') }} style={linkStyle}>パスワードを忘れた方</button>
            </>)}
            {(mode === 'signup' || mode === 'reset') && (
              <button onClick={() => { setMode('login'); setError(''); setSuccess('') }} style={linkStyle}>ログイン画面に戻る</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const linkStyle: React.CSSProperties = {
  background: 'none', border: 'none',
  color: 'var(--accent-blue)', cursor: 'pointer',
  fontSize: 13, textDecoration: 'underline',
}
