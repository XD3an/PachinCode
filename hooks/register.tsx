import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { GlowProps, Handle, Hud, Machine, PadInput, Tally } from '../types'
import { buildGeometry, isBusy, messageOf, newGame, paint, step, TICK_MS, wake, windDown } from './game'
import type { Game } from './game'

const PANE = 'pachincode'
const BASE_BALLS = 30
const CHARS_PER_BALL = 4
const POINTS_PER_GATE_BALL = 15
const ODDS = 1 / 99
const KAKUHEN_FACTOR = 10
const GOLD_LIMIT = 400

const machine = atom({ plugin: 'pachincode', key: 'machine' } as const, {
  granted: 0,
  tally: { fired: 0, gate: 0, jackpots: 0, isFever: false },
  points: 0,
  isKakuhen: false,
  isKakuhenNext: false,
  isEnabled: true,
  isMuted: false,
} as Machine)
const hud = atom({ plugin: 'pachincode', key: 'hud' } as const, { holds: 0, message: '' } as Hud)
const handle = atom({ plugin: 'pachincode', key: 'handle' } as const, { power: 30, isAuto: false } as Handle)
const gold = atom({ plugin: 'pachincode', key: 'gold' } as const, [] as string[])

type Saved = { points: number; isKakuhenNext: boolean; isEnabled: boolean; isMuted: boolean; gold: string[] }

const RAINBOW = ['#ff4d4d', '#ff9f1a', '#ffd700', '#7cfc00', '#00e5ff', '#4d79ff', '#d14dff']

/** The opening of a reply block, so a gold row is found by its text too. */
const goldKey = (text: string) => `text:${text.trim().slice(0, 120)}`


const save = async ($: EngineInterface) => {
  const m = await read($, machine)
  const saved: Saved = {
    points: m.points,
    isKakuhenNext: m.isKakuhenNext,
    isEnabled: m.isEnabled,
    isMuted: m.isMuted,
    gold: await read($, gold),
  }
  await $.store.set('saved', saved)
}

const openPane = ($: EngineInterface) => $.ui.open({ id: PANE, title: 'PachinCode' })

// The machine lives in this module: a reload starts it afresh from the session's totals.
const game: Game = newGame({ fired: 0, gate: 0, jackpots: 0 })
const live = {
  granted: 0,
  isMuted: false,
  isMounted: false,
  handle: { power: 30, isAuto: false } as Handle,
  /** Space or F held down: the key's repeats keep it firing until this frame. */
  pulseUntil: 0,
  /** Single shots asked for by taps, fired one by one. */
  queued: 0,
  /** When the last Space or F press came, to tell a held key's repeats from taps. */
  pressedAt: 0,
  /** The mouse is held on the machine. */
  isPointerDown: false,
  /** The layer's counts as last seen, to act on what is new. */
  pad: { id: 0, isPointerDown: false, space: 0, steps: 0, preset: 0, presetPower: 30 } as PadInput,
  /** Ticks since the pane was last seen, to look for it again now and then. */
  probe: 0,
  carry: 0,
  synced: { fired: 0, gate: 0, jackpots: 0, isFever: false } as Tally,
  syncedHud: { holds: 0, message: '' } as Hud,
}
game.ammo = () => live.granted - game.fired

// Sound. On Windows a terminal plays no clips, so a PowerShell child plays them from a
// queue file written here; elsewhere the engine's own `$.audio.play` does.
const QUEUE_LENGTH = 32
/** The shortest gap between two plays of one clip, so a stream of balls is not a buzz. */
const MIN_GAP_MS: Record<string, number> = { pin: 60, launch: 90, grant: 140, gate: 50 }
const sound = {
  isWindows: false,
  queuePath: '',
  seq: 0,
  pending: [] as string[],
  lines: [] as string[],
  lastAt: new Map<string, number>(),
}

async function startSpeaker($: EngineInterface) {
  sound.isWindows = (await $.env.get('OS')) === 'Windows_NT'
  sound.queuePath = `${$.plugin.root}/.runtime/queue.txt`
  // Milliseconds, so the numbers keep rising across reloads.
  sound.seq = Math.floor(await $.clock.now())
  if (!sound.isWindows) return
  await $.fs.write(sound.queuePath, '')
  void runPlayer($)
}

