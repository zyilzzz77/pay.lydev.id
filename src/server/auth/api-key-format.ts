import { randomBytes } from 'node:crypto'

const PREFIX = 'lypay-'
const BODY_LENGTH = 48

export function generateApiKey() {
  return `${PREFIX}${randomBytes(36).toString('base64url')}`
}

export function readApiKey(request: Request) {
  const header = request.headers.get('authorization') ?? ''
  if (!header.startsWith('Bearer ')) return null
  const raw = header.slice('Bearer '.length)
  return raw.length === PREFIX.length + BODY_LENGTH && /^lypay-[A-Za-z0-9_-]+$/.test(raw) ? raw : null
}
