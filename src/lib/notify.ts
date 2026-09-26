export type NotificationState = NotificationPermission | 'unsupported'

export function notificationPermission(): NotificationState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

export async function enableNotifications() {
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  try {
    return (await Notification.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

export function sendNotification(title: string, body: string, tag = 'lydev-pay') {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return
  try {
    new Notification(title, { body, tag, icon: '/favicon.svg' })
  } catch {
    // Sebagian browser (terutama mobile) menolak konstruksi Notification; abaikan saja.
  }
}