async function runPlayer($: EngineInterface) {
  try {
    const player = $.process.spawn({
      argv: [
        'powershell.exe',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        `${$.plugin.root}/assets/player.ps1`,
        '-Queue',
        sound.queuePath,
        '-Sounds',
        `${$.plugin.root}/assets/sounds`,
      ],
    })
    for await (const piece of player) {
      if (piece.stream === 'stderr') $.ui.log(`pachincode sound: ${piece.text}`, { to: 'debug' })
    }
  } catch (error) {
    $.ui.log(`pachincode sound: the player did not start: ${String(error)}`, { to: 'debug' })
  }
}

function playSound($: EngineInterface, name: string) {
  if (live.isMuted) return
  const now = Date.now()
  if (now - (sound.lastAt.get(name) ?? 0) < (MIN_GAP_MS[name] ?? 0)) return
  sound.lastAt.set(name, now)
  if (sound.isWindows) sound.pending.push(name)
  else void $.audio.play({ asset: `assets/sounds/${name}.wav` }, { gain: name === 'jackpot' || name === 'kakuhen' || name === 'reach' || name === 'boot' ? 0.25 : 0.3 }).catch(() => undefined)
}

/** Hands what was played since the last flush to the player, in one write. */
async function flushSounds($: EngineInterface) {
  if (sound.pending.length === 0) return
  for (const name of sound.pending.splice(0)) sound.lines.push(`${++sound.seq} ${name}`)
  sound.lines = sound.lines.slice(-QUEUE_LENGTH)
  await $.fs.write(sound.queuePath, sound.lines.join('\n') + '\n')
}

async function refresh($: EngineInterface) {
  const m = await read($, machine)
  live.granted = m.granted
  live.isMuted = m.isMuted
  game.isKakuhen = m.isKakuhen
  game.odds = Math.min(1, ODDS * (m.isKakuhen ? KAKUHEN_FACTOR : 1))
}

/** Hands what the machine counted to the session: points, kakuhen, the strip's lamps. */
async function sync($: EngineInterface) {
  const synced = live.synced
  const tally: Tally = { fired: game.fired, gate: game.gate, jackpots: game.jackpots, isFever: game.fever !== null }
  const isUrgent = tally.jackpots !== synced.jackpots || tally.isFever !== synced.isFever
  const isChanged = isUrgent || tally.fired !== synced.fired || tally.gate !== synced.gate
  if (isChanged && (isUrgent || game.frame % 8 === 0)) {
    const newJackpots = tally.jackpots - synced.jackpots
    const gained = (tally.gate - synced.gate) * POINTS_PER_GATE_BALL
    live.synced = tally
    await update($, machine, m => ({
      ...m,
      tally,
      points: m.points + Math.max(0, gained),
      isKakuhenNext: m.isKakuhenNext || (newJackpots > 0 && game.lastPrize !== 'normal'),
    }))
    if (newJackpots > 0) {
      $.ui.toast(
        game.lastPrize === 'premium'
          ? 'プレミアム大當たり！7-7-7　右打ち ▶▶▶'
          : game.lastPrize === 'kakuhen'
            ? '確變大當たり！右打ち ▶▶▶'
            : '大當たり！右打ち ▶▶▶',
      )
    }
    if (isUrgent || gained > 0) await save($)
  }
  const next: Hud = { holds: game.holds, message: messageOf(game) }
  if (next.holds !== live.syncedHud.holds || next.message !== live.syncedHud.message) {
    live.syncedHud = next
    await update($, hud, () => next)
  }
}

/** Turns the handle: the machine reads it at its next frame, the buttons redraw from the atom. */
async function setHandle($: EngineInterface, change: (now: Handle) => Handle) {
  live.handle = change(live.handle)
  if (live.handle.isAuto) wake(game)
  await update($, handle, () => live.handle)
}

const isPadInput = (value: unknown): value is PadInput => {
  const input = value as PadInput
  return (
    typeof input === 'object' &&
    input !== null &&
    typeof input.id === 'number' &&
    typeof input.space === 'number' &&
    typeof input.steps === 'number' &&
    typeof input.preset === 'number'
  )
}

