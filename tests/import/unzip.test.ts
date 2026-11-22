import { describe, expect, it } from 'vitest'
import { makeZip } from '../helpers/zip'
import { listZip, MAX_ENTRY_BYTES } from '../../src/import/unzip'
import { ImportError } from '../../src/import/musicxml/xml'

const dec = new TextDecoder()
const enc = new TextEncoder()
const UNSUPPORTED = "This .mxl file uses a zip feature this app can't read."
const TOO_LARGE = 'This .mxl file is too large to open (over 20 MB unpacked).'
const DAMAGED = 'Could not read this MusicXML file; it may be damaged.'

async function readAll(bytes: Uint8Array) {
  const out: Record<string, string> = {}
  for (const e of listZip(bytes)) out[e.name] = dec.decode(await e.read())
  return out
}

describe('listZip', () => {
  it('reads stored and deflated entries', async () => {
    const zip = makeZip([
      { name: 'a.txt', data: 'stored text', method: 0 },
      { name: 'b.txt', data: 'deflated text '.repeat(20), method: 8 },
    ])
    expect(await readAll(zip)).toEqual({
      'a.txt': 'stored text',
      'b.txt': 'deflated text '.repeat(20),
    })
  })

  it('finds the directory behind an archive comment', async () => {
    const zip = makeZip([{ name: 'a.txt', data: 'hello' }], { comment: 'x'.repeat(5000) })
    expect(await readAll(zip)).toEqual({ 'a.txt': 'hello' })
  })

  it('takes sizes from the central directory for data-descriptor entries', async () => {
    const zip = makeZip([
      { name: 'a.txt', data: 'first entry', dataDescriptor: true },
      { name: 'b.txt', data: 'second', method: 0, dataDescriptor: true },
    ])
    expect(await readAll(zip)).toEqual({ 'a.txt': 'first entry', 'b.txt': 'second' })
  })

  it('uses the local extra-field length for the data offset', async () => {
    const zip = makeZip([
      {
        name: 'a.txt',
        data: 'payload',
        localExtra: new Uint8Array(9).fill(7),
        centralExtra: new Uint8Array(5).fill(7),
      },
    ])
    expect(await readAll(zip)).toEqual({ 'a.txt': 'payload' })
  })

  it('normalises ./ and backslashes in names', () => {
    const zip = makeZip([
      { name: './META-INF\\container.xml', data: 'x' },
      { name: 'dir\\score.xml', data: 'y' },
    ])
    expect(listZip(zip).map((e) => e.name)).toEqual(['META-INF/container.xml', 'dir/score.xml'])
  })

  it('refuses encrypted entries', () => {
    const zip = makeZip([{ name: 'a.txt', data: 'x', flags: 1 }])
    expect(() => listZip(zip)).toThrow(new ImportError(UNSUPPORTED))
  })

  it('refuses method 12', () => {
    const zip = makeZip([{ name: 'a.txt', data: 'x' }], { methodOverride: 12 })
    expect(() => listZip(zip)).toThrow(new ImportError(UNSUPPORTED))
  })

  it('refuses Zip64', () => {
    for (const field of [10, 12, 16]) {
      const zip = makeZip([{ name: 'a.txt', data: 'x', method: 0 }])
      const eocd = zip.length - 22
      const patched = zip.slice()
      const n = field === 16 ? 4 : field === 12 ? 4 : 2
      patched.fill(0xff, eocd + field, eocd + field + n)
      expect(() => listZip(patched)).toThrow(new ImportError(UNSUPPORTED))
    }
  })

  it('stops inflating past 20 MB even when the declared size is small', async () => {
    const zip = makeZip([{ name: 'big.bin', data: new Uint8Array(21 * 1024 * 1024), declaredSize: 10 }])
    const [entry] = listZip(zip)
    await expect(entry.read()).rejects.toThrow(new ImportError(TOO_LARGE))
  })

  it('accepts an entry of exactly the limit', async () => {
    const zip = makeZip([{ name: 'big.bin', data: new Uint8Array(MAX_ENTRY_BYTES) }])
    const [entry] = listZip(zip)
    expect((await entry.read()).length).toBe(MAX_ENTRY_BYTES)
  })

  it('rejects a file that is not a zip archive', () => {
    expect(() => listZip(enc.encode('<score-partwise/>'))).toThrow(new ImportError(DAMAGED))
  })

  it('rejects bad offsets as damaged', () => {
    const zip = makeZip([{ name: 'a.txt', data: 'x' }])
    const bad = zip.slice(0, zip.length - 10) // truncate the EOCD
    expect(() => listZip(bad)).toThrow(new ImportError(DAMAGED))
  })
})
