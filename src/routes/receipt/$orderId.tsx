import { useEffect, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { PaymentLayout, PaymentTop, rupiah, totalAmount, type PaymentInfo } from '../../components/PaymentLayout'

export const Route = createFileRoute('/receipt/$orderId')({ component: ReceiptPage })

function ReceiptPage() {
  const { orderId } = Route.useParams()
  const [payment, setPayment] = useState<PaymentInfo | null>(null)
  useEffect(() => { fetch(`/api/v1/payments/${encodeURIComponent(orderId)}`).then((response) => response.ok ? response.json() : null).then(setPayment) }, [orderId])
  return <PaymentLayout><PaymentTop eyebrow="DOCUMENT / RECEIPT" title="Tanda terima" subtitle="Bukti pembayaran yang telah terkonfirmasi." /><div className="document-card">{!payment ? <p>Memuat tanda terima...</p> : payment.status !== 'PAID' ? <div className="receipt-pending"><div className="terminal-mark">!</div><h2>Belum tersedia</h2><p>Tanda terima muncul setelah pembayaran dikonfirmasi.</p><Link to="/pay/$orderId" params={{ orderId }} className="button button-primary">Lihat status ↗</Link></div> : <><div className="document-head"><span>LYDEV PAY</span><span>PAYMENT RECEIPT</span></div><div className="receipt-success">✓ <span>PEMBAYARAN BERHASIL</span></div><div className="document-grid"><div><span className="field-label">NOMOR ORDER</span><strong className="mono">{payment.orderId}</strong></div><div><span className="field-label">DIBAYAR PADA</span><strong>{payment.paidAt ? new Date(payment.paidAt).toLocaleString('id-ID') : '—'}</strong></div><div><span className="field-label">METODE</span><strong>QRIS</strong></div><div><span className="field-label">REFERENSI</span><strong>{payment.externalReference || '—'}</strong></div></div><div className="document-item"><span>{payment.description || 'Pembayaran QRIS'}</span><strong>{rupiah(payment.amount)}</strong></div>{payment.fee ? <div className="document-item"><span>Biaya layanan</span><strong>{rupiah(payment.fee)}</strong></div> : null}<div className="document-total"><span>TOTAL DIBAYAR</span><strong>{rupiah(totalAmount(payment))}</strong></div><button className="button button-outline" onClick={() => window.print()}>Cetak tanda terima ↗</button></>}</div></PaymentLayout>
}
