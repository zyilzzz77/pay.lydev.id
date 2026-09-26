import { useEffect, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { PaymentLayout, PaymentTop, rupiah, totalAmount, type PaymentInfo } from '../../components/PaymentLayout'

export const Route = createFileRoute('/pay/$orderId')({ component: CheckoutPage })

function CheckoutPage() {
  const { orderId } = Route.useParams()
  const [payment, setPayment] = useState<PaymentInfo | null>(null)
  const [error, setError] = useState('')
  const [qrAvailable, setQrAvailable] = useState(true)
  const [qrVersion, setQrVersion] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [retrying, setRetrying] = useState(false)
  const [checking, setChecking] = useState(false)
  const [checkMessage, setCheckMessage] = useState('')

  async function loadStatus() {
    const response = await fetch(`/api/v1/payments/${encodeURIComponent(orderId)}/status`)
    if (response.status === 401) { window.location.assign('/login'); return null }
    if (!response.ok) throw new Error('Payment tidak ditemukan.')
    return await response.json() as PaymentInfo
  }

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const result = await loadStatus()
        if (active && result) setPayment(result)
      } catch (cause) { if (active) setError((cause as Error).message) }
    }
    load()
    const timer = window.setInterval(load, 5000)
    return () => { active = false; clearInterval(timer) }
  }, [orderId])

  useEffect(() => {
    if (!payment?.expiresAt) return
    const update = () => setSeconds(Math.max(0, Math.ceil((new Date(payment.expiresAt!).getTime() - Date.now()) / 1000)))
    update()
    const timer = window.setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [payment?.expiresAt])

  async function retryQr() {
    setRetrying(true); setError('')
    try {
      const response = await fetch(`/api/admin/payments/${encodeURIComponent(orderId)}/refresh-qr`, { method: 'POST' })
      if (!response.ok) throw new Error((await response.json()).error ?? 'QR belum tersedia.')
      setQrAvailable(true); setQrVersion((version) => version + 1)
    } catch (cause) { setError((cause as Error).message) } finally { setRetrying(false) }
  }

  async function checkNow() {
    setChecking(true); setCheckMessage('')
    try {
      const result = await loadStatus()
      if (!result) return
      setPayment(result)
      setCheckMessage(result.status === 'PAID'
        ? 'Pembayaran sudah diterima. Terima kasih!'
        : result.status === 'PENDING'
          ? 'Belum ada pembayaran masuk. Status masih menunggu.'
          : `Status pembayaran: ${result.status}.`)
    } catch (cause) { setCheckMessage((cause as Error).message) } finally { setChecking(false) }
  }

  const time = `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  const paid = payment?.status === 'PAID'
  const terminal = payment && ['PAID', 'FAILED', 'EXPIRED', 'CANCELLED', 'REFUNDED'].includes(payment.status)

  return <PaymentLayout><PaymentTop eyebrow="PAYMENT CHECKOUT" title={paid ? 'Pembayaran berhasil' : 'Selesaikan pembayaran'} subtitle={paid ? 'Transaksi Anda telah dikonfirmasi oleh provider.' : 'Scan QRIS di bawah menggunakan aplikasi pembayaran pilihan Anda.'} />
    {error ? <div className="checkout-error" role="alert">{error}</div> : null}
    {!payment ? <div className="checkout-card loading-card">Menyiapkan detail pembayaran...</div> : <div className="checkout-card"><div className="order-summary"><div><span className="field-label">ORDER ID</span><strong className="mono">{payment.orderId}</strong></div><span className={`status-badge status-${payment.status.toLowerCase()}`}>{paid ? 'Berhasil' : terminal ? payment.status : 'Menunggu pembayaran'}</span></div><div className="amount-section"><span className="field-label">TOTAL PEMBAYARAN</span><strong>{rupiah(totalAmount(payment))}</strong><p>{payment.description || 'Pembayaran QRIS'}</p>{payment.fee ? <p className="muted">Termasuk biaya layanan {rupiah(payment.fee)} · Nominal dasar {rupiah(payment.amount)}</p> : null}</div>
      {paid ? <div className="success-area"><div className="success-mark">✓</div><h2>Pembayaran diterima</h2><p>Status ini berasal dari webhook Sumopod yang telah diverifikasi.</p><Link to="/receipt/$orderId" params={{ orderId }} className="button button-primary">Lihat tanda terima ↗</Link></div>
      : terminal ? <div className="success-area"><div className="terminal-mark">!</div><h2>Transaksi {payment.status.toLowerCase()}</h2><p>Silakan buat payment baru jika masih ingin mencoba pembayaran.</p><Link to="/dashboard" className="button button-primary">Kembali ke dashboard ↗</Link></div>
      : <><div className="qr-area"><div className="qr-corners"><div className="qr-box">{qrAvailable ? <img key={qrVersion} src={`/api/v1/payments/${encodeURIComponent(orderId)}/qr?v=${qrVersion}`} alt="Kode QRIS untuk pembayaran ini" onError={() => setQrAvailable(false)} /> : <div className="qr-missing"><span>◇</span><strong>QR belum tersedia</strong><p>Provider mungkin merender QR lewat JavaScript.</p><button className="button button-outline" onClick={retryQr} disabled={retrying}>{retrying ? 'Mencoba...' : 'Coba ambil ulang'}</button></div>}</div></div><div className="qris-label">QRIS <span>·</span> SCAN TO PAY</div><p>Buka aplikasi bank atau e-wallet, lalu scan kode QR di atas.</p></div><div className="countdown-row"><span className="pulse-dot" /> Menunggu pembayaran <span className="countdown-time">Sisa waktu <strong>{time}</strong></span></div><div className="check-row"><button className="button button-outline" type="button" onClick={checkNow} disabled={checking}>{checking ? 'Memeriksa...' : 'Cek pembayaran'}</button>{checkMessage ? <p className="muted" role="status">{checkMessage}</p> : null}</div></>}
      <div className="checkout-actions"><Link to="/invoice/$orderId" params={{ orderId }}>Lihat invoice <span>↗</span></Link><span>Pembayaran diproses aman oleh Sumopod</span></div>
    </div>}
  </PaymentLayout>
}
