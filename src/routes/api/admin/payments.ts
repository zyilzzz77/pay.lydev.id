import { randomUUID } from 'node:crypto'
import { createFileRoute } from '@tanstack/react-router'
import { requireOperator, sameOrigin } from '../../../server/auth/session'
import { db } from '../../../server/db'
import { createPayment, PaymentError } from '../../../server/payments/service'
import { parsePaymentInput, PaymentInputError } from '../../../server/payments/validation'

export const Route = createFileRoute('/api/admin/payments')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await requireOperator(request))) return new Response('Unauthorized', { status: 401 })
        if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 })
        try {
          const body = await request.json()
          const projectId = String(body.projectId ?? '')
          const project = await db.project.findUnique({ where: { id: projectId } })
          if (!project || !project.isActive) return Response.json({ error: 'Project tidak ditemukan.' }, { status: 404 })
          const input = parsePaymentInput(body)
          const payment = await createPayment(projectId, input, randomUUID())
          return Response.json(payment, { status: 201 })
        } catch (error) {
          if (error instanceof PaymentError) return Response.json({ error: error.message }, { status: error.status })
          if (error instanceof PaymentInputError) return Response.json({ error: error.message }, { status: 400 })
          if (error instanceof SyntaxError || (error && typeof error === 'object' && 'issues' in error)) return Response.json({ error: 'Input pembayaran tidak valid.' }, { status: 400 })
          console.error('admin.payment.create failed', error)
          return Response.json({ error: 'Gagal membuat pembayaran. Periksa konfigurasi Sumopod.' }, { status: 503 })
        }
      },
    },
  },
})
