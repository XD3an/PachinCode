// The reels: each held ball's drawn result, its premonition and joke, and how the reels roll.
import type { Notice, Prize, ReelView } from '../render/lcd'
import { CRAWL_STEP, CRAWL_STEPS, DEMO_AFTER, PRIZE_DIGITS, REACH_FRAMES, SPIN_FRAMES, STOPS, holdOf } from './constants'
import { rand } from './state'
import type { Game, Pending, Spin } from './types'

/** Draws a held ball's result the moment it enters the tulip, and picks its lamp. */
export const drawPending = (game: Game): Pending => {
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

export const startSpin = (game: Game, pending: Pending): Spin => {
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
export const crawlBehind = (left: number) => {
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
export const reelViews = (game: Game): ReelView[] => {
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
