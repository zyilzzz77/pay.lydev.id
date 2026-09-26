import { createFileRoute } from '@tanstack/react-router'
import { handleSumopodWebhook } from '../../../server/providers/sumopod-webhook'

export const Route = createFileRoute('/api/webhooks/sumopod')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (Number(request.headers.get('content-length') ?? 0) > 64_000) return new Response('Too large', { status: 413 })
        const raw = await request.text()
        if (raw.length > 64_000) return new Response('Too large', { status: 413 })
        try {
          const result = await handleSumopodWebhook(raw, request.headers)
          return Response.json(result.body, { status: result.status })
        } catch (error) {
          console.error('sumopod.webhook failed', error)
          return Response.json({ error: 'Webhook processing failed' }, { status: 500 })
        }
      },
    },
  },
})
