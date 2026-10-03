// The machine: physics on a pixel canvas, painted as half-block cells for a Raster.
// Pixels are half a terminal cell tall, so they are about square: x and y share one unit.

export type Input = { power: number; isFiring: boolean }

export type Sound =
  | 'launch'
  | 'pin'
  | 'foul'
  | 'pocket'
  | 'spin'
  | 'stop'
  | 'reach'
  | 'jackpot'
  | 'gate'
  | 'round'
  | 'kakuhen'
  | 'boot'
  | 'warp'
  | 'warn'

const FPS = 30
const GRAVITY = 0.12
const SUBSTEPS = 4
const MAX_SPEED = 6
const MAX_BALLS = 300
const SHOT_EVERY = 3
const HOLD_LIMIT = 4
const SPIN_FRAMES = 3 * FPS
const REACH_FRAMES = 7 * FPS
/** The last stretch of a reach, where the middle reel steps one digit at a time. */
const CRAWL_STEPS = 3
const CRAWL_STEP = 25
/** How long a stopped spin holds its result on screen before it pays out or clears. */
const holdOf = (spin: { isReach: boolean; gag?: string }) => (spin.isReach ? 45 : spin.gag ? 40 : 15)
/** Rounds of the attacker for each kind of jackpot. */
const ROUNDS: Record<Prize, number> = { premium: 10, kakuhen: 8, normal: 5 }
/** The digits each kind of jackpot lines up. */
const PRIZE_DIGITS: Record<Prize, readonly number[]> = { premium: [7], kakuhen: [1, 3, 5, 9], normal: [2, 4, 6, 8] }
/** About one quiet frame in this many starts a little scene of its own. */
const SCENE_CHANCE = 300
const SCENE_FRAMES: Record<SceneEvent, number> = { cat: 75, balloon: 100, meteors: 60, jump: 30, light: 160, rain: 240, birds: 90 }
const ROUND_BALLS = 10
const ROUND_FRAMES = 12 * FPS
/** Where the launch lane lets go of the ball: 60 degrees up the rail from its left side. */
const LANE_EXIT = Math.PI / 3
/** Where each reel stops, as a share of the spin: left, middle last, right. */
const STOPS = [0.35, 1, 0.6] as const
const BOOT_FRAMES = 45
/** Quiet frames before the screen runs its demo (デモ画面), as an idle machine in a hall does. */
const DEMO_AFTER = 10 * FPS
/** The handle's power from which a ball goes right (右打ち). */
const RIGHT_STRIKE = 80
/** Frames of striking the wrong way before the machine calls it out. */
const WARN_AFTER = FPS
/** How lit a sleeping machine stays: dim, but plainly there. */
const SLEEP_LIGHT = 0.35
const IDLE_BEFORE_SLEEP = 3 * FPS

import { hash, hex, hue, mix } from './color'
import { lcdSize, paintLcd } from './lcd'
import type { Notice, Prize, ReelView, SceneEvent } from './lcd'

const C = {
  cabinetTop: hex('#1d1040'),
  cabinetBottom: hex('#07060f'),
  fieldCenter: hex('#183070'),
  fieldEdge: hex('#060a1c'),
  star: hex('#3b4f9a'),
  rail: hex('#b9c2d3'),
  railShine: hex('#ffffff'),
  innerRail: hex('#7d879b'),
  pin: hex('#c9952b'),
  pinLit: hex('#fff3a0'),
  ball: hex('#f2f6ff'),
  lcdFrame: hex('#d4af37'),
  lcdTop: hex('#001a3a'),
  lcdBottom: hex('#003355'),
  digit: hex('#e8f4ff'),
  reach: hex('#ff2a2a'),
  gold: hex('#ffd700'),
  tulip: hex('#00e5ff'),
  hole: hex('#000000'),
  holdOn: hex('#ff9f1a'),
  holdOff: hex('#3a2a10'),
  gateShut: hex('#7a1020'),
  gateEdge: hex('#d4af37'),
  kakuhen: hex('#ff2020'),
}

type Pin = { x: number; y: number; glow: number }
type Ball =
  | { mode: 'lane'; s: number; v: number }
  | { mode: 'free'; x: number; y: number; vx: number; vy: number; still?: number }
type Spark = { x: number; y: number; life: number; color: number }
type Spin = {
  result: number[]
  frame: number
  length: number
  isHit: boolean
  isReach: boolean
  stopped: number
  /** Digits left in the reach's crawl, to tick as each one lands. */
  crawl: number
  notice: Notice | null
  prize: Prize
  /** The joke the screen makes when this spin misses, if it makes one. */
  gag?: string
}
/** `frame` counts within a round, `age` across the whole fever. */
type Fever = { round: number; count: number; frame: number; age: number; prize: Prize; rounds: number }

/** A ball in the tulip waiting its spin, its result already drawn (先読み) and its lamp's colour hinting at it. */
type Pending = { isHit: boolean; isReach: boolean; prize: Prize; lamp: 'plain' | 'red' | 'gold' }

type Box = { x0: number; y0: number; x1: number; y1: number }

export type Geometry = {
  cols: number
  rows: number
  width: number
  height: number
  cx: number
  cy: number
  radius: number
  laneRadius: number
  laneStart: number
  laneLength: number
  pins: Pin[]
  pinAt: Map<number, Pin>
  lcd: Box
  lcdScale: 1 | 2
  /** The screen's top is an arch: this circle, cut by the screen's box. */
  lcdArc: { cx: number; cy: number; r: number }
  pocket: { x: number; y: number }
  holdY: number
  gate: { x0: number; x1: number; y: number }
  lights: { x: number; y: number }[]
  roads: { x0: number; y0: number; x1: number; y1: number }[]
  /** The ledge under the screen that warped balls roll along, gap in the middle. */
  stage: { y: number; x0: number; x1: number }
  windmills: { x: number; y: number }[]
  background: Uint32Array
}

