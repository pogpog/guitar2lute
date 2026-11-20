import { ImportError } from './musicxml/xml'

export const MAX_ENTRY_BYTES = 20 * 1024 * 1024

export interface ZipEntry {
  name: string
  read(): Promise<Uint8Array>
}

const UNSUPPORTED = "This .mxl file uses a zip feature this app can't read."
const TOO_LARGE = 'This .mxl file is too large to open (over 20 MB unpacked).'
const DAMAGED = 'Could not read this MusicXML file; it may be damaged.'
const NO_INFLATE = "This browser can't open .mxl files; export uncompressed MusicXML instead."

function damaged(): ImportError {
  return new ImportError(DAMAGED)
}

function normaliseName(raw: string): string {
  let name = raw.replace(/\\/g, '/')
  while (name.startsWith('./')) name = name.slice(2)
  return name
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new ImportError(NO_INFLATE)
  let stream: DecompressionStream
  try {
    stream = new DecompressionStream('deflate-raw')
  } catch {
    throw new ImportError(NO_INFLATE)
  }
  const reader = new Blob([data as BlobPart]).stream().pipeThrough(stream).getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.length
      if (total > MAX_ENTRY_BYTES) {
        await reader.cancel().catch(() => undefined)
        throw new ImportError(TOO_LARGE)
      }
      chunks.push(value)
    }
  } catch (e) {
    if (e instanceof ImportError) throw e
    throw damaged()
  }
  const out = new Uint8Array(total)
  let p = 0
  for (const c of chunks) {
    out.set(c, p)
    p += c.length
  }
  return out
}

/** Lists the entries of a zip archive, reading sizes from the central directory. */
export function listZip(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const len = bytes.length

  // End-of-central-directory record: scan backwards, allowing a trailing comment.
  let eocd = -1
  for (let i = len - 22; i >= Math.max(0, len - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw damaged()

  const count = view.getUint16(eocd + 10, true)
  const cdSize = view.getUint32(eocd + 12, true)
  const cdOffset = view.getUint32(eocd + 16, true)
  const zip64Locator = eocd >= 20 && view.getUint32(eocd - 20, true) === 0x07064b50
  if (zip64Locator || count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw new ImportError(UNSUPPORTED)
  }
  if (cdOffset + cdSize > eocd) throw damaged()

  const decoder = new TextDecoder()
  const entries: ZipEntry[] = []
  let p = cdOffset
  for (let n = 0; n < count; n++) {
    if (p + 46 > len || view.getUint32(p, true) !== 0x02014b50) throw damaged()
    const flags = view.getUint16(p + 8, true)
    const method = view.getUint16(p + 10, true)
    const compressedSize = view.getUint32(p + 20, true)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    const localOffset = view.getUint32(p + 42, true)
    if (p + 46 + nameLen + extraLen + commentLen > len) throw damaged()
    const name = normaliseName(decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen)))
    p += 46 + nameLen + extraLen + commentLen

    if (flags & 1 || (method !== 0 && method !== 8)) throw new ImportError(UNSUPPORTED)
    if (localOffset + 30 > len || view.getUint32(localOffset, true) !== 0x04034b50) throw damaged()
    // The local header's own name and extra lengths place the data.
    const dataStart =
      localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true)
    const dataEnd = dataStart + compressedSize
    if (dataEnd > len) throw damaged()

    entries.push({
      name,
      async read() {
        const data = bytes.subarray(dataStart, dataEnd)
        if (method === 0) {
          if (data.length > MAX_ENTRY_BYTES) throw new ImportError(TOO_LARGE)
          return data.slice()
        }
        return inflate(data)
      },
    })
  }
  return entries
}
