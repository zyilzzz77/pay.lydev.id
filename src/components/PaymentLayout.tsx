import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Brand } from './Brand'

export type PaymentInfo = {
  orderId: string; status: string; amount: number; currency: string;
  fee: number | null; providerAmount: number | null;
  description: string | null; externalReference: string | null;
  expiresAt: string | null; paidAt: string | null; createdAt: string;
  checkoutUrl: string; qrUrl: string;
}

export function rupiah(amount: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount)
}

export function totalAmount(payment: PaymentInfo) {
  return payment.providerAmount ?? payment.amount
}

export function PaymentLayout({ children, showDashboardLink = true }: { children: ReactNode; showDashboardLink?: boolean }) {
  return <div className="checkout-shell"><header className="checkout-header"><Brand /><span className="checkout-secure"><span>✧</span> Secure payment</span></header><main className="checkout-main">{children}</main><footer className="checkout-footer"><span>© 2026 LYDEV PAY</span><span>PRIVATE & SECURE CHECKOUT</span>{showDashboardLink ? <Link to="/dashboard">Kembali ke dashboard ↗</Link> : <span>Butuh bantuan? Hubungi penjual</span>}</footer></div>
}

export function PaymentTop({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return <div className="checkout-title"><div className="eyebrow">{eyebrow} <span className="eyebrow-line" /></div><h1>{title}<span className="title-period">.</span></h1><p className="muted">{subtitle}</p></div>
}