export type Game = {
  geometry: Geometry | null
  balls: Ball[]
  sparks: Spark[]
  input: Input
  ammo: () => number
  odds: number
  isKakuhen: boolean
  fired: number
  gate: number
  jackpots: number
  holds: number
  /** The held balls' drawn results, oldest first; `holds` is its length. */
  queue: Pending[]
  /** The kind of the last jackpot, so the session knows whether kakuhen follows. */
  lastPrize: Prize | null
  /** A little scene playing on the screen, apart from any spin. */
  scene: { kind: SceneEvent; age: number } | null
  /** How far the walk has come: it stands still while the light is red. */
  travel: number
  /** How far a reach's storm has rolled in, 0 clear to 1 the blood-red sky; it gathers and clears slowly. */
  storm: number
  /** How far kakuhen's red has seeped into the sky, 0 to 1. */
  redness: number
  spin: Spin | null
  reels: number[]
  fever: Fever | null
  flash: number
  frame: number
  shotAt: number
  message: string
  messageUntil: number
  sounds: Sound[]
  pinSoundAt: number
  /** Frames spent striking the wrong way: right outside a fever, left in one. */
  wrongStrike: number
  /** How lit the machine is, 0 dark to 1 full, and where it is heading. */
  light: number
  lightTarget: number
  /** Frames since the machine last powered on, for the lamps' start-up run. */
  bootFrame: number
  /** The turn ended: dim once nothing is left moving. */
  isWindingDown: boolean
  idleFrames: number
}

export const newGame = (counts: { fired: number; gate: number; jackpots: number }): Game => ({
  geometry: null,
  balls: [],
  sparks: [],
  input: { power: 30, isFiring: false },
  ammo: () => 0,
  odds: 1 / 99,
  isKakuhen: false,
  fired: counts.fired,
  gate: counts.gate,
  jackpots: counts.jackpots,
  holds: 0,
  queue: [],
  lastPrize: null,
  scene: null,
  travel: 0,
  storm: 0,
  redness: 0,
  spin: null,
  reels: [7, 7, 7],
  fever: null,
  flash: 0,
  frame: 0,
  shotAt: 0,
  message: '',
  messageUntil: 0,
  sounds: [],
  pinSoundAt: 0,
  wrongStrike: 0,
  // Asleep but visible until a prompt or the handle wakes it.
  light: 1,
  lightTarget: 1,
  bootFrame: BOOT_FRAMES,
  isWindingDown: false,
  idleFrames: 0,
})


/** Lights the machine up from the dark: the fade in, the lamps one by one, the boot sound. */
export const wake = (game: Game) => {
  game.isWindingDown = false
  game.idleFrames = 0
  // No fading: the machine is always fully lit.
}

/** The turn is over: once the last ball has settled the machine fades back to a glow. */
export const windDown = (game: Game) => {
  game.isWindingDown = true
  game.idleFrames = 0
}

const rand = (n: number) => Math.floor(Math.random() * n)
const say = (game: Game, message: string, seconds = 2.5) => {
  game.message = message
  game.messageUntil = game.frame + seconds * FPS
}

