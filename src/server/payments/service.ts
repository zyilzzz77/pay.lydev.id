import { createHash } from 'node:crypto'
import { ulid } from 'ulid'
import { db } from '../db'
import { createSumopodPayment } from '../providers/sumopod'
import { extractQr } from '../qr/extract'
import { getEnv } from '../env'
import type { Prisma } from '../../generated/prisma/client'
import type { PaymentInput } from './validation'

export class PaymentError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

export function paymentDto(payment: {
  orderId: string; status: string; amount: number; currency: string;
  fee: number | null; providerAmount: number | null;
  description: string | null; externalReference: string | null;
  expiresAt: Date | null; paidAt: Date | null; createdAt: Date;
}) {
  return {
    orderId: payment.orderId,
    status: payment.status,
    amount: payment.amount,
    fee: payment.fee ?? null,
    providerAmount: payment.providerAmount ?? null,
    currency: payment.currency,
    description: payment.description,
    externalReference: payment.externalReference,
    expiresAt: payment.expiresAt?.toISOString() ?? null,
    paidAt: payment.paidAt?.toISOString() ?? null,
    createdAt: payment.createdAt.toISOString(),
    checkoutUrl: new URL(`/pay/${payment.orderId}`, getEnv().APP_URL).toString(),
    qrUrl: new URL(`/api/v1/payments/${payment.orderId}/qr`, getEnv().APP_URL).toString(),
  }
}

export async function createPayment(projectId: string, input: PaymentInput, key: string) {
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) throw new PaymentError('Idempotency-Key tidak valid.')
  const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex')
  const existing = await db.idempotencyRecord.findUnique({ where: { projectId_key: { projectId, key } } })
  if (existing) {
    if (existing.requestHash !== requestHash) throw new PaymentError('Idempotency-Key dipakai untuk request berbeda.', 409)
    const payment = existing.paymentId ? await db.payment.findUnique({ where: { id: existing.paymentId } }) : null
    if (!payment || payment.status === 'CREATED') throw new PaymentError('Pembayaran masih diproses. Coba lagi sebentar.', 409)
    return paymentDto(payment)
  }

  const orderId = `LY-${ulid()}`
  let payment
  try {
    payment = await db.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          orderId, projectId, amount: input.amount, currency: input.currency,
          description: input.description, externalReference: input.externalReference,
          customerName: input.customer?.name, customerEmail: input.customer?.email,
          publicMetadata: input.metadata,
          events: { create: { source: 'SYSTEM', eventType: 'payment.created' } },
        },
      })
      await tx.idempotencyRecord.create({
        data: { projectId, key, requestHash, paymentId: created.id, expiresAt: new Date(Date.now() + 24 * 60 * 60_000) },
      })
      return created
    })
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') {
      throw new PaymentError('Request dengan Idempotency-Key ini sedang diproses.', 409)
    }
    throw error
  }

  try {
    const provider = await createSumopodPayment(orderId, input.amount)
    payment = await db.payment.update({
      where: { id: payment.id },
      data: {
        providerPaymentId: provider.paymentId,
        providerPaymentUrl: provider.paymentUrl,
        expiresAt: provider.expiresAt,
        providerAmount: provider.providerAmount,
        fee: provider.fee,
        status: 'PENDING',
        events: { create: { source: 'SYSTEM', eventType: 'payment.pending' } },
      },
    })
    try {
      const qr = await extractQr(provider.paymentUrl)
      await db.paymentQrAsset.create({
        data: { paymentId: payment.id, mimeType: qr.mimeType, image: Uint8Array.from(qr.image), checksum: qr.checksum, expiresAt: provider.expiresAt },
      })
    } catch (error) {
      console.error('QR extraction failed', { orderId, message: error instanceof Error ? error.message : 'unknown' })
    }
    return paymentDto(payment)
  } catch (error) {
    if (payment.status === 'CREATED') {
      try {
        await db.$transaction(async (tx) => {
          await tx.paymentEvent.create({ data: { paymentId: payment.id, source: 'SYSTEM', eventType: 'provider.create_failed' } })
          await tx.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', failedAt: new Date() } })
          await tx.idempotencyRecord.deleteMany({ where: { projectId, key } })
        })
      } catch (cleanupError) {
        console.error('Failed to cleanup failed payment record', cleanupError)
      }
    }
    throw error
  }
}
