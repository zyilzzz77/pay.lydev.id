import { createFileRoute } from '@tanstack/react-router'
import { requireOperator } from '../../../server/auth/session'
import { db } from '../../../server/db'
import { getEnv } from '../../../server/env'
import { paymentDto } from '../../../server/payments/service'
import { ensureWorker } from '../../../server/worker'

export const Route = createFileRoute('/api/admin/overview')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await requireOperator(request))) return new Response('Unauthorized', { status: 401 })
        ensureWorker()
        const [projects, payments, keys, total, paid, pending, paidTotals] = await Promise.all([
          db.project.findMany({ select: { id: true, name: true, slug: true, isActive: true, webhookUrl: true, createdAt: true }, orderBy: { createdAt: 'desc' } }),
          db.payment.findMany({ orderBy: { createdAt: 'desc' }, take: 50, include: { project: { select: { name: true } }, qrAsset: { select: { id: true } } } }),
          db.apiKey.findMany({ select: { id: true, projectId: true, prefix: true, label: true, isActive: true, createdAt: true }, orderBy: { createdAt: 'desc' } }),
          db.payment.count(), db.payment.count({ where: { status: 'PAID' } }), db.payment.count({ where: { status: 'PENDING' } }),
          db.payment.aggregate({ where: { status: 'PAID' }, _sum: { amount: true, fee: true, providerAmount: true } }),
        ])
        // Nilai yang dibayar pelanggan (bruto) dikurangi fee Sumopod = penerimaan bersih.
        const gross = paidTotals._sum.providerAmount ?? paidTotals._sum.amount ?? 0
        const fees = paidTotals._sum.fee ?? 0
        return Response.json({
          baseUrl: getEnv().APP_URL,
          minAmount: getEnv().MIN_PAYMENT_AMOUNT,
          projects,
          keys,
          payments: payments.map((payment) => ({ ...paymentDto(payment), projectName: payment.project.name, hasQr: Boolean(payment.qrAsset) })),
          metrics: { total, paid, pending, gross, fees, net: gross - fees },
        }, { headers: { 'Cache-Control': 'no-store' } })
      },
    },
  },
})
