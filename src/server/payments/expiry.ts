import type { Prisma } from '../../generated/prisma/client'
import { db } from '../db'
import { canTransition } from './payment-state'
import { processDueDeliveries } from '../webhooks/dispatcher'
import { enqueueWebhookDelivery, paymentEventName } from '../webhooks/enqueue'

const PROJECT_SELECT = { id: true, webhookUrl: true, webhookSecret: true } as const

type PaymentWithProject = Prisma.PaymentGetPayload<{ include: { project: { select: typeof PROJECT_SELECT } } }>

async function expireOne(payment: PaymentWithProject) {
  if (!canTransition(payment.status, 'EXPIRED')) return false
  const event = paymentEventName('EXPIRED')
  if (!event) return false
  const snapshot = { ...payment, status: 'EXPIRED' }
  let queued = false
  await db.$transaction(async (tx) => {
    await tx.paymentEvent.create({ data: { paymentId: payment.id, source: 'SYSTEM', eventType: 'payment.expired' } })
    await tx.payment.updateMany({ where: { id: payment.id, status: 'PENDING' }, data: { status: 'EXPIRED', failedAt: new Date() } })
    queued = await enqueueWebhookDelivery(tx, snapshot, payment.project, event)
  })
  if (queued) void processDueDeliveries().catch((error) => console.error('webhook dispatcher failed', error))
  return true
}

export async function expirePaymentIfStale(orderId: string) {
  const payment = await db.payment.findUnique({ where: { orderId }, include: { project: { select: PROJECT_SELECT } } })
  if (!payment) return null
  if (payment.status !== 'PENDING' || !payment.expiresAt || payment.expiresAt.getTime() > Date.now()) return payment
  await expireOne(payment)
  return { ...payment, status: 'EXPIRED' as const }
}

export async function expireStalePayments(limit = 50) {
  const stale = await db.payment.findMany({
    where: { status: 'PENDING', expiresAt: { lt: new Date() } },
    include: { project: { select: PROJECT_SELECT } },
    take: limit,
  })
  for (const payment of stale) await expireOne(payment)
}
