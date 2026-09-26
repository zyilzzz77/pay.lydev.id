import { beforeAll, describe, expect, it } from 'vitest'
import { createHmac } from 'node:crypto'

beforeAll(() => {
  process.env.NODE_ENV = 'test'
  process.env.APP_URL = 'http://localhost:3000'
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
  process.env.ADMIN_EMAIL = 'admin@example.com'
  process.env.ADMIN_PASSWORD_HASH = '$argon2id$v=19$m=65536,t=3,p=4$placeholder$placeholder'
  process.env.SESSION_PASSWORD = 'a-test-session-password-longer-than-32-characters'
  process.env.SUMOPOD_ENV = 'sandbox'
  process.env.SUMOPOD_API_BASE_URL = 'https://api-pay-sandbox.sumopod.com/api/v1'
  process.env.SUMOPOD_API_KEY = ''
  process.env.SUMOPOD_WEBHOOK_SECRET = `whsec_${Buffer.alloc(32, 7).toString('base64')}`
  process.env.SUMOPOD_ALLOWED_PAYMENT_HOSTS = 'pay-sandbox.sumopod.com,pay.sumopod.com'
  process.env.API_KEY_PEPPER = 'a-test-api-key-pepper-longer-than-32-characters'
})

describe('Sumopod webhook verification', () => {
  it('accepts a valid signature and rejects tampered or stale content', async () => {
    const { verifySumopodWebhook } = await import('../src/server/providers/sumopod-webhook')
    const raw = '{"event_type":"payment.test"}'
    const id = 'msg_test_123'
    const timestamp = String(Math.floor(Date.now() / 1000))
    const signature = createHmac('sha256', Buffer.alloc(32, 7)).update(`${id}.${timestamp}.${raw}`).digest('base64')
    const headers = new Headers({ 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': `v1,bad v1,${signature}` })
    expect(verifySumopodWebhook(raw, headers)).toBe(id)
    expect(verifySumopodWebhook(`${raw} `, headers)).toBeNull()
    headers.set('svix-timestamp', String(Number(timestamp) - 3600))
    expect(verifySumopodWebhook(raw, headers)).toBeNull()
  })
})

describe('provider URL protection', () => {
  it('only permits the configured HTTPS payment hosts', async () => {
    const { allowedPaymentUrl } = await import('../src/server/providers/sumopod')
    expect(allowedPaymentUrl('https://pay-sandbox.sumopod.com/pay/123').hostname).toBe('pay-sandbox.sumopod.com')
    expect(() => allowedPaymentUrl('http://pay-sandbox.sumopod.com/pay/123')).toThrow()
    expect(() => allowedPaymentUrl('https://pay-sandbox.sumopod.com.evil.test/pay/123')).toThrow()
    expect(() => allowedPaymentUrl('https://user:pass@pay.sumopod.com/pay/123')).toThrow()
    expect(() => allowedPaymentUrl('https://pay.sumopod.com:444/pay/123')).toThrow()
  })
})

describe('project API key format', () => {
  it('issues lypay- keys and only accepts well-formed bearers', async () => {
    const { generateApiKey, readApiKey } = await import('../src/server/auth/api-key-format')
    const raw = generateApiKey()
    expect(raw.startsWith('lypay-')).toBe(true)
    expect(raw).toHaveLength('lypay-'.length + 48)
    expect(readApiKey(new Request('http://localhost', { headers: { authorization: `Bearer ${raw}` } }))).toBe(raw)
    expect(readApiKey(new Request('http://localhost', { headers: { authorization: 'Bearer ly_test_abcdef' } }))).toBeNull()
    expect(readApiKey(new Request('http://localhost', { headers: { authorization: `Bearer ${raw}x` } }))).toBeNull()
    expect(readApiKey(new Request('http://localhost'))).toBeNull()
  })
})

describe('outbound webhook signing', () => {
  it('creates lypay webhook secrets and signs the timestamped body', async () => {
    const { generateWebhookSecret, signWebhook, buildWebhookHeaders } = await import('../src/server/webhooks/signature')
    const secret = generateWebhookSecret()
    expect(secret.startsWith('lywhsec_')).toBe(true)
    const timestamp = 1758859200
    const body = JSON.stringify({ event: 'payment.paid' })
    const signature = signWebhook(secret, timestamp, body)
    const expected = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('base64url')
    expect(signature).toBe(`v1,${expected}`)
    expect(signWebhook(secret, timestamp, `${body} `)).not.toBe(signature)
    const headers = buildWebhookHeaders({ secret, event: 'payment.paid', deliveryId: 'dlv_1', timestamp, body })
    expect(headers.get('x-lydev-signature')).toBe(signature)
    expect(headers.get('x-lydev-event')).toBe('payment.paid')
    expect(headers.get('x-lydev-delivery')).toBe('dlv_1')
    expect(headers.get('x-lydev-timestamp')).toBe(String(timestamp))
  })

  it('only allows https webhook urls, with localhost for development', async () => {
    const { normalizeWebhookUrl } = await import('../src/server/webhooks/signature')
    expect(normalizeWebhookUrl('')).toBeNull()
    expect(normalizeWebhookUrl('https://backend.example.com/hooks/lydev')).toBe('https://backend.example.com/hooks/lydev')
    expect(normalizeWebhookUrl('http://localhost:4000/hook')).toBe('http://localhost:4000/hook')
    expect(normalizeWebhookUrl('http://127.0.0.1:4000/hook')).toBe('http://127.0.0.1:4000/hook')
    expect(() => normalizeWebhookUrl('http://evil.test/hook')).toThrow()
    expect(() => normalizeWebhookUrl('https://user:pass@backend.example.com/hook')).toThrow()
    expect(() => normalizeWebhookUrl('not-a-url')).toThrow()
  })
})
