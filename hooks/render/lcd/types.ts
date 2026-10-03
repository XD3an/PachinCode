// What the screen is told to show, and the box it draws in.

/** The screen's box; with `arc`, its top is that circle, cut by the box. */
export type LcdBox = { x0: number; y0: number; x1: number; y1: number; arc?: { cx: number; cy: number; r: number } }

export type ReelView = {
  digit: number
  /** How far the reel has scrolled toward the next digit, 0 to 1. */
  offset: number
  isSpinning: boolean
  /** Frames since the reel stopped, for its bounce. */
  sinceStop: number
}

/** A premonition (予告) at the start of a spin: the stronger, the likelier a jackpot. */
export type Notice = 'star' | 'ufo' | 'gold' | 'mascot'

/** The three kinds of jackpot, each with its own celebration. */
export type Prize = 'premium' | 'kakuhen' | 'normal'

/** Little scenes that play now and then, whatever the reels are doing. */
export type SceneEvent = 'cat' | 'balloon' | 'meteors' | 'jump' | 'light' | 'rain' | 'birds'

export type LcdView = {
  frame: number
  reels: ReelView[]
  mode: 'idle' | 'spin' | 'reach' | 'fever'
  isKakuhen: boolean
  /** 0 to 1 while the screen powers on, 1 after. */
  boot: number
  notice: { kind: Notice; age: number } | null
  /** Frames since the jackpot, through every round of the fever. */
  feverAge: number
  /** The jackpot being celebrated (or about to be). */
  prize: Prize
  scene: { kind: SceneEvent; age: number } | null
  /** How far the walk has come, in frames walked: the road and lamps move by it, not by time. */
  travel: number
  /** A reach's storm, 0 clear to 1 the blood-red sky. */
  storm: number
  /** Kakuhen's red in the sky, 0 to 1. */
  redness: number
  /** How a reach came out, while its result holds on screen. */
  outcome: 'hit' | 'miss' | null
}
