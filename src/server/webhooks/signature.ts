import { createHmac, randomBytes } from 'node:crypto'

const SECRET_PREFIX = 'lywhsec_'

export function generateWebhookSecret() {
  return `${SECRET_PREFIX}${randomBytes(32).toString('base64url')}`
}

export function normalizeWebhookUrl(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('URL webhook tidak valid.')
  }
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !(isLocal && url.protocol === 'http:')) {
    throw new Error('URL webhook harus memakai HTTPS.')
  }
  if (url.username || url.password) throw new Error('URL webhook tidak boleh memuat kredensial.')
  return url.toString()
}

export function signWebhook(secret: string, timestamp: number, body: string) {
  const digest = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('base64url')
  return `v1,${digest}`
}

export function buildWebhookHeaders(input: {
  secret: string
  event: string
  deliveryId: string
  timestamp: number
  body: string
}) {
  return new Headers({
    'Content-Type': 'application/json',
    'X-Lydev-Event': input.event,
    'X-Lydev-Timestamp': String(input.timestamp),
    'X-Lydev-Delivery': input.deliveryId,
    'X-Lydev-Signature': signWebhook(input.secret, input.timestamp, input.body),
  })
}
