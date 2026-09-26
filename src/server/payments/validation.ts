import { z } from 'zod'
import { getEnv } from '../env'

export const paymentInput = z.object({
  externalReference: z.string().trim().max(100).optional(),
  amount: z.number().int().positive(),
  currency: z.literal('IDR').default('IDR'),
  description: z.string().trim().max(240).optional(),
  customer: z.object({
    name: z.string().trim().max(100).optional(),
    email: z.email().optional(),
  }).optional(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
})

export type PaymentInput = z.infer<typeof paymentInput>

export class PaymentInputError extends Error {}

function rupiah(amount: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount)
}

export function parsePaymentInput(value: unknown) {
  const result = paymentInput.parse(value)
  const env = getEnv()
  if (result.amount < env.MIN_PAYMENT_AMOUNT) {
    throw new PaymentInputError(`Jumlah minimal pembayaran ${rupiah(env.MIN_PAYMENT_AMOUNT)}.`)
  }
  if (result.amount > env.MAX_PAYMENT_AMOUNT) throw new PaymentInputError('Jumlah melebihi batas konfigurasi.')
  if (JSON.stringify(result.metadata ?? {}).length > 4000) throw new PaymentInputError('Metadata terlalu besar.')
  return result
}
