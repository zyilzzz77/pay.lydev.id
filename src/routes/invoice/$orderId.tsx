import { useEffect, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { PaymentLayout, PaymentTop, rupiah, totalAmount, type PaymentInfo } from '../../components/PaymentLayout'

export const Route = createFileRoute('/invoice/$orderId')({ component: InvoicePage })

function InvoicePage() {
  const { orderId } = Route.useParams()
  const [payment, setPayment] = useState<PaymentInfo | null>(null)
  useEffect(() => { fetch(`/api/v1/payments/${encodeURIComponent(orderId)}`).then((response) => response.ok ? response.json() : null).then(setPayment) }, [orderId])
  return <PaymentLayout><PaymentTop eyebrow="DOCUMENT / INVOICE" title="Invoice" subtitle="Ringkasan transaksi untuk pembayaran Anda." /><div className="document-card">{payment ? <><div className="document-head"><span>LYDEV PAY</span><span>INVOICE</span></div><div className="document-grid"><div><span className="field-label">NOMOR ORDER</span><strong className="mono">{payment.orderId}</strong></div><div><span className="field-label">TANGGAL DIBUAT</span><strong>{new Date(payment.createdAt).toLocaleString('id-ID')}</strong></div><div><span className="field-label">STATUS</span><strong>{payment.status}</strong></div><div><span className="field-label">REFERENSI</span><strong>{payment.externalReference || '—'}</strong></div></div><div className="document-item"><span>{payment.description || 'Pembayaran QRIS'}</span><strong>{rupiah(payment.amount)}</strong></div>{payment.fee ? <div className="document-item"><span>Biaya layanan</span><strong>{rupiah(payment.fee)}</strong></div> : null}<div className="document-total"><span>TOTAL</span><strong>{rupiah(totalAmount(payment))}</strong></div><p className="document-note">Invoice ini merupakan ringkasan transaksi. Status lunas hanya berlaku setelah konfirmasi provider diterima.</p><Link to="/pay/$orderId" params={{ orderId }} className="button button-primary">Kembali ke checkout ↗</Link></> : <p>Memuat invoice...</p>}</div></PaymentLayout>
}