/**
 * One press of Space or F. A tap fires one ball; a key held down repeats about thirty
 * times a second after a short pause, and those repeats keep the handle turned.
 */
function press(count: number) {
  const now = Date.now()
  const isRepeat = now - live.pressedAt < 120 || count > 1
  live.pressedAt = now
  if (isRepeat) {
    live.queued = 0
    live.pulseUntil = game.frame + 5
  } else {
    live.queued = Math.min(3, live.queued + 1)
  }
  wake(game)
}

/** Acts on what the layer over the machine saw since its last post. */
async function onPad($: EngineInterface, input: PadInput) {
  const seen = input.id === live.pad.id ? live.pad : { ...input, space: 0, steps: 0, preset: 0, isPointerDown: false }
  live.pad = input
  live.isPointerDown = input.isPointerDown
  if (input.space > seen.space) press(input.space - seen.space)
  if (input.isPointerDown) wake(game)
  const steps = input.steps - seen.steps
  if (steps !== 0) await setHandle($, now => ({ ...now, power: Math.max(0, Math.min(100, now.power + steps * 5)) }))
  if (input.preset > seen.preset) {
    await setHandle($, now =>
      input.presetPower < 0 ? { ...now, isAuto: !now.isAuto } : { ...now, power: input.presetPower },
    )
  }
}

