import { z } from 'zod'
import { getEnv } from '../env'

const createResponse = z.object({
  payment_id: z.string().min(1),
  order_id: z.string().min(1),
  amount: z.number().int().positive(),
  fee: z.number().int().nonnegative().optional(),
  net_amount: z.number().int().positive().optional(),
  payment_link_url: z.url(),
  status: z.string(),
  expires_at: z.iso.datetime(),
})

export function allowedPaymentUrl(raw: string) {
  const url = new URL(raw)
  const hosts = getEnv().SUMOPOD_ALLOWED_PAYMENT_HOSTS.split(',').map((host) => host.trim().toLowerCase())
  if (url.protocol !== 'https:' || url.port || url.username || url.password || !hosts.includes(url.hostname.toLowerCase())) {
    throw new Error('URL pembayaran provider tidak diizinkan.')
  }
  return url
}

export async function createSumopodPayment(orderId: string, amount: number) {
  const env = getEnv()
  if (!env.SUMOPOD_API_KEY) throw new Error('SUMOPOD_API_KEY belum dikonfigurasi.')
  const url = new URL(`${env.SUMOPOD_API_BASE_URL.replace(/\/$/, '')}/payments`)
  if (url.protocol !== 'https:') throw new Error('Sumopod API harus memakai HTTPS.')
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': env.SUMOPOD_API_KEY },
    body: JSON.stringify({
      order_id: orderId,
      amount,
      currency: 'IDR',
      expires_in_hours: 24,
      payment_method_type_code: 'QRIS',
    }),
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new Error(`Sumopod menolak pembuatan pembayaran (${response.status}).`)
  const body = createResponse.parse(await response.json())
  const amountMatches = body.amount === amount || body.net_amount === amount || (body.fee !== undefined && body.amount - body.fee === amount)
  if (body.order_id !== orderId || body.status !== 'pending' || !amountMatches) {
    throw new Error('Respons Sumopod tidak cocok dengan request.')
  }
  allowedPaymentUrl(body.payment_link_url)
  const fee = body.fee ?? (body.net_amount !== undefined ? body.amount - body.net_amount : null)
  return {
    paymentId: body.payment_id,
    paymentUrl: body.payment_link_url,
    expiresAt: new Date(body.expires_at),
    providerAmount: body.amount,
    fee,
  }
}
