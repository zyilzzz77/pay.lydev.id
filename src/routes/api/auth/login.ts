import { verify } from 'argon2'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { getEnv } from '../../../server/env'
import { sameOrigin, sessionCookie } from '../../../server/auth/session'

const credentials = z.object({ email: z.email(), password: z.string().min(1) })

const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60_000
const MAX_TRACKED_CLIENTS = 2000
// Verified even when the email is wrong so both failures cost the same argon2 time.
const DUMMY_HASH = '$argon2id$v=19$m=65536,t=3,p=4$J4xMKRHeCFHqws81/c7WKw$2rq4Jb09OwduEarWcvlaS+Z68gGVQlrPxMVb/dE/VTQ'

const attempts = new Map<string, { count: number; until: number }>()

function clientKey(request: Request) {
  const header = getEnv().TRUSTED_PROXY_HEADER
  const values = header ? request.headers.get(header)?.split(',') : undefined
  // Elemen paling kanan adalah yang ditambahkan proxy terdekat, bukan kiriman klien.
  const value = values?.[values.length - 1]?.trim()
  return value || 'unknown'
}

function recordFailure(key: string, now: number) {
  if (attempts.size >= MAX_TRACKED_CLIENTS) {
    for (const [existing, state] of attempts) if (state.until <= now) attempts.delete(existing)
    if (attempts.size >= MAX_TRACKED_CLIENTS) attempts.clear()
  }
  const state = attempts.get(key)
  attempts.set(key, {
    count: state && state.until > now ? state.count + 1 : 1,
    until: now + WINDOW_MS,
  })
}

export const Route = createFileRoute('/api/auth/login')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 })
        const key = clientKey(request)
        const now = Date.now()
        const state = attempts.get(key)
        if (state && state.until > now && state.count >= MAX_ATTEMPTS) {
          return Response.json({ error: 'Terlalu banyak percobaan. Coba lagi nanti.' }, {
            status: 429,
            headers: { 'Retry-After': String(Math.ceil((state.until - now) / 1000)) },
          })
        }
        const body = credentials.safeParse(await request.json().catch(() => null))
        if (!body.success) return Response.json({ error: 'Email atau password tidak valid.' }, { status: 400 })
        const env = getEnv()
        const emailMatches = body.data.email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase()
        const passwordMatches = await verify(
          emailMatches ? env.ADMIN_PASSWORD_HASH : DUMMY_HASH,
          body.data.password,
        ).catch(() => false)
        if (!emailMatches || !passwordMatches) {
          recordFailure(key, now)
          return Response.json({ error: 'Email atau password salah.' }, { status: 401 })
        }
        attempts.delete(key)
        return Response.json({ ok: true }, {
          headers: { 'Set-Cookie': await sessionCookie(env.ADMIN_EMAIL), 'Cache-Control': 'no-store' },
        })
      },
    },
  },
})
