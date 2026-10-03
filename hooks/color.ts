// Colors as 0xRRGGBB numbers, as a Raster cell carries them.

export const rgb = (r: number, g: number, b: number) =>
  (Math.max(0, Math.min(255, Math.round(r))) << 16) |
  (Math.max(0, Math.min(255, Math.round(g))) << 8) |
  Math.max(0, Math.min(255, Math.round(b)))

export const hex = (value: string) => Number.parseInt(value.slice(1), 16)

/** `a` toward `b` by `t`, 0 to 1. */
export const mix = (a: number, b: number, t: number) =>
  rgb(
    ((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t,
    ((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t,
    (a & 255) * (1 - t) + (b & 255) * t,
  )

/** A hue from 0 to 1 at a lightness, full saturation. */
export const hue = (h: number, light = 0.5) => {
  const k = (n: number) => (n + h * 12) % 12
  const a = Math.min(light, 1 - light)
  const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
  return rgb(f(0) * 255, f(8) * 255, f(4) * 255)
}

/** A cheap stable hash of a pixel, 0 to 255. */
export const hash = (x: number, y: number) => (((x * 73856093) ^ (y * 19349663)) >>> 0) & 255
