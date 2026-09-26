import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { db } from '../db'
import { getEnv } from '../env'
import { canTransition } from '../payments/payment-state'
import { enqueueWebhookDelivery, paymentEventName } from '../webhooks/enqueue'
import { runDeliveriesNow } from '../worker'

const payloadSchema = z.object({
  event_type: z.enum(['payment.completed', 'payment.failed', 'payment.expired', 'payment.test']),
  data: z.object({
    payment_id: z.string().min(1),
    order_id: z.string().min(1),
    amount: z.number().int().positive(),
    status: z.string(),
    payment_method: z.string().optional(),
    paid_at: z.iso.datetime().optional(),
  }).optional(),
})

export function verifySumopodWebhook(raw: string, headers: Headers) {
  const id = headers.get('svix-id')
  const timestamp = headers.get('svix-timestamp')
  const signature = headers.get('svix-signature')
  const secret = getEnv().SUMOPOD_WEBHOOK_SECRET
  if (!id || !timestamp || !signature || !secret.startsWith('whsec_')) return null
  const seconds = Number(timestamp)
  if (!Number.isSafeInteger(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300) return null
  const key = Buffer.from(secret.slice(6), 'base64')
  if (key.length < 16) return null
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${raw}`).digest()
  const valid = signature.split(' ').some((part) => {
    if (!part.startsWith('v1,')) return false
    const received = Buffer.from(part.slice(3), 'base64')
    return received.length === expected.length && timingSafeEqual(received, expected)
  })
  return valid ? id : null
}

export async function handleSumopodWebhook(raw: string, headers: Headers) {
  const eventId = verifySumopodWebhook(raw, headers)
  if (!eventId) return { status: 401, body: { error: 'Invalid signature' } }
  let payload: unknown
  try { payload = JSON.parse(raw) }
  catch { return { status: 400, body: { error: 'Invalid JSON' } } }
  const parsed = payloadSchema.safeParse(payload)
  if (!parsed.success) return { status: 400, body: { error: 'Invalid payload' } }
  const event = parsed.data
  if (event.event_type === 'payment.test') return { status: 200, body: { ok: true } }
  if (!event.data) return { status: 400, body: { error: 'Missing payment data' } }
  const payment = await db.payment.findUnique({
    where: { orderId: event.data.order_id },
    include: { project: { select: { id: true, webhookUrl: true, webhookSecret: true } } },
  })
  if (!payment || payment.providerPaymentId !== event.data.payment_id || payment.amount !== event.data.amount) {
    return { status: 400, body: { error: 'Payment mismatch' } }
  }
  const newStatus = event.event_type === 'payment.completed' ? 'PAID'
    : event.event_type === 'payment.failed' ? 'FAILED' : 'EXPIRED'
  const expectedProviderStatus = newStatus === 'PAID' ? 'completed' : newStatus.toLowerCase()
  if (event.data.status !== expectedProviderStatus) return { status: 400, body: { error: 'Status mismatch' } }
  const shouldTransition = canTransition(payment.status, newStatus)
  const webhookEvent = shouldTransition ? paymentEventName(newStatus) : null
  const webhookProject = payment.project
  const paidAt = newStatus === 'PAID' ? new Date(event.data?.paid_at ?? Date.now()) : undefined
  const failedAt = newStatus === 'FAILED' ? new Date() : undefined
  let queuedDelivery = false
  try {
    await db.$transaction(async (tx) => {
      await tx.paymentEvent.create({ data: {
        paymentId: payment.id,
        source: 'PROVIDER_WEBHOOK',
        eventType: event.event_type,
        providerEventId: eventId,
        payloadHash: createHash('sha256').update(raw).digest('hex'),
      } })
      if (shouldTransition) {
        await tx.payment.updateMany({
          where: { id: payment.id, status: 'PENDING' },
          data: {
            status: newStatus,
            paymentMethod: event.data?.payment_method,
            paidAt,
            failedAt,
          },
        })
        if (webhookEvent) {
          queuedDelivery = await enqueueWebhookDelivery(tx, { ...payment, status: newStatus, paidAt: paidAt ?? payment.paidAt }, webhookProject, webhookEvent)
        }
      }
    })
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') return { status: 200, body: { ok: true, duplicate: true } }
    throw error
  }
  if (queuedDelivery) runDeliveriesNow()
  return { status: 200, body: { ok: true } }
}
