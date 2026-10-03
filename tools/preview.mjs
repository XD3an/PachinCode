// Renders machine frames to PNG for a look without a terminal. Bundle the machine first:
//   npx esbuild hooks/machine.ts --bundle --format=esm --outfile=<dir>/machine.mjs
//   MACHINE=file:///<dir>/machine.mjs node tools/preview.mjs <out-dir> [cols] [rows]
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { join } from 'node:path'
const m = await import(process.env.MACHINE ?? '../hooks/machine.ts')

const out = process.argv[2] ?? '.'
const cols = Number(process.argv[3] ?? 70)
const rows = Number(process.argv[4] ?? 36)

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td))
  return Buffer.concat([len, td, c])
}
// Each cell 8x16 px: top half its fg, bottom half its bg; glyph cells drawn as a block of fg on bg.
const png = (cells, cols, rows) => {
  const W = cols * 8, H = rows * 16
  const raw = Buffer.alloc((W * 3 + 1) * H)
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0
    for (let x = 0; x < W; x++) {
      const i = (Math.floor(y / 16) * cols + Math.floor(x / 8)) * 3
      const code = cells[i], fg = cells[i + 1], bg = cells[i + 2]
      let c
      if (code === 0x2580) c = (y % 16) < 8 ? fg : bg
      else c = (x % 8 > 1 && x % 8 < 6 && y % 16 > 3 && y % 16 < 13) ? fg : bg
      const o = y * (W * 3 + 1) + 1 + x * 3
      raw[o] = (c >> 16) & 255; raw[o + 1] = (c >> 8) & 255; raw[o + 2] = c & 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
const shot = (game, name) => {
  const b64 = m.paint(game)
  const cells = new Uint32Array(Buffer.from(b64, 'base64').buffer.slice(0))
  writeFileSync(join(out, name), png(cells, cols, rows))
  console.log(name)
}

{
  const idle = m.newGame({ fired: 0, gate: 0, jackpots: 0 })
  idle.geometry = m.buildGeometry(cols, rows)
  for (let i = 0; i < 400; i++) m.step(idle)
  shot(idle, 'demo.png')
}
const game = m.newGame({ fired: 0, gate: 0, jackpots: 0 })
game.geometry = m.buildGeometry(cols, rows)
game.ammo = () => 999
m.wake(game)
for (let i = 0; i < 20; i++) m.step(game)
shot(game, 'boot.png')
for (let i = 0; i < 60; i++) m.step(game)
game.input = { power: 45, isFiring: true }
for (let i = 0; i < 70; i++) m.step(game)
shot(game, 'play.png')
game.input.isFiring = false
game.odds = 1
game.holds = 1
for (let i = 0; i < 1; i++) m.step(game)
for (let i = 0; i < 125; i++) m.step(game)
shot(game, 'reach.png')
for (let i = 0; i < 30; i++) m.step(game)
shot(game, 'fever.png')
