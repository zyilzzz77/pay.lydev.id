import { processDueDeliveries } from './webhooks/dispatcher'
import { expireStalePayments } from './payments/expiry'

const WORKER_INTERVAL_MS = 30_000
const globalForWorker = globalThis as unknown as { lydevWorker?: boolean }

async function tick() {
  await expireStalePayments()
  await processDueDeliveries()
}

export function ensureWorker() {
  if (globalForWorker.lydevWorker) return
  globalForWorker.lydevWorker = true
  setInterval(() => {
    tick().catch((error) => console.error('worker tick failed', error))
  }, WORKER_INTERVAL_MS).unref()
}

export function runDeliveriesNow() {
  ensureWorker()
  processDueDeliveries().catch((error) => console.error('webhook dispatcher failed', error))
}
