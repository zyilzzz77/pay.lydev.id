import { createFileRoute } from '@tanstack/react-router'
import { authenticateProject } from '../../../server/auth/api-key'
import { allowPaymentCreate } from '../../../server/auth/rate-limit'
import { createPayment, PaymentError } from '../../../server/payments/service'
import { parsePaymentInput, PaymentInputError } from '../../../server/payments/validation'
import { ensureWorker } from '../../../server/worker'

export const Route = createFileRoute('/api/v1/payments')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        ensureWorker()
        const project = await authenticateProject(request)
        if (!project) return Response.json({ error: 'Invalid project API key' }, { status: 401 })
        const limit = allowPaymentCreate(project.id)
        if (!limit.allowed) return Response.json({ error: 'Terlalu banyak payment dibuat. Coba lagi sebentar.' }, {
          status: 429,
          headers: { 'Retry-After': String(limit.retryAfter) },
        })
        try {
          const input = parsePaymentInput(await request.json())
          const key = request.headers.get('idempotency-key') ?? ''
          const payment = await createPayment(project.id, input, key)
          return Response.json(payment, { status: 201, headers: { 'Cache-Control': 'no-store' } })
        } catch (error) {
          if (error instanceof PaymentError) return Response.json({ error: error.message }, { status: error.status })
          if (error instanceof PaymentInputError) return Response.json({ error: error.message }, { status: 400 })
          if (error instanceof SyntaxError || (error && typeof error === 'object' && 'issues' in error)) return Response.json({ error: 'Request tidak valid.' }, { status: 400 })
          console.error('payment.create failed', error)
          return Response.json({ error: 'Gagal membuat pembayaran.' }, { status: 503 })
        }
      },
    },
  },
})
