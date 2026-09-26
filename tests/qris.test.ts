import { describe, expect, it } from 'vitest'
import { findQrisPayload } from '../src/server/qr/qris-payload'

const payload = '00020101021226570011ID.DANA.WWW0118936009150960199543020996021605204599953033605802ID5910TOKO ONLINE6007JAKARTA61051034062070703A016304ADF4'

describe('QRIS payload scraping', () => {
  it('finds the EMVCo payload inside surrounding markup', async () => {
    expect(findQrisPayload(`<script>self.x=${JSON.stringify(payload)}</script>`)).toBe(payload)
    expect(findQrisPayload(`<img src="data:image/png;base64,${payload}">`)).toBe(payload)
  })

  it('returns null when no payload is present', () => {
    expect(findQrisPayload('<html><body>no code here</body></html>')).toBeNull()
    expect(findQrisPayload('00020101')).toBeNull()
  })

  it('picks the longer payload when several are present', () => {
    const short = '0002010102126304BEEF'
    expect(findQrisPayload(`"${short}" and "${payload}"`)).toBe(payload)
  })
})
