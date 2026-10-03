// One frame of the machine: the handle, the balls' physics, the fever, the scenes and the reels.
import { hue } from '../render/color'
import type { SceneEvent } from '../render/lcd'
import { CRAWL_STEPS, FPS, GRAVITY, HOLD_LIMIT, LANE_EXIT, MAX_BALLS, MAX_SPEED, RIGHT_STRIKE, ROUNDS, ROUND_BALLS, ROUND_FRAMES, SCENE_CHANCE, SCENE_FRAMES, SHOT_EVERY, STOPS, SUBSTEPS, WARN_AFTER, holdOf } from './constants'
import { lanePoint, launchSpeed } from './geometry'
import { crawlBehind, drawPending, isReaching, startSpin } from './spin'
import { isWaitingAtLight, rand, say, wake } from './state'
import type { Ball, Game } from './types'

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
