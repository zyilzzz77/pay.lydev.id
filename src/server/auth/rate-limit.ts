type Window = { count: number; resetsAt: number }

const paymentCreates = new Map<string, Window>()
const WINDOW_MS = 60_000
const MAX_PAYMENT_CREATES = 10

export function allowPaymentCreate(projectId: string) {
  const now = Date.now()
  const previous = paymentCreates.get(projectId)
  const window = previous && previous.resetsAt > now
    ? previous
    : { count: 0, resetsAt: now + WINDOW_MS }
  window.count += 1
  paymentCreates.set(projectId, window)
  return window.count <= MAX_PAYMENT_CREATES
    ? { allowed: true as const }
    : { allowed: false as const, retryAfter: Math.ceil((window.resetsAt - now) / 1000) }
}
