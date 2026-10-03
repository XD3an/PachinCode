// Making a game, and the small questions and changes the rest of it asks of one.
import type { SceneEvent } from '../render/lcd'
import { BOOT_FRAMES, FPS } from './constants'
import type { Game } from './types'

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
  bootFrame: BOOT_FRAMES,
  idleFrames: 0,
})


/** Someone is playing: the demo screen gives way at once. */
export const wake = (game: Game) => {
  game.idleFrames = 0
}

/** The turn is over: the demo screen waits its full quiet spell from here. */
export const windDown = (game: Game) => {
  game.idleFrames = 0
}

export const rand = (n: number) => Math.floor(Math.random() * n)
export const say = (game: Game, message: string, seconds = 2.5) => {
  game.message = message
  game.messageUntil = game.frame + seconds * FPS
}

export const messageOf = (game: Game) => (game.frame < game.messageUntil ? game.message : '')

/** True while a traffic light holds the walk: from when it turns red until it goes green. */
export const isWaitingAtLight = (scene: { kind: SceneEvent; age: number } | null) =>
  scene !== null && scene.kind === 'light' && scene.age >= 30 && scene.age < 110

export const isBusy = (game: Game) =>
  (game.storm > 0 && game.storm < 1) ||
  game.bootFrame < BOOT_FRAMES ||
  game.balls.length > 0 ||
  game.spin !== null ||
  game.holds > 0 ||
  game.fever !== null ||
  game.flash > 0 ||
  game.sparks.length > 0 ||
  game.input.isFiring ||
  game.frame < game.messageUntil
