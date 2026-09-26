import { createFileRoute } from '@tanstack/react-router'
import { requireOperator, sameOrigin } from '../../../../server/auth/session'
import { db } from '../../../../server/db'
import { extractQr } from '../../../../server/qr/extract'

export const Route = createFileRoute('/api/admin/payments/$orderId/refresh-qr')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!(await requireOperator(request))) return new Response('Unauthorized', { status: 401 })
        if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 })
        const payment = await db.payment.findUnique({ where: { orderId: params.orderId } })
        if (!payment || payment.status !== 'PENDING' || !payment.providerPaymentUrl) return new Response('Not found', { status: 404 })
        try {
          const qr = await extractQr(payment.providerPaymentUrl)
          await db.paymentQrAsset.upsert({
            where: { paymentId: payment.id },
            update: { mimeType: qr.mimeType, image: Uint8Array.from(qr.image), checksum: qr.checksum, fetchedAt: new Date(), expiresAt: payment.expiresAt },
            create: { paymentId: payment.id, mimeType: qr.mimeType, image: Uint8Array.from(qr.image), checksum: qr.checksum, expiresAt: payment.expiresAt },
          })
          return Response.json({ ok: true })
        } catch (error) {
          console.error('QR refresh failed', { orderId: payment.orderId, message: error instanceof Error ? error.message : 'unknown' })
          return Response.json({ error: 'QR belum dapat dibaca dari halaman Sumopod.' }, { status: 502 })
        }
      },
    },
  },
})
