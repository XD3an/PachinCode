// A tiny PNG writer: RGB, no filtering, stored (uncompressed) deflate blocks.
// Enough for the desktop, which draws the machine as an image rather than cells.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

const crc32 = (bytes: Uint8Array, start: number, end: number) => {
  let c = 0xffffffff
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 255]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const adler32 = (bytes: Uint8Array) => {
  let a = 1
  let b = 0
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]!) % 65521
    b = (b + a) % 65521
  }
  return ((b << 16) | a) >>> 0
}

/** Encodes `px` (0xRRGGBB per pixel, row by row) as PNG bytes. */
export const encodePng = (px: ArrayLike<number>, width: number, height: number): Uint8Array => {
  const stride = width * 3 + 1
  const raw = new Uint8Array(stride * height)
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0
    for (let x = 0; x < width; x++) {
      const color = px[y * width + x]!
      const o = y * stride + 1 + x * 3
      raw[o] = (color >> 16) & 255
      raw[o + 1] = (color >> 8) & 255
      raw[o + 2] = color & 255
    }
  }

  const blocks = Math.max(1, Math.ceil(raw.length / 65535))
  const zlib = new Uint8Array(2 + raw.length + blocks * 5 + 4)
  zlib[0] = 0x78
  zlib[1] = 0x01
  let o = 2
  for (let i = 0; i < blocks; i++) {
    const chunk = raw.subarray(i * 65535, Math.min(raw.length, (i + 1) * 65535))
    zlib[o++] = i === blocks - 1 ? 1 : 0
    zlib[o++] = chunk.length & 255
    zlib[o++] = chunk.length >> 8
    zlib[o++] = ~chunk.length & 255
    zlib[o++] = (~chunk.length >> 8) & 255
    zlib.set(chunk, o)
    o += chunk.length
  }
  const sum = adler32(raw)
  zlib[o++] = sum >>> 24
  zlib[o++] = (sum >>> 16) & 255
  zlib[o++] = (sum >>> 8) & 255
  zlib[o++] = sum & 255

  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  header[8] = 8 // bit depth
  header[9] = 2 // RGB

  const chunks: [string, Uint8Array][] = [['IHDR', header], ['IDAT', zlib], ['IEND', new Uint8Array(0)]]
  const size = 8 + chunks.reduce((n, [, data]) => n + 12 + data.length, 0)
  const out = new Uint8Array(size)
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  const outView = new DataView(out.buffer)
  let p = 8
  for (const [type, data] of chunks) {
    outView.setUint32(p, data.length)
    for (let i = 0; i < 4; i++) out[p + 4 + i] = type.charCodeAt(i)
    out.set(data, p + 8)
    outView.setUint32(p + 8 + data.length, crc32(out, p + 4, p + 8 + data.length))
    p += 12 + data.length
  }
  return out
}
