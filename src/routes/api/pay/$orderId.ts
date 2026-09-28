import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../../server/db'

export const Route = createFileRoute('/api/pay/$orderId')({
  server: {
    handlers: {
      // Akses publik tanpa kredensial: orderId (ULID) berfungsi sebagai tautan kapabilitas,
      // sama seperti tautan pembayaran milik provider. Hanya berisi data yang dibutuhkan pembayar.
      GET: async ({ params }) => {
        const payment = await db.payment.findUnique({
          where: { orderId: params.orderId },
          include: { qrAsset: { select: { id: true } } },
        })
        if (!payment) return Response.json({ error: 'Not found' }, { status: 404 })
        // Tautan yang sudah kedaluwarsa (lewat 24 jam tanpa pembayaran) tidak lagi berlaku.
        const stale = payment.status === 'EXPIRED'
          || (payment.status === 'PENDING' && payment.expiresAt !== null && payment.expiresAt.getTime() <= Date.now())
        if (stale) return Response.json({ error: 'Not found' }, { status: 404 })
        return Response.json({
          orderId: payment.orderId,
          status: payment.status,
          currency: payment.currency,
          amount: payment.amount,
          fee: payment.fee ?? null,
          providerAmount: payment.providerAmount ?? null,
          description: payment.description ?? null,
          // Endpoint publik tanpa kredensial: jangan bocorkan referensi order internal.
          externalReference: null,
          expiresAt: payment.expiresAt?.toISOString() ?? null,
          paidAt: payment.paidAt?.toISOString() ?? null,
          createdAt: payment.createdAt.toISOString(),
          checkoutUrl: `/pay/${payment.orderId}`,
          qrUrl: `/api/pay/${payment.orderId}/qr`,
          hasQr: Boolean(payment.qrAsset),
        }, { headers: { 'Cache-Control': 'no-store' } })
      },
    },
  },
})
