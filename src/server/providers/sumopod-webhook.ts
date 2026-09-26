import { createHash } from 'node:crypto'
import { z } from 'zod'
import { db } from '../db'
import { canTransition } from '../payments/payment-state'
import { enqueueWebhookDelivery, paymentEventName } from '../webhooks/enqueue'
import { runDeliveriesNow } from '../worker'
import { verifySumopodWebhook } from './sumopod-signature'

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

export async function handleSumopodWebhook(raw: string, headers: Headers) {
  const eventId = verifySumopodWebhook(raw, headers)
  if (!eventId) return { status: 401, body: { error: 'Invalid signature' } }
  let payload: unknown
  try { payload = JSON.parse(raw) }
  catch { return { status: 400, body: { error: 'Invalid JSON' } } }
  // Event uji dari halaman Settings bisa datang dengan data kosong; cukup dibalas 200.
  if (typeof payload === 'object' && payload !== null && (payload as { event_type?: unknown }).event_type === 'payment.test') {
    return { status: 200, body: { ok: true } }
  }
  const parsed = payloadSchema.safeParse(payload)
  if (!parsed.success) return { status: 400, body: { error: 'Invalid payload' } }
  const event = parsed.data
  if (!event.data) return { status: 400, body: { error: 'Missing payment data' } }
  const payment = await db.payment.findUnique({
    where: { orderId: event.data.order_id },
    include: { project: { select: { id: true, webhookUrl: true, webhookSecret: true } } },
  })
  if (!payment) return { status: 404, body: { error: 'Payment not found' } }
  // Di production provider mengirim nominal gross (nominal dasar + fee), sedangkan
  // kolom amount menyimpan nominal dasar. Terima keduanya agar webhook sah tidak ditolak.
  const knownAmounts = [payment.amount, payment.providerAmount].filter((value): value is number => typeof value === 'number')
  if (payment.providerPaymentId && payment.providerPaymentId !== event.data.payment_id) {
    return { status: 400, body: { error: 'Payment mismatch' } }
  }
  if (!knownAmounts.includes(event.data.amount)) return { status: 400, body: { error: 'Amount mismatch' } }
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
