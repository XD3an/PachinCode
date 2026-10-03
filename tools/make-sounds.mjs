// Synthesizes PachinCode's WAV clips into ../sounds. Run: node tools/make-sounds.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RATE = 22050
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'sounds')
mkdirSync(out, { recursive: true })

let seed = 7
const noise = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return (seed / 0x3fffffff) - 1
}

const buffer = seconds => new Float32Array(Math.ceil(seconds * RATE))
const sine = f => t => Math.sin(2 * Math.PI * f * t)
const square = f => t => (Math.sin(2 * Math.PI * f * t) >= 0 ? 1 : -1)
const saw = f => t => 2 * ((f * t) % 1) - 1
const midi = n => 440 * 2 ** ((n - 69) / 12)

/** Adds a voice: `wave(t)` shaped by `env(t)`, starting at `at` seconds. */
const add = (buf, at, length, wave, env, gain = 1) => {
  const start = Math.floor(at * RATE)
  const n = Math.floor(length * RATE)
  for (let i = 0; i < n && start + i < buf.length; i++) {
    const t = i / RATE
    buf[start + i] += wave(t) * env(t, length) * gain
  }
}
const decay = rate => t => Math.exp(-t * rate)
const adsr = (a, r) => (t, length) => Math.min(1, t / a) * Math.min(1, Math.max(0, (length - t) / r))

// Name clips on the command line to write only those (the running player holds the rest open).
const only = new Set(process.argv.slice(2))
const write = (name, buf, gain = 0.8) => {
  if (only.size > 0 && !only.has(name)) return
  let peak = 0
  for (const v of buf) peak = Math.max(peak, Math.abs(v))
  const scale = peak > 0 ? gain / peak : 0
  const data = Buffer.alloc(44 + buf.length * 2)
  data.write('RIFF', 0)
  data.writeUInt32LE(36 + buf.length * 2, 4)
  data.write('WAVE', 8)
  data.write('fmt ', 12)
  data.writeUInt32LE(16, 16)
  data.writeUInt16LE(1, 20)
  data.writeUInt16LE(1, 22)
  data.writeUInt32LE(RATE, 24)
  data.writeUInt32LE(RATE * 2, 28)
  data.writeUInt16LE(2, 32)
  data.writeUInt16LE(16, 34)
  data.write('data', 36)
  data.writeUInt32LE(buf.length * 2, 40)
  buf.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v * scale)) * 32767), 44 + i * 2))
  writeFileSync(join(out, `${name}.wav`), data)
  console.log(`${name}.wav ${(buf.length / RATE).toFixed(2)}s`)
}

// A steel ball on a brass pin: inharmonic partials, gone in a blink.
{
  const b = buffer(0.09)
  for (const [f, g, d] of [[3150, 1, 70], [4730, 0.6, 90], [7020, 0.35, 120], [9800, 0.15, 160]]) {
    add(b, 0, 0.09, sine(f), decay(d), g)
  }
  add(b, 0, 0.004, noise, () => 1, 0.4)
  write('pin', b, 0.35)
}

// The handle firing: a spring thunk and a short metallic swish.
{
  const b = buffer(0.12)
  add(b, 0, 0.06, sine(140), decay(60), 1)
  let low = 0
  add(b, 0, 0.12, () => (low = low * 0.6 + noise() * 0.4), decay(35), 0.5)
  add(b, 0.005, 0.05, sine(2600), decay(90), 0.15)
  write('launch', b, 0.3)
}

// A weak shot rolling back down the lane.
{
  const b = buffer(0.35)
  add(b, 0, 0.35, t => Math.sin(2 * Math.PI * (900 - 1400 * t) * t), adsr(0.01, 0.15), 0.6)
  add(b, 0.18, 0.08, sine(220), decay(40), 0.5)
  write('foul', b, 0.35)
}

// Into the start pocket: a bright two-note chime.
{
  const b = buffer(0.45)
  add(b, 0, 0.45, sine(midi(88)), decay(9), 1)
  add(b, 0.07, 0.38, sine(midi(93)), decay(9), 1)
  add(b, 0.07, 0.38, sine(midi(105)), decay(14), 0.25)
  write('pocket', b, 0.6)
}

// The reels start: a quick rising run of square blips.
{
  const b = buffer(0.5)
  ;[72, 76, 79, 84, 88, 91].forEach((n, i) => add(b, i * 0.06, 0.07, square(midi(n)), decay(25), 0.5))
  write('spin', b, 0.4)
}

// A reel stops: a clunk with a click on top.
{
  const b = buffer(0.12)
  add(b, 0, 0.1, square(midi(57)), decay(45), 0.6)
  add(b, 0, 0.03, sine(2400), decay(120), 0.4)
  write('stop', b, 0.45)
}

