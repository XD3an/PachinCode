// The machine, as the hooks module and the tools see it: make a game, lay it out, step it, paint it.
export { TICK_MS } from './constants'
export { buildGeometry } from './geometry'
export { isBusy, messageOf, newGame, wake, windDown } from './state'
export { step } from './step'
export type { Game, Geometry } from './types'
export { paint, paintSvg } from '../render/paint'