async function tick($: EngineInterface) {
  if (game.geometry === null) return
  if (!live.isMounted) {
    // Lost the pane (a reload, a close): look for it about once a second.
    if (++live.probe % 30 !== 0) return
    const found = await $.ui.blit({ requestId: PANE, key: 'screen', cells: paint(game) })
    if (found.deny !== undefined) return
    live.isMounted = true
  }
  const isHeld = live.handle.isAuto || live.isPointerDown || game.frame < live.pulseUntil
  game.input = { power: live.handle.power, isFiring: isHeld || live.queued > 0 }
  const wasBusy = isBusy(game)
  const firedBefore = game.fired
  step(game)
  if (!isHeld && live.queued > 0 && game.fired > firedBefore) live.queued -= 1
  for (const name of game.sounds.splice(0)) playSound($, name)
  await flushSounds($)
  await sync($)
  // Always moving, as a machine in a hall is: full rate in play, half rate when idle.
  if (wasBusy || isBusy(game) || game.frame % 2 === 0) {
    const blitted = await $.ui.blit({ requestId: PANE, key: 'screen', cells: paint(game) })
    if (blitted.deny !== undefined) live.isMounted = false
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    const saved = (await $.store.get('saved')) as Partial<Saved> | undefined
    if (saved) {
      await update($, machine, m => ({
        ...m,
        points: saved.points ?? 0,
        isKakuhenNext: saved.isKakuhenNext ?? false,
        isEnabled: saved.isEnabled ?? true,
        isMuted: saved.isMuted ?? false,
      }))
      await update($, gold, () => saved.gold ?? [])
    }
    const m = await read($, machine)
    live.synced = m.tally
    game.fired = m.tally.fired
    game.gate = m.tally.gate
    game.jackpots = m.tally.jackpots
    await refresh($)
    await startSpeaker($)
    await $.command.register({
      name: 'pachinko',
      description: 'PachinCode machine: /pachinko [on|off|mute|unmute|stats]',
    })
    $.clock.every(TICK_MS, () => tick($))
    // After a reload the open pane is drawn afresh, so the machine runs again at once.
    $.ui.invalidate('ui.render')

    return started
  })

  on('command.run', { command: 'pachinko' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'off') {
      await update($, machine, m => ({ ...m, isEnabled: false }))
      await save($)
      await $.ui.close({ id: PANE })
      return { text: 'PachinCode 已關閉。輸入 /pachinko on 重新開機。' }
    }
    if (arg === 'mute' || arg === 'unmute') {
      await update($, machine, m => ({ ...m, isMuted: arg === 'mute' }))
      await refresh($)
      await save($)
      return { text: arg === 'mute' ? 'PachinCode 已靜音。' : 'PachinCode 音效開啟。' }
    }
    if (arg === 'stats') {
      const m = await read($, machine)
      return {
        text:
          `PachinPoints ${m.points} · 本次發放 ${m.granted} 顆 · 已發射 ${m.tally.fired} 顆 · ` +
          `大當たり ${m.tally.jackpots} 次${m.isKakuhenNext ? ' · 次回確変待機中' : ''}`,
      }
    }
    await update($, machine, m => ({ ...m, isEnabled: true }))
    await save($)
    wake(game)
    // Typed by the person over an empty prompt: the pane can take the keyboard at once.
    await $.ui.open({ id: PANE, title: 'PachinCode', focus: true })
    return { text: 'PachinCode 開機。機台面板拿到鍵盤時按 S 自動發射、F 發射、A/D 力道、L/R 左右打；鍵盤回到輸入框後按 ctrl+x tab 再交給機台。' }
  })

  on('prompt.submit', async ($, e, next) => {
    const entered = await next(e)
    if (entered.drop !== undefined || !(await read($, machine)).isEnabled) {
      return entered
    }
    live.carry = 0
    await update($, machine, m => ({
      ...m,
      granted: m.granted + BASE_BALLS,
      isKakuhen: m.isKakuhenNext,
      isKakuhenNext: false,
    }))
    await refresh($)
    await save($)
    wake(game)
    await openPane($)

    return entered
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined) windDown(game)
    return done
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) {
      return yield* next(e)
    }
    for await (const chunk of next(e)) {
      yield chunk
      if (chunk.kind !== 'text') continue
      live.carry += chunk.text.length
      const balls = Math.floor(live.carry / CHARS_PER_BALL)
      if (balls > 0) {
        live.carry -= balls * CHARS_PER_BALL
        live.granted += balls
        playSound($, 'grant')
        // Not awaited: the reply streams on while the tray fills.
        void update($, machine, m => (m.isEnabled ? { ...m, granted: m.granted + balls } : m))
      }
    }
  })

  // Reply blocks written while the fever runs are remembered, and drawn gold for good.
  on('ui.message', async ($, e, next) => {
    if (e.element === 'pad' && isPadInput(e.data)) await onPad($, e.data)
    return next(e)
  })

  on('session.append', async ($, e, next) => {
    const stored = await next(e)
    if (e.door !== 'response' || e.agentId !== undefined || game.fever === null) {
      return stored
    }
    const content = e.message.content
    const texts = Array.isArray(content)
      ? content.flatMap(block =>
          block.type === 'text' && typeof block.text === 'string' && block.text.trim() !== ''
            ? [goldKey(block.text)]
            : [],
        )
      : []
    if (texts.length > 0) {
      await update($, gold, list => [...list, e.uuid, ...texts].slice(-GOLD_LIMIT))
      await save($)
    }

    return stored
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const list = await read($, gold)
    if (!list.includes(e.requestId) && !list.includes(goldKey(e.props.text))) {
      return next(e)
    }
    const { Box, Text } = $.ui.resolve(e)
    const reply = await next(e)
    const banner = '★ 大当たり GOLD ★'

    return (
      <Box flexDirection="column" borderStyle="double" borderColor="#d4af37" paddingX={1}>
        <Text bold>
          {[...banner].map((char, i) => (
            <Text color={RAINBOW[i % RAINBOW.length]}>{char}</Text>
          ))}
        </Text>
        {reply}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const m = await read($, machine)
    const lamps = await read($, hud)
    const ammo = Math.max(0, m.granted - m.tally.fired)

    if (e.surface !== 'terminal') {
      const { Text } = $.ui.resolve(e)
      return <Text dimColor>PachinCode 的機台畫面只在終端機顯示。PachinPoints {m.points}</Text>
    }
    const { Box, Text, Raster, Button, Client } = $.ui.resolve(e)
    const turned = await read($, handle)
    const cols = Math.max(32, Math.min(200, e.props.bodyColumns))
    const rows = Math.max(16, Math.min(80, (e.viewport?.rows ?? 30) - 7))
    if (game.geometry === null || game.geometry.cols !== cols || game.geometry.rows !== rows) {
      game.geometry = buildGeometry(cols, rows)
    }
    live.isMounted = true
    const isRight = turned.power >= 80
    const bar = '▰'.repeat(Math.round(turned.power / 10)) + '▱'.repeat(10 - Math.round(turned.power / 10))
    const holds = '●'.repeat(lamps.holds) + '○'.repeat(Math.max(0, 4 - lamps.holds))

    return (
      <Box flexDirection="column">
        <Box justifyContent="space-between">
          <Text color="#ffd700" bold>
            PachinPoints {m.points}
          </Text>
          <Text color="#9aa0a6">大當たり {m.tally.jackpots}</Text>
        </Box>
        <Box width={cols} height={rows}>
          <Raster key="screen" columns={cols} rows={rows} cells={paint(game)} />
          {/* An invisible layer over the machine takes the mouse and Space. */}
          <Box position="absolute" top={0} left={0}>
            <Client key="pad" module="./surfaces/pad.tsx" props={{ columns: cols, rows }} width={cols} height={rows} />
          </Box>
        </Box>
        <Text wrap="truncate">
          <Text color={turned.isAuto ? '#ffd700' : '#9aa0a6'} bold={turned.isAuto}>
            {turned.isAuto ? '◉ 自動發射中 ' : '○ 停止 '}
          </Text>
          <Text color={isRight ? '#ff4d4d' : '#00e5ff'}>
            力 {bar} {turned.power}% {isRight ? '右打ち' : '左打ち'}
          </Text>
          <Text color="#e6e6e6">　玉 {ammo}</Text>
          <Text color={lamps.holds === 4 ? '#ff4d4d' : '#ff9f1a'}>　保留 {holds}</Text>
          <Text color={m.isKakuhen ? '#ff3b3b' : '#9aa0a6'}>　{m.isKakuhen ? '確変中 1/9.9' : '1/99'}</Text>
        </Text>
        <Box gap={1}>
          <Button
            key="auto"
            hotkey="s"
            variant="primary"
            label={turned.isAuto ? '停止' : '自動發射'}
            onPress={() => setHandle($, now => ({ ...now, isAuto: !now.isAuto }))}
          />
          <Button
            key="shot"
            hotkey="f"
            label="發射"
            onPress={() => press(1)}
          />
          <Button key="less" hotkey="a" label="力−" onPress={() => setHandle($, now => ({ ...now, power: Math.max(0, now.power - 5) }))} />
          <Button key="more" hotkey="d" label="力＋" onPress={() => setHandle($, now => ({ ...now, power: Math.min(100, now.power + 5) }))} />
          <Button key="left" hotkey="l" label="左打" onPress={() => setHandle($, now => ({ ...now, power: 30 }))} />
          <Button key="right" hotkey="r" label="右打" onPress={() => setHandle($, now => ({ ...now, power: 95 }))} />
        </Box>
        <Text wrap="truncate" color={lamps.message ? '#ffd700' : undefined} dimColor={!lamps.message}>
          {lamps.message ||
            '在機台上按住滑鼠發射；點一下機台後 Space 發射、←→ 力道。也可以 ctrl+x tab 後按 S/F/A/D/L/R'}
        </Text>
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const m = await read($, machine)
    if (e.props.hasSurvey || !m.isEnabled) {
      return next(e)
    }
    const glow: GlowProps | undefined = m.tally.isFever
      ? { mode: 'fever', text: '右打ち中 ▶▶▶ RIGHT STRIKE　這段回覆會鍍金' }
      : m.isKakuhen && e.props.isWorking
        ? { mode: 'kakuhen', text: '確変中　大當たり機率 ×10 (1/9.9)' }
        : m.isKakuhenNext && !e.props.isWorking
          ? { mode: 'next', text: '次回確変　下一個問題大當たり機率 ×10，繼續連莊！' }
          : undefined
    if (glow === undefined || e.surface !== 'terminal') {
      return next(e)
    }
    const { Client } = $.ui.resolve(e)

    return <Client key="glow" module="./surfaces/glow.tsx" props={glow} width={e.props.bodyColumns} height={1} />
  })
}
