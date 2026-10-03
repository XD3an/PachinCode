// The three big reel cards, for a reach and the moment of the hit.
import { hex, hue, mix } from '../color'
import { BLACK, GOLD, GOLD_DARK, GOLD_LIGHT, WHITE } from './inks'
import { FONT } from './sprites'
import type { LcdView } from './types'


/** The three big reel cards, in the middle: for a reach and the moment of the hit. */
export const paintCards = (
  px: Uint32Array,
  width: number,
  put: (x: number, y: number, color: number) => void,
  get: (x: number, y: number) => number,
  ix0: number,
  iy0: number,
  ix1: number,
  iy1: number,
  view: LcdView,
  scale: 1 | 2,
) => {
  const { frame } = view
  const { card, gap } = lcdSize(scale)
  const total = 3 * card.w + 2 * gap
  const left = Math.round((ix0 + ix1) / 2 - total / 2) + 1
  const top = Math.round((iy0 + iy1) / 2 - card.h / 2) - 1
  view.reels.forEach((reel, i) => {
    const x0 = left + i * (card.w + gap)
    const x1 = x0 + card.w - 1
    const bounce = !reel.isSpinning && reel.sinceStop < 6 ? Math.round(Math.sin((reel.sinceStop / 6) * Math.PI) * 2) : 0
    const y0 = top + bounce
    const y1 = y0 + card.h - 1
    const isFocus = view.mode === 'reach' && i === 1
    const isFever = view.mode === 'fever'

    for (let y = y0 + 1; y < y1; y++) {
      for (let x = x0 + 1; x < x1; x++) put(x, y, mix(get(x, y), hex('#02030f'), 0.62 - 0.18 * ((y - y0) / card.h)))
    }
    const flash = isFocus && frame % 4 < 2 ? hex('#ff2a2a') : undefined
    for (let x = x0; x <= x1; x++) {
      put(x, y0, flash ?? (isFever ? hue((x / 20 + frame / 30) % 1, 0.6) : GOLD_LIGHT))
      put(x, y1, isFocus ? GOLD : GOLD_DARK)
    }
    for (let y = y0 + 1; y < y1; y++) {
      const rim = isFever ? hue((y / 20 + frame / 30) % 1, 0.6) : mix(GOLD_LIGHT, GOLD_DARK, (y - y0) / card.h)
      put(x0, y, flash ?? rim)
      put(x1, y, flash ?? rim)
    }

    const glyphW = 5 * scale
    const glyphH = 7 * scale
    const gx = x0 + Math.floor((card.w - glyphW) / 2)
    const gy = y0 + Math.floor((card.h - glyphH) / 2)
    const drawDigit = (digit: number, dy: number, alpha: number, isShadow: boolean) => {
      const rows = FONT[digit]!
      for (let r = 0; r < glyphH; r++) {
        const row = rows[Math.floor(r / scale)]!
        const y = gy + r + dy + (isShadow ? 1 : 0)
        if (y <= y0 || y >= y1) continue
        const t = r / (glyphH - 1)
        const fill = isShadow
          ? BLACK
          : isFever
            ? hue((t * 0.3 + frame / 40 + i / 3) % 1, 0.6)
            : digit === 7
              ? mix(hex('#fff3a0'), hex('#ff2a2a'), t)
              : mix(WHITE, hex('#6fc3ff'), t)
        for (let c = 0; c < glyphW; c++) {
          if (row[Math.floor(c / scale)] !== '#') continue
          const x = gx + c + (isShadow ? 1 : 0)
          if (x >= 0 && x < width && y >= 0 && y < px.length / width) put(x, y, mix(get(x, y), fill, alpha))
        }
      }
    }
    if (reel.isSpinning) {
      const pitch = card.h - 2
      const dy = Math.round(reel.offset * pitch)
      drawDigit(reel.digit, dy, 0.75, false)
      drawDigit((reel.digit + 1) % 10, dy - pitch, 0.75, false)
      drawDigit(reel.digit, dy - 2, 0.25, false)
    } else {
      drawDigit(reel.digit, 0, 0.85, true)
      drawDigit(reel.digit, 0, 1, false)
    }
  })
}

/** The screen's size for a scale: the cards, the scene around them, the bezel. */
export const lcdSize = (scale: 1 | 2) => {
  const card = { w: 5 * scale + 3, h: 7 * scale + 3 }
  const gap = scale + 1
  return { card, gap, width: 3 * card.w + 2 * gap + 12, height: card.h + 10 }
}
