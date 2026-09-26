import { createFileRoute } from '@tanstack/react-router'
import { getAccessiblePayment } from '../../../../server/auth/payment-access'
import { db } from '../../../../server/db'

export const Route = createFileRoute('/api/v1/payments/$orderId/qr')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const payment = await getAccessiblePayment(request, params.orderId)
        if (!payment || payment.status !== 'PENDING') return new Response('Not found', { status: 404 })
        const qr = await db.paymentQrAsset.findUnique({ where: { paymentId: payment.id } })
        if (!qr || (qr.expiresAt && qr.expiresAt < new Date())) return new Response('QR belum tersedia', { status: 404 })
        return new Response(Uint8Array.from(qr.image), {
          headers: { 'Content-Type': qr.mimeType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
        })
      },
    },
  },
})
