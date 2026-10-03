// Paints a frame of the machine as half-block Raster cells.
import { BOOT_FRAMES, DEMO_AFTER, FPS, HOLD_LIMIT, ROUND_BALLS, WARN_AFTER } from '../game/constants'
import { lanePoint } from '../game/geometry'
import { isReaching, reelViews } from '../game/spin'
import type { Game } from '../game/types'
import { hex, hue, mix } from './color'
import { paintLcd } from './lcd'
import type { Prize } from './lcd'
import { C } from './palette'

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
      cells[i + 1] = word.color
      cells[i + 2] = px[(textRow * 2 + 1) * width + col]!
    })
  }

  return toBase64(new Uint8Array(cells.buffer))
}

export const toBase64 = (bytes: Uint8Array) => {
  const native = (bytes as Uint8Array & { toBase64?: () => string }).toBase64
  if (typeof native === 'function') return native.call(bytes)
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(text)
}
