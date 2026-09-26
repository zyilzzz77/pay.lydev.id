import { useCallback, useEffect, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { PaymentLayout, PaymentTop, rupiah, totalAmount, type PaymentInfo } from '../../components/PaymentLayout'

export const Route = createFileRoute('/pay/$orderId')({ component: CheckoutPage })

const POLL_INTERVAL_MS = 5000
const TERMINAL_STATUSES = ['PAID', 'FAILED', 'EXPIRED', 'CANCELLED', 'REFUNDED']

function CheckoutPage() {
  const { orderId } = Route.useParams()
  const [payment, setPayment] = useState<PaymentInfo | null>(null)
  const [error, setError] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [qrAvailable, setQrAvailable] = useState(true)
  const [qrVersion, setQrVersion] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [checking, setChecking] = useState(false)
  const [checkMessage, setCheckMessage] = useState('')
  const notFoundRef = useRef(false)

  const qrUrl = `/api/pay/${encodeURIComponent(orderId)}/qr?v=${qrVersion}`

  const loadStatus = useCallback(async (signal?: AbortSignal) => {
    let response: Response
    try {
      response = await fetch(`/api/pay/${encodeURIComponent(orderId)}`, { signal })
    } catch (cause) {
      if ((cause as Error).name === 'AbortError') throw cause
      throw new Error('Gagal menghubungi server. Periksa koneksi Anda lalu coba lagi.')
    }
    if (response.status === 404) {
      notFoundRef.current = true
      setNotFound(true)
      throw new Error('Link pembayaran tidak berlaku')
    }
    if (!response.ok) throw new Error('Gagal memuat status pembayaran.')
    return await response.json() as PaymentInfo
  }, [orderId])

  useEffect(() => {
    if (notFoundRef.current) return
    const controller = new AbortController()
    let active = true
    let timer: number | undefined

    function stop() {
      active = false
      controller.abort()
      if (timer !== undefined) window.clearInterval(timer)
    }

    async function load(initial: boolean) {
      try {
        const result = await loadStatus(controller.signal)
        if (!active || !result) return
        setPayment(result)
        setError('')
        if (TERMINAL_STATUSES.includes(result.status)) stop()
      } catch (cause) {
        if (!active || notFoundRef.current) return
        if ((cause as Error).name === 'AbortError') return
        // Kegagalan sesaat saat polling latar (mis. tab di-background) tidak perlu
        // menampilkan error: state terakhir tetap ditampilkan sampai polling sukses lagi.
        if (!initial) return
        setError((cause as Error).message)
      }
    }

    void load(true)
    timer = window.setInterval(() => void load(false), POLL_INTERVAL_MS)
    return stop
  }, [loadStatus])

  useEffect(() => {
    if (!payment?.expiresAt) return
    const update = () => setSeconds(Math.max(0, Math.ceil((new Date(payment.expiresAt!).getTime() - Date.now()) / 1000)))
    update()
    const timer = window.setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [payment?.expiresAt])

  async function checkNow() {
    setChecking(true); setCheckMessage('')
    try {
      const result = await loadStatus()
      setPayment(result)
      setError('')
      setCheckMessage(result.status === 'PAID'
        ? 'Pembayaran sudah diterima. Terima kasih!'
        : result.status === 'PENDING'
          ? 'Belum ada pembayaran masuk. Status masih menunggu.'
          : `Status pembayaran: ${result.status}.`)
    } catch (cause) { setCheckMessage((cause as Error).message) } finally { setChecking(false) }
  }

  const time = `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  const paid = payment?.status === 'PAID'
  const terminal = payment ? TERMINAL_STATUSES.includes(payment.status) : false

  return <PaymentLayout showDashboardLink={false}><PaymentTop eyebrow="PAYMENT CHECKOUT" title={paid ? 'Pembayaran berhasil' : 'Selesaikan pembayaran'} subtitle={paid ? 'Transaksi Anda telah dikonfirmasi oleh provider.' : 'Scan QRIS di bawah menggunakan aplikasi pembayaran pilihan Anda.'} />
    {error && !notFound ? <div className="checkout-error" role="alert">{error}</div> : null}
    {notFound ? <div className="checkout-card"><div className="success-area"><div className="terminal-mark">!</div><h2>Link tidak berlaku</h2><p>Link pembayaran ini tidak ditemukan atau sudah melewati batas 24 jam. Minta penjual membuat payment baru.</p></div></div>
    : !payment ? <div className="checkout-card loading-card">Menyiapkan detail pembayaran...</div> : <div className="checkout-card"><div className="order-summary"><div><span className="field-label">ORDER ID</span><strong className="mono">{payment.orderId}</strong></div><span className={`status-badge status-${payment.status.toLowerCase()}`}>{paid ? 'Berhasil' : terminal ? payment.status : 'Menunggu pembayaran'}</span></div><div className="amount-section"><span className="field-label">TOTAL PEMBAYARAN</span><strong>{rupiah(totalAmount(payment))}</strong><p>{payment.description || 'Pembayaran QRIS'}</p>{payment.fee ? <p className="muted">Termasuk biaya layanan {rupiah(payment.fee)} · Nominal dasar {rupiah(payment.amount)}</p> : null}</div>
      {paid ? <div className="success-area"><div className="success-mark">✓</div><h2>Pembayaran diterima</h2><p>Status ini berasal dari webhook Sumopod yang telah diverifikasi.</p></div>
      : terminal ? <div className="success-area"><div className="terminal-mark">!</div><h2>Transaksi {payment.status.toLowerCase()}</h2><p>Silakan minta penjual membuat payment baru jika masih ingin membayar.</p></div>
      : <><div className="qr-area"><div className="qr-corners"><div className="qr-box">{qrAvailable ? <img key={qrVersion} src={qrUrl} alt="Kode QRIS untuk pembayaran ini" onError={() => setQrAvailable(false)} /> : <div className="qr-missing"><span>◇</span><strong>QR belum tersedia</strong><p>Minta penjual membuka dashboard untuk mengambil ulang QR.</p></div>}</div></div><div className="qris-label">QRIS <span>·</span> SCAN TO PAY</div><p>Buka aplikasi bank atau e-wallet, lalu scan kode QR di atas.</p></div><div className="check-row">{qrAvailable ? <a className="button button-outline" href={qrUrl} download={`${orderId}.png`}>Simpan gambar QR (.png)</a> : null}<button className="button button-outline" type="button" onClick={checkNow} disabled={checking}>{checking ? 'Memeriksa...' : 'Cek pembayaran'}</button>{checkMessage ? <p className="muted" role="status">{checkMessage}</p> : null}</div><div className="pay-steps"><div className="eyebrow">CARA PEMBAYARAN</div><ol><li><span><strong>Buka aplikasi</strong> e-wallet Anda (GoPay, OVO, DANA, ShopeePay, LinkAja) atau m-banking (BCA mobile, Livin', BRImo, dan lainnya).</span></li><li><span>Pilih menu <strong>QRIS</strong>, <strong>Bayar</strong>, atau <strong>Scan QR</strong>.</span></li><li><span>Arahkan kamera ke <strong>kode QR di atas</strong> sampai terbaca.</span></li><li><span><strong>Periksa nominal {rupiah(totalAmount(payment))}</strong> dan nama merchant sebelum melanjutkan. Kode QR ini hanya berlaku untuk transaksi ini.</span></li><li><span>Masukkan PIN atau konfirmasi pembayaran di aplikasi Anda.</span></li><li><span>Simpan bukti pembayaran. Status di halaman ini berubah otomatis begitu pembayaran terverifikasi.</span></li></ol></div><div className="countdown-row"><span className="pulse-dot" /> Menunggu pembayaran <span className="countdown-time">Sisa waktu <strong>{time}</strong></span></div></>}
      <div className="checkout-actions"><span>Pembayaran diperiksa otomatis setiap 5 detik</span><span>Pembayaran diproses aman oleh Sumopod</span></div>
    </div>}
  </PaymentLayout>
}
