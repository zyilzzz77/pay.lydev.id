import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../../server/db'

export const Route = createFileRoute('/api/pay/$orderId/qr')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const payment = await db.payment.findUnique({ where: { orderId: params.orderId } })
        if (!payment || !['PENDING', 'PAID'].includes(payment.status)) return new Response('Not found', { status: 404 })
        if (payment.status === 'PENDING' && payment.expiresAt !== null && payment.expiresAt.getTime() <= Date.now()) {
          return new Response('Not found', { status: 404 })
        }
        const qr = await db.paymentQrAsset.findUnique({ where: { paymentId: payment.id } })
        if (!qr) return new Response('QR belum tersedia', { status: 404 })
        return new Response(Uint8Array.from(qr.image), {
          headers: { 'Content-Type': qr.mimeType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
        })
      },
    },
  },
})
