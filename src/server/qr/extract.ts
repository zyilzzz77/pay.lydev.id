import { createHash } from 'node:crypto'
import { load } from 'cheerio'
import { allowedPaymentUrl } from '../providers/sumopod'
import { getEnv } from '../env'
import { findQrisPayload } from './qris-payload'
import { renderQrisPng } from './render'

const MAX_HTML = 1_000_000
const MAX_IMAGE = 2_000_000
const MAX_REDIRECTS = 3

async function readLimited(response: Response, limit: number) {
  const announced = Number(response.headers.get('content-length') ?? 0)
  if (announced > limit) throw new Error('Resource provider terlalu besar.')
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Resource provider kosong.')
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) { await reader.cancel(); throw new Error('Resource provider terlalu besar.') }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}

function detectImage(bytes: Buffer) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return 'image/jpeg'
  if (bytes.subarray(0, 6).toString('ascii').startsWith('GIF8')) return 'image/gif'
  throw new Error('QR provider bukan gambar yang didukung.')
}

async function fetchHtml(startUrl: URL) {
  let current = startUrl
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(10000) })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) throw new Error('Halaman pembayaran provider tidak tersedia.')
      current = allowedPaymentUrl(new URL(location, current).toString())
      continue
    }
    if (!response.ok) throw new Error('Halaman pembayaran provider tidak tersedia.')
    if (!(response.headers.get('content-type') ?? '').includes('text/html')) throw new Error('Halaman provider bukan HTML.')
    return { html: (await readLimited(response, MAX_HTML)).toString('utf8'), url: current }
  }
  throw new Error('Terlalu banyak pengalihan halaman provider.')
}

async function extractFromHtml(pageUrl: URL) {
  const { html, url } = await fetchHtml(pageUrl)
  const payload = findQrisPayload(html)
  if (payload) return renderQrisPng(payload)
  const $ = load(html)
  const candidates = $('img').toArray().map((element) => ({
    src: $(element).attr('src') ?? '',
    hint: `${$(element).attr('alt') ?? ''} ${$(element).attr('id') ?? ''} ${$(element).attr('class') ?? ''}`.toLowerCase(),
  })).filter((item) => /qr|qris/i.test(item.hint) || /qr|qris/i.test(item.src))
  for (const candidate of candidates) {
    try {
      let image: Buffer
      if (candidate.src.startsWith('data:image/png;base64,')) {
        image = Buffer.from(candidate.src.slice('data:image/png;base64,'.length), 'base64')
      } else {
        const imageUrl = allowedPaymentUrl(new URL(candidate.src, url).toString())
        const response = await fetch(imageUrl, { redirect: 'manual', signal: AbortSignal.timeout(10000) })
        if (!response.ok || response.status >= 300) continue
        image = await readLimited(response, MAX_IMAGE)
      }
      if (image.length < 100 || image.length > MAX_IMAGE) continue
      const mimeType = detectImage(image)
      return { image, mimeType, checksum: createHash('sha256').update(image).digest('hex') }
    } catch {
      continue
    }
  }
  return null
}

export async function extractQr(paymentUrl: string) {
  const pageUrl = allowedPaymentUrl(paymentUrl)
  try {
    const fromHtml = await extractFromHtml(pageUrl)
    if (fromHtml) return fromHtml
  } catch (error) {
    console.error('QR HTML extraction failed', error instanceof Error ? error.message : error)
  }
  if (getEnv().QR_BROWSER_ENABLED) {
    const { extractQrWithBrowser } = await import('./browser-extractor')
    return extractQrWithBrowser(paymentUrl)
  }
  throw new Error('QR tidak ditemukan pada HTML provider dan browser extractor dinonaktifkan.')
}
