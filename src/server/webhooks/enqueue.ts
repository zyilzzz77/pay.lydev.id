import type { Prisma } from '../../generated/prisma/client'
import { paymentDto } from '../payments/service'

export type WebhookEvent = 'payment.paid' | 'payment.failed' | 'payment.expired'

export type PaymentForWebhook = {
  id: string
  orderId: string
  status: string
  amount: number
  currency: string
  fee: number | null
  providerAmount: number | null
  description: string | null
  externalReference: string | null
  expiresAt: Date | null
  paidAt: Date | null
  createdAt: Date
  projectId: string
}

export type WebhookTarget = { id: string; webhookUrl: string | null; webhookSecret: string | null }

export function paymentEventName(status: string): WebhookEvent | null {
  if (status === 'PAID') return 'payment.paid'
  if (status === 'FAILED') return 'payment.failed'
  if (status === 'EXPIRED') return 'payment.expired'
  return null
}

export function buildWebhookPayload(payment: PaymentForWebhook, event: WebhookEvent, deliveryId: string) {
  return {
    event,
    deliveryId,
    createdAt: new Date().toISOString(),
    data: { ...paymentDto(payment), projectId: payment.projectId },
  }
}

export async function enqueueWebhookDelivery(
  tx: Prisma.TransactionClient,
  payment: PaymentForWebhook,
  project: WebhookTarget,
  event: WebhookEvent,
) {
  if (!project.webhookUrl || !project.webhookSecret) return false
  const delivery = await tx.webhookDelivery.create({
    data: { paymentId: payment.id, projectId: project.id, eventType: event, url: project.webhookUrl, payload: {} },
  })
  const payload = JSON.parse(JSON.stringify(buildWebhookPayload(payment, event, delivery.id)))
  await tx.webhookDelivery.update({ where: { id: delivery.id }, data: { payload } })
  return true
}
