import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const PANE = {
  plugin: 'pachincode',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'pachincode',
  props: { title: 'PachinCode', isFocused: false, bodyColumns: 70, placement: 'dock' } as never,
  viewport: { columns: 140, rows: 40 },
} as const

/** The engine beneath the plugin: a store and env in memory, a command table that takes anything. */
const boot = async ($: Engine, on: On) => {
  mock.store(on)
  mock.env(on, { OS: 'test' })
  const clock = mock.clock(on)
  const answer = (value: unknown) => () => ({ value }) as never
  on('command.register', answer({ command: 'pachinko' }))
  on('session.start', () => ({ cwd: '.' }) as never)
  on('prompt.submit', ($, e) => ({ text: e.text }) as never)
  on('ui.message', () => ({}))
  on('ui.open', answer({ isPlaced: true }))
  on('ui.toast', answer(undefined))
  on('ui.blit', answer({}))
  on('audio.play', answer(undefined))
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true } as never)
  return clock
}

const submit = ($: Engine, text: string) => $.prompt.submit({ text, wait: false } as never)

const strip = async (ui: { find: (q: { text: RegExp; in?: string }) => Promise<{ text?: string } | undefined> }) =>
  (await ui.find({ text: /玉 \d+/ }))?.text ?? ''

describe('PachinCode', () => {
  test('a prompt loads 30 balls and every 4 characters adds one', async ($, on) => {
    on('turn.step', async function* ($, e) {
      yield { kind: 'text', index: 0, text: 'x'.repeat(23) }
      yield { kind: 'text', index: 0, text: 'y'.repeat(17) }
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null } as never
    })
    await boot($, on)
    await submit($, '寫一個排序')
    const ui = await $.ui.mount(PANE)
    expect(await strip(ui)).toMatch(/玉 30/)

    for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'm', messageCount: 1 })) {
      // drained
    }
    await ui.redraw()
    expect(await strip(ui)).toMatch(/玉 40/)
    await ui.unmount()
  })

  test('S locks the handle on and balls leave the tray', async ($, on) => {
    const clock = await boot($, on)
    await submit($, 'q')
    const ui = await $.ui.mount(PANE)
    expect(await ui.find({ type: 'Raster' } as never)).toBeDefined()

    await ui.press({ key: 'auto' })
    await clock.advance(1500)
    await ui.redraw()
    const left = Number((await strip(ui)).match(/玉 (\d+)/)?.[1])
    expect(left).toBeLessThan(30)
    expect(await ui.find({ text: /自動發射中/ })).toBeDefined()

    await ui.press({ key: 'more' })
    expect(await ui.find({ text: /35%/ })).toBeDefined()
    await ui.unmount()
  })

  test('holding the mouse on the machine fires, and Space does once it has the keys', async ($, on) => {
    const clock = await boot($, on)
    await submit($, 'q')
    const ui = await $.ui.mount(PANE)
    expect(await ui.find({ type: 'Raster' } as never)).toBeDefined()

    await ui.pointer({ type: 'down', button: 'left', x: 10, y: 10, in: 'pad' })
    await clock.advance(1000)
    await ui.pointer({ type: 'up', button: 'left', x: 10, y: 10, in: 'pad' })
    await ui.redraw()
    const afterMouse = Number((await strip(ui)).match(/玉 (\d+)/)?.[1])
    expect(afterMouse).toBeLessThan(30)

    // A tap is one ball, no more.
    await clock.advance(2000)
    await ui.redraw()
    const beforeTap = Number((await strip(ui)).match(/玉 (\d+)/)?.[1])
    await ui.key({ key: ' ', in: 'pad' })
    await clock.advance(1000)
    await ui.redraw()
    const afterTap = Number((await strip(ui)).match(/玉 (\d+)/)?.[1])
    expect(afterTap).toBe(beforeTap - 1)

    await ui.key({ key: 'right', in: 'pad' })
    await ui.redraw()
    expect(await ui.find({ text: /35%/ })).toBeDefined()
    await ui.unmount()
  })

  test('/pachinko mute and stats answer', async ($, on) => {
    await boot($, on)
    expect((await $.command.run({ command: 'pachinko', args: 'mute' } as never)).text).toMatch(/靜音/)
    expect((await $.command.run({ command: 'pachinko', args: 'stats' } as never)).text).toMatch(/PachinPoints 0/)
  })

  test('a reply outside the fever is drawn as the engine draws it', async ($, on) => {
    on('ui.render', { component: 'AssistantMessage' }, ($, e) =>
      ({ type: 'Text', props: {}, children: [e.props.text] }) as never)
    await boot($, on)
    const plain = await $.ui.mount({
      plugin: 'pachincode',
      surface: 'terminal',
      component: 'AssistantMessage',
      requestId: 'row-2',
      props: { text: 'not gold', isFirstOfReply: true },
    })
    expect(await plain.find({ text: /GOLD/ })).toBeUndefined()
  })
})