export const messageOf = (game: Game) => (game.frame < game.messageUntil ? game.message : '')

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
const lanePoint = (g: Geometry, s: number) => {
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
const launchSpeed = (g: Geometry, power: number) => {
  const climb = g.laneStart - g.cy + g.laneRadius * Math.sin(LANE_EXIT)
  const extra = (power / 100) * g.radius * 1.25 - 3
  return Math.sqrt(Math.max(0.5, 2 * GRAVITY * (climb + extra))) * (1 + (Math.random() - 0.5) * 0.03)
}

/** Draws a held ball's result the moment it enters the tulip, and picks its lamp. */
const drawPending = (game: Game): Pending => {
  const isHit = Math.random() < game.odds
  const isReach = isHit || Math.random() < 0.12
  const r = Math.random()
  const prize: Prize = r < 0.25 ? 'premium' : r < 0.6 ? 'kakuhen' : 'normal'
  const l = Math.random()
  // A coloured lamp says this one is worth watching: gold almost always pays; red often
  // brings a reach; once in a while a plain spin wears red for nothing (ガセ).
  const lamp = isHit ? (l < 0.3 ? 'gold' : l < 0.55 ? 'red' : 'plain') : isReach ? (l < 0.15 ? 'red' : 'plain') : l < 0.02 ? 'red' : 'plain'
  return { isHit, isReach, prize, lamp }
}

const startSpin = (game: Game, pending: Pending): Spin => {
  const { isHit, isReach, prize } = pending
  const lineUp = PRIZE_DIGITS[prize][rand(PRIZE_DIGITS[prize].length)]!
  const side = isHit ? lineUp : rand(10)
  let middle = isHit ? lineUp : rand(10)
  // A reach that misses by one digit is the classic near miss (前後外れ): OFF BY ONE.
  const isOffByOne = !isHit && isReach && Math.random() < 0.5
  if (isOffByOne) middle = (side + (Math.random() < 0.5 ? 1 : 9)) % 10
  if (!isHit && isReach && middle === side) middle = (side + 1 + rand(9)) % 10
  let last = isReach ? side : rand(10)
  if (!isReach && last === side) last = (last + 1) % 10
  // Now and then a plain miss comes up 4-0-4: the jackpot was not found.
  const is404 = !isReach && Math.random() < 0.03
  const misses = ["IT'S A FEATURE", 'WONTFIX', 'SO CLOSE...']
  const gag = is404 ? '404 NOT FOUND' : isOffByOne ? 'OFF BY ONE!' : isReach && !isHit ? misses[rand(misses.length)] : undefined
  // A premonition (予告): the stronger ones come mostly before a reach or a hit.
  const weights: [Notice, number][] = isHit
    ? [['gold', 0.3], ['ufo', 0.25], ['mascot', 0.2], ['star', 0.15]]
    : isReach
      ? [['gold', 0.06], ['ufo', 0.2], ['mascot', 0.1], ['star', 0.2]]
      : [['ufo', 0.03], ['mascot', 0.02], ['star', 0.08]]
  let roll = Math.random()
  let notice: Notice | null = null
  for (const [kind, weight] of weights) {
    if (roll < weight) {
      notice = kind
      break
    }
    roll -= weight
  }
  return {
    result: is404 ? [4, 0, 4] : [side, middle, last],
    frame: 0,
    length: isReach ? REACH_FRAMES : SPIN_FRAMES,
    isHit,
    isReach,
    stopped: 0,
    crawl: CRAWL_STEPS + 1,
    notice,
    prize,
    gag,
  }
}

export const isReaching = (spin: Spin | null) =>
  spin !== null && spin.isReach && spin.frame >= STOPS[2] * spin.length && spin.frame < spin.length + holdOf(spin)

/**
 * How far the middle reel of a reach still has to go, in digits, `left` frames from its
 * stop. It rolls slowly, then crawls the last few digits one at a time: each a quick slide
 * and a long, tense pause on the digit it lands on.
 */
const crawlBehind = (left: number) => {
  const crawlFrames = CRAWL_STEPS * CRAWL_STEP
  if (left > crawlFrames) return CRAWL_STEPS + (left - crawlFrames) * 0.12
  const k = left / CRAWL_STEP
  const whole = Math.floor(k)
  const u = k - whole
  // The slide happens in the first fifth of each step; the rest is the pause.
  const slide = Math.min(1, Math.max(0, (u - 0.8) / 0.2))
  return whole + slide * slide * (3 - 2 * slide)
}

/** Where each reel is: rolling toward its digit, slowing to a crawl under a reach, or resting. */
const reelViews = (game: Game): ReelView[] => {
  const spin = game.spin
  if (spin === null && game.idleFrames > DEMO_AFTER) {
    // The demo: the reels drift round on their own, each at its own pace.
    const t = game.idleFrames - DEMO_AFTER
    return game.reels.map((digit, i) => {
      const position = digit + t * (0.04 + i * 0.012)
      const whole = Math.floor(position)
      return { digit: ((whole % 10) + 10) % 10, offset: position - whole, isSpinning: true, sinceStop: 0 }
    })
  }
  if (spin === null) {
    return game.reels.map(digit => ({ digit, offset: 0, isSpinning: false, sinceStop: 99 }))
  }
  return spin.result.map((digit, i) => {
    const stopAt = STOPS[i]! * spin.length
    if (spin.frame >= stopAt) return { digit, offset: 0, isSpinning: false, sinceStop: spin.frame - stopAt }
    const left = stopAt - spin.frame
    const position = i === 1 && isReaching(spin) ? digit - crawlBehind(left) : digit - left * 0.45
    const whole = Math.floor(position)
    return { digit: ((whole % 10) + 10) % 10, offset: position - whole, isSpinning: true, sinceStop: 0 }
  })
}

/** True while a traffic light holds the walk: from when it turns red until it goes green. */
export const isWaitingAtLight = (scene: { kind: SceneEvent; age: number } | null) =>
  scene !== null && scene.kind === 'light' && scene.age >= 30 && scene.age < 110

export const isBusy = (game: Game) =>
  (game.storm > 0 && game.storm < 1) ||
  game.light !== game.lightTarget ||
  game.bootFrame < BOOT_FRAMES ||
  game.balls.length > 0 ||
  game.spin !== null ||
  game.holds > 0 ||
  game.fever !== null ||
  game.flash > 0 ||
  game.sparks.length > 0 ||
  game.input.isFiring ||
  game.frame < game.messageUntil

/** One frame of the machine. */
export const step = (game: Game) => {
  const g = game.geometry
  if (g === null) return
  game.frame += 1
  game.bootFrame += 1

  // Fading in and out: quick to wake, slow to fall asleep.
  if (game.input.isFiring) wake(game)
  const isPlaying =
    game.balls.length > 0 || game.spin !== null || game.holds > 0 || game.fever !== null || game.input.isFiring
  // Quiet frames since anything was in play: past DEMO_AFTER the screen runs its demo.
  if (!isPlaying) {
    game.idleFrames += 1
  } else {
    game.idleFrames = 0
  }
  const rate = game.lightTarget > game.light ? 1 / 40 : 1 / 75
  game.light =
    Math.abs(game.lightTarget - game.light) <= rate
      ? game.lightTarget
      : game.light + Math.sign(game.lightTarget - game.light) * rate

  // The machine calls out a wrong strike, as a real one does: right outside the fever
  // (左打ちに戻してください), left in it (右打ちしてください).
  const isRightStrike = game.input.power >= RIGHT_STRIKE
  const isWrong = game.input.isFiring && game.ammo() > 0 && (game.fever === null ? isRightStrike : !isRightStrike)
  game.wrongStrike = isWrong ? game.wrongStrike + 1 : Math.max(0, game.wrongStrike - 2)
  if (isWrong && game.wrongStrike >= WARN_AFTER && (game.wrongStrike - WARN_AFTER) % (2 * FPS) === 0) {
    game.sounds.push('warn')
    say(game, game.fever === null ? '⚠ 請回到左打ち！右打只在大當時才有用' : '⚠ 請右打ち！把力道推到右邊打進大閘門', 2)
  }

  // The handle: one ball every few frames while it is held and the tray has any.
  if (
    game.input.isFiring &&
    game.ammo() > 0 &&
    game.balls.length < MAX_BALLS &&
    game.frame - game.shotAt >= SHOT_EVERY
  ) {
    game.shotAt = game.frame
    game.fired += 1
    game.balls.push({ mode: 'lane', s: 0, v: launchSpeed(g, game.input.power) })
    game.sounds.push('launch')
  }

  const dt = 1 / SUBSTEPS
  const kept: Ball[] = []
  let didHitPin = false
  for (let ball of game.balls) {
    let isGone = false
    for (let sub = 0; sub < SUBSTEPS && !isGone; sub++) {
      if (ball.mode === 'lane') {
        const at = lanePoint(g, ball.s)
        ball.v -= GRAVITY * at.up * dt
        ball.s += ball.v * dt
        if (ball.s < 0) {
          // Too weak to clear the rail: it rolls back to the tray (戻り球).
          isGone = true
          game.fired -= 1
          game.sounds.push('foul')
          say(game, '力道不夠，鋼珠滾回來了（戻り球 = git revert，不扣彈藥）', 1.5)
          continue
        }
        if (at.angle >= LANE_EXIT) {
          ball = { mode: 'free', x: at.x, y: at.y, vx: ball.v * at.tx, vy: ball.v * at.ty }
        }
        continue
      }

      ball.vy += GRAVITY * dt
      const speed = Math.hypot(ball.vx, ball.vy)
      if (speed > MAX_SPEED) {
        ball.vx *= MAX_SPEED / speed
        ball.vy *= MAX_SPEED / speed
      }
      ball.x += ball.vx * dt
      ball.y += ball.vy * dt

      // The rails: the ball rolls along them, losing little.
      if (ball.y < g.cy) {
        const dx = ball.x - g.cx
        const dy = ball.y - g.cy
        const d = Math.hypot(dx, dy)
        const angle = Math.atan2(g.cy - ball.y, g.cx - ball.x)
        const limit = (angle < LANE_EXIT + 0.08 ? g.radius - 3 : g.radius) - 0.5
        if (d > limit) {
          const nx = dx / d
          const ny = dy / d
          ball.x = g.cx + nx * limit
          ball.y = g.cy + ny * limit
          const along = ball.vx * nx + ball.vy * ny
          if (along > 0) {
            ball.vx -= 1.2 * along * nx
            ball.vy -= 1.2 * along * ny
          }
        }
      } else {
        const left = g.cx - (g.radius - 3) + 0.5
        const right = g.cx + g.radius - 0.5
        if (ball.x < left) {
          ball.x = left
          ball.vx = Math.abs(ball.vx) * 0.3
        }
        if (ball.x > right) {
          ball.x = right
          ball.vx = -Math.abs(ball.vx) * 0.3
        }
      }

      // The LCD is solid: an arched top, straight sides, a flat bottom.
      const lcd = g.lcd
      const arc = g.lcdArc
      const arcDistance = Math.hypot(ball.x - arc.cx, ball.y - arc.cy)
      const isUnderArc = ball.y >= arc.cy || arcDistance <= arc.r
      if (isUnderArc && ball.x >= lcd.x0 && ball.x <= lcd.x1 + 1 && ball.y >= lcd.y0 && ball.y <= lcd.y1 + 1) {
        // Under the arch, its depth stands in for the distance from a flat top.
        const fromTop = ball.y < arc.cy ? arc.r - arcDistance : Infinity
        const fromBottom = lcd.y1 + 1 - ball.y
        const fromLeft = ball.x - lcd.x0
        const fromRight = lcd.x1 + 1 - ball.x
        const least = Math.min(fromTop, fromBottom, fromLeft, fromRight)
        if ((least === fromLeft || least === fromRight) && Math.random() < 0.05) {
          // ワープ: into the screen's side, out onto the stage below it.
          const side = ball.x < g.cx ? -1 : 1
          ball.x = g.cx + side * (g.stage.x1 - g.cx - 1)
          ball.y = g.stage.y - 1
          ball.vx = -side * (0.25 + Math.random() * 0.2)
          ball.vy = 0
          game.sounds.push('warp')
        } else if (least === fromTop) {
          // Off the arch: out along its normal, keeping the run along it.
          const nx = (ball.x - arc.cx) / arcDistance
          const ny = (ball.y - arc.cy) / arcDistance
          ball.x = arc.cx + nx * (arc.r + 0.01)
          ball.y = arc.cy + ny * (arc.r + 0.01)
          const along = ball.vx * nx + ball.vy * ny
          if (along < 0) {
            ball.vx -= 1.3 * along * nx
            ball.vy -= 1.3 * along * ny
          }
        } else if (least === fromBottom) {
          ball.y = lcd.y1 + 1.01
          ball.vy = Math.abs(ball.vy) * 0.35
        } else if (least === fromLeft) {
          ball.x = lcd.x0 - 0.01
          ball.vx = -Math.abs(ball.vx) * 0.35
        } else {
          ball.x = lcd.x1 + 1.01
          ball.vx = Math.abs(ball.vx) * 0.35
        }
      }

      // The stage: balls roll on it, swaying toward the middle, and drop through the gap.
      const stage = g.stage
      if (
        ball.vy >= 0 &&
        ball.y >= stage.y - 1 &&
        ball.y < stage.y + 0.5 &&
        ball.x >= stage.x0 &&
        ball.x <= stage.x1 + 1 &&
        Math.abs(ball.x - (g.cx + 0.5)) > 1.2
      ) {
        ball.y = stage.y - 1
        ball.vy = 0
        ball.vx = (ball.vx + (ball.x < g.cx + 0.5 ? 0.03 : -0.03) * dt * 4) * 0.995
      }

      // Roads: the ball slides down them.
      for (const road of g.roads) {
        const rx = road.x1 - road.x0
        const ry = road.y1 - road.y0
        const length2 = rx * rx + ry * ry
        const t = Math.max(0, Math.min(1, ((ball.x - road.x0) * rx + (ball.y - road.y0) * ry) / length2))
        const nx0 = ball.x - (road.x0 + rx * t)
        const ny0 = ball.y - (road.y0 + ry * t)
        const d = Math.hypot(nx0, ny0)
        if (d < 1 && d > 0 && ny0 < 0) {
          const nx = nx0 / d
          const ny = ny0 / d
          ball.x += nx * (1 - d)
          ball.y += ny * (1 - d)
          const along = ball.vx * nx + ball.vy * ny
          if (along < 0) {
            ball.vx -= 1.15 * along * nx
            ball.vy -= 1.15 * along * ny
          }
        }
      }

      // Windmills (風車): a spinning hub that flings a ball off at random.
      for (const mill of g.windmills) {
        const dx = ball.x - (mill.x + 0.5)
        const dy = ball.y - (mill.y + 0.5)
        const d = Math.hypot(dx, dy)
        if (d < 2 && d > 0) {
          ball.x = mill.x + 0.5 + (dx / d) * 2
          ball.y = mill.y + 0.5 + (dy / d) * 2
          ball.vx = (dx / d) * 0.8 + (Math.random() - 0.5) * 1.6
          ball.vy = Math.abs(dy / d) * 0.4
          didHitPin = true
        }
      }

      // Brass pins.
      const px = Math.floor(ball.x)
      const py = Math.floor(ball.y)
      for (let y = py - 1; y <= py + 1; y++) {
        for (let x = px - 1; x <= px + 1; x++) {
          const pin = g.pinAt.get(y * g.width + x)
          if (pin === undefined) continue
          const dx = ball.x - (pin.x + 0.5)
          const dy = ball.y - (pin.y + 0.5)
          const d = Math.hypot(dx, dy)
          if (d >= 1.2 || d === 0) continue
          const nx = dx / d
          const ny = dy / d
          const along = ball.vx * nx + ball.vy * ny
          if (along < 0) {
            ball.vx -= 1.5 * along * nx
            ball.vy -= 1.5 * along * ny
            if (Math.abs(along) > 0.6) didHitPin = true
          }
          ball.vx += (Math.random() - 0.5) * 0.15
          ball.x = pin.x + 0.5 + nx * 1.2
          ball.y = pin.y + 0.5 + ny * 1.2
          pin.glow = 4
        }
      }

      // The tulip under the LCD.
      if (Math.floor(ball.y) === g.pocket.y && Math.abs(ball.x - (g.pocket.x + 0.5)) < 1.5 && ball.vy > 0) {
        isGone = true
        if (game.holds < HOLD_LIMIT) {
          const pending = drawPending(game)
          game.queue.push(pending)
          game.holds = game.queue.length
          if (pending.lamp !== 'plain') say(game, pending.lamp === 'gold' ? '保留變金色！！' : '保留變紅色！', 2)
          game.sounds.push('pocket')
        } else {
          say(game, '保留滿了：放開發射，趁拉霸時看一下回覆（止め打ち）', 2)
        }
        continue
      }

      // The attacker: open in the fever; shut, the right side drains to the out hole, so
      // a right strike outside the fever wins nothing, as on a real machine.
      if (Math.floor(ball.y) === g.gate.y && ball.x >= g.gate.x0 && ball.x < g.gate.x1 + 1) {
        if (game.fever !== null) {
          isGone = true
          game.gate += 1
          game.fever.count += 1
          game.sounds.push('gate')
          for (let i = 0; i < 4; i++) {
            game.sparks.push({ x: Math.floor(ball.x) + rand(5) - 2, y: g.gate.y - 1 - rand(4), life: 6, color: hue(Math.random()) })
          }
          continue
        } else {
          isGone = true
          continue
        }
      }

      if (ball.y >= g.height - 1) isGone = true
    }
    if (!isGone && ball.mode === 'free') {
      // A ball wedged somewhere gets a nudge, as a real one would from the machine's shake.
      ball.still = Math.hypot(ball.vx, ball.vy) < 0.12 ? (ball.still ?? 0) + 1 : 0
      if (ball.still > 40) {
        ball.vx = (Math.random() - 0.5) * 1.2
        ball.vy = -0.6
        ball.still = 0
      }
    }
    if (!isGone) kept.push(ball)
  }
  game.balls = kept
  if (didHitPin && game.frame - game.pinSoundAt >= 2) {
    game.pinSoundAt = game.frame
    game.sounds.push('pin')
  }
  for (const pin of g.pins) if (pin.glow > 0) pin.glow -= 1

  // The fever: rounds of the attacker.
  const fever = game.fever
  if (fever !== null) {
    fever.frame += 1
    fever.age += 1
    if (fever.count >= ROUND_BALLS || fever.frame >= ROUND_FRAMES) {
      if (fever.round >= fever.rounds) {
        game.fever = null
        if (fever.prize === 'normal') {
          say(game, '通常大當結束，下一個問題機率回到 1/99', 4)
        } else {
          game.sounds.push('kakuhen')
          say(game, '確変突入！下一個問題大當たり機率 ×10，繼續提問保持連莊', 5)
        }
      } else {
        game.fever = { ...fever, round: fever.round + 1, count: 0, frame: 0 }
        game.sounds.push('round')
      }
    }
    for (let i = 0; i < 4; i++) {
      game.sparks.push({ x: rand(g.width), y: rand(g.height), life: 3 + rand(6), color: hue(Math.random(), 0.6) })
    }
  }
  game.sparks = game.sparks.filter(spark => --spark.life > 0).slice(-160)
  if (game.flash > 0) game.flash -= 1

  // A little scene now and then, to keep the screen alive between spins.
  if (game.scene !== null) {
    game.scene.age += 1
    if (game.scene.age >= SCENE_FRAMES[game.scene.kind]) game.scene = null
  } else if (game.fever === null && !isReaching(game.spin) && rand(SCENE_CHANCE) === 0) {
    const kinds: SceneEvent[] = ['cat', 'balloon', 'meteors', 'jump', 'light', 'rain', 'birds']
    game.scene = { kind: kinds[rand(kinds.length)]!, age: 0 }
  }

  // The walk goes on unless the light is red (or amber).
  if (!isWaitingAtLight(game.scene)) game.travel += 1

  // Weather never snaps: a reach's storm gathers over about a second and a half and clears
  // over three; kakuhen's red seeps in and out.
  const approach = (now: number, target: number, up: number, down: number) =>
    target > now ? Math.min(target, now + up) : Math.max(target, now - down)
  game.storm = approach(game.storm, isReaching(game.spin) ? 1 : 0, 1 / 45, 1 / 90)
  game.redness = approach(game.redness, game.isKakuhen ? 1 : 0, 1 / 60, 1 / 60)

  // The reels.
  const next = game.queue[0]
  if (game.spin === null && next !== undefined && game.fever === null) {
    game.queue.shift()
    game.holds = game.queue.length
    game.spin = startSpin(game, next)
    game.sounds.push('spin')
  }
  const spin = game.spin
  if (spin !== null) {
    spin.frame += 1
    const wasReaching = spin.isReach && spin.frame - 1 >= STOPS[2] * spin.length
    game.reels = spin.result.map((digit, i) => {
      if (spin.frame >= STOPS[i]! * spin.length) return digit
      const pace = i === 1 && isReaching(spin) ? 4 : 1
      return (Math.floor(spin.frame / pace) + i * 3) % 10
    })
    const stopped = STOPS.filter(at => spin.frame >= at * spin.length).length
    if (stopped > spin.stopped) {
      spin.stopped = stopped
      game.sounds.push('stop')
      if (stopped === 3 && spin.isReach) say(game, spin.isHit ? '7-7-7 !!' : '惜しい！差一點…', 1.5)
    }
    // Each digit of the crawl lands with a click.
    if (spin.isReach && spin.frame < spin.length) {
      const crawl = Math.ceil(crawlBehind(spin.length - spin.frame))
      if (crawl < spin.crawl && crawl <= CRAWL_STEPS) game.sounds.push('stop')
      spin.crawl = Math.min(spin.crawl, crawl)
    }
    if (!wasReaching && isReaching(spin)) {
      game.sounds.push('reach')
      say(game, 'リーチ！', 2)
    }
    // The result holds on screen a moment before it pays out or clears.
    if (spin.frame >= spin.length + holdOf(spin)) {
      game.spin = null
      if (spin.isHit) {
        game.jackpots += 1
        game.lastPrize = spin.prize
        game.fever = { round: 1, count: 0, frame: 0, age: 0, prize: spin.prize, rounds: ROUNDS[spin.prize] }
        game.flash = 30
        game.sounds.push('jackpot')
        const digits = spin.result.join('-')
        say(
          game,
          spin.prize === 'premium'
            ? `プレミアム大當たり!! ${digits}　${ROUNDS.premium} 輪＋確變　右打ち ▶▶▶`
            : spin.prize === 'kakuhen'
              ? `確變大當たり! ${digits}　${ROUNDS.kakuhen} 輪＋確變　右打ち ▶▶▶`
              : `大當たり ${digits}　${ROUNDS.normal} 輪　右打ち ▶▶▶`,
          6,
        )
      }
    }
  }
}

/** Paints the frame as Raster cells: `[codePoint, foreground, background]` per cell, base64. */
export const paint = (game: Game): string => {
  const g = game.geometry!
  const { width, height, lcd } = g
  const px = g.background.slice()
  const set = (x: number, y: number, color: number) => {
    if (x >= 0 && x < width && y >= 0 && y < height) px[y * width + x] = color
  }
  const frame = game.frame
  const reaching = isReaching(game.spin)

  // Lamps around the rail.
  const booting = game.bootFrame < BOOT_FRAMES
  g.lights.forEach((light, i) => {
    let color: number
    if (booting && i / g.lights.length > game.bootFrame / (BOOT_FRAMES * 0.8)) color = hex('#1a1206')
    else if (booting) color = i / g.lights.length > (game.bootFrame - 4) / (BOOT_FRAMES * 0.8) ? hex('#ffffff') : hex('#ffb347')
    else if (game.fever !== null) color = hue((i / 12 + frame / 15) % 1, 0.55)
    else if (reaching) color = (i + Math.floor(frame / 2)) % 2 === 0 ? C.reach : C.gold
    else if (game.isKakuhen) color = mix(C.kakuhen, hex('#400000'), (Math.sin(frame / 4 + i / 3) + 1) / 2)
    else {
      const chase = (frame / 3) % g.lights.length
      const near = Math.abs(i - chase)
      color = near < 2 ? hex('#fff1b0') : mix(hex('#ff9f1a'), hex('#3a1c00'), 0.55 + 0.35 * Math.sin(i))
    }
    set(light.x, light.y, color)
  })

  for (const pin of g.pins) set(pin.x, pin.y, pin.glow > 0 ? C.pinLit : C.pin)

  // Windmills turning.
  for (const mill of g.windmills) {
    const turn = frame * 0.35
    for (let arm = 0; arm < 4; arm++) {
      const a = turn + (arm * Math.PI) / 2
      for (const r of [1, 2]) {
        set(Math.round(mill.x + Math.cos(a) * r), Math.round(mill.y + Math.sin(a) * r), arm % 2 === 0 ? hex('#ffffff') : hex('#ff4d6d'))
      }
    }
    set(mill.x, mill.y, C.gold)
  }

  // The centre screen.
  paintLcd(px, width, { ...lcd, arc: g.lcdArc }, {
    frame,
    reels: reelViews(game),
    mode: game.fever !== null ? 'fever' : reaching ? 'reach' : game.spin !== null ? 'spin' : 'idle',
    isKakuhen: game.isKakuhen,
    boot: Math.min(1, game.bootFrame / BOOT_FRAMES),
    notice: game.spin?.notice ? { kind: game.spin.notice, age: game.spin.frame } : null,
    feverAge: game.fever?.age ?? 0,
    prize: game.fever?.prize ?? game.spin?.prize ?? 'premium',
    outcome: game.spin !== null && game.spin.isReach && game.spin.frame >= game.spin.length ? (game.spin.isHit ? 'hit' : 'miss') : null,
    scene: game.scene,
    travel: game.travel,
    storm: game.storm,
    redness: game.redness,
  }, g.lcdScale)

  // Hold lamps, in the screen's bottom-right corner.
  for (let i = 0; i < HOLD_LIMIT; i++) {
    const pending = game.queue[i]
    const lamp =
      pending === undefined
        ? C.holdOff
        : pending.lamp === 'gold'
          ? frame % 6 < 3
            ? C.gold
            : hex('#ffffff')
          : pending.lamp === 'red'
            ? C.reach
            : C.holdOn
    set(lcd.x1 - 4 - (HOLD_LIMIT - 1 - i) * 3, lcd.y1 - 4, lamp)
  }

  // The attacker.
  for (let x = g.gate.x0; x <= g.gate.x1; x++) {
    if (game.fever !== null) {
      set(x, g.gate.y, (x + frame) % 4 < 2 ? C.gold : C.reach)
      set(x, g.gate.y + 1, mix(C.gold, C.hole, 0.6))
    } else {
      set(x, g.gate.y, x === g.gate.x0 || x === g.gate.x1 ? C.gateEdge : C.gateShut)
      set(x, g.gate.y + 1, C.gateShut)
    }
  }

  for (const spark of game.sparks) set(spark.x, spark.y, spark.color)
  for (const ball of game.balls) {
    if (ball.mode === 'lane') {
      const at = lanePoint(g, ball.s)
      set(Math.floor(at.x), Math.floor(at.y), C.ball)
    } else {
      set(Math.floor(ball.x), Math.floor(ball.y), C.ball)
    }
  }

  if (game.flash > 0) {
    const t = game.flash % 6 < 3 ? 0.75 : 0.35
    const tint = game.flash % 12 < 6 ? hex('#ffffff') : C.gold
    for (let i = 0; i < px.length; i++) px[i] = mix(px[i]!, tint, t)
  }

  // Words on the LCD's top row, as glyphs over the screen.
  const words: { text: string; color: number }[] = []
  if (game.fever !== null && game.wrongStrike >= WARN_AFTER) {
    words.push({ text: 'RIGHT STRIKE!', color: frame % 6 < 3 ? C.reach : hex('#ffffff') })
  } else if (game.fever !== null) {
    const titles: Record<Prize, string> = { premium: 'SHIP IT!! 777', kakuhen: 'KAKUHEN BONUS!', normal: 'BONUS!' }
    words.push(
      game.fever.age < 60
        ? { text: titles[game.fever.prize], color: hue((frame / 10) % 1, 0.6) }
        : { text: `RIGHT STRIKE R${game.fever.round}/${game.fever.rounds} ${game.fever.count}/${ROUND_BALLS}`, color: C.gold },
    )
  } else if (reaching && game.spin !== null && game.spin.frame >= game.spin.length) {
    // The result, held: the bug squashed and the jackpot, or the near miss's joke.
    const since = game.spin.frame - game.spin.length
    words.push(
      game.spin.isHit
        ? { text: since < 20 ? 'BUG FIXED!' : 'JACKPOT!!', color: hue((frame / 10) % 1, 0.6) }
        : { text: game.spin.gag ?? 'SO CLOSE...', color: hex('#9aa4b8') },
    )
  } else if (reaching) {
    // The duel with the bug: REACH! and DEBUGGING... by turns.
    const isDebugging = Math.floor(frame / FPS) % 2 === 1
    words.push(isDebugging ? { text: 'DEBUGGING...', color: hex('#7cfc00') } : { text: 'REACH!', color: frame % 4 < 2 ? C.reach : C.gold })
  } else if (game.spin !== null && game.spin.gag !== undefined && game.spin.frame >= game.spin.length) {
    words.push({ text: game.spin.gag, color: hex('#9aa4b8') })
  } else if (game.spin?.notice === 'gold' && game.spin.frame < 45) {
    words.push({ text: 'CHANCE!', color: frame % 4 < 2 ? C.gold : hex('#ffffff') })
  } else if (game.wrongStrike >= WARN_AFTER) {
    words.push({ text: game.fever === null ? 'LEFT STRIKE!' : 'RIGHT STRIKE!', color: frame % 6 < 3 ? C.reach : hex('#ffffff') })
  } else if (game.holds >= HOLD_LIMIT) {
    words.push({ text: 'CONTEXT FULL', color: frame % 8 < 4 ? C.reach : hex('#ffffff') })
  } else if (game.scene?.kind === 'light' && game.scene.age >= 30 && game.scene.age < 110) {
    words.push({ text: '429 RATE LIMITED', color: hex('#ff4d4d') })
  } else if (game.scene?.kind === 'light' && game.scene.age >= 110 && game.scene.age < 140) {
    words.push({ text: 'RETRY OK', color: hex('#2aff6a') })
  } else if (game.scene?.kind === 'rain' && game.scene.age >= 40 && game.scene.age < 190) {
    words.push({ text: 'CLOUD OUTAGE', color: hex('#a8c0e8') })
  } else if (game.isKakuhen) {
    words.push({ text: 'KAKUHEN x10', color: C.kakuhen })
  } else if (game.bootFrame < BOOT_FRAMES * 1.6) {
    words.push({ text: 'PACHINCODE', color: hue((frame / 25) % 1, 0.65) })
  } else if (game.idleFrames > DEMO_AFTER) {
    const lines = ['PACHINCODE', 'ASK CLAUDE', "YOU'RE ABSOLUTELY RIGHT!", 'GET BALLS', 'LGTM', '1/99 JACKPOT', 'SHIP IT']
    const line = lines[Math.floor((game.idleFrames - DEMO_AFTER) / (3 * FPS)) % lines.length]!
    words.push({ text: line, color: hue((frame / 40) % 1, 0.65) })
  }

  // The fade: everything toward black, with an ease so the dark end lingers.
  if (game.light < 1) {
    const t = 1 - game.light * game.light * (3 - 2 * game.light)
    for (let i = 0; i < px.length; i++) px[i] = mix(px[i]!, 0, t)
    if (game.isKakuhen || game.lightTarget < 1) {
      // Asleep, the rail lamps keep a faint breath so the machine is still there.
      const breath = 0.25 + 0.2 * Math.sin(frame / 12)
      for (const light of g.lights) {
        const i = light.y * width + light.x
        if (i >= 0 && i < px.length) px[i] = mix(px[i]!, game.isKakuhen ? C.kakuhen : hex('#ff9f1a'), breath * (1 - game.light))
      }
    }
  }

  // Half blocks: the top pixel is the glyph, the bottom one the background.
  const shift = reaching && frame % 2 === 0 ? 1 : 0
  const cells = new Uint32Array(g.cols * g.rows * 3)
  for (let row = 0; row < g.rows; row++) {
    for (let col = 0; col < g.cols; col++) {
      const x = Math.max(0, Math.min(width - 1, col - shift))
      const top = px[row * 2 * width + x]!
      const bottom = px[(row * 2 + 1) * width + x]!
      const i = (row * g.cols + col) * 3
      cells[i] = 0x2580
      cells[i + 1] = top
      cells[i + 2] = bottom
    }
  }
  const textRow = Math.floor((lcd.y0 + 6) / 2)
  // Under the arch the row is narrower than the screen: keep the words inside it.
  const rowY = textRow * 2 + 1
  const arc = g.lcdArc
  const room = rowY < arc.cy ? Math.floor(2 * Math.sqrt(Math.max(0, arc.r ** 2 - (arc.cy - rowY) ** 2))) - 4 : lcd.x1 - lcd.x0 - 4
  for (const word of words) {
    const text = word.text.slice(0, Math.max(4, room))
    const start = g.cx - Math.floor(text.length / 2)
    ;[...text].forEach((char, k) => {
      const col = start + k
      if (col < 0 || col >= g.cols) return
      const i = (textRow * g.cols + col) * 3
      cells[i] = char.charCodeAt(0)
      cells[i + 1] = mix(0, word.color, Math.max(0.15, game.light))
      cells[i + 2] = px[(textRow * 2 + 1) * width + col]!
    })
  }

  return toBase64(new Uint8Array(cells.buffer))
}

const toBase64 = (bytes: Uint8Array) => {
  const native = (bytes as Uint8Array & { toBase64?: () => string }).toBase64
  if (typeof native === 'function') return native.call(bytes)
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(text)
}

export const HOLDS = HOLD_LIMIT
export const TICK_MS = 1000 / FPS
