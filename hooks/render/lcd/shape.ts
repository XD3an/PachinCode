// The screen's outline: which pixels are rim, lip and picture.
import type { LcdBox } from './types'

/**
 * How deep each pixel of the box lies in the screen's shape: 0 outside, 1 the gold rim,
 * 2 the black lip, 3 the picture. Kept per box, since a box keeps its shape.
 */
export const depths = new Map<string, Uint8Array>()
export const depthsOf = (box: LcdBox) => {
  const key = JSON.stringify(box)
  const known = depths.get(key)
  if (known !== undefined) return known
  const w = box.x1 - box.x0 + 1
  const h = box.y1 - box.y0 + 1
  const inShape = (x: number, y: number) =>
    x >= box.x0 &&
    x <= box.x1 &&
    y >= box.y0 &&
    y <= box.y1 &&
    (box.arc === undefined || y >= box.arc.cy || Math.hypot(x - box.arc.cx, y - box.arc.cy) <= box.arc.r)
  // Every neighbour, diagonals too, so the rim runs unbroken round the curve, as thick
  // there as along the straight sides.
  const ring = (x: number, y: number, k: number) => {
    for (let dy = -k; dy <= k; dy++) {
      for (let dx = -k; dx <= k; dx++) if (!inShape(x + dx, y + dy)) return false
    }
    return true
  }
  const out = new Uint8Array(w * h)
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      out[(y - box.y0) * w + (x - box.x0)] = !inShape(x, y) ? 0 : !ring(x, y, 1) ? 1 : !ring(x, y, 2) ? 2 : 3
    }
  }
  if (depths.size > 8) depths.clear()
  depths.set(key, out)
  return out
}
