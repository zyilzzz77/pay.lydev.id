import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { createProjectKey } from '../../../server/auth/api-key'
import { requireOperator, sameOrigin } from '../../../server/auth/session'
import { db } from '../../../server/db'

const input = z.object({ projectId: z.string().min(1), label: z.string().trim().max(80).optional() })

export const Route = createFileRoute('/api/admin/keys')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await requireOperator(request))) return new Response('Unauthorized', { status: 401 })
        if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 })
        const parsed = input.safeParse(await request.json().catch(() => null))
        if (!parsed.success) return Response.json({ error: 'Input tidak valid.' }, { status: 400 })
        const project = await db.project.findUnique({ where: { id: parsed.data.projectId } })
        if (!project || !project.isActive) return Response.json({ error: 'Project tidak ditemukan.' }, { status: 404 })
        return Response.json(await createProjectKey(project.id, parsed.data.label), { status: 201, headers: { 'Cache-Control': 'no-store' } })
      },
      DELETE: async ({ request }) => {
        if (!(await requireOperator(request))) return new Response('Unauthorized', { status: 401 })
        if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 })
        const parsed = z.object({ id: z.string().min(1) }).safeParse(await request.json().catch(() => null))
        if (!parsed.success) return new Response('Bad request', { status: 400 })
        await db.apiKey.updateMany({ where: { id: parsed.data.id }, data: { isActive: false } })
        return Response.json({ ok: true })
      },
    },
  },
})
