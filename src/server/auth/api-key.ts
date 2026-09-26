import { createHash, timingSafeEqual } from 'node:crypto'
import { db } from '../db'
import { getEnv } from '../env'
import { generateApiKey, readApiKey } from './api-key-format'

export function hashApiKey(raw: string) {
  return createHash('sha256').update(`${getEnv().API_KEY_PEPPER}:${raw}`).digest('hex')
}

export async function createProjectKey(projectId: string, label?: string) {
  const raw = generateApiKey()
  const record = await db.apiKey.create({
    data: { projectId, prefix: raw.slice(0, 20), keyHash: hashApiKey(raw), label },
  })
  return { id: record.id, raw, prefix: record.prefix }
}

export async function authenticateProject(request: Request) {
  const raw = readApiKey(request)
  if (!raw) return null
  const digest = hashApiKey(raw)
  const key = await db.apiKey.findUnique({
    where: { keyHash: digest },
    include: { project: true },
  })
  if (!key || !key.isActive || !key.project.isActive || (key.expiresAt && key.expiresAt < new Date())) return null
  if (!timingSafeEqual(Buffer.from(key.keyHash, 'hex'), Buffer.from(digest, 'hex'))) return null
  await db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
  return key.project
}
