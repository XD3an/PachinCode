// The sky: palettes for each time of day and mood, and the day's turning.
import { hex, mix } from '../color'

export type Palette = { top: number; mid: number; glow: number; sunTop: number; sunBottom: number; grid: number; floor: number }

export const DUSK: Palette = {
  top: hex('#070420'),
  mid: hex('#341058'),
  glow: hex('#ff4f8b'),
  sunTop: hex('#ffe66d'),
  sunBottom: hex('#ff3f8e'),
  grid: hex('#ff2fd0'),
  floor: hex('#12041f'),
}
export const BLOOD: Palette = {
  top: hex('#140000'),
  mid: hex('#560006'),
  glow: hex('#ff3b1f'),
  sunTop: hex('#ffd23f'),
  sunBottom: hex('#ff1a00'),
  grid: hex('#ff6a1f'),
  floor: hex('#1a0300'),
}
export const MORNING: Palette = {
  top: hex('#5a7ad0'),
  mid: hex('#e8a8c8'),
  glow: hex('#ffd8a0'),
  sunTop: hex('#fff6c0'),
  sunBottom: hex('#ffb060'),
  grid: hex('#80b0ff'),
  floor: hex('#2a3048'),
}
export const DAY: Palette = {
  top: hex('#2f7fe0'),
  mid: hex('#79c0ff'),
  glow: hex('#d8f0ff'),
  sunTop: hex('#ffffff'),
  sunBottom: hex('#fff2a0'),
  grid: hex('#5aa8ff'),
  floor: hex('#34405a'),
}
export const MOONLIT: Palette = {
  top: hex('#02010a'),
  mid: hex('#0e0a30'),
  glow: hex('#2a1a5a'),
  sunTop: hex('#ffffff'),
  sunBottom: hex('#c8c8e0'),
  grid: hex('#6a4aff'),
  floor: hex('#06030f'),
}

export const mixPalette = (a: Palette, b: Palette, t: number): Palette => ({
  top: mix(a.top, b.top, t),
  mid: mix(a.mid, b.mid, t),
  glow: mix(a.glow, b.glow, t),
  sunTop: mix(a.sunTop, b.sunTop, t),
  sunBottom: mix(a.sunBottom, b.sunBottom, t),
  grid: mix(a.grid, b.grid, t),
  floor: mix(a.floor, b.floor, t),
})

/** A whole day, from morning round to morning, in frames: about two and a half minutes. */
export const DAY_FRAMES = 4500
/**
 * The day's stops, each with its palette, how dark it is (stars, lit windows, lamps), how
 * high the sun stands (0 on the horizon, 1 high; at night it is the moon), and whether the
 * sun wears its sunset stripes. Between stops everything blends.
 */
export const TIMES: { at: number; palette: Palette; dark: number; sun: number; stripes: number }[] = [
  { at: 0, palette: MORNING, dark: 0.2, sun: 0.15, stripes: 0 },
  { at: 0.12, palette: DAY, dark: 0, sun: 1, stripes: 0 },
  { at: 0.38, palette: DAY, dark: 0, sun: 1, stripes: 0 },
  { at: 0.5, palette: DUSK, dark: 0.6, sun: 0.2, stripes: 1 },
  { at: 0.6, palette: DUSK, dark: 0.7, sun: 0.15, stripes: 1 },
  { at: 0.7, palette: MOONLIT, dark: 1, sun: 0.85, stripes: 0 },
  { at: 0.88, palette: MOONLIT, dark: 1, sun: 0.85, stripes: 0 },
  { at: 1, palette: MORNING, dark: 0.2, sun: 0.15, stripes: 0 },
]

/** The sky at a moment of the day. */
export const skyAt = (frame: number) => {
  const phase = (frame % DAY_FRAMES) / DAY_FRAMES
  const i = TIMES.findIndex((stop, k) => k + 1 < TIMES.length && phase >= stop.at && phase < TIMES[k + 1]!.at)
  const a = TIMES[Math.max(0, i)]!
  const b = TIMES[Math.max(0, i) + 1] ?? a
  const t = b.at > a.at ? (phase - a.at) / (b.at - a.at) : 0
  const ease = t * t * (3 - 2 * t)
  const lerp = (p: number, q: number) => p + (q - p) * ease
  return {
    palette: mixPalette(a.palette, b.palette, ease),
    dark: lerp(a.dark, b.dark),
    sun: lerp(a.sun, b.sun),
    stripes: lerp(a.stripes, b.stripes),
    phase,
    isMoon: a.palette === MOONLIT && b.palette === MOONLIT,
  }
}

export const KAKUHEN: Palette = {
  top: hex('#12000c'),
  mid: hex('#4a0030'),
  glow: hex('#ff2a6a'),
  sunTop: hex('#ffb3c6'),
  sunBottom: hex('#ff0044'),
  grid: hex('#ff3355'),
  floor: hex('#160010'),
}
export const NIGHT: Palette = {
  top: hex('#02010a'),
  mid: hex('#120a35'),
  glow: hex('#3a1a6a'),
  sunTop: hex('#000000'),
  sunBottom: hex('#000000'),
  grid: hex('#d4af37'),
  floor: hex('#06030f'),
}
