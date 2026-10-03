// The centre screen (液晶) and its theme: the Claude Code mascot walking a neon road into the
// sunset. The reels sit small in a corner while the story plays; a reach brings them to the
// middle as the mascot squares up to a bug, and the jackpot ends the walk in fireworks.
import { hash, hex, hue, mix } from '../color'
import { paintBezel } from './bezel'
import { lcdSize, paintCards } from './cards'
import { BLACK, CLAUDE, CLAUDE_DARK, CLAUDE_LIGHT, GOLD, WHITE } from './inks'
import { depthsOf } from './shape'
import { BLOOD, KAKUHEN, NIGHT, mixPalette, skyAt } from './sky'
import { BUG, MASCOT, SMALL, within } from './sprites'
import type { LcdBox, LcdView } from './types'

/** How long the jackpot's rays and big 777 hold before the fireworks. */
export const HIT_SCENE = 60


/** Paints the screen into `px` (row-major, `width` wide) inside `box`, bezel included. */
export const paintLcd = (px: Uint32Array, width: number, box: LcdBox, view: LcdView, scale: 1 | 2) => {
  const height = px.length / width
  const put = (x: number, y: number, color: number) => {
    if (x >= 0 && x < width && y >= 0 && y < height) px[y * width + x] = color
  }
  const get = (x: number, y: number) => px[y * width + x] ?? BLACK
  const shape = depthsOf(box)
  const boxWidth = box.x1 - box.x0 + 1
  /** True for a pixel of the picture, inside the rim and lip. */
  const isScreen = (x: number, y: number) =>
    x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1 && shape[(y - box.y0) * boxWidth + (x - box.x0)] === 3
  const blend = (x: number, y: number, color: number, alpha: number) => {
    if (isScreen(x, y)) put(x, y, mix(get(x, y), color, alpha))
  }
  const { frame } = view

  const ix0 = box.x0 + 2
  const iy0 = box.y0 + 2
  const ix1 = box.x1 - 2
  const iy1 = box.y1 - 2
  const iw = ix1 - ix0 + 1
  const ih = iy1 - iy0 + 1
  const cx = Math.round((ix0 + ix1) / 2)
  const cy = (iy0 + iy1) / 2
  const horizonY = iy0 + Math.round(ih * 0.5)
  const isCelebration = view.mode === 'fever' && view.feverAge >= HIT_SCENE
  const isRays = view.mode === 'fever' && !isCelebration
  // The time of day, tinted by kakuhen's red and overcast by a reach's storm, each blended
  // in by how far it has come; the jackpot's night has its own sky.
  const sky = skyAt(frame)
  const storm = view.storm
  const tinted = mixPalette(mixPalette(sky.palette, KAKUHEN, view.redness * 0.7), BLOOD, storm)
  const isOwnSky = !isCelebration
  const palette = isCelebration ? NIGHT : tinted
  const dark = isCelebration ? 1 : Math.max(sky.dark, storm, view.redness * 0.6)
  const sunRise = sky.sun * (1 - storm)
  const stripes = Math.max(sky.stripes, storm)
  // Big and low at sunrise and sunset, smaller as it climbs; the moon smaller still.
  const sunRadius = ih * (isOwnSky && sky.isMoon ? 0.14 : 0.26 - 0.12 * sunRise)
  // The sun climbs from the horizon as the morning goes on.
  const sunY = horizonY - sunRise * (horizonY - iy0 - sunRadius - 1)
  // The road runs faster in a reach.
  const speed = view.mode === 'reach' ? 0.14 : view.mode === 'idle' ? 0.05 : 0.08

  // The skyline: two layers of towers, the far one slow, the near one quicker.
  const skyline = (x: number, layer: 0 | 1) => {
    // Far off on the horizon, the city holds still: nobody here moves sideways.
    const scroll = layer === 0 ? 0 : 7
    const wide = layer === 0 ? 4 : 5
    const world = x + scroll
    const tower = Math.floor(world / wide)
    const tall = layer === 0 ? 2 + (hash(tower, 11) % 5) : 1 + (hash(tower, 23) % 7)
    const isGap = layer === 1 && hash(tower, 31) % 4 === 0
    return { tall: isGap ? 0 : tall, column: world % wide, tower }
  }

  // ---- The scene ----
  for (let y = iy0; y <= iy1; y++) {
    for (let x = ix0; x <= ix1; x++) {
      if (!isScreen(x, y)) continue
      let color: number
      if (isRays) {
        // The hit: rays wheeling round the centre, in every colour.
        const angle = Math.atan2(y - cy, (x - cx) * 0.8)
        const ray = Math.floor(((angle + Math.PI) / (Math.PI / 8) + frame * 0.12) % 2)
        const d = Math.hypot(x - cx, (y - cy) * 1.6) / iw
        color = ray === 0 ? hue(((angle / Math.PI + 1) / 2 + frame / 90) % 1, 0.55) : hex('#1a0630')
        color = mix(color, hex('#fff6c2'), Math.max(0, 0.6 - d * 2))
      } else if (y < horizonY) {
        // Sky, stars, the sun, then the city in front of it.
        const t = (y - iy0) / (horizonY - iy0)
        color = t < 0.6 ? mix(palette.top, palette.mid, t / 0.6) : mix(palette.mid, palette.glow, (t - 0.6) / 0.4)
        const h = hash(x, y)
        // Stars, only as the sky darkens.
        if (t < 0.7 && h < (isCelebration ? 10 : 7) && dark > 0.4) {
          color = mix(color, WHITE, (dark - 0.4) * (0.4 + 1.1 * ((Math.sin(frame / 5 + h) + 1) / 2)))
        }
        // Clouds drifting by in the daylight.
        if (dark < 0.5 && t < 0.55) {
          const puff = hash(Math.floor((x + frame * 0.03) / 6), Math.floor(y / 3))
          if (puff < 22) color = mix(color, WHITE, (0.5 - dark) * 1.2)
        }
        if (!isCelebration) {
          const dx = x - cx
          const dy = sunY - y
          const d = Math.hypot(dx * 0.85, dy)
          // The sunset sun wears stripes across its lower half; the morning one is whole.
          const isStripe = stripes > 0.5 && horizonY - y < sunRadius * 0.6 && (horizonY - y) % 3 === 1
          if (d <= sunRadius && !isStripe) color = mix(palette.sunBottom, palette.sunTop, Math.min(1, (dy + sunRadius) / (2 * sunRadius)))
          else if (d <= sunRadius + 2.5) color = mix(color, palette.glow, 0.35)
        }
        const above = horizonY - y
        for (const layer of [0, 1] as const) {
          const tower = skyline(x, layer)
          if (above > tower.tall) continue
          // By day the towers stand pale blue in the haze; by night they are silhouettes.
          const nightBase = layer === 0 ? mix(palette.mid, BLACK, 0.45) : mix(palette.top, BLACK, 0.3)
          const dayBase = layer === 0 ? hex('#8aa8d8') : hex('#4a6290')
          const base = mix(dayBase, nightBase, dark)
          color = base
          // Lit windows, a few blinking.
          const isWindow = tower.column % 2 === 1 && above % 2 === 0 && above > 0
          const lit = hash(tower.tower * 7 + above, layer + 3)
          if (isWindow && lit < (layer === 0 ? 60 : 110)) {
            // Windows light up as evening comes, a few blinking.
            const isOn = lit / 255 < dark * 1.2 && (lit % 9 !== 0 || Math.floor(frame / 20 + lit) % 3 !== 0)
            if (isOn) color = isCelebration ? GOLD : layer === 0 ? hex('#7a3a8a') : lit % 2 ? hex('#ffd36b') : hex('#6fe7ff')
          }
        }
      } else {
        // The ground: a road running to the horizon, a neon grid either side of it.
        const depth = y - horizonY + 1
        const t = depth / (iy1 - horizonY + 1)
        const roadHalf = 1 + depth * 1.3
        const fromMiddle = Math.abs(x - cx)
        // Walking forward: the ground runs toward us.
        const row = (7 / depth + view.travel * speed) % 1
        if (fromMiddle <= roadHalf) {
          // Asphalt, lighter toward the viewer, with a dashed centre line flowing past.
          color = mix(hex('#140c1e'), hex('#2a2238'), t)
          if (hash(x, y) < 24) color = mix(color, hex('#3a3050'), 0.6)
          if (fromMiddle < 0.6 + depth * 0.04 && row < 0.5) color = hex('#ffd36b')
          if (roadHalf - fromMiddle < 1) color = mix(hex('#6fe7ff'), WHITE, 0.2)
        } else {
          color = mix(palette.floor, palette.glow, 0.18 * (1 - t))
          const lane = ((x - cx) / depth) * 2.2
          const isColumn = Math.abs(lane - Math.round(lane)) * depth < 0.55
          const isRow = row < 0.16 + 0.1 * t
          if (isColumn || isRow) color = mix(palette.grid, WHITE, isColumn && isRow ? 0.4 : 0)
          color = mix(color, palette.floor, 0.35 * (1 - t))
        }
        if (depth === 1) color = mix(palette.glow, WHITE, 0.5)
      }

      // The storm's clouds: a lid of churning grey over the sky as it gathers.
      if (storm > 0 && y < horizonY) {
        const cloud = hash(Math.floor((x + frame * 0.4) / 4), Math.floor((y - iy0) / 2))
        const reach = (horizonY - iy0) * storm * 0.7
        if (y - iy0 < reach && cloud < 170) color = mix(color, cloud < 60 ? hex('#1a1420') : hex('#3a3040'), 0.75 * storm)
      }

      // リーチ: speed lines bursting out of the centre.
      if (view.mode === 'reach' && storm > 0.8) {
        const angle = Math.atan2(y - cy, (x - cx) * 0.7)
        const bin = Math.floor((angle + Math.PI) * 16)
        if (Math.hypot(x - cx, y - cy) > ih * 0.4 && hash(bin, frame >> 1) < 40) color = mix(color, WHITE, 0.3)
      }
      if (y % 2 === 1) color = mix(color, BLACK, 0.1)
      put(x, y, color)
    }
  }

  /** Rain streaks slanting down the whole screen, as heavy as `amount`. */
  const drawRain = (amount: number) => {
    for (let k = 0; k < Math.round(40 * amount); k++) {
      const x = ix0 + ((hash(k, 41) + frame * 2) % iw)
      const y = iy0 + ((hash(k, 42) + frame * 3) % ih)
      blend(x, y, hex('#a8c0e8'), 0.6)
      blend(x - 1, y - 1, hex('#a8c0e8'), 0.35)
    }
  }

  // ---- Street lamps, coming on and passing by ----
  if (!isRays && !isCelebration) {
    const lamps = 3
    for (let k = 0; k < lamps; k++) {
      // Each lamp rises from the horizon and comes on, slowly at first and quicker as it
      // nears, then passes by: the walk goes forward, toward the city.
      const t = (view.travel * speed * 0.35 + k / lamps) % 1
      const near = t ** 2
      const depth = 1 + near * (iy1 - horizonY)
      const footY = Math.round(horizonY - 1 + depth)
      const tall = Math.max(1, Math.round(1 + near * ih * 0.45))
      for (const side of [-1, 1] as const) {
        const footX = Math.round(cx + side * (1 + depth * 1.3 + 1 + near * 3))
        for (let dy = 0; dy < tall; dy++) blend(footX, footY - dy, hex('#7d879b'), 0.9)
        // The lamp's head, glowing over the road.
        const headX = footX - side * Math.max(1, Math.round(near * 2))
        blend(headX, footY - tall, dark > 0.4 ? hex('#fff1b0') : hex('#c8ccd8'), 1)
        if (near > 0.3 && dark > 0.4) {
          blend(headX, footY - tall + 1, hex('#ffd36b'), 0.5)
          blend(headX - side, footY - tall, hex('#ffd36b'), 0.4)
        }
      }
    }
  }

  // ---- The Claude Code mascot ----
  /**
   * The mascot, `scale` pixels to the icon's unit, its feet on `bottom`. `step` lifts
   * alternate legs as it walks; `isAngry` narrows its eyes for a fight.
   */
  type Look = { body?: number; light?: number; hasCrown?: boolean }
  const drawMascot = (centre: number, bottom: number, scale: number, step: number, isAngry: boolean, look: Look = {}) => {
    const w = Math.round(24 * scale)
    const h = Math.round(15 * scale)
    const left = Math.round(centre - w / 2)
    const top = bottom - h + 1
    // Its shadow on the road.
    for (let px = Math.round(w * 0.1); px < Math.round(w * 0.9); px++) {
      blend(left + px, bottom + 1, BLACK, 0.45)
    }
    const at = (px: number, py: number) => {
      // Sample the icon at the pixel's centre; the icon's own top is at unit 5.
      const ux = (px + 0.5) / scale
      const uy = (py + 0.5) / scale + 5
      if (MASCOT.eyes.some(r => within([r[0] - 0.45, r[1], r[2] + 0.45, r[3]], ux, uy))) return isAngry && uy < 9.4 ? 'body' : 'eye'
      if (within(MASCOT.body, ux, uy) || MASCOT.arms.some(r => within(r, ux, uy))) return 'body'
      const leg = MASCOT.legs.findIndex(r => within(r, ux, uy))
      if (leg >= 0) return (leg + step) % 2 === 1 && uy > 19 ? null : 'body'
      return null
    }
    // A dark rim first, so it reads against anything behind it.
    for (let py = -1; py <= h; py++) {
      for (let px = -1; px <= w; px++) {
        if (at(px, py) !== null) continue
        const isNext = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(px + dx!, py + dy!) !== null)
        if (isNext) blend(left + px, top + py, CLAUDE_DARK, 0.85)
      }
    }
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const part = at(px, py)
        if (part === null) continue
        const color = part === 'eye' ? hex('#1a0a05') : py === 0 ? (look.light ?? CLAUDE_LIGHT) : (look.body ?? CLAUDE)
        blend(left + px, top + py, color, 1)
      }
    }
  }
  /** A gold crown with jewels, for the premium jackpot, sitting on the mascot's head. */
  const drawCrown = (centre: number, top: number) => {
    const rows = ['#.#.#', '#####', '#####'] as const
    rows.forEach((row, dy) => {
      ;[...row].forEach((cell, dx) => {
        if (cell === '#') blend(Math.round(centre) - 2 + dx, top - 3 + dy, dy === 2 && dx % 2 === 1 ? hex('#ff2a6a') : GOLD, 1)
      })
    })
  }
  const drawBug = (left: number, top: number) => {
    BUG.forEach((row, dy) => {
      ;[...row].forEach((cell, dx) => {
        if (cell === '.') return
        const color = cell === 'e' ? hex('#ff2020') : cell === 'l' ? hex('#2f7a1a') : hex('#7cfc00')
        blend(left + dx, top + dy, color, 1)
      })
    })
  }
  if (!isRays) {
    // As large as the screen lets it be crisp: the icon's own size, or two thirds of it.
    const scale = ih >= 30 && iw >= 44 ? 0.75 : 0.6
    const pace = view.mode === 'spin' || view.mode === 'reach' ? 3 : 6
    const isWaiting = view.scene?.kind === 'light' && view.scene.age >= 30 && view.scene.age < 110
    const step = isWaiting ? 0 : Math.floor(view.travel / pace) % 2
    // Little scenes and the gold premonition change how the mascot moves and shines.
    const scene = view.scene
    const isJumping = scene?.kind === 'jump'
    const isGolden = view.notice?.kind === 'mascot' && view.notice.age < 90
    const golden: Look = isGolden ? { body: frame % 6 < 3 ? GOLD : hex('#ffe680'), light: WHITE } : {}
    if (isCelebration) {
      // The jackpot: it hops over the celebration, crowned for the premium one.
      const hop = Math.round(Math.abs(Math.sin(frame / 6)) * ih * 0.25)
      const mx = cx + Math.sin(frame / 20) * iw * 0.2
      const bottom = iy1 - 2 - hop
      const look: Look = view.prize === 'premium' ? { body: frame % 8 < 4 ? CLAUDE : hex('#f0a07a') } : {}
      drawMascot(mx, bottom, scale, step, false, look)
      if (view.prize === 'premium') drawCrown(mx, bottom - Math.round(15 * scale) + 1)
    } else if (view.mode === 'reach') {
      // A reach: the mascot squares up to a bug, lightning crackling between them. Once it
      // is decided, the bug is squashed flat, or it dances while the mascot sweats.
      const mx = cx - iw * 0.22
      const bx = Math.round(cx + iw * 0.3 - 3 + (frame % 4 < 2 && view.outcome === null ? 1 : 0))
      const by = iy1 - BUG.length
      const cheer = view.outcome === 'hit' ? Math.round(Math.abs(Math.sin(frame / 4)) * 3) : 0
      drawMascot(mx, iy1 - 1 - cheer, scale * 0.8, step, view.outcome === null, golden)
      if (view.outcome === 'hit') {
        for (let dx = 0; dx < 7; dx++) blend(bx + dx, iy1 - 1, hex('#4a6a3a'), 1)
        blend(bx + 1, iy1 - 2, hex('#7a8a6a'), 1)
        blend(bx + 5, iy1 - 2, hex('#7a8a6a'), 1)
      } else if (view.outcome === 'miss') {
        const hop = Math.round(Math.abs(Math.sin(frame / 3)) * 3)
        drawBug(bx, by - hop)
        // A bead of sweat on the mascot's brow.
        blend(Math.round(mx + 7 * scale), iy1 - Math.round(12 * scale * 0.8) + (frame % 12 < 6 ? 0 : 1), hex('#6fc3ff'), 1)
      } else {
        drawBug(bx, by)
      }
      if (frame % 3 !== 0 && view.outcome === null) {
        let y = Math.round(iy1 - 6 * scale)
        for (let x = Math.round(mx + 10 * scale); x < bx; x++) {
          y += (hash(x, frame) % 3) - 1
          blend(x, y, hex('#fff6a0'), 0.9)
        }
      }
    } else {
      // The walk: down the middle of the road, bobbing in step; a happy jump now and then.
      const mx = cx + Math.sin(frame / 50) * 2
      const jump = isJumping ? Math.round(Math.sin((scene.age / 30) * Math.PI) * ih * 0.3) : 0
      const bottom = iy1 - 2 - step - jump
      for (let k = 1; k <= 4; k++) {
        blend(Math.round(mx + (hash(k, frame >> 2) % 9) - 4), iy1 - 1, hue((frame / 30 + k / 4) % 1, 0.7), 0.6)
      }
      drawMascot(mx, bottom, scale, isJumping ? 0 : step, false, golden)
      // Mornings start with coffee: a mug in its right hand, steam curling up.
      if (isOwnSky && sky.phase < 0.16 && storm === 0) {
        const mugX = Math.round(mx + 12 * scale) + 1
        const mugY = bottom - Math.round(5 * scale)
        for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 2; dx++) blend(mugX + dx, mugY + dy, WHITE, 1)
        blend(mugX + 2, mugY + 1, WHITE, 1)
        blend(mugX, mugY, hex('#6a3a1a'), 1)
        blend(mugX + 1, mugY, hex('#6a3a1a'), 1)
        blend(mugX + (frame % 20 < 10 ? 0 : 1), mugY - 2, hex('#d0d0e0'), 0.6)
      }
      // Sparkles round it when it jumps or turns gold.
      if (isJumping || isGolden) {
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2 + frame / 6
          const r = 13 * scale + (frame % 6)
          blend(Math.round(mx + Math.cos(a) * r), Math.round(bottom - 7 * scale + Math.sin(a) * r * 0.6), isGolden ? GOLD : hue(k / 8, 0.7), 0.9)
        }
      }
    }
  }

  // ---- The storm's lightning and rain ----
  if (view.storm > 0.3 && !isCelebration) {
    // Now and then a bolt, and the sky flashes with it.
    if (hash(Math.floor(frame / 3), 77) < 18 * view.storm) {
      let x = ix0 + 4 + (hash(Math.floor(frame / 3), 78) % Math.max(1, iw - 8))
      for (let y = iy0; y < horizonY; y++) {
        x += (hash(x, y + frame) % 3) - 1
        blend(x, y, WHITE, 1)
      }
      for (let y = iy0; y < horizonY; y++) for (let x2 = ix0; x2 <= ix1; x2++) blend(x2, y, hex('#d8d0ff'), 0.25)
    }
    drawRain(view.storm)
  }

  // ---- Little scenes ----
  const scene = view.scene
  if (scene !== null && !isRays && !isCelebration && view.mode !== 'reach') {
    const { kind, age } = scene
    if (kind === 'cat') {
      // A white cat trots across the front of the road, eyes shining.
      const x = ix0 - 5 + Math.floor((age / 75) * (iw + 10))
      const y = iy1 - 1
      const legs = Math.floor(age / 4) % 2
      for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [3, 0], [3, -1], [4, -1], [4, -2], [0, -1]] as const) {
        blend(x + dx, y + dy, dx === 1 && dy === 0 ? hex('#f0a050') : hex('#f4f4f8'), 1)
      }
      blend(x + 4, y - 1, hex('#2a9a3a'), 1)
      blend(x + (legs ? 0 : 1), y + 1, hex('#f4f4f8'), 1)
      blend(x + (legs ? 3 : 2), y + 1, hex('#f4f4f8'), 1)
    } else if (kind === 'balloon') {
      // A red balloon drifts up out of the city.
      const x = Math.round(ix0 + iw * 0.2 + Math.sin(age / 8) * 2)
      const y = Math.round(iy1 - (age / 100) * (ih + 6))
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [-1, -1]] as const) {
        blend(x + dx, y + dy, dy < 0 && dx < 0 ? hex('#ff8a8a') : hex('#ff2a3a'), 1)
      }
      for (let k = 2; k < 5; k++) blend(x + (k % 2), y + k, hex('#d0d0d0'), 0.8)
    } else if (kind === 'light') {
      // A traffic light comes up the roadside and stops the walk: red, amber, then green.
      // It halts part way down the road, in full view, then carries on past once green.
      const STOP = 0.6
      const near = age < 30 ? STOP * (age / 30) ** 2 : age < 110 ? STOP : STOP + ((age - 110) / 50) ** 2 * 1.2
      const depth = 1 + Math.min(near, 1) * (iy1 - horizonY - 2)
      const footY = Math.round(horizonY - 1 + depth)
      const poleX = Math.round(cx + 1 + depth * 1.3 + 2 + near * 2)
      const tall = Math.max(2, Math.round(2 + Math.min(near, 1) * ih * 0.4))
      for (let dy = 0; dy < tall; dy++) blend(poleX, footY - dy, hex('#5a6070'), 1)
      // The head: a dark box of three lamps.
      const headTop = footY - tall - 6
      for (let dy = 0; dy < 7; dy++) for (let dx = -1; dx <= 1; dx++) blend(poleX + dx, headTop + dy, hex('#141418'), 1)
      const lit = age < 95 ? 0 : age < 110 ? 1 : 2
      const colors = [hex('#ff2a2a'), hex('#ffb020'), hex('#2aff6a')]
      colors.forEach((color, k) => {
        const isLit = k === lit && (age >= 30 || k === 2)
        blend(poleX, headTop + 1 + k * 2, isLit ? color : mix(color, BLACK, 0.75), 1)
        if (isLit) blend(poleX - 2, headTop + 1 + k * 2, color, 0.4)
      })
    } else if (kind === 'rain') {
      // A rain cloud drifts over, it pours for a while, then the sky clears again.
      const amount = Math.min(1, age / 40, (240 - age) / 50)
      for (let y = iy0; y < iy0 + Math.round((horizonY - iy0) * 0.45); y++) {
        for (let x = ix0; x <= ix1; x++) {
          const puff = hash(Math.floor((x + frame * 0.2) / 5), Math.floor((y - iy0) / 2))
          if (puff < 200) blend(x, y, puff < 90 ? hex('#5a6070') : hex('#8a90a0'), 0.7 * amount)
        }
      }
      drawRain(amount * 0.8)
    } else if (kind === 'birds') {
      // A flock in a V, flying across the sky, wings beating.
      const lead = ix0 - 4 + Math.floor((age / 90) * (iw + 16))
      const top = iy0 + Math.round((horizonY - iy0) * 0.3)
      for (let b = 0; b < 5; b++) {
        const bx = lead - Math.ceil(b / 2) * 3
        const by = top + (b === 0 ? 0 : Math.ceil(b / 2)) * (b % 2 ? 1 : -1) + (b === 0 ? 0 : Math.ceil(b / 2))
        const wing = Math.floor((frame + b * 3) / 4) % 2 ? -1 : 0
        blend(bx, by, hex('#1a1a24'), 1)
        blend(bx - 1, by + wing, hex('#1a1a24'), 1)
        blend(bx + 1, by + wing, hex('#1a1a24'), 1)
      }
    } else if (kind === 'meteors') {
      // A shower of shooting stars.
      for (let m = 0; m < 4; m++) {
        const t = age - m * 10
        if (t < 0 || t > 20) continue
        const sx = ix1 - t * 2 - m * 5
        const sy = iy0 + 1 + m * 2 + Math.floor(t * 0.5)
        for (let k = 0; k < 5; k++) blend(sx + k, sy - Math.floor(k / 2), WHITE, 1 - k / 5)
      }
    }
  }

  // ---- Premonitions (予告) ----
  const notice = view.notice
  if (notice !== null && !isRays && !isCelebration) {
    const { kind, age } = notice
    if (kind === 'star' && age < 24) {
      // A shooting star across the sky.
      const sx = ix1 - age * 2
      const sy = iy0 + 1 + Math.floor(age * 0.5)
      for (let k = 0; k < 6; k++) blend(sx + k, sy - Math.floor(k / 2), WHITE, 1 - k / 6)
    } else if (kind === 'ufo' && age < 60) {
      // A saucer crossing, its beam sweeping the city.
      const ux = ix0 - 6 + Math.floor(age * ((iw + 12) / 60))
      const uy = iy0 + 2
      for (let dx = 0; dx < 7; dx++) blend(ux + dx, uy + 1, hex('#9aa4b8'), 1)
      for (let dx = 2; dx < 5; dx++) blend(ux + dx, uy, hex('#7af7ff'), 1)
      for (let dx = 1; dx < 6; dx += 2) blend(ux + dx, uy + 1, hue((frame / 8 + dx / 7) % 1, 0.6), 1)
      if (age % 8 < 6) {
        for (let dy = 2; dy < horizonY - uy; dy++) {
          for (let dx = 3 - Math.floor(dy / 3); dx <= 3 + Math.floor(dy / 3); dx++) blend(ux + dx, uy + dy, hex('#7af7ff'), 0.25)
        }
      }
    } else if (kind === 'gold' && age < 45) {
      // The gold cut-in: a flash, then the screen washed in gold.
      const strength = age < 6 ? 0.85 : 0.35 * (1 - (age - 6) / 39)
      for (let y = iy0; y <= iy1; y++) for (let x = ix0; x <= ix1; x++) blend(x, y, age < 6 ? WHITE : GOLD, strength)
    }
  }

  // ---- The celebration, one for each kind of jackpot ----
  if (isCelebration) {
    const age = view.feverAge - HIT_SCENE
    if (view.prize !== 'normal') {
      // Fireworks: every colour for the premium jackpot, reds and golds for kakuhen.
      for (let j = 0; j < 3; j++) {
        const burst = Math.floor(age / 10) - j
        if (burst < 0) continue
        const t = age - burst * 10
        if (t > 22) continue
        const bx = ix0 + 4 + (hash(burst, 1) % Math.max(1, iw - 8))
        const by = iy0 + 3 + (hash(burst, 2) % Math.max(1, horizonY - iy0 - 6))
        const color = view.prize === 'premium' ? hue(hash(burst, 3) / 255, 0.6) : burst % 2 ? hex('#ff2a3a') : GOLD
        const fade = 1 - t / 22
        for (let k = 0; k < 14; k++) {
          const a = (k / 14) * Math.PI * 2
          const r = Math.min(t, 12) * 0.55
          blend(Math.round(bx + Math.cos(a) * r * 1.2), Math.round(by + Math.sin(a) * r + t * t * 0.006), color, fade)
        }
        if (t < 3) blend(bx, by, WHITE, 1)
      }
    }
    if (view.prize === 'premium') {
      // A rain of gold coins over everything.
      for (let k = 0; k < 18; k++) {
        const x = ix0 + (hash(k, 7) % iw)
        const y = iy0 + ((hash(k, 9) + age * (1 + (k % 3))) % ih)
        blend(x, y, frame % 4 < 2 && k % 3 === 0 ? WHITE : GOLD, 1)
        blend(x, y - 1, hex('#8a6a10'), 0.6)
      }
    }
    if (view.prize === 'normal') {
      // Confetti, tumbling down in every colour.
      for (let k = 0; k < 24; k++) {
        const x = ix0 + ((hash(k, 5) + Math.round(Math.sin((age + k * 7) / 6) * 2)) % iw)
        const y = iy0 + ((hash(k, 6) + Math.floor(age * 0.6)) % ih)
        blend(x, y, hue(hash(k, 8) / 255, 0.6), 1)
      }
    }
  }

  // ---- The reels ----
  const isBig = view.mode === 'reach' || isRays
  if (isBig) {
    // A reach keeps the cards modest so the duel shows; the hit's 777 takes the screen.
    paintCards(px, width, put, get, ix0, iy0, ix1, iy1 - (isRays ? 0 : 6), view, isRays ? scale : 1)
  } else {
    // Small, in the bottom-left corner, on a dark plate.
    const left = ix0 + 1
    const top = iy1 - 6
    for (let y = top - 1; y <= top + 5; y++) for (let x = left - 1; x <= left + 12; x++) blend(x, y, BLACK, 0.55)
    view.reels.forEach((reel, i) => {
      const x0 = left + i * 4
      const draw = (digit: number, dy: number, alpha: number) => {
        SMALL[digit]!.forEach((row, r) => {
          const y = top + r + dy
          if (y < top || y > top + 4) return
          ;[...row].forEach((cell, c) => {
            if (cell !== '#') return
            const color = view.mode === 'fever' ? hue((i / 3 + frame / 30) % 1, 0.6) : digit === 7 ? hex('#ffd36b') : WHITE
            blend(x0 + c, y, color, alpha)
          })
        })
      }
      if (reel.isSpinning) {
        const dy = Math.round(reel.offset * 6)
        draw(reel.digit, dy, 0.8)
        draw((reel.digit + 1) % 10, dy - 6, 0.8)
      } else {
        draw(reel.digit, 0, 1)
      }
    })
  }

  // Powering on: the picture opens out from a bright line across the middle.
  if (view.boot < 1) {
    const open = view.boot * ih * 0.6
    for (let y = iy0; y <= iy1; y++) {
      const fromMiddle = Math.abs(y - cy)
      for (let x = ix0; x <= ix1; x++) {
        if (!isScreen(x, y)) continue
        if (fromMiddle > open) put(x, y, BLACK)
        else if (fromMiddle > open - 1.2) put(x, y, mix(get(x, y), WHITE, 0.8))
      }
    }
  }

  paintBezel(put, box, shape, view)
}
