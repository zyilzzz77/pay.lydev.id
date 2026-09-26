import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { requireOperator, sameOrigin } from '../../../server/auth/session'
import { db } from '../../../server/db'
import { generateWebhookSecret, normalizeWebhookUrl } from '../../../server/webhooks/signature'

const input = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().regex(/^[a-z0-9-]{2,40}$/),
})

const webhookInput = z.object({
  id: z.string().min(1),
  webhookUrl: z.string().max(2048).nullish(),
  rotateSecret: z.boolean().optional(),
})

export const Route = createFileRoute('/api/admin/projects')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await requireOperator(request))) return new Response('Unauthorized', { status: 401 })
        if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 })
        const parsed = input.safeParse(await request.json().catch(() => null))
        if (!parsed.success) return Response.json({ error: 'Nama atau slug tidak valid.' }, { status: 400 })
        try {
          const project = await db.project.create({ data: parsed.data })
          return Response.json(project, { status: 201 })
        } catch {
          return Response.json({ error: 'Slug project sudah dipakai.' }, { status: 409 })
        }
      },
      PATCH: async ({ request }) => {
        if (!(await requireOperator(request))) return new Response('Unauthorized', { status: 401 })
        if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 })
        const parsed = webhookInput.safeParse(await request.json().catch(() => null))
        if (!parsed.success) return Response.json({ error: 'Input webhook tidak valid.' }, { status: 400 })
        const project = await db.project.findUnique({ where: { id: parsed.data.id } })
        if (!project) return Response.json({ error: 'Project tidak ditemukan.' }, { status: 404 })
        let webhookUrl = project.webhookUrl
        if (parsed.data.webhookUrl !== undefined) {
          try {
            webhookUrl = normalizeWebhookUrl(parsed.data.webhookUrl ?? '')
          } catch (error) {
            return Response.json({ error: (error as Error).message }, { status: 400 })
          }
        }
        const shouldIssueSecret = Boolean(webhookUrl) && (parsed.data.rotateSecret === true || !project.webhookSecret)
        const secret = shouldIssueSecret ? generateWebhookSecret() : null
        const updated = await db.project.update({
          where: { id: project.id },
          data: { webhookUrl, ...(secret ? { webhookSecret: secret } : {}) },
        })
        return Response.json({ ok: true, webhookUrl: updated.webhookUrl, secret }, { headers: { 'Cache-Control': 'no-store' } })
      },
    },
  },
})
