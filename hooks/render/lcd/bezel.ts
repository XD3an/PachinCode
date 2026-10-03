// The gold bezel round the screen, its jewels and its wings.
import { hex, hue, mix } from '../color'
import { BLACK, GOLD, WHITE } from './inks'
import type { LcdBox, LcdView } from './types'


/** The bezel: a gold rim lit from the top left, a black lip, jewels, and wings. */
export const paintBezel = (
  put: (x: number, y: number, color: number) => void,
  box: LcdBox,
  shape: Uint8Array,
  view: LcdView,
) => {
  const { frame } = view
  const w = box.x1 - box.x0 + 1
  const h = box.y1 - box.y0 + 1
  // A gold rim and a black lip inside it, following the shape.
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      const depth = shape[(y - box.y0) * w + (x - box.x0)]
      // One gold all the way round, arch and sides alike.
      if (depth === 1) put(x, y, GOLD)
      else if (depth === 2) put(x, y, BLACK)
    }
  }
  // Jewels at the bottom corners, where the sides meet the arch, and at its crown.
  const arc = box.arc
  const jewels = [
    [box.x0, box.y1 - 1],
    [box.x1 - 1, box.y1 - 1],
    ...(arc ? [[Math.round(arc.cx), box.y0] as const] : []),
  ] as const
  jewels.forEach(([x, y], k) => {
    const color = hue((k / jewels.length + frame / 60) % 1, 0.6)
    put(x, y, mix(color, WHITE, 0.4))
    put(x + 1, y, color)
    put(x, y + 1, color)
    put(x + 1, y + 1, mix(color, BLACK, 0.3))
  })
  const midY = Math.round((box.y0 + box.y1) / 2)
  const wing = view.mode === 'reach' && frame % 4 < 2 ? hex('#ff2a2a') : GOLD
  for (let k = 0; k < 3; k++) {
    for (const side of [-1, 1] as const) {
      const x = side < 0 ? box.x0 - 2 - k : box.x1 + 2 + k
      put(x, midY - 2 + k, wing)
      put(x, midY + 2 - k, wing)
    }
  }
}
