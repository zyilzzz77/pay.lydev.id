import { createFileRoute } from '@tanstack/react-router'
import { requireOperator } from '../../../server/auth/session'
import { db } from '../../../server/db'
import { buildXlsx, type Cell } from '../../../server/reports/xlsx'

const dateTime = new Intl.DateTimeFormat('id-ID', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Jakarta' })

function slugStamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`
}

export const Route = createFileRoute('/api/admin/payments/export')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await requireOperator(request))) return new Response('Unauthorized', { status: 401 })
        const payments = await db.payment.findMany({
          orderBy: { createdAt: 'desc' },
          include: { project: { select: { name: true } } },
        })
        const rows: Cell[][] = [
          ['Order ID', 'Project', 'Deskripsi', 'Nominal Dasar', 'Fee', 'Total Dibayar', 'Status', 'Dibuat', 'Dibayar Pada'],
          ...payments.map((payment) => [
            payment.orderId,
            payment.project.name,
            payment.description ?? '',
            payment.amount,
            payment.fee ?? 0,
            payment.providerAmount ?? payment.amount,
            payment.status,
            dateTime.format(payment.createdAt),
            payment.paidAt ? dateTime.format(payment.paidAt) : '',
          ] as Cell[]),
        ]
        const file = buildXlsx('Transaksi', rows, [26, 16, 30, 14, 12, 14, 12, 18, 18])
        return new Response(new Uint8Array(file), {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="lydev-pay-transaksi-${slugStamp(new Date())}.xlsx"`,
            'Cache-Control': 'no-store',
          },
        })
      },
    },
  },
})
