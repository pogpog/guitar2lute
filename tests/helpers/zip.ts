import { crc32, deflateRawSync } from 'node:zlib'

export interface ZipInput {
  name: string
  data: Uint8Array | string
  method?: 0 | 8
  dataDescriptor?: boolean
  localExtra?: Uint8Array
  centralExtra?: Uint8Array
  flags?: number
  /** Overrides the uncompressed size written to the central directory. */
  declaredSize?: number
}

function u16(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff]
}
function u32(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]
}

/** Builds a zip archive byte by byte, so tests can create awkward shapes. */
export function makeZip(
  entries: ZipInput[],
  opts: { comment?: string; methodOverride?: number } = {},
): Uint8Array {
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  const push = (b: Uint8Array | number[]) => {
    const u = b instanceof Uint8Array ? b : Uint8Array.from(b)
    parts.push(u)
    offset += u.length
  }

  for (const e of entries) {
    const raw = typeof e.data === 'string' ? enc.encode(e.data) : e.data
    const method = e.method ?? 8
    const stored = method === 0 ? raw : new Uint8Array(deflateRawSync(raw))
    const crc = crc32(raw)
    const name = enc.encode(e.name)
    const localExtra = e.localExtra ?? new Uint8Array(0)
    const centralExtra = e.centralExtra ?? new Uint8Array(0)
    const dd = e.dataDescriptor ?? false
    const flags = (e.flags ?? 0) | (dd ? 0x8 : 0)
    const wireMethod = opts.methodOverride ?? method
    const usize = e.declaredSize ?? raw.length
    const localOffset = offset

    push([
      ...u32(0x04034b50), ...u16(20), ...u16(flags), ...u16(wireMethod), ...u16(0), ...u16(0x21),
      ...u32(dd ? 0 : crc), ...u32(dd ? 0 : stored.length), ...u32(dd ? 0 : usize),
      ...u16(name.length), ...u16(localExtra.length),
    ])
    push(name)
    push(localExtra)
    push(stored)
    if (dd) push([...u32(0x08074b50), ...u32(crc), ...u32(stored.length), ...u32(raw.length)])

    central.push(
      Uint8Array.from([
        ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(flags), ...u16(wireMethod),
        ...u16(0), ...u16(0x21), ...u32(crc), ...u32(stored.length), ...u32(usize),
        ...u16(name.length), ...u16(centralExtra.length), ...u16(0), ...u16(0), ...u16(0),
        ...u32(0), ...u32(localOffset), ...name, ...centralExtra,
      ]),
    )
  }

  const cdStart = offset
  for (const c of central) push(c)
  const cdSize = offset - cdStart
  const comment = enc.encode(opts.comment ?? '')
  push([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length),
    ...u32(cdSize), ...u32(cdStart), ...u16(comment.length),
  ])
  push(comment)

  const out = new Uint8Array(offset)
  let p = 0
  for (const part of parts) {
    out.set(part, p)
    p += part.length
  }
  return out
}
