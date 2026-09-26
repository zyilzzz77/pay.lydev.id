import { createFileRoute } from '@tanstack/react-router'
import { getAccessiblePayment } from '../../../../server/auth/payment-access'
import { expirePaymentIfStale } from '../../../../server/payments/expiry'
import { paymentDto } from '../../../../server/payments/service'
import { ensureWorker } from '../../../../server/worker'

export const Route = createFileRoute('/api/v1/payments/$orderId/status')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const payment = await getAccessiblePayment(request, params.orderId)
        if (!payment) return Response.json({ error: 'Not found' }, { status: 404 })
        ensureWorker()
        const fresh = await expirePaymentIfStale(params.orderId)
        return Response.json(paymentDto(fresh ?? payment), { headers: { 'Cache-Control': 'no-store' } })
      },
    },
  },
})
