// The machine's state and layout, as plain data the rest of the game passes around.
import type { Notice, Prize, SceneEvent } from '../render/lcd'

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

export type Pin = { x: number; y: number; glow: number }
export type Ball =
  | { mode: 'lane'; s: number; v: number }
  | { mode: 'free'; x: number; y: number; vx: number; vy: number; still?: number }
export type Spark = { x: number; y: number; life: number; color: number }
export type Spin = {
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
export type Fever = { round: number; count: number; frame: number; age: number; prize: Prize; rounds: number }

/** A ball in the tulip waiting its spin, its result already drawn (先読み) and its lamp's colour hinting at it. */
export type Pending = { isHit: boolean; isReach: boolean; prize: Prize; lamp: 'plain' | 'red' | 'gold' }

export type Box = { x0: number; y0: number; x1: number; y1: number }

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
  /** Frames since the machine last powered on, for the lamps' start-up run. */
  bootFrame: number
  idleFrames: number
}
