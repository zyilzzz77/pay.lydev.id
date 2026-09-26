import { Client } from 'pg'
import { chromium } from 'playwright-core'
import { allowedPaymentUrl } from '../src/server/providers/sumopod'

const orderId = process.argv[2]
if (!orderId) throw new Error('Order ID diperlukan.')
const db = new Client({ connectionString: process.env.DATABASE_URL })
await db.connect()
const { rows } = await db.query<{ providerPaymentUrl: string }>(
  'SELECT "providerPaymentUrl" FROM "Payment" WHERE "orderId" = $1', [orderId],
)
await db.end()
const url = allowedPaymentUrl(rows[0]?.providerPaymentUrl)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 1000 } })
  const hosts = new Set<string>()
  await page.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url())
    if (requestUrl.protocol === 'https:' && (requestUrl.hostname === 'sumopod.com' || requestUrl.hostname.endsWith('.sumopod.com'))) {
      hosts.add(requestUrl.hostname)
      await route.continue()
    } else {
      await route.abort()
    }
  })
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 15000 })
  await page.getByText('QRIS', { exact: false }).first().waitFor({ timeout: 12000 }).catch(() => {})
  const summary = await page.evaluate(() => ({
    title: document.title,
    text: document.body.innerText.slice(0, 700),
    images: Array.from(document.images).map((img) => ({
      alt: img.alt,
      className: img.className,
      width: img.naturalWidth,
      height: img.naturalHeight,
      sourceKind: img.src.startsWith('data:') ? 'data' : 'url',
      dataMime: img.src.startsWith('data:') ? img.src.slice(0, img.src.indexOf(',')) : null,
    })),
    canvasCount: document.querySelectorAll('canvas').length,
    svgCount: document.querySelectorAll('svg').length,
    qrElements: Array.from(document.querySelectorAll('[class*="qr" i], [id*="qr" i]')).slice(0, 20).map((element) => ({
      tag: element.tagName, id: element.id, className: String(element.className).slice(0, 100),
      childCount: element.childElementCount,
    })),
  }))
  console.log(JSON.stringify({ ...summary, networkHosts: [...hosts] }, null, 2))
} finally {
  await browser.close()
}
