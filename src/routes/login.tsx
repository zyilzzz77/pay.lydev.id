import { useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Brand } from '../components/Brand'

export const Route = createFileRoute('/login')({ component: LoginPage })

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const result = await response.json()
      if (!response.ok) { setError(result.error ?? 'Gagal masuk.'); return }
      const next = new URLSearchParams(window.location.search).get('next')
      const destination = next?.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'
      window.location.assign(destination)
    } catch { setError('Koneksi bermasalah. Coba lagi.') }
    finally { setBusy(false) }
  }

  return <div className="login-page">
    <div className="login-art" aria-hidden="true"><div className="art-grain" /><div className="art-card art-card-back" /><div className="art-card art-card-front"><span>LYDEV / PAY</span><div className="art-circle" /><small>PRIVATE PAYMENT WORKSPACE</small></div><div className="art-caption">Payments,<br /><em>beautifully</em> in control.</div></div>
    <main className="login-main">
      <header className="login-top"><Brand to="/" /><span className="private-chip"><span className="private-dot" /> Private access</span></header>
      <div className="login-content"><div className="eyebrow">SECURE WORKSPACE <span className="eyebrow-line" /></div><h1>Selamat datang<br />kembali<span className="title-period">.</span></h1><p className="muted login-intro">Masuk untuk mengelola pembayaran, endpoint, dan project Anda dalam satu tempat.</p>
        <form onSubmit={submit} className="login-form"><label htmlFor="email">Alamat email</label><input id="email" type="email" autoComplete="username" placeholder="nama@lydev.id" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" placeholder="Masukkan password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="button button-primary login-button" disabled={busy}>{busy ? 'Memeriksa...' : 'Masuk ke workspace'}<span aria-hidden="true">↗</span></button>
        </form><p className="login-note"><span>◆</span> Akses terbatas untuk pemilik workspace LYDEV.</p>
      </div><footer className="login-footer"><span>© 2026 LYDEV PAY</span><span>PAYMENTS WITH PURPOSE</span></footer>
    </main>
  </div>
}
