// The playfield's layout: rails, pins, the screen, the tulip, the attacker, and the still picture.
// Pixels are half a terminal cell tall, so they are about square: x and y share one unit.
import { hash, hex, mix } from '../render/color'
import { lcdSize } from '../render/lcd'
import { C } from '../render/palette'
import { GRAVITY, LANE_EXIT } from './constants'
import type { Box, Geometry, Pin } from './types'

/** Lays the machine out for a Raster of `cols` by `rows` cells. */
export const buildGeometry = (cols: number, rows: number): Geometry => {
  const width = cols
  const height = rows * 2
  const radius = Math.floor(Math.min((width - 4) / 2, height * 0.46))
  const cx = Math.floor(width / 2)
  const cy = radius + 2
  const laneRadius = radius - 1.5
  const laneStart = height - 3
  const laneLength = laneStart - cy + laneRadius * LANE_EXIT

  // The screen is the machine's centrepiece: round on top, square below. Its arch sits
  // well inside the rail, leaving a band of pins over it; it reaches down to just above
  // the stage, roads and tulip.
  const halfWidth = Math.floor(radius * 0.74)
  const lcdArc = { cx, cy, r: halfWidth }
  const lcdTop = cy - lcdArc.r
  const lcdHeight = Math.max(14, height - 23 - lcdTop)
  const lcd = {
    x0: cx - halfWidth,
    y0: lcdTop,
    x1: cx + halfWidth,
    y1: lcdTop + lcdHeight,
  }
  const big = lcdSize(2)
  const lcdScale: 1 | 2 = big.card.w * 3 + big.gap * 2 <= lcd.x1 - lcd.x0 - 4 && big.card.h + 6 <= lcdHeight ? 2 : 1
  const holdY = lcd.y1 - 3
  const stage = { y: lcd.y1 + 2, x0: lcd.x0 + 2, x1: lcd.x1 - 2 }
  // The start pocket sits at the very bottom, just above the out hole.
  const pocket = { x: cx, y: height - 5 }
  // The attacker sits under the right-hand channel, where the right strike comes down
  // between the screen and the rail, so a ball shot hard enough drops straight in.
  const gate = {
    x0: Math.max(Math.floor(cx + radius * 0.35), lcd.x1 - 6),
    x1: Math.floor(cx + radius - 1),
    y: height - 9,
  }

  const isInside = (x: number, y: number, margin: number) => {
    if (y >= cy) return x >= cx - (radius - 3) + margin && x <= cx + radius - margin && y < height - 2
    const d = Math.hypot(x - cx, y - cy)
    const angle = Math.atan2(cy - y, cx - x)
    const edge = angle < LANE_EXIT + 0.08 ? radius - 3 : radius
    return d <= edge - margin
  }

  const windmills = [
    { x: cx - Math.round(radius * 0.5), y: lcd.y0 - 6 },
    { x: cx + Math.round(radius * 0.5), y: lcd.y0 - 6 },
  ].filter(w => isInside(w.x, w.y, 2.5))

  // Funnel roads (道) at the bottom, sloping in to the tulip; the right one stops short of the attacker.
  const roads = [
    { x0: cx - (radius - 3) + 3, y0: height - 15, x1: pocket.x - 4, y1: pocket.y - 3 },
  ].filter(road => Math.abs(road.x0 - road.x1) > 4)
  const nearRoad = (x: number, y: number) =>
    roads.some(road => {
      const rx = road.x1 - road.x0
      const ry = road.y1 - road.y0
      const t = Math.max(0, Math.min(1, ((x - road.x0) * rx + (y - road.y0) * ry) / (rx * rx + ry * ry)))
      return Math.hypot(x - (road.x0 + rx * t), y - (road.y0 + ry * t)) < 2.5
    })

  // Brass pins, a staggered grid, kept off the rails and the features.
  const pins: Pin[] = []
  const pinAt = new Map<number, Pin>()
  const addPin = (x: number, y: number) => {
    const pin = { x, y, glow: 0 }
    pins.push(pin)
    pinAt.set(y * width + x, pin)
  }
  const isNear = (box: Box, x: number, y: number, pad: number) =>
    x >= box.x0 - pad && x <= box.x1 + pad && y >= box.y0 - pad && y <= box.y1 + pad
  for (let y = cy - radius + 5; y < height - 4; y += 4) {
    const offset = (Math.floor(y / 4) % 2) * 2
    for (let x = offset; x < width; x += 4) {
      if (!isInside(x, y, 3.5)) continue
      if (isNear(lcd, x, y, 5) && (y >= cy - 2 || Math.hypot(x - cx, y - cy) < lcdArc.r + 3)) continue
      if (x >= lcd.x0 - 2 && x <= lcd.x1 + 2 && y >= lcd.y1 && y <= lcd.y1 + 4) continue
      if (Math.abs(x - pocket.x) <= 3 && y >= pocket.y - 4) continue
      if (nearRoad(x, y)) continue
      if (windmills.some(w => Math.hypot(x - w.x, y - w.y) < 4)) continue
      if (x >= gate.x0 - 2 && x <= gate.x1 + 2 && y >= gate.y - 3) continue
      addPin(x, y)
    }
  }
  addPin(pocket.x - 2, pocket.y - 2)
  addPin(pocket.x + 2, pocket.y - 2)

  // Lamps around the rail, every few pixels of its length.
  const lights: { x: number; y: number }[] = []
  for (let y = height - 3; y >= cy; y -= 4) lights.push({ x: cx - radius - 2, y })
  for (let a = 0; a <= Math.PI; a += 4 / (radius + 2)) {
    lights.push({ x: Math.round(cx - (radius + 2) * Math.cos(a)), y: Math.round(cy - (radius + 2) * Math.sin(a)) })
  }
  for (let y = cy; y < height - 2; y += 4) lights.push({ x: cx + radius + 2, y })

  // The still picture: cabinet, playfield art, rails, LCD bezel.
  const background = new Uint32Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      let color = mix(C.cabinetTop, C.cabinetBottom, y / height)
      if ((x * 7 + y * 3) % 23 === 0) color = mix(color, C.star, 0.25)
      if (isInside(x, y, 0)) {
        const d = Math.hypot(x - cx, (y - cy) * 0.9) / (radius + 1)
        color = mix(C.fieldCenter, C.fieldEdge, Math.min(1, d))
        if (hash(x, y) === 7) color = mix(color, C.star, 0.8)
      }
      background[i] = color
    }
  }
  const set = (x: number, y: number, color: number) => {
    if (x >= 0 && x < width && y >= 0 && y < height) background[y * width + x] = color
  }
  // Outer rail: the arc and its two legs.
  for (let a = -0.02; a <= Math.PI + 0.02; a += 0.5 / radius) {
    const shine = a > 0.4 && a < 1.3 ? C.railShine : C.rail
    set(Math.round(cx - (radius + 0.6) * Math.cos(a)), Math.round(cy - (radius + 0.6) * Math.sin(a)), shine)
  }
  for (let y = cy; y < height; y++) {
    set(cx - radius - 1, y, C.rail)
    set(cx + radius + 1, y, C.rail)
  }
  // Inner rail: the launch lane's wall, up to where it lets go.
  for (let a = 0; a <= LANE_EXIT; a += 0.5 / radius) {
    set(Math.round(cx - (radius - 3) * Math.cos(a)), Math.round(cy - (radius - 3) * Math.sin(a)), C.innerRail)
  }
  for (let y = cy; y < height - 2; y++) set(cx - (radius - 3), y, C.innerRail)
  // Tulip: a cup around a dark hole.
  set(pocket.x - 1, pocket.y, C.tulip)
  set(pocket.x + 1, pocket.y, C.tulip)
  set(pocket.x - 1, pocket.y + 1, C.tulip)
  set(pocket.x, pocket.y + 1, C.tulip)
  set(pocket.x + 1, pocket.y + 1, C.tulip)
  set(pocket.x, pocket.y, C.hole)
  // The stage: a glassy ledge, open in the middle over the tulip.
  for (let x = stage.x0; x <= stage.x1; x++) {
    if (Math.abs(x - cx) <= 1) continue
    const t = Math.abs(x - cx) / (stage.x1 - cx)
    set(x, stage.y, mix(hex('#7fe8ff'), hex('#2a6a9a'), t))
    set(x, stage.y + 1, mix(hex('#123a5a'), C.fieldEdge, t))
  }
  for (const road of roads) {
    const steps = Math.ceil(Math.hypot(road.x1 - road.x0, road.y1 - road.y0) * 2)
    for (let k = 0; k <= steps; k++) {
      const x = Math.round(road.x0 + ((road.x1 - road.x0) * k) / steps)
      const y = Math.round(road.y0 + ((road.y1 - road.y0) * k) / steps)
      set(x, y, k % 4 === 0 ? hex('#ffe08a') : C.pin)
    }
  }
  // Warp mouths on the screen's sides.
  for (const x of [lcd.x0 - 1, lcd.x1 + 1]) {
    set(x, lcd.y0 + 4, C.tulip)
    set(x, lcd.y0 + 5, hex('#004a5a'))
  }

  return {
    cols,
    rows,
    width,
    height,
    cx,
    cy,
    radius,
    laneRadius,
    laneStart,
    laneLength,
    pins,
    pinAt,
    lcd,
    lcdScale,
    lcdArc,
    pocket,
    holdY,
    gate,
    lights,
    stage,
    roads,
    windmills,
    background,
  }
}

/** Where a ball `s` along the launch lane is, and which way the lane runs there. */
export const lanePoint = (g: Geometry, s: number) => {
  const straight = g.laneStart - g.cy
  if (s <= straight) return { x: g.cx - g.laneRadius, y: g.laneStart - s, tx: 0, ty: -1, up: 1, angle: 0 }
  const angle = (s - straight) / g.laneRadius
  return {
    x: g.cx - g.laneRadius * Math.cos(angle),
    y: g.cy - g.laneRadius * Math.sin(angle),
    tx: Math.sin(angle),
    ty: -Math.cos(angle),
    up: Math.cos(angle),
    angle,
  }
}

/** The launch speed for a handle position: low powers fall back down the lane. */
export const launchSpeed = (g: Geometry, power: number) => {
  const climb = g.laneStart - g.cy + g.laneRadius * Math.sin(LANE_EXIT)
  const extra = (power / 100) * g.radius * 1.25 - 3
  return Math.sqrt(Math.max(0.5, 2 * GRAVITY * (climb + extra))) * (1 + (Math.random() - 0.5) * 0.03)
}
