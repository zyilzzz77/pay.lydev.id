import { createHmac, timingSafeEqual } from 'node:crypto'
import { getEnv } from '../env'

/**
 * Verifikasi signature Svix milik Sumopod. Sengaja dipisah dari handler webhook
 * agar bisa diuji tanpa memuat Prisma/worker.
 */
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
