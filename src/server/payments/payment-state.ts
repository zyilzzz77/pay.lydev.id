import type { PaymentStatus } from '../../generated/prisma/enums'

const allowed: Record<PaymentStatus, PaymentStatus[]> = {
  CREATED: ['PENDING'],
  PENDING: ['PAID', 'FAILED', 'EXPIRED', 'CANCELLED'],
  PAID: ['REFUNDED'],
  FAILED: [],
  EXPIRED: [],
  CANCELLED: [],
  REFUNDED: [],
}

export function canTransition(from: PaymentStatus, to: PaymentStatus) {
  return allowed[from].includes(to)
}
