import { createFileRoute } from '@tanstack/react-router'
import { expiredSessionCookie, sameOrigin } from '../../../server/auth/session'

export const Route = createFileRoute('/api/auth/logout')({
  server: {
    handlers: {
      POST: ({ request }) => {
        if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 })
        return Response.json({ ok: true }, {
          headers: { 'Set-Cookie': expiredSessionCookie(), 'Cache-Control': 'no-store' },
        })
      },
    },
  },
})
