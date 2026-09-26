import { createMiddleware, createStart } from '@tanstack/react-start'
import { readSession } from './server/auth/session'
import { getEnv } from './server/env'

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "font-src 'self' data:",
].join('; ')

function usesHttps() {
  return new URL(getEnv().APP_URL).protocol === 'https:'
}

function withSecurityHeaders(response: Response) {
  const headers = new Headers(response.headers)
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('X-Frame-Options', 'DENY')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
  headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  // CSP and HSTS only make sense over HTTPS and would break the Vite dev server on http.
  if (usesHttps()) {
    headers.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains')
    headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY)
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

const gate = createMiddleware().server(async ({ next, request }) => {
  const path = new URL(request.url).pathname
  // Each API route below applies its own project, provider, or operator credential check.
  const guarded = path === '/login' || path.startsWith('/api/')
  if (guarded || await readSession(request)) {
    const result = await next()
    return withSecurityHeaders(result.response)
  }
  if (request.method !== 'GET') return withSecurityHeaders(new Response('Unauthorized', { status: 401 }))
  const target = new URL('/login', request.url)
  target.searchParams.set('next', path)
  return withSecurityHeaders(Response.redirect(target, 302))
})

export const startInstance = createStart(() => ({ requestMiddleware: [gate] }))
