/** Running totals for this session, as the machine counts them. */
export type Tally = { fired: number; gate: number; jackpots: number; isFever: boolean }

export type Machine = {
  /** Balls handed out this session (30 per prompt, 1 per 4 characters). */
  granted: number
  tally: Tally
  /** PachinPoints, kept across sessions. */
  points: number
  /** This prompt runs at ten times the odds. */
  isKakuhen: boolean
  /** A jackpot landed: the next prompt runs at ten times the odds. */
  isKakuhenNext: boolean
  isEnabled: boolean
  isMuted: boolean
}

/** What the control strip shows beside the machine. */
export type Hud = { holds: number; message: string }

/** The handle: how hard it is turned, and whether it is locked on (自動發射). */
export type Handle = { power: number; isAuto: boolean }

/**
 * What the invisible layer over the machine posts: running counts, so a post that
 * replaces an undelivered one loses nothing. `id` tells one instance from the next.
 * `presetPower` is the power L or R chose, or -1 for S (自動發射 on and off).
 */
export type PadInput = {
  id: number
  isPointerDown: boolean
  space: number
  steps: number
  preset: number
  presetPower: number
}

/** What the glow module receives as props. */
export type GlowProps = { text: string; mode: 'fever' | 'kakuhen' | 'next' }

declare module 'claude-code' {
  interface PluginState {
    pachincode: {
      machine: Machine
      hud: Hud
      handle: Handle
      /** Ids and opening text of the replies written during a fever, drawn gold. */
      gold: string[]
    }
  }
}