// リーチ: five seconds of tense battle music, quickening, in D minor.
{
  const length = 5
  const b = buffer(length)
  let t = 0
  let beat = 0.2
  const bass = [38, 38, 41, 38, 43, 38, 41, 40]
  const lead = [62, 65, 69, 74, 72, 69, 65, 64]
  let i = 0
  while (t < length - 0.1) {
    add(b, t, beat * 0.9, saw(midi(bass[i % 8])), adsr(0.005, 0.05), 0.5)
    add(b, t, beat * 0.5, square(midi(lead[i % 8] + (t > 3 ? 12 : 0))), adsr(0.005, 0.04), 0.22)
    if (i % 2 === 0) add(b, t, 0.05, noise, decay(60), 0.35)
    t += beat
    beat = Math.max(0.1, beat * 0.975)
    i++
  }
  add(b, length - 0.6, 0.6, t2 => Math.sin(2 * Math.PI * (400 + 1200 * t2) * t2), adsr(0.05, 0.1), 0.35)
  write('reach', b, 0.75)
}

// 大当たり: a brass fanfare over a bell shimmer.
{
  const b = buffer(3.2)
  const brass = f => t => saw(f)(t) * 0.6 + square(f / 2)(t) * 0.2 + Math.sin(2 * Math.PI * f * t * (1 + 0.004 * Math.sin(2 * Math.PI * 6 * t)))
  ;[[0, 72, 0.18], [0.2, 76, 0.18], [0.4, 79, 0.18], [0.6, 84, 0.7], [1.35, 79, 0.16], [1.55, 84, 1.5]].forEach(
    ([at, n, len]) => {
      add(b, at, len, brass(midi(n)), adsr(0.02, 0.12), 0.5)
      add(b, at, len, brass(midi(n - 12)), adsr(0.02, 0.12), 0.25)
    },
  )
  for (let k = 0; k < 24; k++) add(b, 1.5 + k * 0.06, 0.4, sine(midi(96 + ((k * 5) % 12))), decay(8), 0.18)
  add(b, 0, 0.25, noise, decay(12), 0.3)
  write('jackpot', b, 0.85)
}

// A ball into the open gate: a coin.
{
  const b = buffer(0.3)
  add(b, 0, 0.08, sine(1975), decay(30), 0.8)
  add(b, 0.06, 0.24, sine(2637), decay(14), 1)
  add(b, 0.06, 0.24, sine(5274), decay(20), 0.2)
  write('gate', b, 0.4)
}

// The next round of the fever.
{
  const b = buffer(0.6)
  ;[79, 84, 88, 91].forEach((n, i) => add(b, i * 0.08, 0.3, square(midi(n)), decay(10), 0.4))
  write('round', b, 0.5)
}

// 確変突入: a siren sweeping up and down.
{
  const b = buffer(1.6)
  let phase = 0
  const siren = () => {
    let i = 0
    return () => {
      const t = i++ / RATE
      const f = 700 + 500 * Math.sin(2 * Math.PI * 2.5 * t)
      phase += (2 * Math.PI * f) / RATE
      return Math.sin(phase) * 0.7 + (Math.sin(phase * 2) >= 0 ? 0.3 : -0.3)
    }
  }
  add(b, 0, 1.6, siren(), adsr(0.05, 0.3), 0.8)
  write('kakuhen', b, 0.6)
}

// The machine powering on: a deep swell that opens into a chord.
{
  const b = buffer(1.8)
  add(b, 0, 1.8, t => Math.sin(2 * Math.PI * (55 + 30 * t) * t), adsr(0.6, 0.6), 0.6)
  ;[60, 64, 67, 72, 76].forEach((n, i) =>
    add(b, 0.5 + i * 0.08, 1.2, t => sine(midi(n))(t) * 0.7 + saw(midi(n))(t) * 0.15, adsr(0.15, 0.6), 0.35),
  )
  add(b, 0.5, 1.2, sine(midi(96)), decay(3), 0.12)
  write('boot', b, 0.7)
}

// A ball dropping into the tray as Claude writes.
{
  const b = buffer(0.05)
  add(b, 0, 0.05, sine(5200), decay(110), 0.6)
  add(b, 0, 0.05, sine(3400), decay(90), 0.4)
  write('grant', b, 0.18)
}

// ワープ: a ball swallowed by the screen's side and spat onto the stage.
{
  const b = buffer(0.3)
  add(b, 0, 0.3, t => Math.sin(2 * Math.PI * (300 + 2400 * t * t * 10) * t), adsr(0.01, 0.1), 0.5)
  add(b, 0.18, 0.1, sine(1800), decay(30), 0.4)
  write('warp', b, 0.35)
}

// 左打ちに戻してください: a two-tone warning chime, twice.
{
  const b = buffer(0.9)
  for (const at of [0, 0.45]) {
    add(b, at, 0.18, square(988), adsr(0.005, 0.03), 0.5)
    add(b, at + 0.2, 0.2, square(784), adsr(0.005, 0.05), 0.5)
  }
  write('warn', b, 0.4)
}
