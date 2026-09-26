const START = /00020/g
const PAYLOAD = /^00020[0-9A-Za-z$%*+\-./: ]{10,900}?6304[0-9A-Fa-f]{4}$/
const WINDOW = 1000
const BOUNDARY = /[^0-9A-Za-z$%*+\-./: ]/

export function findQrisPayload(source: string): string | null {
  let best: string | null = null
  for (const start of source.matchAll(START)) {
    const window = source.slice(start.index ?? 0, (start.index ?? 0) + WINDOW)
    const boundary = window.search(BOUNDARY)
    const segment = boundary === -1 ? window : window.slice(0, boundary)
    const match = PAYLOAD.exec(segment)
    if (match && (!best || match[0].length > best.length)) best = match[0]
  }
  return best
}
