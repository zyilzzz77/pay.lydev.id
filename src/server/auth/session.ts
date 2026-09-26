import { sealData, unsealData } from 'iron-session'
import { getEnv } from '../env'

const COOKIE = 'lydev_session'
const SECURE_COOKIE = `__Host-${COOKIE}`
const TTL = 60 * 60 * 8

type SessionData = { email?: string; version?: number }

function usesSecureCookie() {
  return new URL(getEnv().APP_URL).protocol === 'https:'
}

function cookieName() {
  return usesSecureCookie() ? SECURE_COOKIE : COOKIE
}

function readCookie(header: string, name: string) {
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1) continue
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim()
  }
  return undefined
}

export async function readSession(request: Request) {
  const header = request.headers.get('cookie') ?? ''
  const value = readCookie(header, cookieName()) ?? readCookie(header, COOKIE)
  if (!value) return null
  try {
    const session = await unsealData<SessionData>(decodeURIComponent(value), {
      password: getEnv().SESSION_PASSWORD,
      ttl: TTL,
    })
    return session.email === getEnv().ADMIN_EMAIL && session.version === 1
      ? { email: session.email }
      : null
  } catch {
    return null
  }
}

function cookieSuffix(maxAge: number) {
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${usesSecureCookie() ? '; Secure' : ''}`
}

export async function sessionCookie(email: string) {
  const seal = await sealData({ email, version: 1 }, {
    password: getEnv().SESSION_PASSWORD,
    ttl: TTL,
  })
  return `${cookieName()}=${encodeURIComponent(seal)}; ${cookieSuffix(TTL)}`
}

export function expiredSessionCookie() {
  return `${cookieName()}=; ${cookieSuffix(0)}`
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  return origin === new URL(getEnv().APP_URL).origin
}

export async function requireOperator(request: Request) {
  return Boolean(await readSession(request))
}
