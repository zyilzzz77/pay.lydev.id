import { createHash } from 'node:crypto'
import { chromium, type Page } from 'playwright-core'
import { getEnv } from '../env'
import { allowedPaymentUrl } from '../providers/sumopod'
import { findQrisPayload } from './qris-payload'
import { renderQrisPng } from './render'

let activeBrowsers = 0
const MAX_CONCURRENT_BROWSERS = 2
const MAX_IMAGE = 2_000_000
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

function validatePng(image: Buffer) {
  if (image.length < 100 || image.length > MAX_IMAGE || !image.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Data gambar QR provider tidak valid.')
  }
  return { image, mimeType: 'image/png' as const, checksum: createHash('sha256').update(image).digest('hex') }
}

async function readDataUrlQr(page: Page) {
  const qr = page.locator('img.qr-image[alt="QRIS code"]')
  if (await qr.count() === 0) return null
  await qr.first().waitFor({ state: 'visible', timeout: 12_000 })
  const source = await qr.first().getAttribute('src')
  if (!source?.startsWith('data:image/png;base64,')) return null
  return Buffer.from(source.slice('data:image/png;base64,'.length), 'base64')
}

export async function extractQrWithBrowser(paymentUrl: string) {
  if (activeBrowsers >= MAX_CONCURRENT_BROWSERS) throw new Error('QR browser sedang sibuk; coba lagi sebentar.')
  activeBrowsers += 1
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  try {
    const pageUrl = allowedPaymentUrl(paymentUrl)
    const env = getEnv()
    const allowedHosts = new Set([
      ...env.SUMOPOD_ALLOWED_PAYMENT_HOSTS.split(',').map((host) => host.trim().toLowerCase()),
      new URL(env.SUMOPOD_API_BASE_URL).hostname.toLowerCase(),
    ])
    browser = await chromium.launch({
      headless: true,
      ...(env.QR_BROWSER_EXECUTABLE_PATH
        ? { executablePath: env.QR_BROWSER_EXECUTABLE_PATH }
        : { channel: env.QR_BROWSER_CHANNEL }),
    })
    const page = await browser.newPage({ viewport: { width: 900, height: 1400 }, acceptDownloads: false })
    await page.route('**/*', async (route) => {
      try {
        const url = new URL(route.request().url())
        if (url.protocol === 'https:' && allowedHosts.has(url.hostname.toLowerCase()) && !url.username && !url.password) {
          await route.continue()
        } else {
          await route.abort()
        }
      } catch { await route.abort() }
    })
    await page.goto(pageUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 15_000 })
    allowedPaymentUrl(page.url())
    const payload = findQrisPayload(await page.content())
    if (payload) return renderQrisPng(payload)
    const dataUrl = await readDataUrlQr(page).catch(() => null)
    if (dataUrl) return validatePng(dataUrl)
    throw new Error('QR tidak ditemukan pada halaman provider.')
  } finally {
    try { await browser?.close() }
    finally { activeBrowsers -= 1 }
  }
}
