import { createFileRoute } from '@tanstack/react-router'
import { ensureWorker } from '../../server/worker'

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: () => {
        ensureWorker()
        return Response.json({ status: 'ok', service: 'lydev-pay' })
      },
    },
  },
})
