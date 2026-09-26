import { Client } from 'pg'
import { load } from 'cheerio'
import { allowedPaymentUrl } from '../src/server/providers/sumopod'

const orderId = process.argv[2]
if (!orderId) throw new Error('Order ID diperlukan.')
const db = new Client({ connectionString: process.env.DATABASE_URL })
await db.connect()
try {
  const { rows } = await db.query<{ providerPaymentUrl: string }>(
    'SELECT "providerPaymentUrl" FROM "Payment" WHERE "orderId" = $1', [orderId],
  )
  const paymentUrl = rows[0]?.providerPaymentUrl
  if (!paymentUrl) throw new Error('Payment URL tidak tersedia.')
  const url = allowedPaymentUrl(paymentUrl)
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10000) })
  const contentType = response.headers.get('content-type') ?? ''
  const html = contentType.includes('text/html') ? await response.text() : ''
  const $ = load(html)
  const images = $('img').toArray().map((node) => ({
    alt: $(node).attr('alt') ?? '',
    id: $(node).attr('id') ?? '',
    className: $(node).attr('class') ?? '',
    sourceKind: ($(node).attr('src') ?? '').startsWith('data:') ? 'data' : 'url',
  }))
  const scripts = $('script[src]').toArray().map((node) => {
    const src = $(node).attr('src') ?? ''
    try { const parsed = new URL(src, url); return { host: parsed.hostname, path: parsed.pathname } }
    catch { return { host: '', path: '' } }
  })
  console.log(JSON.stringify({
    status: response.status, contentType, htmlBytes: Buffer.byteLength(html),
    title: $('title').text(), images, canvasCount: $('canvas').length,
    svgCount: $('svg').length, scriptCount: $('script').length, scripts,
    qrWordCount: (html.match(/qris|qr[_-]?code|qrPayload/gi) ?? []).length,
  }, null, 2))
} finally {
  await db.end()
}
