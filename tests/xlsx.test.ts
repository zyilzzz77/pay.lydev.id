import { inflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { buildXlsx } from '../src/server/reports/xlsx'

function readEntries(archive: Buffer) {
  const entries = new Map<string, Buffer>()
  let offset = 0
  while (archive.readUInt32LE(offset) === 0x04034b50) {
    const method = archive.readUInt16LE(offset + 8)
    const compressedSize = archive.readUInt32LE(offset + 18)
    const nameLength = archive.readUInt16LE(offset + 26)
    const extraLength = archive.readUInt16LE(offset + 28)
    const name = archive.subarray(offset + 30, offset + 30 + nameLength).toString('utf8')
    const dataStart = offset + 30 + nameLength + extraLength
    const data = archive.subarray(dataStart, dataStart + compressedSize)
    entries.set(name, method === 8 ? inflateRawSync(data) : Buffer.from(data))
    offset = dataStart + compressedSize
  }
  return entries
}

describe('xlsx report builder', () => {
  const archive = buildXlsx('Transaksi', [
    ['Order ID', 'Nominal', 'Status'],
    ['LY-01ABC', 50000, 'PAID'],
    ['LY-01DEF', 12500, 'PENDING'],
  ], [24, 12, 10])

  it('writes a zip archive containing every required part', () => {
    expect([...archive.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04])
    expect(archive.readUInt16LE(4)).toBe(20)
    const names = [...readEntries(archive).keys()]
    expect(names).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/worksheets/sheet1.xml',
    ])
  })

  it('renders header, text and numeric cells with the right styles', () => {
    const sheet = readEntries(archive).get('xl/worksheets/sheet1.xml')!.toString('utf8')
    expect(sheet).toContain('<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Order ID</t></is></c>')
    expect(sheet).toContain('<c r="B2" s="2"><v>50000</v></c>')
    expect(sheet).toContain('<c r="A3" t="inlineStr"><is><t xml:space="preserve">LY-01DEF</t></is></c>')
    expect(sheet.match(/<row /g)).toHaveLength(3)
    expect(sheet).toContain('<col min="1" max="1" width="24" customWidth="1"/>')
  })

  it('escapes xml characters in text cells', () => {
    const escaped = readEntries(buildXlsx('Sheet', [['a & b <c>']])).get('xl/worksheets/sheet1.xml')!.toString('utf8')
    expect(escaped).toContain('a &amp; b &lt;c&gt;')
  })
})
