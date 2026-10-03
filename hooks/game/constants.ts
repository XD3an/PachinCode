// The numbers that tune the machine: timing, physics, odds and rounds.
import type { Prize, SceneEvent } from '../render/lcd'

export const FPS = 30
export const GRAVITY = 0.12
export const SUBSTEPS = 4
export const MAX_SPEED = 6
export const MAX_BALLS = 300
export const SHOT_EVERY = 3
export const HOLD_LIMIT = 4
export const SPIN_FRAMES = 3 * FPS
export const REACH_FRAMES = 7 * FPS
/** The last stretch of a reach, where the middle reel steps one digit at a time. */
export const CRAWL_STEPS = 3
export const CRAWL_STEP = 25
/** How long a stopped spin holds its result on screen before it pays out or clears. */
export const holdOf = (spin: { isReach: boolean; gag?: string }) => (spin.isReach ? 45 : spin.gag ? 40 : 15)
/** Rounds of the attacker for each kind of jackpot. */
export const ROUNDS: Record<Prize, number> = { premium: 10, kakuhen: 8, normal: 5 }
/** The digits each kind of jackpot lines up. */
export const PRIZE_DIGITS: Record<Prize, readonly number[]> = { premium: [7], kakuhen: [1, 3, 5, 9], normal: [2, 4, 6, 8] }
/** About one quiet frame in this many starts a little scene of its own. */
export const SCENE_CHANCE = 300
export const SCENE_FRAMES: Record<SceneEvent, number> = { cat: 75, balloon: 100, meteors: 60, jump: 30, light: 160, rain: 240, birds: 90 }
export const ROUND_BALLS = 10
export const ROUND_FRAMES = 12 * FPS
/** Where the launch lane lets go of the ball: 60 degrees up the rail from its left side. */
export const LANE_EXIT = Math.PI / 3
/** Where each reel stops, as a share of the spin: left, middle last, right. */
export const STOPS = [0.35, 1, 0.6] as const
export const BOOT_FRAMES = 45
/** Quiet frames before the screen runs its demo (デモ画面), as an idle machine in a hall does. */
export const DEMO_AFTER = 10 * FPS
/** The handle's power from which a ball goes right (右打ち). */
export const RIGHT_STRIKE = 80
/** Frames of striking the wrong way before the machine calls it out. */
export const WARN_AFTER = FPS

export const HOLDS = HOLD_LIMIT
export const TICK_MS = 1000 / FPS
