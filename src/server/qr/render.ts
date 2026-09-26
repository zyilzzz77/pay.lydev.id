import { createHash } from 'node:crypto'
import QRCode from 'qrcode'

const QR_WIDTH = 512
const QR_MARGIN = 3

export async function renderQrisPng(payload: string) {
  const image = await QRCode.toBuffer(payload, { type: 'png', errorCorrectionLevel: 'M', margin: QR_MARGIN, width: QR_WIDTH })
  return { image, mimeType: 'image/png' as const, checksum: createHash('sha256').update(image).digest('hex') }
}
