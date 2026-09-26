import { authenticateProject } from './api-key'
import { readSession } from './session'
import { db } from '../db'

export async function getAccessiblePayment(request: Request, orderId: string) {
  const operator = await readSession(request)
  const project = operator ? null : await authenticateProject(request)
  if (!operator && !project) return null
  const payment = await db.payment.findUnique({ where: { orderId } })
  if (!payment) return null
  if (operator) return payment
  return project?.id === payment.projectId ? payment : null
}
