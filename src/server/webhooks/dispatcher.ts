import { db } from '../db'
import { buildWebhookHeaders } from './signature'

const MAX_ATTEMPTS = 5
const BACKOFF_SECONDS = [30, 120, 600, 3600, 21600]
const REQUEST_TIMEOUT_MS = 10_000
const DELIVERY_BATCH = 20

type DueDelivery = {
  id: string
  paymentId: string
  eventType: string
  url: string
  payload: unknown
  attempts: number
  project: { webhookSecret: string | null }
}

async function failPermanently(delivery: DueDelivery, attempts: number, info: { statusCode: number | null; error: string }) {
  await db.webhookDelivery.update({
    where: { id: delivery.id },
    data: { status: 'FAILED', attempts, nextAttemptAt: new Date(), lastStatusCode: info.statusCode, lastError: info.error },
  })
  await db.paymentEvent.create({ data: { paymentId: delivery.paymentId, source: 'WEBHOOK', eventType: 'webhook.failed' } })
}

async function scheduleRetry(delivery: DueDelivery, attempts: number, info: { statusCode: number | null; error: string }) {
  if (attempts >= MAX_ATTEMPTS) return failPermanently(delivery, attempts, info)
  const delay = BACKOFF_SECONDS[attempts - 1] ?? BACKOFF_SECONDS[BACKOFF_SECONDS.length - 1]
  await db.webhookDelivery.update({
    where: { id: delivery.id },
    data: { attempts, lastStatusCode: info.statusCode, lastError: info.error, nextAttemptAt: new Date(Date.now() + delay * 1000) },
  })
}

async function attemptDelivery(delivery: DueDelivery) {
  const attempts = delivery.attempts + 1
  const secret = delivery.project.webhookSecret
  if (!secret) return scheduleRetry(delivery, attempts, { statusCode: null, error: 'Webhook tidak dikonfigurasi.' })
  const body = JSON.stringify(delivery.payload)
  const timestamp = Math.floor(Date.now() / 1000)
  try {
    const response = await fetch(delivery.url, {
      method: 'POST',
      headers: buildWebhookHeaders({ secret, event: delivery.eventType, deliveryId: delivery.id, timestamp, body }),
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (response.ok) {
      await db.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: 'SUCCESS', attempts, deliveredAt: new Date(), lastStatusCode: response.status, lastError: null },
      })
      await db.paymentEvent.create({ data: { paymentId: delivery.paymentId, source: 'WEBHOOK', eventType: 'webhook.delivered' } })
      return
    }
    return scheduleRetry(delivery, attempts, { statusCode: response.status, error: `Provider webhook membalas HTTP ${response.status}.` })
  } catch (error) {
    return scheduleRetry(delivery, attempts, { statusCode: null, error: error instanceof Error ? error.message : 'Gagal mengirim webhook.' })
  }
}

let processing = false

export async function processDueDeliveries() {
  if (processing) return
  processing = true
  try {
    const due = await db.webhookDelivery.findMany({
      where: { status: 'PENDING', nextAttemptAt: { lte: new Date() } },
      orderBy: { nextAttemptAt: 'asc' },
      take: DELIVERY_BATCH,
      include: { project: { select: { webhookSecret: true } } },
    })
    for (const delivery of due) await attemptDelivery(delivery)
  } finally {
    processing = false
  }
}
